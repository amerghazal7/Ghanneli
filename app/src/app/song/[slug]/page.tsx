import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Player } from '../../../components/player'
import { getDb, type Db } from '../../../server/db/client'
import { songs } from '../../../server/db/schema'

// ---------------------------------------------------------------------------
// Presentational component — exported so tests can render it directly
// ---------------------------------------------------------------------------

interface SharePageContentProps {
  status: string
  previewUri?: string
  /** fullUri intentionally unused — full audio is gated behind Slice 4 */
  fullUri?: string
}

export function SharePageContent({ status, previewUri }: SharePageContentProps) {
  if (status === 'ready' && previewUri) {
    return (
      <main>
        <Player src={previewUri} />
        <Link href="/create">اصنع أغنيتك</Link>
      </main>
    )
  }

  if (status === 'failed') {
    return (
      <main>
        <p>حدث خطأ أثناء إنشاء الأغنية.</p>
        <Link href="/create">اصنع أغنيتك</Link>
      </main>
    )
  }

  // pending / lyrics / generating / postprocess
  return (
    <main>
      <p>جاري إنشاء أغنيتك…</p>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

export async function getShareSong(
  slug: string,
  db: Db,
): Promise<{ status: string; previewUri: string | null } | null> {
  const rows = await db
    .select({ status: songs.status, previewUri: songs.previewUri })
    .from(songs)
    .where(eq(songs.shareSlug, slug))

  if (rows.length === 0) return null
  return rows[0]
}

// ---------------------------------------------------------------------------
// Server component (page)
// ---------------------------------------------------------------------------

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const song = await getShareSong(slug, getDb())
  if (!song) notFound()

  return (
    <SharePageContent
      status={song.status}
      previewUri={song.previewUri ?? undefined}
    />
  )
}
