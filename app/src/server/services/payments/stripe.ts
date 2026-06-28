import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { orders } from '../../db/schema'
import { type Db, getDb } from '../../db/client'
import { getPack } from './packs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for the injected Stripe client (real or mock). */
export interface StripeClient {
  checkout: {
    sessions: {
      create: (params: Stripe.Checkout.SessionCreateParams) => Promise<{ id: string; url: string | null }>
    }
  }
}

// ---------------------------------------------------------------------------
// Core (testable — Stripe client and db are injected)
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Checkout session for a credit pack purchase.
 *
 * Steps:
 *  1. Validate packId — throws if unknown (route maps to 400).
 *  2. Insert a `pending` order row.
 *  3. Call Stripe to create the checkout session (metadata carries orderId +
 *     userId so the 4.3 webhook can credit idempotently).
 *  4. Persist the returned session id back onto the order.
 *  5. Return { url }.
 */
export async function createCheckoutSession(
  userId: string,
  packId: string,
  stripe: StripeClient,
  db: Db = getDb(),
): Promise<{ url: string }> {
  // 1. Look up pack
  const pack = getPack(packId)
  if (!pack) {
    throw new Error(`Unknown pack: ${packId}`)
  }

  // 2. Insert pending order
  const [order] = await db
    .insert(orders)
    .values({
      userId,
      packId,
      amountMinor: pack.amountMinor,
      currency: pack.currency,
      status: 'pending',
    })
    .returning()

  // 3. Create Stripe Checkout session
  const successUrl = process.env.STRIPE_SUCCESS_URL ?? 'https://ghanneli.com/credits?success=1'
  const cancelUrl = process.env.STRIPE_CANCEL_URL ?? 'https://ghanneli.com/credits?cancelled=1'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pack.currency,
          unit_amount: pack.amountMinor,
          product_data: {
            name: `Ghanneli ${pack.credits} Credits`,
          },
        },
      },
    ],
    metadata: {
      orderId: order.id,
      userId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  })

  // 4. Persist stripe session id
  await db
    .update(orders)
    .set({ stripeSessionId: session.id })
    .where(eq(orders.id, order.id))

  // 5. Return checkout URL
  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL')
  }
  return { url: session.url }
}

// ---------------------------------------------------------------------------
// Production factory (NOT used in tests)
// ---------------------------------------------------------------------------

export function getStripe(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
}
