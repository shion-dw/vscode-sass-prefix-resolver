import * as path from "node:path";
import { fileExists, readPackageJson } from "../utils/fileSystem";
import { logger } from "../utils/logger";

/**
 * Sassモジュールパスを解決するクラス
 */
export class ModuleResolver {
  /**
   * モジュールパスを実際のファイルパスに解決
   *
   * @param modulePath - @use/@forwardで指定されたパス
   * @param currentFilePath - 現在のファイルの絶対パス
   * @param workspaceRoot - ワークスペースのルートパス
   * @returns 解決されたファイルパス、解決できない場合はundefined
   */
  async resolveModule(
    modulePath: string,
    currentFilePath: string,
    workspaceRoot: string,
  ): Promise<string | undefined> {
    logger.debug(`Resolving module: ${modulePath} from ${currentFilePath}`);

    // sass:で始まる組み込みモジュールはスキップ
    if (modulePath.startsWith("sass:")) {
      logger.debug("Built-in Sass module, skipping");
      return undefined;
    }

    // 相対パスの場合
    if (modulePath.startsWith("./") || modulePath.startsWith("../")) {
      return this.resolveRelativePath(modulePath, currentFilePath);
    }

    // パッケージ名の場合（node_modules）
    return this.resolvePackagePath(modulePath, currentFilePath, workspaceRoot);
  }

  /**
   * 相対パスを解決
   */
  private async resolveRelativePath(
    modulePath: string,
    currentFilePath: string,
  ): Promise<string | undefined> {
    const currentDir = path.dirname(currentFilePath);
    const basePath = path.resolve(currentDir, modulePath);

    // 以下の優先順位でファイルを探す
    const candidates = [
      `${basePath}.scss`,
      `${basePath}.sass`,
      `${basePath}/_index.scss`,
      `${basePath}/_index.sass`,
      `${basePath}/index.scss`,
      `${basePath}/index.sass`,
      path.join(path.dirname(basePath), `_${path.basename(basePath)}.scss`),
      path.join(path.dirname(basePath), `_${path.basename(basePath)}.sass`),
    ];

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        logger.debug(`Resolved to: ${candidate}`);
        return candidate;
      }
    }

    logger.debug(`Failed to resolve relative path: ${modulePath}`);
    return undefined;
  }

  /**
   * パッケージパスを解決（node_modules）
   */
  private async resolvePackagePath(
    modulePath: string,
    currentFilePath: string,
    workspaceRoot: string,
  ): Promise<string | undefined> {
    // node_modulesを探索（現在のディレクトリから上に向かって）
    let currentDir = path.dirname(currentFilePath);

    while (true) {
      const nodeModulesPath = path.join(currentDir, "node_modules");

      if (await fileExists(nodeModulesPath)) {
        const resolved = await this.resolveInNodeModules(modulePath, nodeModulesPath);
        if (resolved) {
          return resolved;
        }
      }

      // 親ディレクトリに移動
      const parentDir = path.dirname(currentDir);

      // ワークスペースルートまたはルートディレクトリに到達したら終了
      if (parentDir === currentDir || currentDir === workspaceRoot) {
        break;
      }

      currentDir = parentDir;
    }

    logger.debug(`Failed to resolve package: ${modulePath}`);
    return undefined;
  }

  /**
   * node_modules内でパッケージを解決
   */
  private async resolveInNodeModules(
    modulePath: string,
    nodeModulesPath: string,
  ): Promise<string | undefined> {
    const packagePath = path.join(nodeModulesPath, modulePath);

    // package.jsonを確認
    const packageJsonPath = path.join(packagePath, "package.json");
    if (await fileExists(packageJsonPath)) {
      const packageJson = await readPackageJson(packageJsonPath);
      if (packageJson) {
        // "sass" または "style" フィールドを確認
        const sassEntry = packageJson.sass || packageJson.style;
        if (sassEntry) {
          const entryPath = path.join(packagePath, sassEntry);
          if (await fileExists(entryPath)) {
            logger.debug(`Resolved via package.json: ${entryPath}`);
            return entryPath;
          }
        }
      }
    }

    // デフォルトのファイルを探す
    const candidates = [
      path.join(packagePath, "index.scss"),
      path.join(packagePath, "_index.scss"),
      path.join(packagePath, "index.sass"),
      path.join(packagePath, "_index.sass"),
      `${packagePath}.scss`,
      `${packagePath}.sass`,
      path.join(path.dirname(packagePath), `_${path.basename(packagePath)}.scss`),
      path.join(path.dirname(packagePath), `_${path.basename(packagePath)}.sass`),
    ];

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        logger.debug(`Resolved to: ${candidate}`);
        return candidate;
      }
    }

    return undefined;
  }
}

export const moduleResolver = new ModuleResolver();
