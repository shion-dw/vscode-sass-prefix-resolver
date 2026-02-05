import type { MixinDefinition, VariableDefinition } from "../types";
import { logger } from "../utils/logger";

/**
 * Sassファイルをパースしてmixin定義を検索するクラス
 */
export class SassParser {
  /**
   * mixin定義を検索する正規表現
   * 例: @mixin reset() { ... } または @mixin reset { ... }
   */
  private readonly MIXIN_PATTERN = /@mixin\s+([\w-]+)(?:\s*\(|\s*\{)/g;

  /**
   * 変数定義を検索する正規表現
   * 例: $primary-color: #fff;
   */
  private readonly VARIABLE_PATTERN = /\$[\w-]+\s*:/g;

  /**
   * ファイル内容からmixin定義を検索
   *
   * @param content - ファイル内容
   * @param mixinName - 検索するmixin名
   * @param filePath - ファイルパス
   * @returns MixinDefinition | undefined
   */
  findMixinDefinition(
    content: string,
    mixinName: string,
    filePath: string,
  ): MixinDefinition | undefined {
    const lines = content.split("\n");

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];

      // コメント行はスキップ（簡易的なチェック）
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("//")) {
        continue;
      }

      // mixin定義を検索
      const matches = Array.from(line.matchAll(this.MIXIN_PATTERN));
      for (const match of matches) {
        const foundMixinName = match[1];

        if (foundMixinName === mixinName) {
          // @mixinの位置を取得
          const column = match.index || 0;

          logger.debug(
            `Found mixin definition: ${mixinName} at ${filePath}:${lineNumber}:${column}`,
          );

          return {
            name: mixinName,
            filePath,
            line: lineNumber,
            column,
          };
        }
      }
    }

    logger.debug(`Mixin "${mixinName}" not found in ${filePath}`);
    return undefined;
  }

  /**
   * ファイル内容から変数定義を検索
   *
   * @param content - ファイル内容
   * @param variableName - 検索する変数名（$付き、例: "$mono6"）
   * @param filePath - ファイルパス
   * @returns VariableDefinition | undefined
   */
  findVariableDefinition(
    content: string,
    variableName: string,
    filePath: string,
  ): VariableDefinition | undefined {
    const lines = content.split("\n");

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];

      // コメント行はスキップ
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("//")) {
        continue;
      }

      // 変数定義を検索
      // 変数名をエスケープして正規表現を作成
      const escapedVarName = variableName.replace(/\$/g, "\\$");
      const varPattern = new RegExp(`${escapedVarName}\\s*:`, "g");
      const matches = Array.from(line.matchAll(varPattern));

      for (const match of matches) {
        // 変数定義の位置を取得
        const column = match.index || 0;

        logger.debug(
          `Found variable definition: ${variableName} at ${filePath}:${lineNumber}:${column}`,
        );

        return {
          name: variableName,
          filePath,
          line: lineNumber,
          column,
        };
      }
    }

    logger.debug(`Variable "${variableName}" not found in ${filePath}`);
    return undefined;
  }

  /**
   * ファイル内の全てのmixin定義を列挙
   *
   * @param content - ファイル内容
   * @param filePath - ファイルパス
   * @returns MixinDefinition[]
   */
  findAllMixinDefinitions(content: string, filePath: string): MixinDefinition[] {
    const definitions: MixinDefinition[] = [];
    const lines = content.split("\n");

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];

      // コメント行はスキップ
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("//")) {
        continue;
      }

      // mixin定義を検索
      const matches = Array.from(line.matchAll(this.MIXIN_PATTERN));
      for (const match of matches) {
        const mixinName = match[1];
        const column = match.index || 0;

        definitions.push({
          name: mixinName,
          filePath,
          line: lineNumber,
          column,
        });
      }
    }

    return definitions;
  }

  /**
   * ブロックコメント内かどうかを判定（将来の改善用）
   */
  private isInBlockComment(content: string, position: number): boolean {
    // 簡易実装: positionまでの内容でブロックコメントの開始/終了をカウント
    const beforeContent = content.substring(0, position);
    const openCount = (beforeContent.match(/\/\*/g) || []).length;
    const closeCount = (beforeContent.match(/\*\//g) || []).length;

    return openCount > closeCount;
  }
}

export const sassParser = new SassParser();
