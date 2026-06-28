import { eq, sql } from 'drizzle-orm'
import { creditLedger } from '../../db/schema'
import { getDb, type Db } from '../../db/client'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits')
    this.name = 'InsufficientCreditsError'
  }
}

// ---------------------------------------------------------------------------
// Core ledger functions (db parameter defaults to prod getDb() so production
// callers can omit it; tests inject a pglite db).
// ---------------------------------------------------------------------------

/**
 * Returns the current credit balance for a user (sum of delta rows, 0 if none).
 */
export async function getBalance(userId: string, db: Db = getDb()): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
  return Number(result[0]?.total ?? 0)
}

/**
 * Writes a +amount ledger row. Idempotent by (reason, refId) — a duplicate call
 * with the same refId silently does nothing (ON CONFLICT DO NOTHING).
 * Amount must be a positive integer.
 */
export async function credit(
  userId: string,
  amount: number,
  reason: string,
  refId: string,
  db: Db = getDb(),
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError('credit amount must be a positive integer')
  }
  await db
    .insert(creditLedger)
    .values({ userId, delta: amount, reason, refId })
    .onConflictDoNothing({ target: [creditLedger.reason, creditLedger.refId] })
}

/**
 * Writes a −amount ledger row atomically, guarded by a balance check in a
 * single SQL statement so it is safe under neon-http (stateless, no
 * interactive transactions).
 *
 * SQL strategy:
 *   INSERT INTO credit_ledger (user_id, delta, reason, ref_id)
 *   SELECT $userId, -$amount, $reason, $refId
 *   WHERE (SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE user_id = $userId) >= $amount
 *   ON CONFLICT (reason, ref_id) DO NOTHING
 *   RETURNING id
 *
 * Disambiguation of a 0-row result:
 *   1. Row returned → debit applied.
 *   2. No row → check for existing (reason, refId):
 *      - exists   → idempotent replay → success (no-op).
 *      - not found → balance was insufficient → throw InsufficientCreditsError.
 */
export async function debit(
  userId: string,
  amount: number,
  reason: string,
  refId: string,
  db: Db = getDb(),
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError('debit amount must be a positive integer')
  }

  const rows = await db.execute(sql`
    INSERT INTO credit_ledger (id, user_id, delta, reason, ref_id)
    SELECT gen_random_uuid(), ${userId}, ${-amount}, ${reason}, ${refId}
    WHERE (
      SELECT COALESCE(SUM(delta), 0)
      FROM credit_ledger
      WHERE user_id = ${userId}
    ) >= ${amount}
    ON CONFLICT (reason, ref_id) DO NOTHING
    RETURNING id
  `)

  // rows is the raw result — check if any row was returned
  const returned = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []
  if (returned.length > 0) {
    // Debit was applied successfully
    return
  }

  // No row returned — disambiguate: idempotent replay vs. insufficient balance
  const existingWithRef = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(sql`${creditLedger.reason} = ${reason} AND ${creditLedger.refId} = ${refId}`)
    .limit(1)

  if (existingWithRef.length > 0) {
    // Idempotent replay — already applied this debit
    return
  }

  // No existing row with this (reason, refId) → balance was insufficient
  throw new InsufficientCreditsError()
}
