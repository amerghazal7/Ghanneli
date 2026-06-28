import { NextResponse } from 'next/server'
import { requireUser } from '../../../server/auth/middleware'
import { Unauthorized } from '../../../server/auth/verify'
import { getDb } from '../../../server/db/client'
import { createQueue } from '../../../server/jobs/queue/factory'
import { emitDefault } from '../../../server/services/analytics/wiring'
import { bodySchema, createSong } from './create'

export async function POST(req: Request): Promise<NextResponse> {
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

  const queue = createQueue()
  const result = await createSong(parsed.data, {
    db: getDb(),
    userId,
    enqueue: (songId) => queue.enqueue('generate', { songId }),
    emitEvent: emitDefault,
  })

  return NextResponse.json(result, { status: 201 })
}
