import type { ForwardStatement, MixinDefinition, VariableDefinition } from "../types";
import { readFile } from "../utils/fileSystem";
import { logger } from "../utils/logger";
import { moduleResolver } from "./moduleResolver";
import { sassParser } from "./sassParser";

/**
 * @forward宣言を解析するクラス
 */
export class ForwardResolver {
  /**
   * @forward宣言を抽出する正規表現
   * 例:
   * - @forward "./src/elements/list" as list-*;
   * - @forward "./components/button";
   */
  private readonly FORWARD_PATTERN = /@forward\s+["']([^"']+)["'](?:\s+as\s+([\w-]+)-\*)?/g;

  /**
   * 循環参照を検出するための訪問済みファイルのセット
   */
  private visitedFiles: Set<string> = new Set();

  /**
   * ファイル内容から全ての@forward宣言を抽出
   */
  parseForwardStatements(content: string): ForwardStatement[] {
    const statements: ForwardStatement[] = [];
    const lines = content.split("\n");

    lines.forEach((line, lineNumber) => {
      // コメント行はスキップ
      if (line.trim().startsWith("//")) {
        return;
      }

      const matches = Array.from(line.matchAll(this.FORWARD_PATTERN));
      matches.forEach((match) => {
        const path = match[1];
        const prefix = match[2] ? `${match[2]}-` : null;

        statements.push({
          path,
          prefix,
          line: lineNumber,
        });

        logger.debug(
          `Found @forward: ${path}${prefix ? ` as ${prefix}*` : ""} (line ${lineNumber})`,
        );
      });
    });

    return statements;
  }

  /**
   * memberNameに一致する@forward宣言を検索し、元のmixin名とファイルパスを返す
   *
   * @param content - 検索対象のファイル内容
   * @param memberName - 検索するメンバー名（例: "list-reset"）
   * @param currentFilePath - 現在のファイルパス
   * @param workspaceRoot - ワークスペースルート
   * @returns { originalName: string, filePath: string } | undefined
   */
  async findForwardedMember(
    content: string,
    memberName: string,
    currentFilePath: string,
    workspaceRoot: string,
  ): Promise<{ originalName: string; filePath: string } | undefined> {
    // 循環参照チェック
    if (this.visitedFiles.has(currentFilePath)) {
      logger.debug(`Circular reference detected: ${currentFilePath}`);
      return undefined;
    }

    this.visitedFiles.add(currentFilePath);

    try {
      const statements = this.parseForwardStatements(content);

      for (const statement of statements) {
        // prefixがある場合、memberNameから除去して元の名前を取得
        let originalName = memberName;
        if (statement.prefix) {
          // 変数の場合、$記号を除いてプレフィックスをチェック
          const isVariable = memberName.startsWith("$");
          const nameWithoutDollar = isVariable ? memberName.substring(1) : memberName;

          if (nameWithoutDollar.startsWith(statement.prefix)) {
            // プレフィックスを除去
            const baseName = nameWithoutDollar.substring(statement.prefix.length);

            // $記号を元に戻す
            originalName = isVariable ? `$${baseName}` : baseName;

            logger.debug(
              `Prefix match: "${memberName}" -> "${originalName}" (prefix: "${statement.prefix}")`,
            );
          } else {
            // prefixが一致しない場合はスキップ
            continue;
          }
        }

        // モジュールパスを解決
        const resolvedPath = await moduleResolver.resolveModule(
          statement.path,
          currentFilePath,
          workspaceRoot,
        );

        if (!resolvedPath) {
          logger.debug(`Failed to resolve forward path: ${statement.path}`);
          continue;
        }

        logger.debug(`Resolved forward to: ${resolvedPath}`);

        // 再帰的に@forwardを解決(多段階の転送に対応)
        const forwardedContent = await readFile(resolvedPath);
        const nestedResult = await this.findForwardedMember(
          forwardedContent,
          originalName,
          resolvedPath,
          workspaceRoot,
        );

        if (nestedResult) {
          return nestedResult;
        }

        // 転送元ファイルに直接定義がある可能性があるため、ファイルパスを返す
        return {
          originalName,
          filePath: resolvedPath,
        };
      }

      return undefined;
    } finally {
      // 訪問済みファイルから削除(別の経路での再訪を許可)
      this.visitedFiles.delete(currentFilePath);
    }
  }

  /**
   * 全@forward転送メンバーを列挙
   *
   * @param content - 検索対象のファイル内容
   * @param currentFilePath - 現在のファイルパス
   * @param workspaceRoot - ワークスペースルート
   * @param type - 取得するメンバーの種類
   * @returns MixinDefinition[] | VariableDefinition[]
   */
  async findAllForwardedMembers(
    content: string,
    currentFilePath: string,
    workspaceRoot: string,
    type: "mixin" | "variable",
    visitedFiles: Set<string> = new Set(),
  ): Promise<Array<MixinDefinition | VariableDefinition>> {
    // 循環参照チェック
    if (visitedFiles.has(currentFilePath)) {
      logger.debug(`Circular reference detected in findAllForwardedMembers: ${currentFilePath}`);
      return [];
    }

    visitedFiles.add(currentFilePath);

    const results: Array<MixinDefinition | VariableDefinition> = [];

    try {
      const statements = this.parseForwardStatements(content);

      for (const statement of statements) {
        // モジュールパスを解決
        const resolvedPath = await moduleResolver.resolveModule(
          statement.path,
          currentFilePath,
          workspaceRoot,
        );

        if (!resolvedPath) {
          logger.debug(`Failed to resolve forward path: ${statement.path}`);
          continue;
        }

        const forwardedContent = await readFile(resolvedPath);

        // 直接定義を取得
        let members: Array<MixinDefinition | VariableDefinition>;
        if (type === "mixin") {
          members = sassParser.findAllMixinDefinitionsWithParams(forwardedContent, resolvedPath);
        } else {
          members = sassParser.findAllVariableDefinitions(forwardedContent, resolvedPath);
        }

        // プライベートメンバーを除外し、プレフィックス変換を適用
        for (const member of members) {
          const isVariable = member.name.startsWith("$");
          const nameWithoutDollar = isVariable ? member.name.substring(1) : member.name;

          // _始まりのプライベートメンバーを除外
          if (nameWithoutDollar.startsWith("_")) {
            continue;
          }

          // プレフィックス変換
          if (statement.prefix) {
            if (isVariable) {
              member.name = `$${statement.prefix}${nameWithoutDollar}`;
            } else {
              member.name = `${statement.prefix}${member.name}`;
            }
          }

          results.push(member);
        }

        // 再帰的にネストした@forwardも処理
        const nestedMembers = await this.findAllForwardedMembers(
          forwardedContent,
          resolvedPath,
          workspaceRoot,
          type,
          visitedFiles,
        );

        // ネストしたメンバーにもプレフィックスを適用
        for (const member of nestedMembers) {
          if (statement.prefix) {
            const isVariable = member.name.startsWith("$");
            const nameWithoutDollar = isVariable ? member.name.substring(1) : member.name;
            if (isVariable) {
              member.name = `$${statement.prefix}${nameWithoutDollar}`;
            } else {
              member.name = `${statement.prefix}${member.name}`;
            }
          }
          results.push(member);
        }
      }

      return results;
    } finally {
      visitedFiles.delete(currentFilePath);
    }
  }

  /**
   * 循環参照検出用の訪問済みセットをクリア
   */
  clearVisitedFiles(): void {
    this.visitedFiles.clear();
  }
}

export const forwardResolver = new ForwardResolver();
