import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb, type Db } from '../../../../../server/db/client'
import { songs } from '../../../../../server/db/schema'
import { requireUser } from '../../../../../server/auth/middleware'
import { Unauthorized } from '../../../../../server/auth/verify'
import type { AnalyticsEvent } from '../../../../../server/services/analytics/events'
import { emitDefault } from '../../../../../server/services/analytics/wiring'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

/**
 * Store a rating for a song owned by userId.
 * - Throws RangeError when rating is not an integer in range 1..5.
 * - Throws NotFoundError when song doesn't exist or belongs to another user.
 */
export async function rateSong(
  songId: string,
  userId: string,
  rating: number,
  db: Db = getDb(),
  emitEvent?: (e: AnalyticsEvent) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RangeError(`rating must be an integer between 1 and 5, got ${rating}`)
  }

  const rows = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)))

  if (rows.length === 0) {
    throw new NotFoundError('Song not found')
  }

  await db.update(songs).set({ rating }).where(eq(songs.id, songId))

  await emitEvent?.({ type: 'song_rated', songId, rating })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let userId: string
  try {
    const result = await requireUser(req)
    userId = result.userId
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: songId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await rateSong(songId, userId, parsed.data.rating, getDb(), emitDefault)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
}
