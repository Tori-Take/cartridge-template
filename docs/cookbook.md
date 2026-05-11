# AppHarbor カートリッジ Cookbook

実装パターン集。AI アシスタントはこの中から該当パターンをコピペ・改変して使ってください。

---

## 目次

1. [CRUD: 一覧 + 作成 + 詳細](#1-crud-一覧--作成--詳細)
2. [検索・フィルタリング](#2-検索フィルタリング)
3. [ページネーション](#3-ページネーション)
4. [編集・削除（楽観的 UI）](#4-編集削除楽観的-ui)
5. [写真・ファイルアップロード](#5-写真ファイルアップロード)
6. [ワークフロー（状態遷移）](#6-ワークフロー状態遷移)
7. [権限による UI 出し分け](#7-権限による-ui-出し分け)
8. [CSV エクスポート](#8-csv-エクスポート)
9. [ダッシュボード（集計）](#9-ダッシュボード集計)
10. [モーダルフォーム](#10-モーダルフォーム)

---

## 1. CRUD: 一覧 + 作成 + 詳細

→ テンプレートの `routes/` がそのままこのパターンです。

**ポイント:**
- `requireApp(slug, 'cartridge-id')` で認証
- `.eq('organization_id', ctx.actor.organizationId)` でテナント境界
- Server Action で挿入 → `redirect()` で遷移

---

## 2. 検索・フィルタリング

`routes/page.tsx`:

```tsx
import { requireApp, getAdminSupabase } from '@/sdk'

export default async function ListPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  let query = supabase
    .from('my_items')
    .select('*')
    .eq('organization_id', ctx.actor.organizationId)
    .order('created_at', { ascending: false })

  if (sp.q)      query = query.ilike('name', `%${sp.q}%`)
  if (sp.status) query = query.eq('status', sp.status)

  const { data: items } = await query

  return (
    <div className="p-6">
      <form className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={sp.q}
          placeholder="名前で検索"
          className="rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          name="status"
          defaultValue={sp.status}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">すべて</option>
          <option value="active">有効</option>
          <option value="archived">アーカイブ</option>
        </select>
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
          検索
        </button>
      </form>

      {/* 一覧 */}
    </div>
  )
}
```

---

## 3. ページネーション

```tsx
const pageSize = 20
const page     = Number(sp.page ?? '1')

const { data, count } = await supabase
  .from('my_items')
  .select('*', { count: 'exact' })
  .eq('organization_id', ctx.actor.organizationId)
  .range((page - 1) * pageSize, page * pageSize - 1)

const totalPages = Math.ceil((count ?? 0) / pageSize)

// UI
<div className="flex gap-2">
  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
    <Link
      key={p}
      href={`?page=${p}`}
      className={cn('rounded px-2 py-1', p === page && 'bg-primary text-primary-foreground')}
    >
      {p}
    </Link>
  ))}
</div>
```

---

## 4. 編集・削除（楽観的 UI）

`routes/[id]/edit/page.tsx`:

```tsx
import { requireApp, getAdminSupabase } from '@/sdk'
import { updateItemAction, deleteItemAction } from './actions'

export default async function EditPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const { data: item } = await supabase
    .from('my_items')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)
    .single()

  if (!item) return notFound()

  return (
    <form action={updateItemAction.bind(null, slug, id)}>
      <input name="name" defaultValue={item.name} required />
      <textarea name="description" defaultValue={item.description ?? ''} />
      <button type="submit">保存</button>
      <button type="submit" formAction={deleteItemAction.bind(null, slug, id)}>削除</button>
    </form>
  )
}
```

`actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireApp, getAdminSupabase } from '@/sdk'

export async function updateItemAction(slug: string, id: string, formData: FormData) {
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const { error } = await supabase
    .from('my_items')
    .update({
      name: formData.get('name'),
      description: formData.get('description') || null,
    })
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)  // ← 削除でも必ず付ける

  if (error) throw new Error(error.message)

  revalidatePath(`/org/${slug}/apps/my-cartridge/${id}`)
  redirect(`/org/${slug}/apps/my-cartridge/${id}`)
}

export async function deleteItemAction(slug: string, id: string) {
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  await supabase
    .from('my_items')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)

  redirect(`/org/${slug}/apps/my-cartridge`)
}
```

---

## 5. 写真・ファイルアップロード

`db/schema.sql` にバケット定義:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'my-cartridge-attachments',
  'my-cartridge-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "my_cartridge_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'my-cartridge-attachments');

CREATE POLICY "my_cartridge_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'my-cartridge-attachments');
```

クライアント側コンポーネント:

```tsx
'use client'
import { useState } from 'react'
import { createBrowserSupabase } from '@/sdk/client'

export function PhotoUpload({ orgId, itemId }: { orgId: string; itemId: string }) {
  const [uploading, setUploading] = useState(false)
  const supabase = createBrowserSupabase()

  const handleUpload = async (file: File) => {
    setUploading(true)
    const path = `${orgId}/${itemId}/${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage
      .from('my-cartridge-attachments')
      .upload(path, file)
    setUploading(false)

    if (error) { alert(`アップロード失敗: ${error.message}`); return }

    // path を DB に保存（別途 Server Action）
    await fetch('/api/...path保存...', { method: 'POST', body: JSON.stringify({ path: data.path }) })
  }

  return (
    <input
      type="file"
      accept="image/*"
      disabled={uploading}
      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
    />
  )
}
```

サーバー側で signed URL を発行:

```ts
const { data } = await supabase.storage
  .from('my-cartridge-attachments')
  .createSignedUrl(item.photo_path, 60 * 30)  // 30 分有効

// data.signedUrl を <img> に渡す
```

---

## 6. ワークフロー（状態遷移）

```sql
CREATE TABLE IF NOT EXISTS my_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  requester_id    UUID REFERENCES profiles(id),
  reviewer_id     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Server Action で状態遷移:

```ts
export async function approveRequestAction(slug: string, id: string, comment: string) {
  const ctx = await requireApp(slug, 'my-cartridge', (role) => role === 'admin')
  const supabase = getAdminSupabase()

  // 現在状態を検証
  const { data: req } = await supabase
    .from('my_requests')
    .select('status')
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)
    .single()

  if (!req || req.status !== 'submitted') {
    throw new Error('承認できる状態ではありません')
  }

  await supabase
    .from('my_requests')
    .update({
      status: 'approved',
      reviewer_id: ctx.actor.id,
      reviewed_at: new Date().toISOString(),
      comment,
    })
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)
}
```

UI で状態に応じた表示:

```tsx
const STATUS_LABEL: Record<string, string> = {
  draft:     '下書き',
  submitted: '承認待ち',
  approved:  '承認済み',
  rejected:  '却下',
}

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
}

<span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_COLOR[req.status])}>
  {STATUS_LABEL[req.status]}
</span>
```

---

## 7. 権限による UI 出し分け

```tsx
import { requireApp } from '@/sdk'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireApp(slug, 'my-cartridge')

  const isAdmin = ctx.role === 'admin'

  return (
    <div>
      {/* 全員が見える */}
      <ItemList />

      {/* admin のみ */}
      {isAdmin && (
        <Link href={`/org/${slug}/apps/my-cartridge/admin`}>
          管理画面へ
        </Link>
      )}
    </div>
  )
}
```

admin 専用ページの保護:

```tsx
export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // 第 3 引数で権限チェック関数を渡す
  await requireApp(slug, 'my-cartridge', (role) => role === 'admin')

  return <div>管理画面</div>
}
```

---

## 8. CSV エクスポート

`app/api/export/route.ts`（カートリッジ内に API ルートも作れる）:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireActor, getAdminSupabase } from '@/sdk'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guard = await requireActor(slug, 'member')
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  const supabase = getAdminSupabase()
  const { data } = await supabase
    .from('my_items')
    .select('*')
    .eq('organization_id', guard.actor.organizationId)

  const csv = [
    ['ID', '名前', '説明', '作成日'].join(','),
    ...(data ?? []).map((r) =>
      [r.id, `"${r.name}"`, `"${r.description ?? ''}"`, r.created_at].join(','),
    ),
  ].join('\n')

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="export-${Date.now()}.csv"`,
    },
  })
}
```

---

## 9. ダッシュボード（集計）

```tsx
export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const orgId = ctx.actor.organizationId

  const [totalRes, activeRes, archivedRes] = await Promise.all([
    supabase.from('my_items').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase.from('my_items').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('my_items').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'archived'),
  ])

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      <Kpi label="総項目" value={totalRes.count ?? 0} />
      <Kpi label="有効"   value={activeRes.count ?? 0} />
      <Kpi label="アーカイブ" value={archivedRes.count ?? 0} />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
```

---

## 10. モーダルフォーム

`'use client'` でステート管理:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { createItemAction } from './actions'

export function CreateItemButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded bg-primary px-3 py-1.5">
        + 新規
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="w-96 rounded-lg bg-background p-6">
            <h2 className="mb-3 text-lg font-bold">新規作成</h2>
            <form
              action={(fd) => start(async () => {
                await createItemAction(slug, fd)
                setOpen(false)
              })}
            >
              <input name="name" required className="w-full rounded border px-3 py-1.5" />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)}>キャンセル</button>
                <button type="submit" disabled={pending}>作成</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

---

## 参考実装

実用カートリッジの実装例:
**[Tori-Take/cart-patrol-navi](https://github.com/Tori-Take/cart-patrol-navi)** - 業務向けの本格カートリッジ
- マルチステップワークフロー
- 写真添付 + signed URL
- CSV インポート/エクスポート
- 期間レポート PDF
- リアルタイム検索
- 是正アクション追跡
