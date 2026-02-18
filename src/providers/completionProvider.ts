import * as vscode from "vscode";
import { forwardResolver } from "../parser/forwardResolver";
import { moduleResolver } from "../parser/moduleResolver";
import { sassParser } from "../parser/sassParser";
import { useResolver } from "../parser/useResolver";
import type { MixinDefinition, VariableDefinition } from "../types";
import { readFile } from "../utils/fileSystem";
import { logger } from "../utils/logger";

interface MixinArgumentContext {
  type: "mixinArgument";
  namespace: string | undefined;
  mixinName: string;
}

type NamespaceMemberFilter = "mixin" | "variable" | "both";

interface NamespaceMemberContext {
  type: "namespaceMember";
  namespace: string;
  memberFilter: NamespaceMemberFilter;
  typedLength: number;
}

interface ScopeVariableContext {
  type: "scopeVariable";
}

type CompletionContext = MixinArgumentContext | NamespaceMemberContext | ScopeVariableContext;

/**
 * Sass Completion Provider
 * mixin/変数/引数の補完を提供
 */
export class SassCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    try {
      logger.debug(`provideCompletionItems called at ${position.line}:${position.character}`);

      const completionContext = this.getCompletionContext(document, position);
      if (!completionContext) {
        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        logger.debug(`No completion context for: "${textBeforeCursor}"`);
        return [];
      }

      logger.debug(`Completion context: ${JSON.stringify(completionContext)}`);

      switch (completionContext.type) {
        case "mixinArgument":
          return await this.provideMixinArgumentCompletion(
            document,
            position,
            completionContext.namespace ?? null,
            completionContext.mixinName,
          );
        case "namespaceMember":
          return await this.provideNamespaceMemberCompletion(
            document,
            position,
            completionContext.namespace,
            completionContext.memberFilter,
            completionContext.typedLength,
          );
        case "scopeVariable":
          return await this.provideScopeVariableCompletion(document, position);
        default:
          return [];
      }
    } catch (error) {
      logger.error("Error in provideCompletionItems", error as Error);
      return [];
    }
  }

  /**
   * カーソル位置から補完コンテキストを判定
   */
  private getCompletionContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): CompletionContext | null {
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // 1. MixinArgument: @include namespace.mixin( または @include mixin(
    const mixinArgMatch = textBeforeCursor.match(/@include\s+(?:([\w-]+)\.)?([\w-]+)\s*\([^)]*$/);
    if (mixinArgMatch) {
      return {
        type: "mixinArgument",
        namespace: mixinArgMatch[1] || undefined,
        mixinName: mixinArgMatch[2],
      };
    }

    // 2. NamespaceMember: namespace.$ or namespace.
    const namespaceMemberMatch = textBeforeCursor.match(/([\w-]+)\.(\$[\w-]*|[\w-]*)$/);
    if (namespaceMemberMatch) {
      const typedAfterDot = namespaceMemberMatch[2];
      const memberFilter = this.determineMemberFilter(textBeforeCursor, typedAfterDot);
      return {
        type: "namespaceMember",
        namespace: namespaceMemberMatch[1],
        memberFilter,
        typedLength: typedAfterDot.length,
      };
    }

    // 3. ScopeVariable: $
    const scopeVarMatch = textBeforeCursor.match(/(?:^|[\s:,(])\$[\w-]*$/);
    if (scopeVarMatch) {
      return {
        type: "scopeVariable",
      };
    }

    return null;
  }

  /**
   * カーソル位置のコンテキストからネームスペースメンバーのフィルタ種別を判定
   *
   * 判定優先順位:
   * 1. `$` が入力済み → "variable"
   * 2. `@include` が前にある → "mixin"
   * 3. プロパティ値の位置（`:` の後） → "variable"
   * 4. 上記いずれでもない → "both"
   */
  private determineMemberFilter(
    textBeforeCursor: string,
    typedAfterDot: string,
  ): NamespaceMemberFilter {
    // 1. $ が入力済み → variable
    if (typedAfterDot.startsWith("$")) {
      return "variable";
    }

    // 2. @include が前にある → mixin
    if (/@include\s+/.test(textBeforeCursor)) {
      return "mixin";
    }

    // 3. プロパティ値の位置（: の後） → variable
    // "property: namespace." のようなケースを検出
    if (/[\w-]+\s*:/.test(textBeforeCursor)) {
      return "variable";
    }

    // 4. 上記いずれでもない → both
    return "both";
  }

  /**
   * 名前空間メンバー補完 (styles.█ / styles.$█)
   */
  private async provideNamespaceMemberCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    namespace: string,
    memberFilter: NamespaceMemberFilter,
    typedLength: number,
  ): Promise<vscode.CompletionItem[]> {
    const replaceStart = new vscode.Position(position.line, position.character - typedLength);
    const replaceRange = new vscode.Range(replaceStart, position);

    const content = document.getText();
    const useStatement = useResolver.findUseByNamespace(content, namespace);

    if (!useStatement) {
      logger.debug(`No @use statement found for namespace: ${namespace}`);
      return [];
    }

    // sass:で始まる組み込みモジュールはスキップ
    if (useStatement.path.startsWith("sass:")) {
      return [];
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return [];
    }

    const currentFilePath = document.uri.fsPath;
    const workspaceRoot = workspaceFolder.uri.fsPath;

    const moduleFilePath = await moduleResolver.resolveModule(
      useStatement.path,
      currentFilePath,
      workspaceRoot,
    );

    if (!moduleFilePath) {
      logger.debug(`Failed to resolve module: ${useStatement.path}`);
      return [];
    }

    const moduleContent = await readFile(moduleFilePath);
    const items: vscode.CompletionItem[] = [];
    const shouldIncludeVariables = memberFilter === "variable" || memberFilter === "both";
    const shouldIncludeMixins = memberFilter === "mixin" || memberFilter === "both";

    if (shouldIncludeVariables) {
      const directVars = sassParser.findAllVariableDefinitions(moduleContent, moduleFilePath);
      const forwardedVars = (await forwardResolver.findAllForwardedMembers(
        moduleContent,
        moduleFilePath,
        workspaceRoot,
        "variable",
      )) as VariableDefinition[];

      const allVars = [...directVars, ...forwardedVars];
      const seen = new Set<string>();

      for (const v of allVars) {
        const nameWithoutDollar = v.name.startsWith("$") ? v.name.substring(1) : v.name;
        if (nameWithoutDollar.startsWith("_")) {
          continue;
        }
        if (seen.has(v.name)) {
          continue;
        }
        seen.add(v.name);

        const displayName = `$${nameWithoutDollar}`;
        const item = new vscode.CompletionItem(displayName, vscode.CompletionItemKind.Variable);
        item.detail = v.value ? `${v.name}: ${v.value}` : v.name;
        item.insertText = displayName;
        item.range = replaceRange;
        items.push(item);
      }
    }

    if (shouldIncludeMixins) {
      const directMixins = sassParser.findAllMixinDefinitionsWithParams(
        moduleContent,
        moduleFilePath,
      );
      const forwardedMixins = (await forwardResolver.findAllForwardedMembers(
        moduleContent,
        moduleFilePath,
        workspaceRoot,
        "mixin",
      )) as MixinDefinition[];

      const allMixins = [...directMixins, ...forwardedMixins];
      const seen = new Set<string>();

      for (const m of allMixins) {
        if (m.name.startsWith("_")) {
          continue;
        }
        if (seen.has(m.name)) {
          continue;
        }
        seen.add(m.name);

        const item = new vscode.CompletionItem(m.name, vscode.CompletionItemKind.Function);
        const paramsStr = m.parameters
          ? m.parameters
              .map((p) => {
                const paramName = `$${p.name}`;
                return p.defaultValue ? `${paramName}: ${p.defaultValue}` : paramName;
              })
              .join(", ")
          : "";
        item.detail = paramsStr ? `(${paramsStr})` : "()";
        item.documentation = new vscode.MarkdownString(`\`@mixin ${m.name}(${paramsStr})\``);
        item.range = replaceRange;
        items.push(item);
      }
    }

    logger.debug(`Returning ${items.length} completion items for namespace: ${namespace}`);
    return items;
  }

  /**
   * mixin引数補完 (@include styles.button-primary(█))
   */
  private async provideMixinArgumentCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    namespace: string | null,
    mixinName: string,
  ): Promise<vscode.CompletionItem[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return [];
    }

    const currentFilePath = document.uri.fsPath;
    const workspaceRoot = workspaceFolder.uri.fsPath;
    const currentContent = document.getText();

    let targetFilePath: string;
    let targetMixinName: string;

    if (namespace) {
      const useStatement = useResolver.findUseByNamespace(currentContent, namespace);
      if (!useStatement) {
        return [];
      }

      if (useStatement.path.startsWith("sass:")) {
        return [];
      }

      const moduleFilePath = await moduleResolver.resolveModule(
        useStatement.path,
        currentFilePath,
        workspaceRoot,
      );

      if (!moduleFilePath) {
        return [];
      }

      const moduleContent = await readFile(moduleFilePath);
      forwardResolver.clearVisitedFiles();

      const forwardedResult = await forwardResolver.findForwardedMember(
        moduleContent,
        mixinName,
        moduleFilePath,
        workspaceRoot,
      );

      targetFilePath = forwardedResult?.filePath || moduleFilePath;
      targetMixinName = forwardedResult?.originalName || mixinName;
    } else {
      // namespace なしの場合は現在のファイルで検索
      targetFilePath = currentFilePath;
      targetMixinName = mixinName;
    }

    const targetContent = await readFile(targetFilePath);
    const mixinDef = sassParser.findMixinDefinition(targetContent, targetMixinName, targetFilePath);

    if (!mixinDef?.parameters || mixinDef.parameters.length === 0) {
      return [];
    }

    // 現在の行から既に入力済みの引数を検出
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);
    const enteredArgs = new Set<string>();
    const enteredArgMatches = Array.from(textBeforeCursor.matchAll(/\$([\w-]+)\s*:/g));
    for (const m of enteredArgMatches) {
      enteredArgs.add(m[1]);
    }

    // 未入力の引数のみ補完候補に
    const items: vscode.CompletionItem[] = [];
    for (const param of mixinDef.parameters) {
      if (enteredArgs.has(param.name)) {
        continue;
      }

      const item = new vscode.CompletionItem(`\$${param.name}`, vscode.CompletionItemKind.Property);
      item.detail = param.defaultValue ? `(optional) default: ${param.defaultValue}` : "(required)";
      item.insertText = new vscode.SnippetString(`\\$${param.name}: \${0}`);
      items.push(item);
    }

    return items;
  }

  /**
   * スコープ内変数補完 ($█)
   */
  private async provideScopeVariableCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return [];
    }

    const currentFilePath = document.uri.fsPath;
    const workspaceRoot = workspaceFolder.uri.fsPath;
    const content = document.getText();
    const items: vscode.CompletionItem[] = [];
    const seen = new Set<string>();

    // 1. ローカル変数
    const localVars = sassParser.findAllVariableDefinitions(content, currentFilePath);
    for (const v of localVars) {
      const nameWithoutDollar = v.name.startsWith("$") ? v.name.substring(1) : v.name;
      if (nameWithoutDollar.startsWith("_")) {
        continue;
      }
      const key = v.name;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable);
      item.detail = v.value ? `${v.name}: ${v.value}` : v.name;
      // $は既に入力済みなので変数名のみ挿入
      item.insertText = nameWithoutDollar;
      items.push(item);
    }

    // 2. @useモジュールの変数
    const useStatements = useResolver.parseUseStatements(content);
    for (const stmt of useStatements) {
      if (stmt.path.startsWith("sass:")) {
        continue;
      }

      const moduleFilePath = await moduleResolver.resolveModule(
        stmt.path,
        currentFilePath,
        workspaceRoot,
      );

      if (!moduleFilePath) {
        continue;
      }

      const moduleContent = await readFile(moduleFilePath);

      // 直接定義の変数
      const directVars = sassParser.findAllVariableDefinitions(moduleContent, moduleFilePath);
      // @forward転送された変数
      const forwardedVars = (await forwardResolver.findAllForwardedMembers(
        moduleContent,
        moduleFilePath,
        workspaceRoot,
        "variable",
      )) as VariableDefinition[];

      const allVars = [...directVars, ...forwardedVars];

      for (const v of allVars) {
        const nameWithoutDollar = v.name.startsWith("$") ? v.name.substring(1) : v.name;
        if (nameWithoutDollar.startsWith("_")) {
          continue;
        }

        const label = `${stmt.namespace}.$${nameWithoutDollar}`;
        if (seen.has(label)) {
          continue;
        }
        seen.add(label);

        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);
        item.detail = v.value ? `${v.name}: ${v.value}` : v.name;
        // $の代わりにnamespace.$variableNameを全体挿入
        // filterTextを設定して$入力中にマッチするように
        item.filterText = `$${stmt.namespace}.$${nameWithoutDollar}`;
        item.insertText = `${stmt.namespace}.$${nameWithoutDollar}`;
        // 既に入力されている$を置換するためのrange設定
        const startPos = new vscode.Position(position.line, position.character - 1);
        item.range = new vscode.Range(startPos, position);
        items.push(item);
      }
    }

    return items;
  }
}
