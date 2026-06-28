import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * LOCAL.3 — verifies the local Neon HTTP proxy toggle in db/client.ts.
 *
 * getDb() caches a module-level singleton and neonConfig is global mutable
 * state, so each case runs against a freshly reset module graph.
 */

const ORIGINAL_ENV = { ...process.env }

describe('getDb local Neon proxy toggle', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('points neonConfig.fetchEndpoint at the proxy when NEON_LOCAL_PROXY_URL is set', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/ghanneli'
    process.env.NEON_LOCAL_PROXY_URL = 'http://neon-proxy:4444/sql'

    const { neonConfig } = await import('@neondatabase/serverless')
    const { getDb } = await import('../../src/server/db/client')

    getDb()

    expect(neonConfig.fetchEndpoint).toBe('http://neon-proxy:4444/sql')
    expect(neonConfig.useSecureWebSocket).toBe(false)
  })

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    delete process.env.NEON_LOCAL_PROXY_URL

    const { getDb } = await import('../../src/server/db/client')

    expect(() => getDb()).toThrow(/DATABASE_URL/)
  })
})
