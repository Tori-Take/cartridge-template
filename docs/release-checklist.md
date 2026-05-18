# Stage 1 → Stage 5 リリースチェックリスト

AppHarbor Studio で動いたカートリッジを **AppHarbor 本番** まで届ける時の必須手順と、
実際に踏まれがちな落とし穴をまとめた実戦ガイド。

> **想定読者**: Stage 1 (ローカル Studio + PGlite) でカートリッジが動いた直後の開発者
> **ゴール**: 同じカートリッジを `https://appharbor.vercel.app/org/<slug>/apps/<id>` で動かす

---

## 🎯 全体像

```
Stage 1  (ローカル Studio + PGlite)
  │
  ├─ Stage 2  (ローカル Studio + Docker Supabase)        ← 本物の Postgres で挙動確認
  ├─ Stage 3  (ローカル Studio + Studio クラウド Supabase) ← ネット越し DB を体験
  ├─ Stage 4  (Vercel Studio + GitHub fetch)            ← デプロイ環境で動くか確認
  └─ Stage 5  (AppHarbor 本番)                          ← 実運用 ★ハマる
```

各 Stage は単独で完結。途中で止めても「デモ用」として使える。

---

## ✅ Stage 1 完了の確認

ここから先に進む前に、Stage 1 で以下を満たしていること:

- [ ] `npm run dev` で Studio が起動 (`http://localhost:3200`)
- [ ] `cartridges-registry.yaml` にカートリッジが登録されている
- [ ] `/org/studio-sandbox/apps/<id>` でページが描画される
- [ ] `getAdminSupabase()` や `notify()` などの SDK 呼び出しが期待通りに動く

---

## 🚀 Stage 5 (本番) リリース手順

> Stage 2-4 をスキップして Stage 5 へ直行する場合の最短経路。
> 既存カートリッジ (`cart-daily-log` 等) と同じ流れ。

### Step 1. import エイリアスを `@/sdk` に統一

```ts
// ❌ Vercel build で Module not found になる
import { requireApp } from '@appharbor/sdk'

// ✅ 既存カートリッジと揃える
import { requireApp } from '@/sdk'
```

cartridge-template の `package.json` には `@appharbor/sdk` 依存があるが、
**AppHarbor 本体には `@appharbor/sdk` の webpack alias がないため、本番で resolve できない**。
ローカル開発用 (npm install 後の型補完用) と割り切り、import は `@/sdk` を使うこと。

### Step 2. カートリッジを GitHub に push

```bash
gh repo create Tori-Take/cart-<id> --public --source=. --remote=origin --push
```

### Step 3. AppHarbor 本体 `cartridges-registry.yaml` に追加

```yaml
- id: <id>
  repo: Tori-Take/cart-<id>
  ref: main
  mode: installed
  enabled: true
```

→ commit + push すると Vercel の prebuild で `fetch-cartridges.js` が clone する。

### Step 4. 本番 `apps` テーブルに行を作る ★忘れがち

```bash
# 推奨: 公式 CLI 経由
cd /path/to/AppHarbor
npx tsx scripts/cartridge-install.ts ./cartridges/<id>
```

または手で SQL:

```sql
INSERT INTO apps (app_id, display_name, description, version,
                  permissions, default_permission, status)
VALUES ('<id>', '...', '...', '0.1.0',
        ARRAY['member'], 'member', 'active')
ON CONFLICT (app_id) DO UPDATE SET ...
```

**`apps` テーブルに行がないと `announcements.source_app_id` FK で notify() が失敗する**。

### Step 5. DB schema があれば migration を本番 Supabase に適用

```bash
cd /path/to/AppHarbor
# supabase/migrations/ に SQL ファイルを追加
npx supabase db push --linked
```

schema 不要のカートリッジは skip。

### Step 6. Vercel デプロイ完了を待つ

```bash
gh api repos/Tori-Take/appharbor/deployments?per_page=1
```

state=success を確認。失敗していたら `npx vercel inspect <url> --logs`。

### Step 7. 対象組織でカートリッジを「有効化」

ブラウザで `/platform/apps/<id>` を開き、対象組織の行で「**有効化**」をクリック。
これがないと `app_installations` テーブルに行が作られず、`/org/<slug>/apps/<id>` は 404 を返す。

### Step 8. テストユーザーが対象組織のメンバーか確認

ブラウザで `/org/<slug>/apps/<id>` にアクセスする **テストユーザー** が:

- [ ] `profiles` テーブルにその組織の行を持っている
- [ ] `auth.users.raw_user_meta_data.orgSlug` が対象 slug に一致
- [ ] サインインし直して新しい JWT を取得済み (metadata 変更後は **必ず再ログイン**)

---

## 🆘 よくあるハマりポイント (FAQ)

### Q1: Vercel build が `Module not found: '@appharbor/sdk'` で失敗する

cartridge-template の例示通りに書いたパターン。Step 1 を参照。**全 import を `@/sdk` に書き換える**。

### Q2: `/org/<slug>/apps/<id>` が 404 を返す

候補を上から順に潰す:

1. `apps` テーブルに行があるか？ → `SELECT * FROM apps WHERE app_id = '<id>'`
2. その組織で有効化されているか？ → `/platform/apps/<id>` で確認
3. 自分が組織メンバーか？ → `SELECT * FROM profiles WHERE id = '<your-uuid>'`
4. `user_metadata.orgSlug` は正しいか？ → 違ったら UPDATE + 再ログイン
5. Vercel デプロイは成功しているか？ → `gh api deployments` で確認

### Q3: Studio で動いたコードが本番で動かない

**Studio mock と本番でテーブル名が違う可能性あり**:

| 概念 | Studio mock | 本番 |
|---|---|---|
| 通知 | `notifications` | `announcements` |

カートリッジが `notify()` で **書く** だけなら問題なし（SDK が吸収）。
カートリッジで **読む** クエリを書くなら、**本番側のテーブル名** に揃えること。

### Q4: 自分が送った通知が自分にも届く

AppHarbor 本体側の RLS / クエリで `created_by != self` を入れていないと起きる。
最新の `app/org/[slug]/layout.tsx` 等にはフィルタ追加済み。古いブランチを使っているなら更新。

### Q5: Platform Admin が自分の作ったカートリッジをテストできない

Platform Admin はデフォルトでどの組織のメンバーでもないので `/org/<slug>/apps/<id>` で弾かれる。
回避策:

- **Option A**: `platform-preview` 組織で有効化 → `/org/platform-preview/apps/<id>` でテスト
  (要 Step 7 を `platform-preview` に対して実行)
- **Option B**: 開発用に自分を任意組織のメンバーとして登録 (上記 Step 8)

### Q6: `user_metadata` を変更したのに JWT に反映されない

Supabase の JWT は発行時のクレームを持っている。**ユーザーがサインアウト → サインインし直す** まで proxy.ts のチェックは旧 metadata を見続ける。

---

## 🧪 リリース後の動作確認

最終チェック:

- [ ] `/org/<slug>/apps/<id>` でカートリッジ画面が表示される
- [ ] サーバーアクションが成功する (フォーム送信 → エラーなし)
- [ ] DB に正しい行が書き込まれている (`SELECT` で確認)
- [ ] `notify()` を呼ぶなら、`/org/<slug>/dashboard` で他ユーザーに見えるか
- [ ] Sentry / ログにエラーが出ていない

---

## 📚 関連ドキュメント

| ファイル | 内容 |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | カートリッジ開発の基本規約 |
| [`docs/cookbook.md`](./cookbook.md) | 10 種類の実装パターン集 |
| [`docs/sdk-reference.md`](./sdk-reference.md) | `@/sdk` の全関数リファレンス |
| [`docs/pitfalls.md`](./pitfalls.md) | AI が間違えがちな 10 個の罠 |
| [`docs/prompts.md`](./prompts.md) | 効果的なプロンプト例 |

---

## 📝 このチェックリストの履歴

- 2026-05-18 初版作成。`cart-info-sender` を Stage 1 → Stage 5 まで通した実体験を元に整理。
