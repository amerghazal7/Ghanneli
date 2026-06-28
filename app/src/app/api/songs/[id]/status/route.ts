import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb, type Db } from '../../../../../server/db/client'
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const result = await getSongStatus(id, getDb())
  if (!result) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(result)
}
