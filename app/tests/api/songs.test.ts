import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { createSong, bodySchema } from '../../src/app/api/songs/route'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

const validInput = {
  occasion: 'عيد ميلاد',
  recipient: 'أحمد',
  sender: 'سارة',
  relationship: 'صديق',
  details: ['يحب الموسيقى'],
  mood: 'سعيد',
  lengthHint: 'standard' as const,
  dialect: 'egyptian' as const,
  genre: 'pop',
  voiceGender: 'female' as const,
}

describe('create-song API', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  it('bodySchema rejects invalid dialect → Zod error', () => {
    const result = bodySchema.safeParse({ ...validInput, dialect: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('valid payload → creates song with status=pending and inputs populated, enqueue called once', async () => {
    const [user] = await db
      .insert(users)
      .values({ authUid: 'test-uid', email: 'test@example.com' })
      .returning()

    const mockEnqueue = vi.fn().mockResolvedValue(undefined)

    const result = await createSong(validInput, {
      db: db as unknown as Db,
      userId: user.id,
      enqueue: mockEnqueue,
    })

    expect(result.songId).toBeTruthy()
    expect(result.shareSlug).toBeTruthy()

    expect(mockEnqueue).toHaveBeenCalledOnce()
    expect(mockEnqueue).toHaveBeenCalledWith(result.songId)

    const rows = await db.select().from(songs).where(eq(songs.id, result.songId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].inputs.recipient).toBe('أحمد')
    expect(rows[0].inputs.details).toEqual(['يحب الموسيقى'])
  })
})
