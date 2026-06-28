import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { getBalance, credit } from '../../src/server/services/credits/ledger'
import { unlockSong, SongNotReadyError } from '../../src/app/api/songs/[id]/unlock/route'
import { InsufficientCreditsError } from '../../src/server/services/credits/ledger'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

describe('unlockSong', () => {
  let db: TestDb
  let tdb: Db
  let userId: string
  let otherUserId: string
  let songId: string
  const FULL_URI = 'https://cdn.example.com/full.mp3'

  beforeEach(async () => {
    db = await testDb()
    tdb = db as unknown as Db

    const [u] = await db
      .insert(users)
      .values({ authUid: `uid-${Math.random()}`, email: `owner-${Math.random()}@example.com` })
      .returning()
    userId = u.id

    const [u2] = await db
      .insert(users)
      .values({ authUid: `uid-${Math.random()}`, email: `other-${Math.random()}@example.com` })
      .returning()
    otherUserId = u2.id

    const [s] = await db
      .insert(songs)
      .values({
        userId,
        occasion: 'عيد ميلاد',
        dialect: 'egyptian',
        genre: 'pop',
        voiceGender: 'female',
        status: 'ready',
        fullUri: FULL_URI,
        previewUri: 'https://cdn.example.com/preview.mp3',
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
    songId = s.id
  })

  it('0 credits → throws InsufficientCreditsError; song stays unlocked=false', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(unlockSong(songId, userId, tdb)).rejects.toThrow(InsufficientCreditsError)
    } finally {
      consoleSpy.mockRestore()
    }

    const [row] = await db.select({ unlocked: songs.unlocked }).from(songs).where(eq(songs.id, songId))
    expect(row.unlocked).toBe(false)
  })

  it('with 1 credit → debit applied (balance 1→0), song unlocked=true, returns fullUri', async () => {
    await credit(userId, 1, 'purchase', `order-${Math.random()}`, tdb)
    expect(await getBalance(userId, tdb)).toBe(1)

    const result = await unlockSong(songId, userId, tdb)
    expect(result.fullUri).toBe(FULL_URI)

    expect(await getBalance(userId, tdb)).toBe(0)

    const [row] = await db.select({ unlocked: songs.unlocked }).from(songs).where(eq(songs.id, songId))
    expect(row.unlocked).toBe(true)
  })

  it('re-unlock same song → NO double-charge: balance drops by exactly 1 total; both calls return fullUri', async () => {
    await credit(userId, 1, 'purchase', `order-${Math.random()}`, tdb)

    const first = await unlockSong(songId, userId, tdb)
    expect(first.fullUri).toBe(FULL_URI)
    expect(await getBalance(userId, tdb)).toBe(0)

    // Second call — balance is now 0, but debit row already exists → idempotent no-op
    const second = await unlockSong(songId, userId, tdb)
    expect(second.fullUri).toBe(FULL_URI)

    // Still 0 — only ONE debit was ever applied
    expect(await getBalance(userId, tdb)).toBe(0)
  })

  it('ownership: different user cannot unlock the song (NotFound thrown, no debit)', async () => {
    await credit(otherUserId, 5, 'purchase', `order-${Math.random()}`, tdb)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(unlockSong(songId, otherUserId, tdb)).rejects.toThrow()
    } finally {
      consoleSpy.mockRestore()
    }

    // otherUser's credits must be untouched
    expect(await getBalance(otherUserId, tdb)).toBe(5)
    // Song remains locked
    const [row] = await db.select({ unlocked: songs.unlocked }).from(songs).where(eq(songs.id, songId))
    expect(row.unlocked).toBe(false)
  })

  it('non-existent song id → throws NotFound-style error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        unlockSong('00000000-0000-0000-0000-000000000000', userId, tdb),
      ).rejects.toThrow()
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('non-ready song (generating) → throws SongNotReadyError before debit; balance unchanged, unlocked stays false', async () => {
    // Insert a song in 'generating' status (not ready)
    const [generatingSong] = await db
      .insert(songs)
      .values({
        userId,
        occasion: 'عيد ميلاد',
        dialect: 'egyptian',
        genre: 'pop',
        voiceGender: 'female',
        status: 'generating',
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

    // Give the user a credit so we can verify it is NOT consumed
    await credit(userId, 1, 'purchase', `order-not-ready-${Math.random()}`, tdb)
    const balanceBefore = await getBalance(userId, tdb)
    expect(balanceBefore).toBe(1)

    await expect(unlockSong(generatingSong.id, userId, tdb)).rejects.toThrow(SongNotReadyError)

    // Balance must be unchanged — no debit was applied
    expect(await getBalance(userId, tdb)).toBe(1)

    // Song must still be locked
    const [row] = await db.select({ unlocked: songs.unlocked }).from(songs).where(eq(songs.id, generatingSong.id))
    expect(row.unlocked).toBe(false)
  })

  it('non-ready song (pending) → throws SongNotReadyError', async () => {
    const [pendingSong] = await db
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

    await credit(userId, 1, 'purchase', `order-pending-${Math.random()}`, tdb)

    await expect(unlockSong(pendingSong.id, userId, tdb)).rejects.toThrow(SongNotReadyError)
    // Balance must be untouched — debit must not have fired
    expect(await getBalance(userId, tdb)).toBe(1)
  })
})
