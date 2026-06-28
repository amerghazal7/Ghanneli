import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '../../../server/auth/middleware'
import { Unauthorized } from '../../../server/auth/verify'
import { getDb } from '../../../server/db/client'
import { createCheckoutSession, getStripe } from '../../../server/services/payments/stripe'
import { getPack } from '../../../server/services/payments/packs'

const bodySchema = z.object({
  packId: z.string().min(1),
})

export async function POST(req: Request): Promise<NextResponse> {
  // Auth
  let userId: string
  try {
    const result = await requireUser(req)
    userId = result.userId
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request', issues: parsed.error.issues }, { status: 400 })
  }

  const { packId } = parsed.data

  // Validate pack before hitting Stripe
  if (!getPack(packId)) {
    return NextResponse.json({ error: `Unknown pack: ${packId}` }, { status: 400 })
  }

  // Create checkout session
  const { url } = await createCheckoutSession(userId, packId, getStripe(), getDb())
  return NextResponse.json({ url }, { status: 200 })
}
