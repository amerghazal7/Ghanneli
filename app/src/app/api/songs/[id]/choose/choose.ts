import { eq, and } from 'drizzle-orm'
import { getDb, type Db } from '../../../../../server/db/client'
import { songs } from '../../../../../server/db/schema'

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export type Variant = 'primary' | 'alt'

/**
 * Record which A/B version the listener prefers for a song they own.
 * - `variant: 'primary'` → stores the primary engineId; `'alt'` → the altEngineId.
 * - Throws NotFoundError when the song doesn't exist or belongs to another user.
 * - Returns the stored engineId (or null when that variant has no engine).
 */
export async function chooseVersion(
  songId: string,
  userId: string,
  variant: Variant,
  db: Db = getDb(),
): Promise<{ chosenEngine: string | null }> {
  const rows = await db
    .select({
      id: songs.id,
      engineId: songs.engineId,
      altEngineId: songs.altEngineId,
    })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)))

  if (rows.length === 0) {
    throw new NotFoundError('Song not found')
  }

  const song = rows[0]
  const chosenEngine = variant === 'alt' ? song.altEngineId : song.engineId

  await db.update(songs).set({ chosenEngine }).where(eq(songs.id, songId))

  return { chosenEngine }
}
