import * as vscode from "vscode";
import type { CachedFile } from "../types";
import { logger } from "./logger";

/**
 * ファイル内容のキャッシュマネージャー
 */
class CacheManager {
  private cache: Map<string, CachedFile> = new Map();

  initialize(context: vscode.ExtensionContext) {
    // ファイル変更時にキャッシュを無効化
    vscode.workspace.onDidChangeTextDocument((e) => {
      const uri = e.document.uri.fsPath;
      if (this.cache.has(uri)) {
        logger.debug(`Cache invalidated: ${uri}`);
        this.cache.delete(uri);
      }
    });

    // ファイル削除時にキャッシュを削除
    vscode.workspace.onDidDeleteFiles((e) => {
      e.files.forEach((uri) => {
        const path = uri.fsPath;
        if (this.cache.has(path)) {
          logger.debug(`Cache removed: ${path}`);
          this.cache.delete(path);
        }
      });
    });
  }

  get(filePath: string): string | undefined {
    const cached = this.cache.get(filePath);
    if (cached) {
      logger.debug(`Cache hit: ${filePath}`);
      return cached.content;
    }
    logger.debug(`Cache miss: ${filePath}`);
    return undefined;
  }

  set(filePath: string, content: string): void {
    this.cache.set(filePath, {
      content,
      timestamp: Date.now(),
    });
    logger.debug(`Cache set: ${filePath}`);
  }

  clear(): void {
    this.cache.clear();
    logger.info("Cache cleared");
  }

  getSize(): number {
    return this.cache.size;
  }
}

export const cacheManager = new CacheManager();
