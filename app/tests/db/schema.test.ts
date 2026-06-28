import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import * as schema from '../../src/server/db/schema'
import { users, songs, creditLedger } from '../../src/server/db/schema'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

describe('schema', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  it('persists a song with provenance fields', async () => {
    // Insert a user first to satisfy the FK constraint
    const [u] = await db
      .insert(users)
      .values({ authUid: 'auth-uid-1', email: 'test@example.com' })
      .returning()

    const [s] = await db
      .insert(songs)
      .values({
        userId: u.id,
        occasion: 'birthday',
        dialect: 'egyptian',
        genre: 'ballad',
        voiceGender: 'female',
        status: 'pending',
        inputs: {
          recipient: 'Ali',
          sender: 'Sara',
          relationship: 'friend',
          details: ['loves ballads'],
          mood: 'happy',
          lengthHint: 'standard',
        },
      })
      .returning()

    expect(s.status).toBe('pending')
    expect(s.shareSlug).toBeTruthy()
  })

  it('enforces uniqueness on (reason, refId) in credit_ledger', async () => {
    const [u] = await db
      .insert(users)
      .values({ authUid: 'auth-uid-2', email: 'credits@example.com' })
      .returning()

    // First insert should succeed
    await db
      .insert(creditLedger)
      .values({ userId: u.id, delta: 10, reason: 'purchase', refId: 'order-abc' })

    // Second insert with same (reason, refId) should throw
    await expect(
      db
        .insert(creditLedger)
        .values({ userId: u.id, delta: 10, reason: 'purchase', refId: 'order-abc' }),
    ).rejects.toThrow()
  })
})
