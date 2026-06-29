import { eq, and } from 'drizzle-orm'
import { getDb, type Db } from '../../../../../server/db/client'
import { songs } from '../../../../../server/db/schema'
import { debit } from '../../../../../server/services/credits/ledger'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class SongNotReadyError extends Error {
  constructor(message = 'Song not ready') {
    super(message)
    this.name = 'SongNotReadyError'
  }
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

/**
 * Debit 1 credit and mark the song unlocked.
 * - Throws NotFoundError when the song doesn't exist or doesn't belong to userId.
 * - Throws InsufficientCreditsError when the user has no credits (and the debit
 *   has not been applied before — idempotent re-unlock does NOT throw).
 * - Returns { fullUri, altFullUri } on success (altFullUri present when an A/B
 *   alternate version exists).
 */
export async function unlockSong(
  songId: string,
  userId: string,
  db: Db = getDb(),
): Promise<{ fullUri: string; altFullUri?: string }> {
  // 1. Load song — only rows owned by this user
  const rows = await db
    .select({
      id: songs.id,
      userId: songs.userId,
      fullUri: songs.fullUri,
      altFullUri: songs.altFullUri,
      status: songs.status,
    })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)))

  if (rows.length === 0) {
    // Either the song doesn't exist, or it belongs to another user — 404 in both
    // cases so we don't leak existence.
    throw new NotFoundError('Song not found')
  }

  const song = rows[0]

  // 2. Guard: only unlock a song whose audio is ready — don't burn a credit otherwise
  if (song.status !== 'ready') {
    throw new SongNotReadyError('Song not ready')
  }

  // 4. Debit 1 credit — idempotent by (reason='song', refId=songId)
  // If already applied this will no-op; if balance is insufficient it throws.
  await debit(userId, 1, 'song', songId, db)

  // 5. Mark as unlocked (idempotent — safe to run even if already true)
  await db
    .update(songs)
    .set({ unlocked: true })
    .where(eq(songs.id, songId))

  return {
    fullUri: song.fullUri ?? '',
    ...(song.altFullUri ? { altFullUri: song.altFullUri } : {}),
  }
}
