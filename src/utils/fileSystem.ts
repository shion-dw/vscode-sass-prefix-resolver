import * as fs from "node:fs";
import { cacheManager } from "./cache";
import { logger } from "./logger";

/**
 * package.jsonのSass/Style関連フィールドの型定義
 */
interface SassPackageJson {
  sass?: string;
  style?: string;
  [key: string]: unknown;
}

/**
 * ファイル読み込み（キャッシュ対応）
 */
export async function readFile(filePath: string): Promise<string> {
  // キャッシュチェック
  const cached = cacheManager.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  // ファイル読み込み
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    cacheManager.set(filePath, content);
    return content;
  } catch (error) {
    logger.error(`Failed to read file: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * ファイルが存在するかチェック
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * package.jsonを読み込む
 */
export async function readPackageJson(packagePath: string): Promise<SassPackageJson | null> {
  try {
    const content = await readFile(packagePath);
    return JSON.parse(content) as SassPackageJson;
  } catch (error) {
    logger.debug(`Failed to read package.json: ${packagePath}`);
    return null;
  }
}

/**
 * ディレクトリ内のファイルを列挙
 */
export async function readDirectory(dirPath: string): Promise<string[]> {
  try {
    return await fs.promises.readdir(dirPath);
  } catch (error) {
    logger.error(`Failed to read directory: ${dirPath}`, error as Error);
    return [];
  }
}
