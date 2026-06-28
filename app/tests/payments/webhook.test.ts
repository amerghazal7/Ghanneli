import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, orders } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'
import { handleStripeEvent } from '../../src/server/services/payments/webhook'
import { POST as webhookPOST } from '../../src/app/api/webhooks/stripe/route'
import { getBalance } from '../../src/server/services/credits/ledger'
import { PACKS } from '../../src/server/services/payments/packs'
import type { Order } from '../../src/server/db/schema'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

/** Build a fake checkout.session.completed event (no real Stripe signature needed). */
function completedEvent(orderId: string, userId: string) {
  return {
    type: 'checkout.session.completed' as const,
    data: {
      object: {
        metadata: { orderId, userId },
      },
    },
  }
}

/** Build a non-completed event type (should be a no-op). */
function otherEvent() {
  return {
    type: 'payment_intent.created' as const,
    data: { object: {} },
  }
}

async function getOrder(orderId: string, db: TestDb): Promise<Order> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId))
  if (rows.length === 0) throw new Error(`Order ${orderId} not found`)
  return rows[0]
}

describe('handleStripeEvent', () => {
  let db: TestDb
  let userId: string
  let order: Order

  const pack = PACKS[0] // pack_3 → 3 credits

  beforeEach(async () => {
    db = await testDb()

    // Seed a user
    const [user] = await db
      .insert(users)
      .values({ authUid: 'test-uid', email: 'test@example.com' })
      .returning()
    userId = user.id

    // Seed a pending order (as createCheckoutSession would have created)
    const [o] = await db
      .insert(orders)
      .values({
        userId,
        packId: pack.id,
        amountMinor: pack.amountMinor,
        currency: pack.currency,
        status: 'pending',
        stripeSessionId: 'cs_test_123',
      })
      .returning()
    order = o
  })

  it('credits once on completed event; replay is a no-op; order status becomes paid', async () => {
    await handleStripeEvent(completedEvent(order.id, userId), db as unknown as Db)
    await handleStripeEvent(completedEvent(order.id, userId), db as unknown as Db) // replay

    expect(await getBalance(userId, db as unknown as Db)).toBe(pack.credits)
    expect((await getOrder(order.id, db)).status).toBe('paid')
  })

  it('non-completed event type → no credit, order stays pending', async () => {
    await handleStripeEvent(otherEvent() as never, db as unknown as Db)

    expect(await getBalance(userId, db as unknown as Db)).toBe(0)
    expect((await getOrder(order.id, db)).status).toBe('pending')
  })

  it('missing orderId in metadata → no credit, no crash', async () => {
    const badEvent = {
      type: 'checkout.session.completed' as const,
      data: { object: { metadata: { orderId: '', userId } } },
    }
    await handleStripeEvent(badEvent, db as unknown as Db)
    expect(await getBalance(userId, db as unknown as Db)).toBe(0)
  })

  it('unknown orderId in metadata → no credit, no crash', async () => {
    const badEvent = {
      type: 'checkout.session.completed' as const,
      data: {
        object: {
          metadata: { orderId: '00000000-0000-0000-0000-000000000000', userId },
        },
      },
    }
    await handleStripeEvent(badEvent, db as unknown as Db)
    expect(await getBalance(userId, db as unknown as Db)).toBe(0)
  })
})

describe('POST /api/webhooks/stripe signature guard', () => {
  // These cases return 400 BEFORE handleStripeEvent / getDb() are reached, so
  // no DB is needed. They prove a request that fails signature checks never
  // reaches the crediting path.
  it('missing stripe-signature header → 400', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    })
    const res = await webhookPOST(req)
    expect(res.status).toBe(400)
  })

  it('invalid signature → 400 (constructEvent rejects forged sig)', async () => {
    const prev = process.env.STRIPE_WEBHOOK_SECRET
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    try {
      const req = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      })
      const res = await webhookPOST(req)
      expect(res.status).toBe(400)
    } finally {
      if (prev === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
      else process.env.STRIPE_WEBHOOK_SECRET = prev
    }
  })
})
