import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { chooseVersion, NotFoundError } from '../../src/app/api/songs/[id]/choose/choose'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

const baseInputs = {
  recipient: 'أحمد', sender: 'عامر', relationship: 'أخ/أخت',
  mood: 'فرِح', lengthHint: 'short' as const, tempo: 'medium' as const,
  includeName: true, mentionOccasion: true, traits: [],
}

describe('chooseVersion', () => {
  let db: TestDb
  beforeEach(async () => { db = await testDb() })

  async function seed(): Promise<{ userId: string; songId: string }> {
    const [u] = await db.insert(users).values({ authUid: 'u1', email: 'u1@x.com' }).returning()
    const [s] = await db
      .insert(songs)
      .values({
        userId: u.id, occasion: 'عيد ميلاد', dialect: 'khaleeji', genre: 'بوب عربي',
        voiceGender: 'male', status: 'ready',
        engineId: 'acestep-local', altEngineId: 'lyria-3-pro',
        inputs: baseInputs,
      })
      .returning()
    return { userId: u.id, songId: s.id }
  }

  it("picking 'alt' stores the alt engineId", async () => {
    const { userId, songId } = await seed()
    const res = await chooseVersion(songId, userId, 'alt', db as unknown as Db)
    expect(res.chosenEngine).toBe('lyria-3-pro')
    const [row] = await db.select().from(songs).where(eq(songs.id, songId))
    expect(row.chosenEngine).toBe('lyria-3-pro')
  })

  it("picking 'primary' stores the primary engineId", async () => {
    const { userId, songId } = await seed()
    await chooseVersion(songId, userId, 'primary', db as unknown as Db)
    const [row] = await db.select().from(songs).where(eq(songs.id, songId))
    expect(row.chosenEngine).toBe('acestep-local')
  })

  it('another user cannot choose for a song they do not own', async () => {
    const { songId } = await seed()
    const [other] = await db.insert(users).values({ authUid: 'u2', email: 'u2@x.com' }).returning()
    await expect(chooseVersion(songId, other.id, 'alt', db as unknown as Db)).rejects.toBeInstanceOf(NotFoundError)
  })
})
