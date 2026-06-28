/**
 * POST /api/jobs/generate
 *
 * Cloud Tasks worker endpoint. Verifies the OIDC token from Google Cloud Tasks,
 * then calls runGeneration with production deps.
 *
 * Security: Rejects requests without a valid OIDC token issued by Google,
 * with issuer accounts.google.com and audience matching WORKER_URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { getDb } from '../../../../server/db/client'
import { createLyricsService } from '../../../../server/services/lyrics/service'
import { createMusicService } from '../../../../server/services/music/router'
import { loadMusicConfigFromEnv } from '../../../../server/services/music/config'
import { runGeneration } from '../../../../server/services/pipeline'
import type { StoreDep } from '../../../../server/services/pipeline'
import type { MusicTake } from '../../../../server/services/music/types'
import { anthropic } from '@ai-sdk/anthropic'

const authClient = new OAuth2Client()

// ---------------------------------------------------------------------------
// TODO(3.5): Replace this stub with the real GCS/CDN post-processing impl.
// ---------------------------------------------------------------------------
const storeStub: StoreDep = {
  async postProcess(_take: MusicTake) {
    throw new Error('StoreDep.postProcess not implemented — Task 3.5 pending')
  },
}

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
    if (!payload || payload.iss !== 'accounts.google.com') {
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
  const db = getDb()
  const lyrics = createLyricsService({ model: anthropic('claude-3-haiku-20240307') })
  const music = createMusicService(loadMusicConfigFromEnv())

  await runGeneration(songId, { lyrics, music, store: storeStub, db })

  return NextResponse.json({ ok: true }, { status: 200 })
}
