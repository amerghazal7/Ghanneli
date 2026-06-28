/**
 * Composition root for the music engine router.
 * This is the ONLY place that reads environment variables for engine config.
 * Secrets arrive as env vars injected from Secret Manager on Cloud Run at startup.
 */

import { AceStepCloudProd } from './adapters/cloudProd'
import { SelfHostStagingAdapter } from './adapters/selfHostStaging'
import type { MusicGenerationService } from './types'

export type MusicMode = 'cloud-prod' | 'self-host-staging' | 'a-b-compare' | 'fallback'

export interface MusicRouterConfig {
  mode: MusicMode
  /** In fallback mode: primary = cloud-prod (preferred), secondary = self-host-staging (lab backup). */
  primary: MusicGenerationService
  secondary: MusicGenerationService
}

const VALID_MODES = new Set<string>(['cloud-prod', 'self-host-staging', 'a-b-compare', 'fallback'])

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const val = env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export function loadMusicConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MusicRouterConfig {
  const rawMode = env['ENGINE_MODE'] ?? 'fallback'
  if (!VALID_MODES.has(rawMode)) {
    throw new Error(`Invalid ENGINE_MODE "${rawMode}". Must be one of: ${[...VALID_MODES].join(', ')}`)
  }
  const mode = rawMode as MusicMode

  switch (mode) {
    case 'cloud-prod': {
      const cloudProd = new AceStepCloudProd({
        baseUrl: requireEnv(env, 'CLOUD_ENGINE_URL'),
        apiToken: requireEnv(env, 'CLOUD_ENGINE_TOKEN'),
      })
      return { mode, primary: cloudProd, secondary: cloudProd }
    }

    case 'self-host-staging': {
      const selfHost = new SelfHostStagingAdapter({
        baseUrl: requireEnv(env, 'AIBACKEND_URL'),
        token: requireEnv(env, 'AIBACKEND_TOKEN'),
      })
      return { mode, primary: selfHost, secondary: selfHost }
    }

    case 'fallback':
    case 'a-b-compare': {
      const cloudProd = new AceStepCloudProd({
        baseUrl: requireEnv(env, 'CLOUD_ENGINE_URL'),
        apiToken: requireEnv(env, 'CLOUD_ENGINE_TOKEN'),
      })
      const selfHost = new SelfHostStagingAdapter({
        baseUrl: requireEnv(env, 'AIBACKEND_URL'),
        token: requireEnv(env, 'AIBACKEND_TOKEN'),
      })
      return { mode, primary: cloudProd, secondary: selfHost }
    }

    default: {
      const exhaustive: never = mode
      throw new Error(`Unknown mode: ${String(exhaustive)}`)
    }
  }
}
