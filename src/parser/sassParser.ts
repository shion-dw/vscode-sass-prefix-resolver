import type { MixinDefinition, MixinParameter, VariableDefinition } from "../types";
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

          // 引数情報を解析
          const parameters = this.parseMixinParameters(content, mixinName, lineNumber);

          logger.debug(
            `Found mixin definition: ${mixinName} at ${filePath}:${lineNumber}:${column} with ${parameters?.length || 0} parameters`,
          );

          return {
            name: mixinName,
            filePath,
            line: lineNumber,
            column,
            parameters,
          };
        }
      }
    }

    logger.debug(`Mixin "${mixinName}" not found in ${filePath}`);
    return undefined;
  }

  /**
   * mixin定義の引数を解析
   */
  private parseMixinParameters(
    content: string,
    mixinName: string,
    startLine: number,
  ): MixinParameter[] | undefined {
    const lines = content.split("\n");

    // 1. 括弧内の引数文字列を抽出
    const argsString = this.extractArgumentsString(lines, startLine);
    if (!argsString || argsString.trim().length === 0) {
      return []; // 引数なし
    }

    // 2. 引数をカンマで分割（括弧内のカンマは無視）
    const argTokens = this.splitArguments(argsString);

    // 3. 各引数を解析
    const parameters: MixinParameter[] = [];
    for (const token of argTokens) {
      const param = this.parseParameter(token, lines, startLine);
      if (param) {
        parameters.push(param);
      }
    }

    return parameters;
  }

  /**
   * mixin定義の括弧内の引数文字列を抽出
   */
  private extractArgumentsString(lines: string[], startLine: number): string | null {
    let argsString = "";
    let depth = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (char === "(") {
          foundStart = true;
          depth++;
          if (depth === 1) continue; // 最初の括弧はスキップ
        }

        if (foundStart && depth > 0) {
          if (char === ")") {
            depth--;
            if (depth === 0) {
              return argsString;
            }
          }
          argsString += char;
        }
      }

      if (foundStart && depth > 0) {
        argsString += "\n"; // 複数行の場合
      }
    }

    return null; // 閉じ括弧が見つからない
  }

  /**
   * 引数文字列をカンマで分割（括弧内のカンマは無視）
   */
  private splitArguments(argsString: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of argsString) {
      if (char === "(" || char === "{") {
        depth++;
      }
      if (char === ")" || char === "}") {
        depth--;
      }

      if (char === "," && depth === 0) {
        tokens.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  /**
   * 個別の引数トークンを解析
   */
  private parseParameter(token: string, lines: string[], baseLine: number): MixinParameter | null {
    // $name: default-value の形式をパース
    const match = token.match(/\$\s*([\w-]+)(?:\s*:\s*(.+))?/);
    if (!match) {
      return null;
    }

    const name = match[1];
    const defaultValue = match[2]?.trim() || null;

    // 位置情報を計算
    const { line, column } = this.calculateParameterPosition(name, lines, baseLine);

    return { name, defaultValue, line, column };
  }

  /**
   * 引数の位置を計算
   */
  private calculateParameterPosition(
    paramName: string,
    lines: string[],
    startLine: number,
  ): { line: number; column: number } {
    // mixin定義の行から引数を探す
    for (let i = startLine; i < Math.min(startLine + 10, lines.length); i++) {
      const line = lines[i];
      const pattern = new RegExp(`\\$\\s*${paramName}\\b`);
      const match = line.match(pattern);

      if (match && match.index !== undefined) {
        return { line: i, column: match.index };
      }
    }

    // 見つからない場合はmixin定義の行をデフォルトにする
    return { line: startLine, column: 0 };
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
   * ファイル内の全てのmixin定義を引数情報付きで列挙
   *
   * @param content - ファイル内容
   * @param filePath - ファイルパス
   * @returns MixinDefinition[]（parameters付き）
   */
  findAllMixinDefinitionsWithParams(content: string, filePath: string): MixinDefinition[] {
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

        // 引数情報を解析
        const parameters = this.parseMixinParameters(content, mixinName, lineNumber);

        definitions.push({
          name: mixinName,
          filePath,
          line: lineNumber,
          column,
          parameters,
        });
      }
    }

    return definitions;
  }

  /**
   * ファイル内の全ての変数定義を列挙
   *
   * @param content - ファイル内容
   * @param filePath - ファイルパス
   * @returns VariableDefinition[]（value付き）
   */
  findAllVariableDefinitions(content: string, filePath: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
    const lines = content.split("\n");
    let inBlockComment = false;

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];

      // ブロックコメントの追跡
      if (line.includes("/*")) {
        inBlockComment = true;
      }
      if (line.includes("*/")) {
        inBlockComment = false;
        continue;
      }
      if (inBlockComment) {
        continue;
      }

      // コメント行はスキップ
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("//")) {
        continue;
      }

      // 変数定義を検索
      const matches = Array.from(line.matchAll(this.VARIABLE_PATTERN));
      for (const match of matches) {
        const fullMatch = match[0];
        const varName = fullMatch.replace(/\s*:$/, "");
        const column = match.index || 0;

        // 値を抽出（: の後から ; または行末まで）
        const afterColon = line.substring(column + fullMatch.length);
        const semicolonIndex = afterColon.indexOf(";");
        const value =
          semicolonIndex !== -1
            ? afterColon.substring(0, semicolonIndex).trim()
            : afterColon.trim();

        definitions.push({
          name: varName,
          filePath,
          line: lineNumber,
          column,
          value: value || undefined,
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
