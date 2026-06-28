import { NextResponse } from 'next/server'
import { getDb } from '../../../../../server/db/client'
import { getSongStatus } from './status'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const result = await getSongStatus(id, getDb())
  if (!result) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(result)
}
