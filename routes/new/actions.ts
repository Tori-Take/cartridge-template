'use server'

import { redirect } from 'next/navigation'
import { requireApp, getAdminSupabase } from '@/sdk'

/**
 * 新規項目作成 Server Action.
 *
 * - requireApp で認証＋アプリロールチェック
 * - actor.organizationId でテナント境界を保証
 * - 作成後、一覧ページへリダイレクト
 */
export async function createItemAction(slug: string, formData: FormData) {
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const name = (formData.get('name') ?? '').toString().trim()
  if (!name) throw new Error('名前は必須です')

  const description = (formData.get('description') ?? '').toString().trim() || null

  const { error } = await supabase.from('my_items').insert({
    organization_id: ctx.actor.organizationId,
    name,
    description,
    created_by: ctx.actor.id,
  })
  if (error) throw new Error(`作成に失敗しました: ${error.message}`)

  redirect(`/org/${slug}/apps/my-cartridge`)
}
