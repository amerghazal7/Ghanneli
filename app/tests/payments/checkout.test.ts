import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, orders } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { createCheckoutSession } from '../../src/server/services/payments/stripe'
import { PACKS } from '../../src/server/services/payments/packs'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

// Minimal mock Stripe client
function makeMockStripe(sessionId = 'cs_test_123', url = 'https://stripe.test/pay') {
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: sessionId, url }),
      },
    },
  }
}

describe('createCheckoutSession', () => {
  let db: TestDb
  let userId: string

  beforeEach(async () => {
    db = await testDb()
    const [user] = await db
      .insert(users)
      .values({ authUid: 'test-uid', email: 'test@example.com' })
      .returning()
    userId = user.id
  })

  it('unknown pack → throws an error, no order created, Stripe NOT called', async () => {
    const mockStripe = makeMockStripe()

    await expect(
      createCheckoutSession(userId, 'pack_nonexistent', mockStripe as never, db as unknown as Db),
    ).rejects.toThrow(/unknown pack/i)

    // No order row created
    const rows = await db.select().from(orders)
    expect(rows).toHaveLength(0)

    // Stripe was never called
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('valid pack → creates pending order with correct fields, calls Stripe once, persists stripeSessionId, returns url', async () => {
    const pack = PACKS[0] // first pack (e.g. pack_3)
    const mockStripe = makeMockStripe()

    const result = await createCheckoutSession(
      userId,
      pack.id,
      mockStripe as never,
      db as unknown as Db,
    )

    // Returns the mocked URL
    expect(result.url).toBe('https://stripe.test/pay')

    // Stripe called exactly once
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledOnce()

    // Order row created
    const rows = await db.select().from(orders).where(eq(orders.userId, userId))
    expect(rows).toHaveLength(1)
    const order = rows[0]

    expect(order.packId).toBe(pack.id)
    expect(order.amountMinor).toBe(pack.amountMinor)
    expect(Number.isInteger(order.amountMinor)).toBe(true)
    expect(order.currency).toBe(pack.currency)
    expect(order.status).toBe('pending')
    expect(order.stripeSessionId).toBe('cs_test_123')

    // Stripe was called with unit_amount = amountMinor and metadata with orderId + userId
    const stripeCall = mockStripe.checkout.sessions.create.mock.calls[0][0]
    expect(stripeCall.line_items[0].price_data.unit_amount).toBe(pack.amountMinor)
    expect(stripeCall.line_items[0].quantity).toBe(1)
    expect(stripeCall.mode).toBe('payment')
    expect(stripeCall.metadata.orderId).toBe(order.id)
    expect(stripeCall.metadata.userId).toBe(userId)
  })

  it('stripe call receives correct currency from pack', async () => {
    const pack = PACKS[1] // second pack
    const mockStripe = makeMockStripe('cs_test_456', 'https://stripe.test/pay2')

    await createCheckoutSession(userId, pack.id, mockStripe as never, db as unknown as Db)

    const stripeCall = mockStripe.checkout.sessions.create.mock.calls[0][0]
    expect(stripeCall.line_items[0].price_data.currency).toBe(pack.currency)
  })
})
