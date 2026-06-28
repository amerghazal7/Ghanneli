import { eq } from 'drizzle-orm'
import { SongPage } from '../../../components/SongPage'
import type { Db } from '../../../server/db/client'
import { songs } from '../../../server/db/schema'

// ---------------------------------------------------------------------------
// Presentational component — exported so tests can render it directly.
// Props kept identical to original for test compatibility.
// ---------------------------------------------------------------------------

interface SharePageContentProps {
  status: string
  previewUri?: string
  fullUri?: string
  songId?: string
  unlocked?: boolean
}

export function SharePageContent({
  status,
  previewUri,
  fullUri,
  songId,
  unlocked,
}: SharePageContentProps) {
  return (
    <main>
      <SongPage
        songId={songId}
        initialStatus={status}
        previewUri={previewUri}
        fullUri={fullUri}
        unlocked={unlocked}
      />
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
