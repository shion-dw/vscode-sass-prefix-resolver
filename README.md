# vscode-sass-prefix-resolver

VSCode拡張機能で、Sass/SCSSの@forward prefix付き転送を解決し、正確な定義へのジャンプを提供します。既存のSass拡張機能が対応していないprefix変換に特化した補完ツールです。

## なぜこの拡張機能が必要か

多くのSass拡張機能は `@forward` の `as prefix-*` 構文で正しく定義にジャンプできません。この拡張機能は、そのギャップを埋めるために開発されました。

例えば、以下のようなケースで正確にジャンプできます:
- `@forward "./src/list" as list-*` でプレフィックスが付けられたmixin/変数
- 再帰的な@forward転送
- node_modules内のパッケージの複雑なモジュール構造

## 特徴

- `@use` で読み込んだモジュールのmixin定義へのジャンプ
- `@use` で読み込んだモジュールの変数定義へのジャンプ
- `@forward` のprefix付き転送に対応（例: `as list-*`, `as color-*`）
- node_modules 内のパッケージに対応
- 再帰的な `@forward` 転送に対応
- namespace部分のクリックでモジュールファイルへジャンプ

## インストール

### ソースからビルド

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

生成された`vscode-sass-prefix-resolver-X.X.X.vsix`ファイルをVSCodeにインストールします。

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

## 使い方

1. Sass/SCSSファイルで、mixin呼び出しや変数参照の部分（例: `styles.list-reset`, `styles.$color-primary`）にカーソルを合わせる
2. F12キー（または右クリック→「定義に移動」）を押す
3. 定義の場所にジャンプします

**ヒント:** namespace部分（例: `styles.$color`の`styles`）にカーソルを合わせてF12を押すと、モジュールファイル自体にジャンプできます。

## 例

### mixin定義へのジャンプ

```scss
@use "@example/styles" as styles;

.container {
  // "list-reset" にカーソルを合わせて F12 を押す
  @include styles.list-reset;
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
