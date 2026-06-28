import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { getMe } from '../../src/app/api/me/me'
import { credit, debit } from '../../src/server/services/credits/ledger'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

const songDefaults = {
  occasion: 'عيد ميلاد',
  dialect: 'egyptian' as const,
  genre: 'pop',
  voiceGender: 'female',
  status: 'pending' as const,
  inputs: {
    recipient: 'أحمد',
    sender: 'سارة',
    relationship: 'صديق',
    details: ['يحب الموسيقى'],
    mood: 'سعيد',
    lengthHint: 'standard' as const,
  },
}

describe('getMe', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  it('returns correct email for user with no songs and no credits', async () => {
    const [user] = await db
      .insert(users)
      .values({ authUid: 'uid-email-test', email: 'test@example.com' })
      .returning()

    const result = await getMe(user.id, db as unknown as Db)

    expect(result.email).toBe('test@example.com')
    expect(result.credits).toBe(0)
    expect(result.songs).toHaveLength(0)
  })

  it('returns net credit balance (credit 3, debit 1 → 2)', async () => {
    const [user] = await db
      .insert(users)
      .values({ authUid: 'uid-credits-test', email: 'credits@example.com' })
      .returning()

    await credit(user.id, 3, 'purchase', 'order-1', db as unknown as Db)
    await debit(user.id, 1, 'song', 'song-ref-1', db as unknown as Db)

    const result = await getMe(user.id, db as unknown as Db)

    expect(result.credits).toBe(2)
  })

  it('returns songs ordered newest-first with correct fields', async () => {
    const [user] = await db
      .insert(users)
      .values({ authUid: 'uid-songs-test', email: 'songs@example.com' })
      .returning()

    const [songA] = await db
      .insert(songs)
      .values({ ...songDefaults, userId: user.id, occasion: 'عيد ميلاد أ', createdAt: new Date(Date.now() - 1000) })
      .returning()

    const [songB] = await db
      .insert(songs)
      .values({ ...songDefaults, userId: user.id, occasion: 'عيد ميلاد ب', createdAt: new Date() })
      .returning()

    const result = await getMe(user.id, db as unknown as Db)

    expect(result.songs).toHaveLength(2)
    // Newest first — songB was inserted after songA
    expect(result.songs[0].id).toBe(songB.id)
    expect(result.songs[1].id).toBe(songA.id)

    // Check all required fields on songB
    const s = result.songs[0]
    expect(s.id).toBe(songB.id)
    expect(s.shareSlug).toBe(songB.shareSlug)
    expect(s.occasion).toBe('عيد ميلاد ب')
    expect(s.dialect).toBe('egyptian')
    expect(s.genre).toBe('pop')
    expect(s.status).toBe('pending')
    expect(s.unlocked).toBe(false)
    expect(s.createdAt).toBeInstanceOf(Date)
  })

  it('isolates data between users', async () => {
    const [user1] = await db
      .insert(users)
      .values({ authUid: 'uid-iso-1', email: 'user1@example.com' })
      .returning()

    const [user2] = await db
      .insert(users)
      .values({ authUid: 'uid-iso-2', email: 'user2@example.com' })
      .returning()

    // user1: 1 song + 5 credits
    await db.insert(songs).values({ ...songDefaults, userId: user1.id })
    await credit(user1.id, 5, 'purchase', 'order-u1', db as unknown as Db)

    // user2: 2 songs + 2 credits
    await db.insert(songs).values({ ...songDefaults, userId: user2.id, occasion: 'مناسبة أ' })
    await db.insert(songs).values({ ...songDefaults, userId: user2.id, occasion: 'مناسبة ب' })
    await credit(user2.id, 2, 'purchase', 'order-u2', db as unknown as Db)

    const me1 = await getMe(user1.id, db as unknown as Db)
    expect(me1.songs).toHaveLength(1)
    expect(me1.credits).toBe(5)

    const me2 = await getMe(user2.id, db as unknown as Db)
    expect(me2.songs).toHaveLength(2)
    expect(me2.credits).toBe(2)
  })
})
