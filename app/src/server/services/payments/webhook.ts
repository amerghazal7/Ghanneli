import { eq } from 'drizzle-orm'
import { orders } from '../../db/schema'
import { type Db, getDb } from '../../db/client'
import { credit } from '../credits/ledger'
import { getPack } from './packs'
import { emitDefault } from '../analytics/wiring'

// ---------------------------------------------------------------------------
// Minimal shape we need from a Stripe event (real or test-fabricated).
// ---------------------------------------------------------------------------

interface CheckoutSessionCompletedEvent {
  type: 'checkout.session.completed'
  data: {
    object: {
      metadata: Record<string, string>
    }
  }
}

interface OtherEvent {
  type: string
  data: { object: unknown }
}

export type StripeEventLike = CheckoutSessionCompletedEvent | OtherEvent

// ---------------------------------------------------------------------------
// Testable core — takes an already-verified event + injected db.
// The route calls this after constructEvent() succeeds.
// ---------------------------------------------------------------------------

/**
 * Handles a Stripe event object (already signature-verified by the route).
 *
 * - Only acts on `checkout.session.completed`; all other types → silent no-op.
 * - Derives credit count from the pack catalog (never from event amounts).
 * - Idempotency: `credit()` uses ON CONFLICT DO NOTHING on (reason='purchase', refId=orderId).
 *   A replay of the same event therefore cannot double-credit.
 * - Also marks the order `status='paid'` (idempotent update).
 */
export async function handleStripeEvent(
  event: StripeEventLike,
  db: Db = getDb(),
): Promise<void> {
  // Filter: only act on completed checkout sessions
  if (event.type !== 'checkout.session.completed') {
    return
  }

  const session = (event as CheckoutSessionCompletedEvent).data.object
  const { orderId, userId } = session.metadata ?? {}

  // Validate metadata presence
  if (!orderId || !userId) {
    console.error('[webhook] checkout.session.completed missing orderId/userId in metadata', {
      orderId,
      userId,
    })
    return
  }

  // Look up the order
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId))
  if (orderRows.length === 0) {
    console.error('[webhook] order not found for orderId:', orderId)
    return
  }
  const order = orderRows[0]

  // Crediting always uses the DB-stored order.userId (never the metadata userId)
  // so a tampered metadata userId can't redirect credits. If they diverge, that
  // signals tampering or a checkout-creation bug — surface it without blocking.
  if (userId !== order.userId) {
    console.warn(
      '[webhook] metadata userId does not match order.userId; crediting order.userId',
      { metadataUserId: userId, orderUserId: order.userId, orderId },
    )
  }

  // Derive credits from pack catalog — NEVER trust event amount fields
  const pack = getPack(order.packId)
  if (!pack) {
    console.error('[webhook] unknown packId on order:', order.packId, 'orderId:', orderId)
    return
  }

  // Credit the ledger — idempotent via unique(reason='purchase', refId=orderId)
  await credit(order.userId, pack.credits, 'purchase', orderId, db)

  // Mark order paid — idempotent (set is safe to re-apply)
  await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId))

  // Emit purchase_completed (songId omitted — not on the order)
  // Swallowed by emitDefault; a publish failure must not turn a successful credit into a 500.
  await emitDefault({ type: 'purchase_completed', amountMinor: order.amountMinor, currency: order.currency })
}
