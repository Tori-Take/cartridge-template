import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireApp, getAdminSupabase } from '@appharbor/sdk'

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const { data: item } = await supabase
    .from('my_items')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.actor.organizationId)
    .single()

  if (!item) notFound()

  const base = `/org/${slug}/apps/my-cartridge`

  return (
    <div className="mx-auto max-w-md p-6">
      <Link
        href={base}
        className="mb-4 inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        ← 一覧へ戻る
      </Link>

      <h1 className="mb-2 text-xl font-bold">{item.name as string}</h1>
      {item.description ? (
        <p className="text-sm text-muted-foreground">{item.description as string}</p>
      ) : null}

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">ステータス</dt>
        <dd>{item.status as string}</dd>
        <dt className="text-muted-foreground">作成日時</dt>
        <dd>{new Date(item.created_at as string).toLocaleString('ja-JP')}</dd>
      </dl>
    </div>
  )
}
