import { describe, it, expect } from 'vitest'
import { loadMusicConfigFromEnv } from '../../src/server/services/music/config'
import { AceStepCloudProd } from '../../src/server/services/music/adapters/cloudProd'
import { SelfHostStagingAdapter } from '../../src/server/services/music/adapters/selfHostStaging'

const CLOUD_ENV = {
  ENGINE_MODE: 'cloud-prod',
  CLOUD_ENGINE_URL: 'https://cloud.example.com',
  CLOUD_ENGINE_TOKEN: 'cloud-token',
}

const SELFHOST_ENV = {
  ENGINE_MODE: 'self-host-staging',
  AIBACKEND_URL: 'https://lab.example.com',
  AIBACKEND_TOKEN: 'lab-token',
}

const FALLBACK_ENV = {
  ENGINE_MODE: 'fallback',
  CLOUD_ENGINE_URL: 'https://cloud.example.com',
  CLOUD_ENGINE_TOKEN: 'cloud-token',
  AIBACKEND_URL: 'https://lab.example.com',
  AIBACKEND_TOKEN: 'lab-token',
}

const AB_ENV = {
  ENGINE_MODE: 'a-b-compare',
  CLOUD_ENGINE_URL: 'https://cloud.example.com',
  CLOUD_ENGINE_TOKEN: 'cloud-token',
  AIBACKEND_URL: 'https://lab.example.com',
  AIBACKEND_TOKEN: 'lab-token',
}

describe('loadMusicConfigFromEnv', () => {
  it('cloud-prod: primary is AceStepCloudProd, does not require AIBACKEND vars', () => {
    const config = loadMusicConfigFromEnv(CLOUD_ENV as NodeJS.ProcessEnv)
    expect(config.mode).toBe('cloud-prod')
    expect(config.primary).toBeInstanceOf(AceStepCloudProd)
    // secondary equals primary in single-engine mode
    expect(config.secondary).toBeInstanceOf(AceStepCloudProd)
  })

  it('cloud-prod: throws if CLOUD_ENGINE_URL missing', () => {
    expect(() =>
      loadMusicConfigFromEnv({ ENGINE_MODE: 'cloud-prod', CLOUD_ENGINE_TOKEN: 'tok' } as NodeJS.ProcessEnv),
    ).toThrow('CLOUD_ENGINE_URL')
  })

  it('cloud-prod: does NOT require AIBACKEND_URL or AIBACKEND_TOKEN', () => {
    // Should not throw even though AIBACKEND vars are absent
    expect(() => loadMusicConfigFromEnv(CLOUD_ENV as NodeJS.ProcessEnv)).not.toThrow()
  })

  it('self-host-staging: primary is SelfHostStagingAdapter, does not require cloud secrets', () => {
    const config = loadMusicConfigFromEnv(SELFHOST_ENV as NodeJS.ProcessEnv)
    expect(config.mode).toBe('self-host-staging')
    expect(config.primary).toBeInstanceOf(SelfHostStagingAdapter)
    expect(config.secondary).toBeInstanceOf(SelfHostStagingAdapter)
  })

  it('self-host-staging: throws if AIBACKEND_URL missing', () => {
    expect(() =>
      loadMusicConfigFromEnv({ ENGINE_MODE: 'self-host-staging', AIBACKEND_TOKEN: 'tok' } as NodeJS.ProcessEnv),
    ).toThrow('AIBACKEND_URL')
  })

  it('self-host-staging: does NOT require CLOUD_ENGINE_URL or CLOUD_ENGINE_TOKEN', () => {
    expect(() => loadMusicConfigFromEnv(SELFHOST_ENV as NodeJS.ProcessEnv)).not.toThrow()
  })

  it('fallback: primary is AceStepCloudProd, secondary is SelfHostStagingAdapter', () => {
    const config = loadMusicConfigFromEnv(FALLBACK_ENV as NodeJS.ProcessEnv)
    expect(config.mode).toBe('fallback')
    expect(config.primary).toBeInstanceOf(AceStepCloudProd)
    expect(config.secondary).toBeInstanceOf(SelfHostStagingAdapter)
  })

  it('a-b-compare: primary is AceStepCloudProd, secondary is SelfHostStagingAdapter', () => {
    const config = loadMusicConfigFromEnv(AB_ENV as NodeJS.ProcessEnv)
    expect(config.mode).toBe('a-b-compare')
    expect(config.primary).toBeInstanceOf(AceStepCloudProd)
    expect(config.secondary).toBeInstanceOf(SelfHostStagingAdapter)
  })

  it('fallback: requires all four vars', () => {
    expect(() =>
      loadMusicConfigFromEnv({
        ENGINE_MODE: 'fallback',
        CLOUD_ENGINE_URL: 'https://cloud.example.com',
        CLOUD_ENGINE_TOKEN: 'tok',
        // AIBACKEND vars missing
      } as NodeJS.ProcessEnv),
    ).toThrow('AIBACKEND_URL')
  })

  it('throws on invalid ENGINE_MODE', () => {
    expect(() =>
      loadMusicConfigFromEnv({ ENGINE_MODE: 'invalid-mode' } as NodeJS.ProcessEnv),
    ).toThrow('Invalid ENGINE_MODE')
  })
})
