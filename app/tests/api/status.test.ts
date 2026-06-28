import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { getSongStatus } from '../../src/app/api/songs/[id]/status/status'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

describe('getSongStatus', () => {
  let db: TestDb
  let userId: string
  let songId: string

  beforeEach(async () => {
    db = await testDb()

    const [user] = await db
      .insert(users)
      .values({ authUid: 'test-uid', email: 'test@example.com' })
      .returning()
    userId = user.id

    const [song] = await db
      .insert(songs)
      .values({
        userId,
        occasion: 'عيد ميلاد',
        dialect: 'egyptian',
        genre: 'pop',
        voiceGender: 'female',
        status: 'pending',
        inputs: {
          recipient: 'أحمد',
          sender: 'سارة',
          relationship: 'صديق',
          details: ['يحب الموسيقى'],
          mood: 'سعيد',
          lengthHint: 'standard',
        },
      })
      .returning()
    songId = song.id
  })

  it('returns current status for a pending song', async () => {
    const result = await getSongStatus(songId, db as unknown as Db)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('pending')
  })

  it('does NOT expose previewUri when song is not ready', async () => {
    // Update song to have a previewUri but still not ready
    await db
      .update(songs)
      .set({ previewUri: 'https://cdn.example.com/preview.mp3', status: 'generating' })
      .where(eq(songs.id, songId))

    const result = await getSongStatus(songId, db as unknown as Db)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('generating')
    expect(result!.previewUri).toBeUndefined()
  })

  it('exposes previewUri when song is ready', async () => {
    await db
      .update(songs)
      .set({ previewUri: 'https://cdn.example.com/preview.mp3', status: 'ready' })
      .where(eq(songs.id, songId))

    const result = await getSongStatus(songId, db as unknown as Db)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('ready')
    expect(result!.previewUri).toBe('https://cdn.example.com/preview.mp3')
  })

  it('returns null for a non-existent song id', async () => {
    const result = await getSongStatus('00000000-0000-0000-0000-000000000000', db as unknown as Db)
    expect(result).toBeNull()
  })
})
