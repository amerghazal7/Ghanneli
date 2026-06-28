import { describe, it, expect, vi } from 'vitest'
import { BullMqQueue } from '../../src/server/jobs/queue/bullmq'
import { processJob } from '../../src/server/jobs/bullmq-worker'
import type { GenerationDeps } from '../../src/server/services/pipeline'

// ─── BullMqQueue tests ────────────────────────────────────────────────────────

describe('BullMqQueue', () => {
  it('calls queue.add with the job name and payload', async () => {
    const fakeAdd = vi.fn().mockResolvedValue({ id: '1' })
    const fakeQueue = { add: fakeAdd }

    const q = new BullMqQueue(fakeQueue)
    await q.enqueue('generate', { songId: 's1' })

    expect(fakeAdd).toHaveBeenCalledOnce()
    expect(fakeAdd).toHaveBeenCalledWith('generate', { songId: 's1' })
  })

  it('throws when REDIS_URL is missing and no queue is injected', () => {
    delete process.env.REDIS_URL
    // Construction must fail before touching real bullmq/Redis
    expect(() => new BullMqQueue()).toThrow('Missing required env var: REDIS_URL')
  })
})

// ─── Worker processJob tests ──────────────────────────────────────────────────

describe('processJob', () => {
  it('maps job.data.songId to the handler with the provided deps', async () => {
    const fakeHandler = vi.fn().mockResolvedValue(undefined)
    const fakeDeps = {} as GenerationDeps

    await processJob({ data: { songId: 'song-abc' } }, fakeDeps, fakeHandler)

    expect(fakeHandler).toHaveBeenCalledOnce()
    expect(fakeHandler).toHaveBeenCalledWith('song-abc', fakeDeps)
  })

  it('propagates errors thrown by the handler', async () => {
    const fakeHandler = vi.fn().mockRejectedValue(new Error('pipeline failed'))
    const fakeDeps = {} as GenerationDeps

    await expect(
      processJob({ data: { songId: 'bad-song' } }, fakeDeps, fakeHandler),
    ).rejects.toThrow('pipeline failed')
  })
})

// ─── factory tests for bullmq driver ─────────────────────────────────────────

describe('createQueue factory with QUEUE_DRIVER=bullmq', () => {
  it('returns a BullMqQueue instance without connecting to Redis (injected)', async () => {
    // We test the factory by importing createQueue after clearing the module
    // cache so the QUEUE_DRIVER env change is picked up. We do NOT want real
    // Redis — so we set REDIS_URL to a dummy value; BullMqQueue only connects
    // when the constructor receives no injected queue AND actually tries to
    // instantiate the real bullmq Queue. The factory calls new BullMqQueue()
    // with no injection, so we just verify the returned instance type.
    process.env.QUEUE_DRIVER = 'bullmq'
    process.env.REDIS_URL = 'redis://localhost:6379'

    // Reset the module so the updated env var is visible to the factory
    const { createQueue } = await import('../../src/server/jobs/queue/factory')
    const q = createQueue()

    expect(q.constructor.name).toBe('BullMqQueue')

    delete process.env.REDIS_URL
  })
})
