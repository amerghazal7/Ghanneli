import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getDb } from '../../../../server/db/client'
import { handleStripeEvent } from '../../../../server/services/payments/webhook'

// ---------------------------------------------------------------------------
// Next.js App Router webhook route.
//
// CRITICAL: Must read the RAW body with req.text() — NOT req.json() — so the
// exact bytes used by Stripe to compute the HMAC signature are preserved.
// Re-stringifying a parsed JSON object changes whitespace/key order and breaks
// the signature verification.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Read raw body (preserves signature integrity)
  const rawBody = await req.text()

  // 2. Verify Stripe signature
  const sigHeader = req.headers.get('stripe-signature')
  if (!sigHeader) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    // constructEvent throws if the signature is invalid or the timestamp is stale
    event = Stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook] signature verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 })
  }

  // 3. Delegate to testable core (already-verified event + production db)
  await handleStripeEvent(event, getDb())

  // 4. Acknowledge to Stripe (always 200 — Stripe retries on non-2xx)
  return NextResponse.json({ received: true }, { status: 200 })
}
