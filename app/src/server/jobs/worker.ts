/**
 * Worker logic — thin wrapper that calls runGeneration with prod deps.
 * Invoked by the Next.js route handler after OIDC token verification.
 */

import { runGeneration } from '../services/pipeline'
import type { GenerationDeps } from '../services/pipeline'

export async function handleGenerationJob(
  songId: string,
  deps: GenerationDeps,
): Promise<void> {
  await runGeneration(songId, deps)
}
