# vscode-sass-prefix-resolver

VSCode拡張機能で、Sass/SCSSの@forward prefix付き転送を解決し、正確な定義へのジャンプとIntelliSense補完を提供します。既存のSass拡張機能が対応していないprefix変換に特化した補完ツールです。

## なぜこの拡張機能が必要か

多くのSass拡張機能は `@forward` の `as prefix-*` 構文で正しく定義にジャンプできません。この拡張機能は、そのギャップを埋めるために開発されました。

例えば、以下のようなケースで正確にジャンプできます:
- `@forward "./src/list" as list-*` でプレフィックスが付けられたmixin/変数
- 再帰的な@forward転送
- node_modules内のパッケージの複雑なモジュール構造

## 特徴

### 定義へのジャンプ

- `@use` で読み込んだモジュールのmixin定義へのジャンプ
- `@use` で読み込んだモジュールの変数定義へのジャンプ
- ミックスイン呼び出し時の引数から、定義の引数宣言へのジャンプ
- `@forward` のprefix付き転送に対応（例: `as list-*`, `as color-*`）
- node_modules 内のパッケージに対応
- 再帰的な `@forward` 転送に対応
- namespace部分のクリックでモジュールファイルへジャンプ

### IntelliSense補完

- `namespace.` 入力時にmixin・変数の候補を自動表示
- コンテキストに応じた補完の出し分け
  - `@include` の後 → mixin候補のみ
  - プロパティ値の位置（`:` の後） → 変数候補のみ
  - 上記以外 → mixin・変数の両方
- `namespace.$` 入力時に変数候補を表示
- `$` 入力時にスコープ内の変数を補完（ローカル変数 + `@use` モジュールの変数）
- mixin引数の補完（`@include mixin(` の後に未入力の引数を候補表示）

## インストール

### GitHubのReleasesから（推奨）

1. [Releases](https://github.com/shion-dw/vscode-sass-prefix-resolver/releases)ページから最新の`.vsix`ファイルをダウンロード
2. 以下のいずれかの方法でインストール

#### VSIXファイルのインストール方法

**方法1: VSCodeの拡張機能ビューから**

1. VSCodeを開く
2. 拡張機能ビュー（Ctrl+Shift+X / Cmd+Shift+X）を開く
3. 右上の`...`メニューから「VSIXからのインストール...」を選択
4. 生成された`.vsix`ファイルを選択

**方法2: コマンドラインから**

```bash
code --install-extension vscode-sass-prefix-resolver-X.X.X.vsix
```

### ソースからビルド

開発版をビルドする場合:

```bash
# リポジトリをクローン
git clone https://github.com/shion-dw/vscode-sass-prefix-resolver.git
cd vscode-sass-prefix-resolver

# 依存関係をインストール
yarn

# コンパイル
yarn compile

# VSIXファイルを作成
yarn package
```

生成された`vscode-sass-prefix-resolver-X.X.X.vsix`ファイルを上記の方法でVSCodeにインストールします。

## 使い方

### 定義へのジャンプ

1. Sass/SCSSファイルで、mixin呼び出しや変数参照の部分（例: `styles.list-reset`, `styles.$color-primary`）にカーソルを合わせる
2. F12キー（または右クリック→「定義に移動」）を押す
3. 定義の場所にジャンプします

**ヒント:** namespace部分（例: `styles.$color`の`styles`）にカーソルを合わせてF12を押すと、モジュールファイル自体にジャンプできます。

### IntelliSense補完

`@use` で読み込んだモジュールのnamespace名に続けて `.` を入力すると、利用可能なmixinや変数の補完候補が自動的に表示されます。

- **mixin補完**: `@include styles.` と入力 → mixin候補がリストアップ
- **変数補完**: `color: styles.` と入力 → 変数候補がリストアップ
- **引数補完**: `@include styles.button-primary(` と入力 → 未入力の引数が候補表示
- **スコープ変数補完**: `$` を入力 → ローカル変数と`@use`モジュールの変数が候補表示

## 例

### mixin定義へのジャンプ

```scss
@use "@example/styles" as styles;

.container {
  // "list-reset" にカーソルを合わせて F12 を押す
  @include styles.list-reset;
}
```

### mixin引数定義へのジャンプ

```scss
@use "@example/styles" as styles;

.button {
  // "$size" や "$variant" にカーソルを合わせて F12 を押すと、
  // mixin定義の引数宣言にジャンプします
  @include styles.button-primary($size: large, $variant: outline);
}
```

mixinの定義例:
```scss
// @example/styles/src/components/button.scss
@mixin button-primary($size: medium, $variant: solid) {
  padding: if($size == large, 1rem 2rem, 0.5rem 1rem);
  background-color: if($variant == solid, #007bff, transparent);
}
```

### 変数定義へのジャンプ

```scss
@use "@example/styles" as styles;

.container {
  // "$color-primary" にカーソルを合わせて F12 を押す
  color: styles.$color-primary;
  border: 1px solid styles.$color-mono6;
}
```

### IntelliSense補完

#### mixin補完

```scss
@use "@example/styles" as styles;

.container {
  @include styles.  // ← "." の後にmixin候補が表示される
  // 候補: list-reset, button-primary, ...
}
```

#### 変数補完

```scss
@use "@example/styles" as styles;

.container {
  color: styles.  // ← "." の後に変数候補が表示される
  // 候補: $color-primary, $color-mono6, ...
}
```

#### コンテキストに応じた候補の出し分け

```scss
@use "@example/styles" as styles;

// @include の後 → mixin候補のみ
@include styles.  // → list-reset, button-primary, ...

// プロパティ値の位置 → 変数候補のみ
color: styles.  // → $color-primary, $color-mono6, ...

// 行頭など → mixin + 変数の両方
styles.  // → list-reset, button-primary, $color-primary, ...
```

#### mixin引数補完

```scss
@use "@example/styles" as styles;

.button {
  @include styles.button-primary(  // ← "(" の後に引数候補が表示される
  // 候補: $size, $variant
  // 既に入力済みの引数は候補から除外される
  @include styles.button-primary($size: large,   // ← $variant のみ候補に表示
}
```

#### スコープ内変数補完

```scss
@use "@example/styles" as styles;

$local-color: red;

.container {
  color: $  // ← "$" の後にスコープ内の変数候補が表示される
  // 候補: $local-color, styles.$color-primary, styles.$color-mono6, ...
}
```

以下のような構造のパッケージに対応しています:

```
node_modules/@example/styles/
├── index.scss              # @forward "./src/elements/list" as list-*;
│                           # @forward "./src/main/color" as color-*;
└── src/
    ├── elements/
    │   └── list.scss       # @mixin reset() { ... }
    └── main/
        └── color.scss      # $primary: #007bff;
                            # $mono6: #f0f0f0;
```

## 設定

### sassPrefixResolver.includePaths

追加のSassインクルードパスを指定します（将来の拡張用）。

```json
{
  "sassPrefixResolver.includePaths": [
    "src/styles"
  ]
}
```

### sassPrefixResolver.trace.server

デバッグログの出力レベルを設定します。

- `off`: ログ出力なし（デフォルト）
- `messages`: 基本的な情報のみ
- `verbose`: 詳細なデバッグ情報

```json
{
  "sassPrefixResolver.trace.server": "verbose"
}
```

ログは「出力」パネルの「Sass Prefix Resolver」チャンネルで確認できます。

## 対応している構文

### @use

```scss
@use "@example/styles" as styles;
@use "./components/button" as btn;
@use "sass:math";  // 組み込みモジュールはスキップ
```

### @forward

```scss
@forward "./src/elements/list" as list-*;
@forward "./components/button";  // prefix なし
```

### mixin定義

```scss
@mixin reset() {
  // ...
}

@mixin button-primary($size: medium) {
  // ...
}
```

#### mixin呼び出しの引数

```scss
@include styles.button-primary($size: large);
@include btn.reset;  // 引数なし
@include components.card($padding: 20px, $background: #fff);
```

名前付き引数部分（`$size`、`$padding`など）をクリックすると、mixin定義の引数宣言にジャンプします。

### 変数定義

```scss
$primary: #007bff;
$color-mono6: #f0f0f0;
$button-height: 40px;
```

## 制限事項

- 関数定義（`@function`）、クラスセレクタなどは今後対応予定です
- ブロックコメント内のmixin/変数定義を誤検知する可能性があります

## 開発

### プロジェクト構成

```
vscode-sass-prefix-resolver/
├── src/                    # TypeScriptソースコード
│   ├── extension.ts       # 拡張機能のエントリーポイント
│   ├── providers/         # VSCode プロバイダー
│   ├── parser/           # Sassパーサー
│   ├── types/            # 型定義
│   └── utils/            # ユーティリティ
├── out/                   # コンパイル済みJavaScript
├── test/                  # テストファイル
├── package.json          # 拡張機能のメタデータ
├── tsconfig.json         # TypeScript設定
└── README.md             # ドキュメント
```

### セットアップ

```bash
yarn
```

### ビルドコマンド

- `yarn compile`: TypeScriptをコンパイル
- `yarn watch`: ファイル変更を監視して自動コンパイル
- `yarn package`: VSIXファイルを作成
- `yarn lint`: コードのリント（Biome）
- `yarn lint:fix`: リントエラーを自動修正
- `yarn format`: コードフォーマット
- `yarn check`: リント + 型チェックの総合チェック

### デバッグ

1. VSCodeでプロジェクトを開く
2. F5キーを押してExtension Development Hostを起動
3. `test/fixtures/workspace/main.scss`を開いてテスト

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。
