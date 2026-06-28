# AppHarbor Cartridge Template 📦

AppHarbor カートリッジを最速で開発開始するためのテンプレートリポジトリ。

## クイックスタート

### 1. このリポをテンプレートとして使う

GitHub の **「Use this template」→「Create a new repository」** をクリック、
または:

```bash
gh repo create my-cartridge --template Tori-Take/cartridge-template --public
```

### 2. AppHarborStudio で動作確認

`AppHarborStudio/cartridges-registry.yaml` に追加:

```yaml
cartridges:
  - id: my-cartridge
    repo: your-account/my-cartridge
    ref: main
    mode: installed
```

Studio を再起動すると GitHub から自動 fetch され、
`http://localhost:3200/org/studio-sandbox/apps/my-cartridge` で動作確認できます。

### 2.5. 本体への自動反映を有効化（推奨）

このテンプレートには `.github/workflows/redeploy-appharbor.yml` が同梱されており、
**main に push すると AppHarbor 本体を自動で再ビルド**して最新のカートリッジを取り込ませます。
有効化するには、自分のリポに secret を 1 つ登録するだけ:

```bash
gh secret set APPHARBOR_DEPLOY_HOOK_URL --repo your-account/my-cartridge
```

URL は Vercel の AppHarbor プロジェクト → Settings → Git → Deploy Hooks で発行します
（管理者に共有してもらってください）。詳細は本体リポの
`docs/cartridge-auto-redeploy.md` を参照。

### 3. AI でブラッシュアップ

このリポジトリには AI アシスタント向け規約ファイルが含まれています:

- `CLAUDE.md` — Claude Code 用（最も詳細）
- `.cursorrules` — Cursor 用
- `.github/copilot-instructions.md` — GitHub Copilot 用
- `AGENTS.md` — その他の AI エージェント用

→ AI ツールがこれを自動読込するので、AppHarbor 規約に沿った
コード生成がそのまま行えます。

### 4. リリース

`manifest.json` の `version` を上げて push、
AppHarbor リポジトリで:

```bash
npm run cartridge:release my-cartridge
```

→ 本番用 + studio 用 migration が自動生成されます。

---

## 含まれる内容

```
.
├── manifest.json                    カートリッジ定義（id / version / 権限）
├── icon.svg                         アイコン
├── db/
│   ├── schema.sql                  サンプルテーブル (my_items)
│   └── sample-data.sql             サンプルデータ
├── routes/
│   ├── page.tsx                    一覧ページ
│   ├── new/page.tsx                新規作成フォーム
│   ├── new/actions.ts              Server Action
│   └── [id]/page.tsx               詳細ページ
├── docs/                            📚 AI が深く参照するドキュメント
│   ├── cookbook.md                 実装パターン集（10 種類）
│   ├── sdk-reference.md            @/sdk 全 API リファレンス
│   ├── pitfalls.md                 AI が間違えがちな罠
│   └── prompts.md                  効果的なプロンプト例
├── CLAUDE.md                        AI 向けエントリーポイント
├── .cursorrules                     Cursor 用規約
├── .github/copilot-instructions.md  Copilot 用規約
└── AGENTS.md                        汎用 AI エージェント用
```

## 重要なルール

| ルール | 理由 |
|---|---|
| 全テーブルに `organization_id` を持たせる | マルチテナント境界を保証 |
| 全クエリは `organization_id` でフィルタ | テナント越境防止 |
| Server Action は `requireApp()` から始める | 認証 + 権限チェック |
| スキーマは冪等に書く | 再適用時のエラー回避 |
| RLS ポリシーで `auth.jwt()` を参照 | 本番でのテナント分離 |

詳細は `CLAUDE.md` を参照してください。

## 参考実装

実用的なカートリッジ例: **[Tori-Take/cart-patrol-navi](https://github.com/Tori-Take/cart-patrol-navi)**
（安全パトロール管理アプリ。ワークフロー、CSV インポート、PDF 出力など）

## ライセンス

MIT
