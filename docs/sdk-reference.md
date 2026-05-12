# @appharbor/sdk リファレンス

カートリッジが import 可能な SDK 関数の全リスト。

---

## 認証・コンテキスト系

### `requireApp(slug, appId, gate?)`

カートリッジページで認証 + アプリロールチェックを行い、コンテキストを返す。

```ts
import { requireApp } from '@appharbor/sdk'

const ctx = await requireApp('org-slug', 'my-cartridge')

ctx.actor.id              // string: ユーザー ID
ctx.actor.organizationId  // string: 組織 ID
ctx.actor.departmentId    // string | null: 部署 ID
ctx.role                  // string | null: アプリ内ロール（'viewer' / 'admin' 等）
```

オプションの `gate` で権限チェック:

```ts
// admin のみアクセス可能
await requireApp(slug, 'my-cartridge', (role) => role === 'admin')

// viewer 以上
await requireApp(slug, 'my-cartridge', (role) => ['viewer', 'admin'].includes(role ?? ''))
```

権限不足の場合は自動でリダイレクト（または 403）する。

---

### `requireActor(slug, role?)`

組織メンバーであることだけを検証（アプリロールは見ない）。
主に API ルートや管理系で使う。

```ts
import { requireActor } from '@appharbor/sdk'

const guard = await requireActor('org-slug', 'member')
// 'member' | 'dept-admin' | 'org-admin'

if (!guard.ok) {
  return NextResponse.json({ error: guard.error }, { status: 403 })
}

guard.actor.id
guard.actor.organizationId
```

戻り値:
- `{ ok: true; actor: Actor }` — 成功
- `{ ok: false; error: string }` — 失敗

---

### `getAppRole(args)`

特定ユーザーのアプリ内ロールを取得。

```ts
import { getAppRole } from '@appharbor/sdk'

const role = await getAppRole({
  organizationId: ctx.actor.organizationId,
  userId:         someUserId,
  departmentId:   someDeptId,
  appId:          'my-cartridge',
})
// 'viewer' | 'admin' | null
```

---

## Supabase クライアント系

### `getAdminSupabase()` （サーバー専用）

サーバーサイドで使う Supabase クライアント。RLS をバイパスする service_role キー使用想定。
**サーバーコンポーネント / Server Action / API ルートでのみ使う**。

```ts
import { getAdminSupabase } from '@appharbor/sdk'

const supabase = getAdminSupabase()

// SELECT
const { data, error } = await supabase
  .from('my_items')
  .select('*')
  .eq('organization_id', ctx.actor.organizationId)
  .order('created_at', { ascending: false })

// INSERT
await supabase.from('my_items').insert({
  organization_id: ctx.actor.organizationId,
  name: '...',
})

// UPDATE
await supabase.from('my_items')
  .update({ name: '新しい名前' })
  .eq('id', itemId)
  .eq('organization_id', ctx.actor.organizationId)  // ← 必須

// DELETE
await supabase.from('my_items')
  .delete()
  .eq('id', itemId)
  .eq('organization_id', ctx.actor.organizationId)
```

---

### `createBrowserSupabase()` （ブラウザ専用）

クライアントコンポーネントから使う Supabase クライアント。
`'use client'` ファイル内で使用。

```ts
'use client'
import { createBrowserSupabase } from '@appharbor/sdk/client'

const supabase = createBrowserSupabase()

// 読み取り（クライアントから）
const { data } = await supabase
  .from('my_items')
  .select('*')
  .eq('organization_id', currentOrgId)
```

⚠️ ブラウザクライアントは認証ユーザーの権限で動作する（RLS 有効）。
Studio では service_role バイパスされている。

---

## ストレージ系

### `supabase.storage.from(bucketName)`

ファイルアップロード:

```ts
// サーバーから
const supabase = getAdminSupabase()

const { data, error } = await supabase.storage
  .from('my-cartridge-attachments')
  .upload('path/to/file.jpg', fileBlob)

// signed URL を発行（30 分有効）
const { data: signed } = await supabase.storage
  .from('my-cartridge-attachments')
  .createSignedUrl(data.path, 60 * 30)

// signed.signedUrl を <img> に渡す
```

クライアントから:

```ts
'use client'
const supabase = createBrowserSupabase()
const { data } = await supabase.storage
  .from('my-cartridge-attachments')
  .upload(path, file)
```

ファイル削除:

```ts
await supabase.storage
  .from('my-cartridge-attachments')
  .remove(['path/to/file.jpg'])
```

---

## 型

### `Actor`

```ts
type Actor = {
  id:             string  // user UUID
  organizationId: string  // org UUID
  departmentId:   string | null
}
```

### `AppContext` （`requireApp` の戻り値）

```ts
type AppContext = {
  actor: Actor
  role:  string | null  // 'viewer' / 'admin' 等
}
```

### `OrgRole`

```ts
type OrgRole = 'member' | 'dept-admin' | 'org-admin'
```

---

## プラットフォーム共通テーブル

カートリッジから読めるが**書いてはいけない**テーブル:

| テーブル | 説明 |
|---|---|
| `organizations` | 組織（id, slug, name） |
| `profiles`      | ユーザープロフィール（id, organization_id, display_name, org_role） |
| `departments`   | 部署（id, organization_id, parent_id, name） |
| `apps`          | アプリ定義 |

参照例:

```ts
// 組織メンバーの一覧を取得
const { data: members } = await supabase
  .from('profiles')
  .select('id, display_name, org_role')
  .eq('organization_id', ctx.actor.organizationId)
  .eq('status', 'active')
  .order('display_name')
```

---

## 認証関数（SQL 内）

`db/schema.sql` の RLS ポリシーで使える:

| 関数 | 戻り値 |
|---|---|
| `auth.uid()` | 現在のユーザー UUID |
| `auth.jwt() ->> 'organization_id'` | 現在の組織 UUID（文字列） |
| `auth.jwt() ->> 'sub'` | 現在のユーザー UUID（文字列） |

例:

```sql
CREATE POLICY "org_isolation" ON my_items
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```
