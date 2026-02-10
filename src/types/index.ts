/**
 * @use宣言の情報
 */
export interface UseStatement {
  /** モジュールパス（例: "@example/styles", "./components/button"） */
  path: string;
  /** 名前空間（例: "styles", "button"） */
  namespace: string;
  /** ファイル内での行番号 */
  line: number;
}

/**
 * @forward宣言の情報
 */
export interface ForwardStatement {
  /** 転送元モジュールパス */
  path: string;
  /** プレフィックス（例: "list-"）、プレフィックスなしの場合はnull */
  prefix: string | null;
  /** ファイル内での行番号 */
  line: number;
}

/**
 * mixin定義の情報
 */
/**
 * mixin引数の情報
 */
export interface MixinParameter {
  /** 引数名（例: "size"、$記号なし） */
  name: string;
  /** デフォルト値（ある場合、例: "medium"） */
  defaultValue: string | null;
  /** 定義ファイル内での行番号（0-indexed） */
  line: number;
  /** 定義ファイル内での列番号（0-indexed、$記号の位置） */
  column: number;
}

export interface MixinDefinition {
  /** mixin名 */
  name: string;
  /** 定義されているファイルパス */
  filePath: string;
  /** 行番号（0-indexed） */
  line: number;
  /** 列番号（0-indexed） */
  column: number;
  /** mixin引数のリスト（オプショナル） */
  parameters?: MixinParameter[];
}

/**
 * 変数定義の情報
 */
export interface VariableDefinition {
  /** 変数名（$付き） */
  name: string;
  /** 定義されているファイルパス */
  filePath: string;
  /** 行番号（0-indexed） */
  line: number;
  /** 列番号（0-indexed） */
  column: number;
}

/**
 * 解決コンテキスト
 */
export interface ResolutionContext {
  /** カーソル位置のトークン全体（例: "styles.list-reset"） */
  token: string;
  /** 名前空間部分（例: "styles"） */
  namespace: string;
  /** メンバー名部分（例: "list-reset"） */
  member: string;
  /** 現在のドキュメントのファイルパス */
  currentFilePath: string;
  /** ワークスペースルートパス */
  workspaceRoot: string;
  /** カーソルがnamespace部分かmember部分か */
  cursorTarget: "namespace" | "member";
}

/**
 * ファイルキャッシュのエントリ
 */
export interface CachedFile {
  /** ファイル内容 */
  content: string;
  /** キャッシュ時刻 */
  timestamp: number;
}
