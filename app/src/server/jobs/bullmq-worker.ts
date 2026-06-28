/**
 * BullMQ Worker entrypoint — LOCAL-DEV ONLY.
 *
 * Pulls jobs from the 'generate' queue and delegates to handleGenerationJob,
 * which is the same convergence point used by the Cloud Tasks push route.
 *
 * Run via:   pnpm worker   (from the app/ directory)
 *
 * The job-processing function (processJob) is exported separately so it can
 * be unit-tested without a live Redis connection by injecting fakes.
 */

import { handleGenerationJob } from './worker'
import { buildGenerationDeps } from './build-deps'
import type { GenerationDeps } from '../services/pipeline'

// ---------------------------------------------------------------------------
// Exported job processor (unit-testable, no Redis dependency)
// ---------------------------------------------------------------------------

/** Minimal interface for the job data shape pulled from the queue. */
export interface GenerationJob {
  data: { songId: string }
}

/**
 * Process a single generation job.
 *
 * `handler` and `deps` are injected so this function is fully testable without
 * a real Redis connection or live services.
 */
export async function processJob(
  job: GenerationJob,
  deps: GenerationDeps,
  handler: (songId: string, deps: GenerationDeps) => Promise<void> = handleGenerationJob,
): Promise<void> {
  await handler(job.data.songId, deps)
}

// ---------------------------------------------------------------------------
// Worker bootstrap (only runs when executed as a script)
// ---------------------------------------------------------------------------

if (process.env['NODE_ENV'] !== 'test') {
  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) throw new Error('Missing required env var: REDIS_URL')

  // Dynamic require so the module can be imported in tests without triggering
  // a real Redis connection.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker } = require('bullmq') as typeof import('bullmq')

  const worker = new Worker(
    'generate',
    async (job) => {
      await processJob(job as GenerationJob, buildGenerationDeps())
    },
    { connection: { url: redisUrl } },
  )

  worker.on('completed', (job) => {
    console.log(`[bullmq-worker] job ${job.id} completed (songId=${String(job.data?.songId)})`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[bullmq-worker] job ${job?.id} failed (songId=${String(job?.data?.songId)}):`, err)
  })

  console.log('[bullmq-worker] listening on queue "generate"')
}
