import * as vscode from "vscode";
import { SassCompletionProvider } from "./providers/completionProvider";
import { SassDefinitionProvider } from "./providers/definitionProvider";
import { cacheManager } from "./utils/cache";
import { logger } from "./utils/logger";

export function activate(context: vscode.ExtensionContext) {
  logger.initialize(context);
  cacheManager.initialize(context);

  logger.info("Sass Prefix Resolver extension activated");

  // DefinitionProviderの登録
  const definitionProvider = new SassDefinitionProvider();

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(["scss", "sass"], definitionProvider),
  );

  logger.info("Definition provider registered for SCSS and Sass files");

  // CompletionProviderの登録
  const completionProvider = new SassCompletionProvider();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ["scss", "sass"],
      completionProvider,
      ".", // namespace.█ のトリガー
      "$", // $█ のトリガー
      "(", // mixin(█ のトリガー
    ),
  );

  logger.info("Completion provider registered for SCSS and Sass files");
}

export function deactivate() {
  logger.info("Sass Prefix Resolver extension deactivated");
  cacheManager.clear();
}
