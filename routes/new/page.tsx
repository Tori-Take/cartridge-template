import Link from 'next/link'
import { requireApp } from '@/sdk'
import { createItemAction } from './actions'

export default async function NewItemPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await requireApp(slug, 'my-cartridge')

  const base = `/org/${slug}/apps/my-cartridge`
  const bound = createItemAction.bind(null, slug)

  return (
    <div className="mx-auto max-w-md p-6">
      <Link
        href={base}
        className="mb-4 inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        ← 一覧へ戻る
      </Link>

      <h1 className="mb-4 text-xl font-bold">新規作成</h1>

      <form action={bound} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">名前</label>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">説明</label>
          <textarea
            name="description"
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          作成
        </button>
      </form>
    </div>
  )
}
