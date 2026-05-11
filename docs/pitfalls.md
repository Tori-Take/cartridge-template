# AI が間違えがちな罠

AppHarbor カートリッジ開発で AI が頻繁にやらかすミスと正しい対処法。
コード生成後に必ずこのリストを照合してください。

---

## 🚨 罠 1: `organization_id` の付け忘れ

### ❌ ダメな例

```ts
// SELECT
const { data } = await supabase
  .from('my_items')
  .select('*')
  // ← organization_id でフィルタしてない！全テナント丸見え

// INSERT
await supabase.from('my_items').insert({
  name: '...',
  // ← organization_id がない！
})

// UPDATE / DELETE
await supabase.from('my_items')
  .delete()
  .eq('id', id)
  // ← organization_id チェックなし！他組織のデータも消せる
```

### ✅ 正しい例

```ts
// SELECT
const { data } = await supabase
  .from('my_items')
  .select('*')
  .eq('organization_id', ctx.actor.organizationId)

// INSERT
await supabase.from('my_items').insert({
  name: '...',
  organization_id: ctx.actor.organizationId,
})

// UPDATE / DELETE は id だけでなく organization_id でも必ず絞る
await supabase.from('my_items')
  .delete()
  .eq('id', id)
  .eq('organization_id', ctx.actor.organizationId)
```

**理由:** Studio では RLS が無効なので、`organization_id` フィルタなしだとテナント越境する。本番では RLS が守ってくれるが、Studio で動作確認する時に他組織のデータが混ざる事故が起きる。

---

## 🚨 罠 2: Server Action での `requireApp` 忘れ

### ❌ ダメな例

```ts
'use server'

export async function createItemAction(formData: FormData) {
  const supabase = getAdminSupabase()
  await supabase.from('my_items').insert({...})
  // ← 認証チェックなし！誰でも実行できる
}
```

### ✅ 正しい例

```ts
'use server'

export async function createItemAction(slug: string, formData: FormData) {
  const ctx = await requireApp(slug, 'my-cartridge')  // ← 必須

  const supabase = getAdminSupabase()
  await supabase.from('my_items').insert({
    organization_id: ctx.actor.organizationId,
    ...
  })
}
```

**理由:** Server Action は HTTP エンドポイントと同じセキュリティ境界。認証チェックは Server Action 冒頭で。

---

## 🚨 罠 3: スキーマの非冪等な書き方

### ❌ ダメな例

```sql
CREATE TABLE my_items (...);
ALTER TABLE my_items ADD COLUMN new_col TEXT;
CREATE INDEX idx_my_items_org ON my_items(organization_id);
```

→ 2 回目の起動でエラー。Studio が立ち上がらない。

### ✅ 正しい例

```sql
CREATE TABLE IF NOT EXISTS my_items (...);
ALTER TABLE my_items ADD COLUMN IF NOT EXISTS new_col TEXT;
CREATE INDEX IF NOT EXISTS idx_my_items_org ON my_items(organization_id);

DROP TRIGGER IF EXISTS set_updated_at ON my_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON my_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS "org_isolation" ON my_items;
CREATE POLICY "org_isolation" ON my_items
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

**理由:** schema.sql は起動のたびに再実行される。冪等でないと 2 回目以降エラー。

---

## 🚨 罠 4: ブラウザクライアントの誤用

### ❌ ダメな例

```tsx
// サーバーコンポーネントなのに createBrowserSupabase を使ってる
import { createBrowserSupabase } from '@/sdk/client'

export default async function Page() {
  const supabase = createBrowserSupabase()  // ← サーバーで使うとエラー
  // ...
}
```

### ✅ 正しい例

```tsx
// サーバーコンポーネント: getAdminSupabase
import { getAdminSupabase } from '@/sdk'

export default async function Page({ params }) {
  const supabase = getAdminSupabase()
  // ...
}

// クライアントコンポーネント: createBrowserSupabase
'use client'
import { createBrowserSupabase } from '@/sdk/client'

export function MyClientComponent() {
  const supabase = createBrowserSupabase()
  // ...
}
```

**使い分け:**
- 拡張子 `.tsx` で `'use client'` ない → サーバー → `getAdminSupabase`
- `'use client'` ある → ブラウザ → `createBrowserSupabase`

---

## 🚨 罠 5: 禁止 import

### ❌ ダメな例

```tsx
import { something } from '@/lib/utils'        // ← Studio 内部、禁止
import { Button } from '@/components/ui/button'  // ← Studio UI、禁止
import { LayoutHeader } from '@/app/layout'    // ← Studio ページ、禁止
```

### ✅ 正しい例

```tsx
// SDK は OK
import { requireApp } from '@/sdk'

// 自分のカートリッジ内の相対パスは OK
import { ItemCard } from './components/ItemCard'

// npm パッケージは OK
import { format } from 'date-fns'

// Next.js / React は OK
import Link from 'next/link'
import { useState } from 'react'
```

**理由:** カートリッジは独立して動くべき。Studio や AppHarbor 本体の内部実装に依存すると、本番で動かない。自前のコンポーネントが必要なら `./components/` 配下に作る。

---

## 🚨 罠 6: storage バケットの名前空間衝突

### ❌ ダメな例

```sql
INSERT INTO storage.buckets (id, name, ...)
VALUES ('attachments', 'attachments', ...);
```

→ 他カートリッジと衝突する可能性。

### ✅ 正しい例

```sql
INSERT INTO storage.buckets (id, name, ...)
VALUES ('my-cartridge-attachments', 'my-cartridge-attachments', ...);
```

**ルール:** バケット名は `<cartridge-id>-<purpose>` 形式（例: `patrol-navi-attachments`, `expense-tracker-receipts`）。

---

## 🚨 罠 7: redirect / revalidate の置き場所

### ❌ ダメな例

```ts
export async function createItemAction(...) {
  const { error } = await supabase.from(...).insert(...)
  if (error) {
    redirect('/error')  // ← throw した方が良い（特定の場合を除く）
  }

  redirect(`/org/${slug}/apps/my-cartridge`)
  revalidatePath(`/org/${slug}/apps/my-cartridge`)  // ← redirect の後で呼ばれない
}
```

### ✅ 正しい例

```ts
export async function createItemAction(...) {
  const { error } = await supabase.from(...).insert(...)
  if (error) throw new Error(error.message)

  revalidatePath(`/org/${slug}/apps/my-cartridge`)  // ← redirect の前
  redirect(`/org/${slug}/apps/my-cartridge`)
}
```

---

## 🚨 罠 8: `params` / `searchParams` の取り扱い

Next.js 16 では Promise でラップされている。

### ❌ ダメな例

```tsx
export default async function Page({ params }: { params: { slug: string } }) {
  const { slug } = params  // ← Next 16 では Promise
}
```

### ✅ 正しい例

```tsx
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
}
```

---

## 🚨 罠 9: `useTransition` を使わない Server Action 呼び出し

### ❌ ダメな例

```tsx
'use client'
import { myAction } from './actions'

export function Form() {
  return (
    <form action={async (fd) => { await myAction(fd); router.push('/done') }}>
      {/* pending 状態が分からない */}
    </form>
  )
}
```

### ✅ 正しい例

```tsx
'use client'
import { useTransition } from 'react'
import { myAction } from './actions'

export function Form() {
  const [pending, start] = useTransition()

  return (
    <form action={(fd) => start(async () => {
      await myAction(fd)
    })}>
      <button type="submit" disabled={pending}>
        {pending ? '送信中…' : '送信'}
      </button>
    </form>
  )
}
```

---

## 🚨 罠 10: `notFound()` を catch する

### ❌ ダメな例

```ts
try {
  const { data: item } = await supabase.from('my_items').select('*').eq('id', id).single()
  if (!item) notFound()
} catch (e) {
  console.error(e)  // notFound() は throw する。これで握りつぶしてしまう
}
```

### ✅ 正しい例

```ts
const { data: item } = await supabase.from('my_items').select('*').eq('id', id).single()
if (!item) notFound()  // try/catch で囲まない
```

`notFound()` は React の特殊な制御フローで、最寄りの `not-found.tsx` を表示するために throw する。catch しちゃダメ。

---

## 自己チェック手順

新機能のコードを書いたら以下を確認:

- [ ] 全テーブル定義に `organization_id uuid NOT NULL REFERENCES organizations(id)` がある
- [ ] 全 `.from(...)` クエリに `.eq('organization_id', ...)` がある
- [ ] 全 Server Action の冒頭で `requireApp(slug, '<id>')` を呼んでいる
- [ ] スキーマは `CREATE ... IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` で書いた
- [ ] 禁止 import (`@/lib`, `@/components`, `@/app`) を使っていない
- [ ] storage バケット名に `<cartridge-id>-` prefix を付けた
- [ ] `params` / `searchParams` を `await` した
- [ ] サーバーコンポーネントで `createBrowserSupabase` を呼んでいない
- [ ] Server Action 呼び出しに `useTransition` を使った（クライアント側）
