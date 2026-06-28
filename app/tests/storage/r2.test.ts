/**
 * Tests for createProdR2Client — verifies R2_ENDPOINT override for MinIO.
 *
 * We intercept the S3Client constructor via vi.mock so no real AWS calls occur.
 * The test asserting forcePathStyle checks the options passed to the S3Client
 * constructor directly, since S3Client does not expose config as a public API.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Capture the S3Client constructor arguments
// ---------------------------------------------------------------------------

const capturedConfigs: Record<string, unknown>[] = []

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn((config: Record<string, unknown>) => {
      capturedConfigs.push({ ...config })
      return {
        send: vi.fn(),
      }
    }),
    PutObjectCommand: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Helper: reset env + config captures between tests
// ---------------------------------------------------------------------------

function clearCaptures() {
  capturedConfigs.length = 0
}

afterEach(() => {
  clearCaptures()
  delete process.env['R2_ENDPOINT']
  delete process.env['R2_ACCOUNT_ID']
  delete process.env['R2_ACCESS_KEY_ID']
  delete process.env['R2_SECRET_ACCESS_KEY']
  delete process.env['R2_BUCKET']
  delete process.env['R2_PUBLIC_BASE_URL']
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createProdR2Client — R2_ENDPOINT override', () => {
  it('when R2_ENDPOINT is set: uses that endpoint and enables forcePathStyle', async () => {
    process.env['R2_ACCOUNT_ID'] = 'test-account'
    process.env['R2_ACCESS_KEY_ID'] = 'minioadmin'
    process.env['R2_SECRET_ACCESS_KEY'] = 'minioadmin'
    process.env['R2_BUCKET'] = 'ghanneli-local'
    process.env['R2_PUBLIC_BASE_URL'] = 'http://localhost:9000/ghanneli-local'
    process.env['R2_ENDPOINT'] = 'http://minio:9000'

    // Re-import to pick up env at call time (factory reads env on each call)
    const { createProdR2Client } = await import('../../src/server/services/storage/r2')
    createProdR2Client()

    expect(capturedConfigs).toHaveLength(1)
    const cfg = capturedConfigs[0]
    expect(cfg['endpoint']).toBe('http://minio:9000')
    expect(cfg['forcePathStyle']).toBe(true)
  })

  it('when R2_ENDPOINT is unset: uses Cloudflare endpoint and no forcePathStyle', async () => {
    process.env['R2_ACCOUNT_ID'] = 'my-cf-account'
    process.env['R2_ACCESS_KEY_ID'] = 'cfkey'
    process.env['R2_SECRET_ACCESS_KEY'] = 'cfsecret'
    process.env['R2_BUCKET'] = 'ghanneli-prod'
    process.env['R2_PUBLIC_BASE_URL'] = 'https://cdn.ghanneli.com'
    // R2_ENDPOINT deliberately not set

    const { createProdR2Client } = await import('../../src/server/services/storage/r2')
    createProdR2Client()

    expect(capturedConfigs).toHaveLength(1)
    const cfg = capturedConfigs[0]
    expect(cfg['endpoint']).toBe('https://my-cf-account.r2.cloudflarestorage.com')
    // forcePathStyle must be absent or false — not truthy
    expect(cfg['forcePathStyle']).toBeFalsy()
  })

  it('R2Client.publicUri still works correctly when R2_ENDPOINT is set', async () => {
    process.env['R2_ACCOUNT_ID'] = 'test-account'
    process.env['R2_ACCESS_KEY_ID'] = 'minioadmin'
    process.env['R2_SECRET_ACCESS_KEY'] = 'minioadmin'
    process.env['R2_BUCKET'] = 'ghanneli-local'
    process.env['R2_PUBLIC_BASE_URL'] = 'http://localhost:9000/ghanneli-local'
    process.env['R2_ENDPOINT'] = 'http://minio:9000'

    const { createProdR2Client } = await import('../../src/server/services/storage/r2')
    const client = createProdR2Client()

    expect(client.publicUri('audio/full/abc.mp3')).toBe(
      'http://localhost:9000/ghanneli-local/audio/full/abc.mp3',
    )
  })
})
