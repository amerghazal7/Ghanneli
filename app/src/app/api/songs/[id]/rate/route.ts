import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '../../../../../server/db/client'
import { requireUser } from '../../../../../server/auth/middleware'
import { Unauthorized } from '../../../../../server/auth/verify'
import { emitDefault } from '../../../../../server/services/analytics/wiring'
import { rateSong, NotFoundError } from './rate'

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id: songId } = await params

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

  try {
    await rateSong(songId, userId, parsed.data.rating, getDb(), emitDefault)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
}
