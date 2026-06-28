import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { getUserFromRequest, Unauthorized } from '../../src/server/auth/verify'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

describe('getUserFromRequest', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  const fakeVerifier = async (_token: string) => ({ uid: 'firebase-abc', email: 'a@b.c' })

  it('upserts a user row and returns userId', async () => {
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer goodtoken' },
    })
    const result = await getUserFromRequest(req, fakeVerifier, db as unknown as Db)

    expect(result.userId).toBeTruthy()

    const rows = await db.select().from(users).where(eq(users.authUid, 'firebase-abc'))
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('a@b.c')
  })

  it('is idempotent: second call returns same userId with no duplicate row', async () => {
    const req1 = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer goodtoken' },
    })
    const req2 = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer goodtoken' },
    })

    const r1 = await getUserFromRequest(req1, fakeVerifier, db as unknown as Db)
    const r2 = await getUserFromRequest(req2, fakeVerifier, db as unknown as Db)

    expect(r1.userId).toBe(r2.userId)

    const rows = await db.select().from(users).where(eq(users.authUid, 'firebase-abc'))
    expect(rows).toHaveLength(1)
  })

  it('throws Unauthorized when the verifier throws', async () => {
    const badVerifier = async (_token: string): Promise<{ uid: string; email?: string }> => {
      throw new Error('invalid token')
    }
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer badtoken' },
    })
    await expect(
      getUserFromRequest(req, badVerifier, db as unknown as Db),
    ).rejects.toThrow(Unauthorized)
  })

  it('throws Unauthorized when Authorization header is missing', async () => {
    const req = new Request('http://localhost/')
    await expect(
      getUserFromRequest(req, fakeVerifier, db as unknown as Db),
    ).rejects.toThrow(Unauthorized)
  })
})
