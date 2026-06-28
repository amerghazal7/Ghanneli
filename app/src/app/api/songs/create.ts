import { z } from 'zod'
import type { Db } from '../../../server/db/client'
import { songs } from '../../../server/db/schema'
import type { AnalyticsEvent } from '../../../server/services/analytics/events'

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
