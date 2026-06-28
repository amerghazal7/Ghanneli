import { NextResponse } from 'next/server'
import { requireUser } from '../../../server/auth/middleware'
import { Unauthorized } from '../../../server/auth/verify'
import { getDb } from '../../../server/db/client'
import { getMe } from './me'

export async function GET(req: Request): Promise<NextResponse> {
  let userId: string
  try {
    const result = await requireUser(req)
    userId = result.userId
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    throw err
  }

  const data = await getMe(userId, getDb())
  return NextResponse.json(data)
}
