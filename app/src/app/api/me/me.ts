import { desc, eq } from 'drizzle-orm'
import { getDb, type Db } from '../../../server/db/client'
import { users, songs } from '../../../server/db/schema'
import { getBalance } from '../../../server/services/credits/ledger'

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface MeData {
  email: string
  credits: number
  songs: Array<{
    id: string
    shareSlug: string
    occasion: string
    dialect: string
    genre: string
    status: string
    unlocked: boolean
    createdAt: Date
  }>
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

/**
 * Returns profile data for a user: email, credit balance, and song library.
 */
export async function getMe(userId: string, db: Db = getDb()): Promise<MeData> {
  // 1. Email
  const userRows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))

  const email = userRows[0]?.email ?? ''

  // 2. Credits
  const credits = await getBalance(userId, db)

  // 3. Songs — newest first
  const songRows = await db
    .select({
      id: songs.id,
      shareSlug: songs.shareSlug,
      occasion: songs.occasion,
      dialect: songs.dialect,
      genre: songs.genre,
      status: songs.status,
      unlocked: songs.unlocked,
      createdAt: songs.createdAt,
    })
    .from(songs)
    .where(eq(songs.userId, userId))
    .orderBy(desc(songs.createdAt))

  return { email, credits, songs: songRows }
}
