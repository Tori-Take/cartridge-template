import Link from 'next/link'
import { requireApp, getAdminSupabase } from '@appharbor/sdk'

export default async function MyCartridgePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await requireApp(slug, 'my-cartridge')
  const supabase = getAdminSupabase()

  const { data: items } = await supabase
    .from('my_items')
    .select('id, name, description, status, created_at')
    .eq('organization_id', ctx.actor.organizationId)
    .order('created_at', { ascending: false })

  const base = `/org/${slug}/apps/my-cartridge`

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Cartridge</h1>
        <Link
          href={`${base}/new`}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + 新規作成
        </Link>
      </div>

      {!items || items.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          項目がありません
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${base}/${item.id}`}
                className="block rounded-md border bg-background px-4 py-3 hover:bg-muted/30"
              >
                <p className="font-medium">{item.name as string}</p>
                {item.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.description as string}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
