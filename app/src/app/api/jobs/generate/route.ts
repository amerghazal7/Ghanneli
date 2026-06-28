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
import { getDb } from '../../../../server/db/client'
import { createLyricsService } from '../../../../server/services/lyrics/service'
import { createMusicService } from '../../../../server/services/music/router'
import { loadMusicConfigFromEnv } from '../../../../server/services/music/config'
import { handleGenerationJob } from '../../../../server/jobs/worker'
import type { StoreDep } from '../../../../server/services/pipeline'
import { postProcess } from '../../../../server/services/audio/postprocess'
// StoreDep is satisfied by the prodStore closure below
import { createProdR2Client } from '../../../../server/services/storage/r2'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { anthropic } from '@ai-sdk/anthropic'

const authClient = new OAuth2Client()
const execAsync = promisify(exec)

// Production ffmpeg runner — shells out to the system ffmpeg binary.
async function runFfmpeg(args: string[]): Promise<void> {
  const escaped = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')
  await execAsync(`ffmpeg ${escaped}`)
}

// Production StoreDep: closes over real ffmpeg runner + R2 client from env vars.
const prodStore: StoreDep = {
  postProcess: (take) =>
    postProcess(take, {
      runFfmpeg,
      r2: createProdR2Client(),
      config: {
        watermarkPath: process.env['WATERMARK_ASSET_PATH'] ?? '/assets/watermark.mp3',
        previewLengthSec: 30,
        bucket: process.env['R2_BUCKET'] ?? '',
        publicBaseUrl: process.env['R2_PUBLIC_BASE_URL'] ?? '',
      },
    }),
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
  const db = getDb()
  const lyrics = createLyricsService({ model: anthropic('claude-3-haiku-20240307') })
  const music = createMusicService(loadMusicConfigFromEnv())

  // runGeneration sets status='failed' and re-throws on pipeline errors. Surface
  // a clean 5xx (no stack) so Cloud Tasks retries without leaking internals.
  try {
    await handleGenerationJob(songId, { lyrics, music, store: prodStore, db })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
