import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import * as schema from '../../src/server/db/schema'
import { users } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { getBalance, credit, debit, InsufficientCreditsError } from '../../src/server/services/credits/ledger'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

describe('credit ledger', () => {
  let db: TestDb
  let tdb: Db  // same pglite instance, cast to Db for ledger calls
  let userId: string

  beforeEach(async () => {
    db = await testDb()
    tdb = db as unknown as Db
    const [u] = await db
      .insert(users)
      .values({ authUid: `uid-${Math.random()}`, email: `test-${Math.random()}@example.com` })
      .returning()
    userId = u.id
  })

  it('getBalance returns 0 for a user with no rows', async () => {
    expect(await getBalance(userId, tdb)).toBe(0)
  })

  it('credit is idempotent: same (reason, refId) twice → balance reflects ONE credit', async () => {
    await credit(userId, 5, 'purchase', 'order_dup', tdb)
    await credit(userId, 5, 'purchase', 'order_dup', tdb)
    expect(await getBalance(userId, tdb)).toBe(5)
  })

  it('debit exactly equal to balance succeeds (balance → 0)', async () => {
    await credit(userId, 3, 'purchase', 'order_exact', tdb)
    await debit(userId, 3, 'song', 'song_exact', tdb)
    expect(await getBalance(userId, tdb)).toBe(0)
  })

  it('debit after zeroed balance throws InsufficientCreditsError', async () => {
    await credit(userId, 1, 'purchase', 'order_zero', tdb)
    await debit(userId, 1, 'song', 'song_zero', tdb)
    await expect(debit(userId, 1, 'song', 'song_zero2', tdb)).rejects.toThrow(InsufficientCreditsError)
  })

  it('refuses to overdraw and is idempotent', async () => {
    const u = { id: userId }
    await credit(u.id, 3, 'purchase', 'order_1', tdb)
    await expect(debit(u.id, 5, 'song', 'song_1', tdb)).rejects.toThrow(InsufficientCreditsError)
    await debit(u.id, 1, 'song', 'song_1', tdb); await debit(u.id, 1, 'song', 'song_1', tdb) // same refId
    expect(await getBalance(u.id, tdb)).toBe(2) // only one debit applied
  })
})
