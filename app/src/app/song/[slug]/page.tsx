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
  fullUri?: string
  songId?: string
  unlocked?: boolean
}

export function SharePageContent({ status, previewUri, fullUri, songId, unlocked }: SharePageContentProps) {
  if (status === 'ready' && previewUri) {
    return (
      <main>
        {unlocked && fullUri ? (
          <Player src={fullUri} />
        ) : (
          <>
            <Player src={previewUri} />
            {songId && (
              <form method="POST" action={`/api/songs/${songId}/unlock`}>
                <button type="submit">فتح</button>
              </form>
            )}
          </>
        )}
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
): Promise<{ id: string; status: string; previewUri: string | null; fullUri: string | null; unlocked: boolean } | null> {
  const rows = await db
    .select({
      id: songs.id,
      status: songs.status,
      previewUri: songs.previewUri,
      fullUri: songs.fullUri,
      unlocked: songs.unlocked,
    })
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
      fullUri={song.fullUri ?? undefined}
      songId={song.id}
      unlocked={song.unlocked}
    />
  )
}
