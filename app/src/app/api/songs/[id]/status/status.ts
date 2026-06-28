import { eq } from 'drizzle-orm'
import type { Db } from '../../../../../server/db/client'
import { songs } from '../../../../../server/db/schema'

export interface SongStatusResult {
  status: string
  previewUri?: string
}

/**
 * Testable core: look up a song by id and return its status.
 * previewUri is only included when the song is ready — never leak it earlier.
 */
export async function getSongStatus(
  songId: string,
  db: Db,
): Promise<SongStatusResult | null> {
  const rows = await db
    .select({
      status: songs.status,
      previewUri: songs.previewUri,
    })
    .from(songs)
    .where(eq(songs.id, songId))

  if (rows.length === 0) return null

  const row = rows[0]
  const result: SongStatusResult = { status: row.status }
  if (row.status === 'ready' && row.previewUri) {
    result.previewUri = row.previewUri
  }
  return result
}
