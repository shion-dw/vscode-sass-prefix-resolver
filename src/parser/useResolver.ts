import type { UseStatement } from "../types";
import { logger } from "../utils/logger";

/**
 * @use宣言を解析するクラス
 */
export class UseResolver {
  /**
   * @use宣言を抽出する正規表現
   * 例:
   * - @use "@example/styles" as styles;
   * - @use "./components/button";
   * - @use "sass:math";
   */
  private readonly USE_PATTERN = /@use\s+["']([^"']+)["'](?:\s+as\s+([\w-]+))?/g;

  /**
   * ファイル内容から全ての@use宣言を抽出
   */
  parseUseStatements(content: string): UseStatement[] {
    const statements: UseStatement[] = [];
    const lines = content.split("\n");

    lines.forEach((line, lineNumber) => {
      // コメント行はスキップ
      if (line.trim().startsWith("//")) {
        return;
      }

      const matches = Array.from(line.matchAll(this.USE_PATTERN));
      matches.forEach((match) => {
        const path = match[1];
        let namespace = match[2];

        // as句がない場合、パスの最後の部分をnamespaceとする
        if (!namespace) {
          namespace = this.extractDefaultNamespace(path);
        }

        statements.push({
          path,
          namespace,
          line: lineNumber,
        });

        logger.debug(`Found @use: ${path} as ${namespace} (line ${lineNumber})`);
      });
    });

    return statements;
  }

  /**
   * 指定されたnamespaceに対応する@use宣言を検索
   */
  findUseByNamespace(content: string, namespace: string): UseStatement | undefined {
    const statements = this.parseUseStatements(content);
    return statements.find((stmt) => stmt.namespace === namespace);
  }

  /**
   * パスからデフォルトのnamespaceを抽出
   * 例:
   * - "@example/styles" → "styles"
   * - "./components/button" → "button"
   * - "sass:math" → "math"
   */
  private extractDefaultNamespace(path: string): string {
    // パスの最後の部分を取得
    const parts = path.split("/");
    const lastPart = parts[parts.length - 1];

    // sass: プレフィックスを削除
    const withoutPrefix = lastPart.replace(/^sass:/, "");

    // ファイル拡張子を削除
    const withoutExtension = withoutPrefix.replace(/\.(scss|sass)$/, "");

    // アンダースコアプレフィックスを削除（_button → button）
    const withoutUnderscore = withoutExtension.replace(/^_/, "");

    return withoutUnderscore;
  }
}

export const useResolver = new UseResolver();
