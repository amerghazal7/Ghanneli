/**
 * buildGenerationDeps — constructs the production GenerationDeps used by both
 * the Cloud Tasks push route (api/jobs/generate/route.ts) and the BullMQ pull
 * worker (bullmq-worker.ts).
 *
 * Extracted here so both entry-points share a single source of truth for prod
 * dep construction without duplicating the ffmpeg/R2/env wiring.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { anthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getDb } from '../db/client'
import { createLyricsService } from '../services/lyrics/service'
import { createMusicService } from '../services/music/router'
import { loadMusicConfigFromEnv } from '../services/music/config'
import { postProcess } from '../services/audio/postprocess'
import { createProdR2Client } from '../services/storage/r2'
import { createAnalyticsEvents } from '../services/analytics/wiring'
import { getPublisher } from '../services/analytics/emit'
import type { GenerationDeps, StoreDep } from '../services/pipeline'

const execAsync = promisify(exec)

// Production ffmpeg runner — shells out to the system ffmpeg binary.
async function runFfmpeg(args: string[]): Promise<void> {
  const escaped = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')
  await execAsync(`ffmpeg ${escaped}`)
}

/**
 * Build the production GenerationDeps.
 *
 * Called once per job invocation — deps are lightweight to construct and are
 * not cached at module level so that each job gets a fresh DB handle.
 */
export function buildGenerationDeps(): GenerationDeps {
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

  // Gemini primary — honours GEMINI_API_KEY explicitly (the default env var
  // for @ai-sdk/google is GOOGLE_GENERATIVE_AI_API_KEY, so we pass it here).
  const googleProvider = createGoogleGenerativeAI({
    apiKey: process.env['GEMINI_API_KEY'],
  })

  return {
    lyrics: createLyricsService({
      model: googleProvider(process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'),
      fallbackModel: anthropic(process.env['LYRICS_MODEL'] ?? 'claude-3-5-haiku-latest'),
    }),
    music: createMusicService(loadMusicConfigFromEnv()),
    store: prodStore,
    events: createAnalyticsEvents(getPublisher()),
    db: getDb(),
  }
}
