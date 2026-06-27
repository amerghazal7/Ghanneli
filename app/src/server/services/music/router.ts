import type { MusicGenerationService, MusicRequest, MusicResult } from './types'
import type { MusicRouterConfig } from './config'

/**
 * djb2 hash — deterministic, pure, no external deps.
 * Used by a-b-compare to pick an arm from req.taggedLyrics without Math.random.
 */
function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0 // keep unsigned 32-bit
  }
  return h
}

export function createMusicService(config: MusicRouterConfig): MusicGenerationService {
  return {
    async generate(req: MusicRequest): Promise<MusicResult> {
      switch (config.mode) {
        case 'cloud-prod':
          return config.primary.generate(req)

        case 'self-host-staging':
          return config.primary.generate(req)

        case 'fallback': {
          try {
            return await config.primary.generate(req)
          } catch {
            // Primary is down or errored — delegate to secondary.
            return config.secondary.generate(req)
          }
        }

        case 'a-b-compare': {
          const arm = djb2(req.taggedLyrics) % 2 === 0 ? 'primary' : 'secondary'
          const result = await (arm === 'primary'
            ? config.primary.generate(req)
            : config.secondary.generate(req))
          // Return a new object; do not mutate the result from the adapter.
          return { ...result, meta: { ...result.meta, abArm: arm } }
        }

        default: {
          const exhaustive: never = config.mode
          throw new Error(`Unknown mode: ${String(exhaustive)}`)
        }
      }
    },
  }
}
