import * as vscode from "vscode";
import { forwardResolver } from "../parser/forwardResolver";
import { moduleResolver } from "../parser/moduleResolver";
import { sassParser } from "../parser/sassParser";
import { useResolver } from "../parser/useResolver";
import type { ResolutionContext } from "../types";
import { readFile } from "../utils/fileSystem";
import { logger } from "../utils/logger";

/**
 * Sass Definition Provider
 * mixin/variable/functionの定義へのジャンプを提供
 */
export class SassDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * トークンを抽出する正規表現
   * 例: "styles.list-reset", "components.button"
   */
  private readonly TOKEN_PATTERN = /[\w-]+\.[\$\w-]+/;

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Definition | undefined> {
    try {
      logger.debug(
        `provideDefinition called at ${document.uri.fsPath}:${position.line}:${position.character}`,
      );

      // カーソル位置のトークンを取得
      const context = this.extractContext(document, position);
      if (!context) {
        logger.debug("No valid token found at cursor position");
        return undefined;
      }

      logger.info(
        `Resolving: ${context.token} (namespace: ${context.namespace}, member: ${context.member})`,
      );

      // 定義を解決
      const definition = await this.resolveDefinition(context);
      return definition;
    } catch (error) {
      logger.error("Error in provideDefinition", error as Error);
      return undefined;
    }
  }

  /**
   * 定義を解決
   */
  private async resolveDefinition(
    context: ResolutionContext,
  ): Promise<vscode.Location | undefined> {
    try {
      // 1. 現在のファイルを読み込み
      const currentContent = await readFile(context.currentFilePath);

      // 2. @use宣言からモジュールパスを解決
      const useStatement = useResolver.findUseByNamespace(currentContent, context.namespace);

      if (!useStatement) {
        logger.debug(`No @use statement found for namespace: ${context.namespace}`);
        return undefined;
      }

      logger.debug(`Found @use: ${useStatement.path} as ${useStatement.namespace}`);

      // 3. モジュールファイルを解決
      const moduleFilePath = await moduleResolver.resolveModule(
        useStatement.path,
        context.currentFilePath,
        context.workspaceRoot,
      );

      if (!moduleFilePath) {
        logger.debug(`Failed to resolve module: ${useStatement.path}`);
        return undefined;
      }

      logger.debug(`Resolved module to: ${moduleFilePath}`);

      // 4. namespace部分にカーソルがある場合は、モジュールファイルにジャンプ
      if (context.cursorTarget === "namespace") {
        const uri = vscode.Uri.file(moduleFilePath);
        const position = new vscode.Position(0, 0);
        const location = new vscode.Location(uri, position);

        logger.info(`Jumping to module file: ${moduleFilePath}`);
        return location;
      }

      // 5. member部分の処理
      const moduleContent = await readFile(moduleFilePath);

      // memberが変数（$で始まる）かどうかを判定
      const isVariable = context.member.startsWith("$");
      logger.debug(`Member type: ${isVariable ? "variable" : "mixin"}`);

      // 6. @forward宣言を解析してmember名を解決
      forwardResolver.clearVisitedFiles();
      const forwardedResult = await forwardResolver.findForwardedMember(
        moduleContent,
        context.member,
        moduleFilePath,
        context.workspaceRoot,
      );

      let targetFilePath: string;
      let targetMemberName: string;

      if (forwardedResult) {
        targetFilePath = forwardedResult.filePath;
        targetMemberName = forwardedResult.originalName;
        logger.debug(`Forwarded to: ${targetFilePath}, original name: ${targetMemberName}`);
      } else {
        targetFilePath = moduleFilePath;
        targetMemberName = context.member;
        logger.debug(`Direct definition in: ${targetFilePath}`);
      }

      // 7. 対象ファイルを読み込んで定義を検索
      const targetContent = await readFile(targetFilePath);

      // 変数とmixinで処理を分岐
      let definition: { filePath: string; line: number; column: number } | undefined;

      if (isVariable) {
        definition = sassParser.findVariableDefinition(
          targetContent,
          targetMemberName,
          targetFilePath,
        );

        if (!definition) {
          logger.debug(`Variable definition not found: ${targetMemberName}`);
          return undefined;
        }
      } else {
        definition = sassParser.findMixinDefinition(
          targetContent,
          targetMemberName,
          targetFilePath,
        );

        if (!definition) {
          logger.debug(`Mixin definition not found: ${targetMemberName}`);
          return undefined;
        }
      }

      // 8. vscode.Locationを作成して返す
      const uri = vscode.Uri.file(definition.filePath);
      const position = new vscode.Position(definition.line, definition.column);
      const location = new vscode.Location(uri, position);

      logger.info(
        `Definition found: ${definition.filePath}:${definition.line}:${definition.column}`,
      );

      return location;
    } catch (error) {
      logger.error("Error resolving definition", error as Error);
      return undefined;
    }
  }

  /**
   * カーソル位置からコンテキストを抽出
   */
  private extractContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): ResolutionContext | undefined {
    const line = document.lineAt(position.line).text;
    const cursorChar = position.character;

    // カーソル位置から "namespace.member" または "namespace.$member" パターンを抽出
    // 1. まず、カーソル位置が有効な文字上にあるかチェック
    if (cursorChar >= line.length || !/[\w$.-]/.test(line[cursorChar])) {
      // カーソルが記号やスペースの上、または行末にある場合、前の文字をチェック
      if (cursorChar > 0 && /[\w$-]/.test(line[cursorChar - 1])) {
        // OK: カーソルが単語の直後
      } else {
        return undefined;
      }
    }

    // 2. カーソル位置から後方にスキャンしてトークンの開始位置を見つける
    let start = cursorChar;

    // カーソル位置の文字から開始（または1つ前）
    if (start < line.length && /[\w$-]/.test(line[start])) {
      // カーソルが単語の上
    } else if (start > 0 && /[\w$-]/.test(line[start - 1])) {
      start--; // カーソルが単語の直後
    } else {
      return undefined;
    }

    // メンバー名の先頭まで戻る($を含む)
    while (start > 0 && /[\w$-]/.test(line[start - 1])) {
      start--;
    }

    // ドットがあれば、さらに名前空間部分まで戻る
    if (start > 0 && line[start - 1] === ".") {
      start--; // ドットを含める
      // 名前空間の先頭まで戻る
      while (start > 0 && /[\w-]/.test(line[start - 1])) {
        start--;
      }
    }

    // 3. 前方にスキャンしてトークンの終了位置を見つける
    let end = cursorChar;

    // カーソル位置から前方にスキャン
    while (end < line.length && /[\w$-]/.test(line[end])) {
      end++;
    }

    // 4. トークンを抽出
    const token = line.substring(start, end);

    // 5. "namespace.member" の形式かチェック
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) {
      return undefined;
    }

    const namespace = token.substring(0, dotIndex);
    const member = token.substring(dotIndex + 1);

    if (!namespace || !member) {
      return undefined;
    }

    // 6. カーソルがnamespace部分とmember部分のどちらにあるか判定
    const cursorInToken = cursorChar - start;
    const cursorTarget = cursorInToken <= dotIndex ? "namespace" : "member";

    // ワークスペースルートを取得
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      logger.error("No workspace folder found");
      return undefined;
    }

    logger.debug(
      `Extracted context: token="${token}", namespace="${namespace}", member="${member}", cursorTarget="${cursorTarget}"`,
    );

    return {
      token,
      namespace,
      member,
      currentFilePath: document.uri.fsPath,
      workspaceRoot: workspaceFolder.uri.fsPath,
      cursorTarget,
    };
  }
}
