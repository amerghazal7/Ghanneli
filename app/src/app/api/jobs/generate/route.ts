/**
 * POST /api/jobs/generate
 *
 * Cloud Tasks worker endpoint. Verifies the OIDC token from Google Cloud Tasks,
 * then calls runGeneration with production deps.
 *
 * Security: Rejects requests without a valid OIDC token issued by Google
 * (issuer accounts.google.com or https://accounts.google.com) with audience
 * matching WORKER_URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { handleGenerationJob } from '../../../../server/jobs/worker'
import { buildGenerationDeps } from '../../../../server/jobs/build-deps'

const authClient = new OAuth2Client()

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Extract OIDC token from Authorization header
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Verify OIDC token
  const workerUrl = process.env['WORKER_URL'] ?? ''
  try {
    const ticket = await authClient.verifyIdToken({ idToken: token, audience: workerUrl })
    const payload = ticket.getPayload()
    // Google issues OIDC tokens with either issuer form; verifyIdToken already
    // validates the issuer, so accept both rather than reject valid prod tokens.
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com']
    if (!payload || !validIssuers.includes(payload.iss ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse body
  let songId: string
  try {
    const body = (await req.json()) as { songId?: string }
    if (!body.songId) throw new Error('Missing songId')
    songId = body.songId
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  // 4. Build prod deps and run generation
  // runGeneration sets status='failed' and re-throws on pipeline errors. Surface
  // a clean 5xx (no stack) so Cloud Tasks retries without leaking internals.
  try {
    await handleGenerationJob(songId, buildGenerationDeps())
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
