import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '../../../server/auth/middleware'
import { Unauthorized } from '../../../server/auth/verify'
import { getDb, type Db } from '../../../server/db/client'
import { songs } from '../../../server/db/schema'
import { createQueue } from '../../../server/jobs/queue/factory'
import type { AnalyticsEvent } from '../../../server/services/analytics/events'
import { emitDefault } from '../../../server/services/analytics/wiring'

export const bodySchema = z.object({
  occasion: z.string().min(1),
  recipient: z.string().min(1),
  sender: z.string().min(1),
  relationship: z.string().min(1),
  details: z.array(z.string()),
  mood: z.string().min(1),
  lengthHint: z.enum(['short', 'standard']),
  dialect: z.enum(['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi']),
  genre: z.string().min(1),
  voiceGender: z.enum(['male', 'female']),
})

export type SongBody = z.infer<typeof bodySchema>

export async function createSong(
  input: SongBody,
  {
    db,
    userId,
    enqueue,
    emitEvent = async () => {},
  }: { db: Db; userId: string; enqueue: (songId: string) => Promise<void>; emitEvent?: (e: AnalyticsEvent) => Promise<void> },
): Promise<{ songId: string; shareSlug: string }> {
  const { occasion, dialect, genre, voiceGender, recipient, sender, relationship, details, mood, lengthHint } = input

  const [song] = await db
    .insert(songs)
    .values({
      userId,
      occasion,
      dialect,
      genre,
      voiceGender,
      status: 'pending',
      inputs: { recipient, sender, relationship, details, mood, lengthHint },
    })
    .returning()

  await enqueue(song.id)

  await emitEvent({ type: 'wizard_started' })

  return { songId: song.id, shareSlug: song.shareSlug }
}

export async function POST(req: Request): Promise<NextResponse> {
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

  const queue = createQueue()
  const result = await createSong(parsed.data, {
    db: getDb(),
    userId,
    enqueue: (songId) => queue.enqueue('generate', { songId }),
    emitEvent: emitDefault,
  })

  return NextResponse.json(result, { status: 201 })
}
