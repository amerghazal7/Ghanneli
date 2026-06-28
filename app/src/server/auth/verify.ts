import { users } from '../db/schema'
import { type Db, getDb } from '../db/client'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class Unauthorized extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'Unauthorized'
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injected token verifier — returns uid + optional email or throws. */
export type TokenVerifier = (idToken: string) => Promise<{ uid: string; email?: string }>

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Verifies the Firebase ID-token in the Authorization header and upserts the
 * corresponding user row.  The `verifier` and `db` parameters are injected so
 * this function is fully testable without firebase-admin or a real database.
 */
export async function getUserFromRequest(
  req: Request,
  verifier: TokenVerifier,
  db: Db = getDb(),
): Promise<{ userId: string }> {
  // 1. Extract bearer token
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Unauthorized('Missing or malformed Authorization header')
  }
  const token = authHeader.slice(7)

  // 2. Verify token (delegate to injected verifier)
  let decoded: { uid: string; email?: string }
  try {
    decoded = await verifier(token)
  } catch {
    throw new Unauthorized('Token verification failed')
  }

  if (!decoded?.uid) {
    throw new Unauthorized('No uid in decoded token')
  }

  // 3. Upsert user by authUid (idempotent)
  const [row] = await db
    .insert(users)
    .values({ authUid: decoded.uid, email: decoded.email ?? '' })
    .onConflictDoUpdate({
      target: users.authUid,
      set: { email: decoded.email ?? '' },
    })
    .returning()

  return { userId: row.id }
}
