# AI プロンプト例

AppHarbor カートリッジ開発で AI にお願いするときの効果的なプロンプト例。

---

## カートリッジを最初から作る

### プロンプト

> 経費精算アプリを作って。以下の機能が欲しい:
> - 申請者が経費を申請（金額・カテゴリ・領収書写真）
> - 上司が承認/差戻し
> - 一覧 + 検索（ステータスフィルタ）
> - admin がカテゴリマスタを管理できる

### AI が生成すべきもの

1. `manifest.json` — id, version, permissions, navigation
2. `db/schema.sql`:
   - `expense_categories` テーブル（admin が管理）
   - `expense_requests` テーブル（status, amount, category_id, requester_id, approver_id, etc.）
   - storage バケット `expense-tracker-receipts`
   - 各テーブルに organization_id, RLS, トリガ
3. `routes/page.tsx` — 申請一覧（自分の申請）
4. `routes/new/page.tsx` + `actions.ts` — 新規申請
5. `routes/[id]/page.tsx` — 詳細 + 承認/差戻しボタン（admin のみ）
6. `routes/admin/categories/page.tsx` — カテゴリ管理（admin 専用、`requireApp` の gate で保護）

### チェック項目

- [ ] schema.sql のテーブル全てに `organization_id`
- [ ] RLS ポリシーが定義されている
- [ ] storage バケット名に `expense-tracker-` prefix
- [ ] admin 専用ページで `requireApp(slug, 'expense-tracker', role => role === 'admin')`
- [ ] 全クエリに `.eq('organization_id', ctx.actor.organizationId)`

---

## 既存カートリッジに機能を追加

### プロンプト例 1: カラム追加

> `my_items` テーブルに `due_date DATE` カラムを追加して、
> 一覧で期限超過のものを赤背景にして。

### AI が変更すべき箇所

1. `db/schema.sql`:
   ```sql
   ALTER TABLE my_items ADD COLUMN IF NOT EXISTS due_date DATE;
   ```
2. `routes/page.tsx`:
   - `select` の columns に `due_date` を追加
   - 行表示で `new Date(item.due_date) < new Date()` をチェック
   - `className={cn('...', isOverdue && 'bg-red-50')}`
3. `routes/new/page.tsx`:
   - `<input type="date" name="due_date" />` を追加
4. `routes/new/actions.ts`:
   - `due_date: formData.get('due_date')` を insert に追加

---

### プロンプト例 2: フィルタ追加

> 一覧ページに「ステータス」のフィルタを追加して。
> URL クエリパラメータ `?status=active` で絞り込めるように。

### AI が生成すべきもの

```tsx
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  let query = supabase
    .from('my_items')
    .select('*')
    .eq('organization_id', ctx.actor.organizationId)

  if (sp.status) query = query.eq('status', sp.status)

  const { data } = await query

  // フィルタ UI:
  // <Link href="?status=active">Active</Link>
}
```

---

### プロンプト例 3: 削除機能

> 詳細ページに「削除」ボタンを追加して。
> 確認ダイアログを出して、admin のみ削除可能に。

### AI が生成すべきもの

1. `routes/[id]/page.tsx`:
   - `ctx.role === 'admin'` の時のみ削除ボタン表示
   - `DeleteButton` をクライアントコンポーネントとして抽出
2. `routes/[id]/DeleteButton.tsx`:
   ```tsx
   'use client'
   import { useTransition } from 'react'
   import { deleteItemAction } from './actions'

   export function DeleteButton({ slug, id }: { slug: string; id: string }) {
     const [pending, start] = useTransition()
     return (
       <button
         onClick={() => {
           if (!confirm('削除してよろしいですか？')) return
           start(() => deleteItemAction(slug, id))
         }}
         disabled={pending}
       >
         {pending ? '削除中…' : '削除'}
       </button>
     )
   }
   ```
3. `routes/[id]/actions.ts`:
   ```ts
   'use server'
   import { redirect } from 'next/navigation'
   import { requireApp, getAdminSupabase } from '@/sdk'

   export async function deleteItemAction(slug: string, id: string) {
     const ctx = await requireApp(slug, 'my-cartridge', (r) => r === 'admin')
     const supabase = getAdminSupabase()

     await supabase.from('my_items')
       .delete()
       .eq('id', id)
       .eq('organization_id', ctx.actor.organizationId)

     redirect(`/org/${slug}/apps/my-cartridge`)
   }
   ```

---

### プロンプト例 4: 写真アップロード

> 項目に写真を 1 枚添付できるようにして。

### AI が生成すべきもの

1. `db/schema.sql`:
   ```sql
   ALTER TABLE my_items ADD COLUMN IF NOT EXISTS photo_path TEXT;

   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES ('my-cartridge-photos', 'my-cartridge-photos', false, 10485760,
           ARRAY['image/jpeg','image/png','image/webp'])
   ON CONFLICT (id) DO NOTHING;

   CREATE POLICY "photos_insert" ON storage.objects
     FOR INSERT TO authenticated WITH CHECK (bucket_id = 'my-cartridge-photos');
   CREATE POLICY "photos_select" ON storage.objects
     FOR SELECT TO authenticated USING (bucket_id = 'my-cartridge-photos');
   ```
2. `routes/new/PhotoUpload.tsx`:
   ```tsx
   'use client'
   import { useState } from 'react'
   import { createBrowserSupabase } from '@/sdk/client'

   export function PhotoUpload({ orgId, onUploaded }: { orgId: string; onUploaded: (path: string) => void }) {
     const supabase = createBrowserSupabase()
     // ...
   }
   ```
3. `routes/new/actions.ts`:
   - `photo_path: formData.get('photo_path')` を insert に追加
4. `routes/[id]/page.tsx`:
   - signed URL を server で発行して `<img>` で表示

---

## より高度なプロンプト

### ダッシュボード

> このカートリッジのトップに簡易ダッシュボードを置いて。
> 「総項目数」「今月の新規」「ステータス別件数」を KPI カードで表示。

### CSV エクスポート

> 一覧画面に「CSV ダウンロード」ボタンを追加して。
> API ルート経由で BOM 付き UTF-8 CSV を返す。

### ワークフロー

> 「申請 → 承認待ち → 承認済み」のステータス遷移を実装して。
> 各状態でできることが違う。承認は admin のみ。

---

## ❌ こんなプロンプトはダメ

### あいまい

> ❌「経費アプリ作って」
> → 何をどう作るか伝わらず、AI が勝手に決める

### 規約無視を強要

> ❌「とりあえずシンプルに、認証チェックなしで作って」
> → セキュリティ崩壊

### Studio 外を要求

> ❌「Stripe で決済機能つけて」
> → カートリッジは閉じた小さなアプリ。複雑な外部連携はカートリッジの責務外

---

## 必ず伝えるべき情報

新機能を依頼するとき、以下を最初に伝える:

1. **何を作るか**（機能の概要）
2. **誰が使うか**（viewer / admin / 特定の役割）
3. **データ構造**（どんな列が必要か）
4. **画面の流れ**（一覧 → 詳細 → 編集 など）
5. **権限の出し分け**（admin だけが見えるボタン等）

これで AI が AppHarbor 規約に沿ったコードを 90% 以上正しく生成できます。

---

## 生成後に必ず実施

AI 生成コードを受け取ったら:

1. `docs/pitfalls.md` のチェックリストで自己診断
2. `db/schema.sql` の変更を `npm run cartridge:release <id>` でテスト migration 生成
3. Studio で動作確認
4. Git に commit
