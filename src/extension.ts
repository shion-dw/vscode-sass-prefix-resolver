import * as vscode from "vscode";
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
}

export function deactivate() {
  logger.info("Sass Prefix Resolver extension deactivated");
  cacheManager.clear();
}
