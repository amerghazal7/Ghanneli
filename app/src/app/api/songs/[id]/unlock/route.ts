import { NextResponse } from 'next/server'
import { requireUser } from '../../../../../server/auth/middleware'
import { Unauthorized } from '../../../../../server/auth/verify'
import { InsufficientCreditsError } from '../../../../../server/services/credits/ledger'
import { unlockSong, NotFoundError, SongNotReadyError } from './unlock'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id: songId } = await params

  try {
    const result = await unlockSong(songId, userId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err instanceof SongNotReadyError) {
      return NextResponse.json({ error: 'Song not ready' }, { status: 409 })
    }
    throw err
  }
}
