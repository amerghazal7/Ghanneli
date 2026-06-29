import { z } from 'zod'
import type { Db } from '../../../server/db/client'
import { songs } from '../../../server/db/schema'
import type { AnalyticsEvent } from '../../../server/services/analytics/events'

const genderEnum = z.enum(['male', 'female'])
const ageBandEnum = z.enum(['child', 'youth', 'adult', 'senior'])

export const bodySchema = z.object({
  occasion: z.string().min(1),
  recipient: z.string().min(1),
  sender: z.string().min(1),
  relationship: z.string().min(1),
  mood: z.string().min(1),
  lengthHint: z.enum(['short', 'standard']),
  tempo: z.enum(['slow', 'medium', 'fast']),
  dialect: z.enum(['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi']),
  genre: z.string().min(1),
  voiceGender: genderEnum,
  includeName: z.boolean(),
  mentionOccasion: z.boolean(),
  traits: z.array(z.string()),
  story: z.string().optional(),
  recipientGender: genderEnum.optional(),
  recipientAge: ageBandEnum.optional(),
  senderGender: genderEnum.optional(),
  senderAge: ageBandEnum.optional(),
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
  const {
    occasion, dialect, genre, voiceGender,
    recipient, sender, relationship, mood, lengthHint, tempo,
    includeName, mentionOccasion, traits, story,
    recipientGender, recipientAge, senderGender, senderAge,
  } = input

  const [song] = await db
    .insert(songs)
    .values({
      userId,
      occasion,
      dialect,
      genre,
      voiceGender,
      status: 'pending',
      inputs: {
        recipient, sender, relationship, mood, lengthHint, tempo,
        includeName, mentionOccasion, traits, story,
        recipientGender, recipientAge, senderGender, senderAge,
      },
    })
    .returning()

  await enqueue(song.id)

  await emitEvent({ type: 'wizard_started' })

  return { songId: song.id, shareSlug: song.shareSlug }
}
