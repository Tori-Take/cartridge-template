# AppHarbor Cartridge — AI 向けガイド

このリポジトリは AppHarbor カートリッジの**雛形**です。
AI アシスタント（Claude / Cursor / Copilot 等）はこのファイルの規約に従ってコードを生成してください。

---

## 🎯 カートリッジとは

AppHarbor は**マルチテナント型 SaaS プラットフォーム**で、カートリッジ（着脱可能な小さなアプリ）を組織にインストールして使う設計です。
このリポジトリ 1 つ = 1 カートリッジ。

カートリッジは 3 つの環境で同じコードが動きます:

| 環境 | データ保管先 | 認証 |
|---|---|---|
| Studio ローカル | PGlite (`.studio-db/pgdata/`) | Cookie のモックユーザー |
| Studio デプロイ版 | Supabase の `studio` スキーマ | Cookie のモックユーザー |
| AppHarbor 本番 | Supabase の `public` スキーマ | Supabase Auth の本物 JWT |

→ 開発者は環境を意識せず `@/sdk` だけ使えば 3 環境で動く。

---

## 📁 ファイル構造

```
cartridge-root/
├── manifest.json          ← カートリッジ定義（id / version / permissions）
├── icon.svg               ← アイコン（emoji ベースで OK）
├── db/
│   ├── schema.sql         ← 必須: テーブル定義（単一ソース）
│   └── sample-data.sql    ← 任意: Studio 動作確認用 seed
├── routes/                ← Next.js App Router ページ
│   ├── page.tsx           ← トップ
│   ├── new/page.tsx       ← サブページ
│   └── [id]/page.tsx      ← 動的ルート
├── README.md
└── CLAUDE.md              ← このファイル
```

---

## 🔒 厳守ルール（AI が破ったら指摘される）

### ルール 1: 全テーブルに `organization_id` を持たせる

```sql
CREATE TABLE my_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ...
);
```

これがないと**マルチテナント越境**してしまう。

### ルール 2: クエリは必ず `organization_id` でフィルタ

```ts
// ✅ OK
const { data } = await supabase
  .from('my_items')
  .select('*')
  .eq('organization_id', ctx.actor.organizationId)

// ❌ NG: テナント境界を越える
const { data } = await supabase
  .from('my_items')
  .select('*')
```

### ルール 3: Server Action は `requireApp()` で認証

```ts
// routes/new/actions.ts
'use server'

import { requireApp, getAdminSupabase } from '@/sdk'

export async function createItemAction(slug: string, formData: FormData) {
  const ctx = await requireApp(slug, 'my-cartridge')  // ← 必須
  const supabase = getAdminSupabase()

  await supabase.from('my_items').insert({
    organization_id: ctx.actor.organizationId,  // ← actor から取る
    // ...
  })
}
```

### ルール 4: スキーマは冪等に書く

```sql
-- ✅ OK
CREATE TABLE IF NOT EXISTS my_items (...);
ALTER TABLE my_items ADD COLUMN IF NOT EXISTS new_col TEXT;

-- ❌ NG: 再適用時にエラーになる
CREATE TABLE my_items (...);
ALTER TABLE my_items ADD COLUMN new_col TEXT;
```

### ルール 5: RLS ポリシーで `auth.jwt()` を使う

```sql
ALTER TABLE my_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON my_items;
CREATE POLICY "org_isolation" ON my_items
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

これは AppHarbor 本番でのみ機能する（Studio は service_role でバイパスされる）。

---

## 🛠 利用可能な SDK 関数

`@/sdk` から import 可能:

| 関数 | 用途 |
|---|---|
| `requireApp(slug, appId)` | アプリ認証 + ロールチェック。`ctx.actor` を返す |
| `requireActor(slug, role)` | 組織メンバー認証のみ |
| `getAdminSupabase()` | サーバーサイド Supabase クライアント（RLS バイパス） |
| `getAppRole(args)` | ユーザーのアプリ内ロール取得 |
| `createBrowserSupabase()` | クライアントサイド Supabase クライアント（`@/sdk/client`） |

`ctx` の中身:

```ts
ctx.actor.id              // ユーザー ID
ctx.actor.organizationId  // 組織 ID（テナント境界）
ctx.actor.departmentId    // 部署 ID（任意）
ctx.role                  // アプリ内ロール（'viewer' | 'admin' 等）
```

---

## 🚫 import 禁止

カートリッジは以下のみ import 可能:

| 許可 | 例 |
|---|---|
| `@/sdk` / `@/sdk/*` | `import { requireApp } from '@/sdk'` |
| `react` / `react-dom` | `import { useState } from 'react'` |
| `next/*` | `import Link from 'next/link'` |
| 相対パス | `import { Foo } from './components/Foo'` |
| npm パッケージ | `import { format } from 'date-fns'` |

以下は**禁止**（cartridge-lint で検出される）:

- `@/lib/*` — Studio 内部モジュール
- `@/components/*` — Studio UI コンポーネント
- `@/app/*` — Studio ページ

---

## 🧑‍💻 開発の進め方

### 1. このリポをテンプレートとして新規カートリッジを作る

```bash
# GitHub UI で「Use this template」→ 自分のリポを作成
# または:
gh repo create my-cartridge --template Tori-Take/cartridge-template
```

### 2. manifest.json を編集

```json
{
  "id": "my-cartridge",        ← 一意の ID
  "version": "0.1.0",
  "name": "My App",
  "icon": "📦",
  "category": "業務",
  "permissions": [
    { "id": "viewer", "label": "閲覧者", "default": true },
    { "id": "admin",  "label": "管理者" }
  ]
}
```

### 3. Studio で動作確認

`AppHarborStudio` の `cartridges-registry.yaml` に登録:

```yaml
cartridges:
  - id: my-cartridge
    repo: your-account/my-cartridge
    ref: main
    mode: installed
```

→ Studio が起動時に GitHub から fetch して `_installed/` に展開。
→ `http://localhost:3200/org/studio-sandbox/apps/my-cartridge` で確認。

### 4. リリース

カートリッジに変更を push して version を bump:

```bash
# manifest.json の version を 0.2.0 に
git tag v0.2.0
git push --tags
```

AppHarbor 本体への取り込みは:

```bash
# AppHarbor リポジトリで
npm run cartridge:release my-cartridge
# → supabase/migrations/ に本番用 + studio 用 SQL が自動生成される
```

---

## 💡 サンプルパターン

このテンプレートには以下のパターンが含まれています:

- `routes/page.tsx`         → 一覧表示（`select` + `eq('organization_id', ...)`）
- `routes/new/page.tsx`     → フォーム（form action でサーバーアクション呼び出し）
- `routes/new/actions.ts`   → Server Action（`requireApp` + `insert`）
- `routes/[id]/page.tsx`    → 動的ルート + `notFound()`

これらをコピペ・改変して自分のカートリッジを作ってください。

---

## 🤖 AI への追加指示

新機能を作るときは:

1. まず `db/schema.sql` にテーブル追加（必ず `organization_id`）
2. `routes/<feature>/page.tsx` で UI
3. 必要なら `routes/<feature>/actions.ts` で Server Action
4. `routes/page.tsx` の一覧やナビにリンク追加
5. `manifest.json` のナビゲーションを更新（任意）

新機能のテンプレ的な質問例:

- 「項目に `due_date` カラムを追加して、期限切れを赤表示」
  → schema.sql に ALTER TABLE、page.tsx で日付比較
- 「ステータス変更ボタンを追加」
  → 新しい Server Action + ボタン UI
- 「写真アップロード機能」
  → `supabase.storage.from('xxx-attachments').upload(...)` + バケット定義

迷ったら `Tori-Take/cart-patrol-navi` の実装を参考にしてください（実用的な参考実装）。

---

## 📚 詳細ドキュメント

このリポジトリの `docs/` 配下に AI が参照すべき詳細情報があります:

| ファイル | 内容 |
|---|---|
| **`docs/cookbook.md`** | 10 種類の実装パターン集（CRUD / 検索 / ファイル / ワークフロー / etc.） |
| **`docs/sdk-reference.md`** | `@/sdk` の全関数リファレンス + コード例 |
| **`docs/pitfalls.md`** | AI が間違えがちな 10 個の罠 + チェックリスト |
| **`docs/prompts.md`** | 効果的なプロンプト例 + AI への依頼テンプレ |

**新機能を生成する前に必ず参照すべき:**
1. 該当パターンがあれば `docs/cookbook.md` からコピペ・改変
2. `@/sdk` の使い方は `docs/sdk-reference.md`
3. 生成後は `docs/pitfalls.md` のチェックリストで自己診断

**ユーザーへのヒント:**
プロンプトの書き方に迷ったら `docs/prompts.md` を見せると、効果的な依頼方法が学べる。
