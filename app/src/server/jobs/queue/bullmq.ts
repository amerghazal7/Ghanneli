/**
 * BullMqQueue — QueueAdapter backed by BullMQ (LOCAL-DEV ONLY).
 *
 * The constructor accepts an optional injectable queue-like object so unit
 * tests can inject a fake without touching real Redis. In production (local
 * dev), pass no argument and the real bullmq Queue is constructed lazily from
 * REDIS_URL.
 *
 * The real `bullmq` import is done via require() inside the constructor so
 * that the module can be imported at type-check time even when bullmq is not
 * initialised, and so unit tests that inject a fake never trigger a real
 * Redis connection.
 */

import type { QueueAdapter } from './types'

/** Minimal interface matching bullmq's Queue.add that we depend on. */
export interface QueueLike {
  add(name: string, data: unknown): Promise<unknown>
}

export class BullMqQueue implements QueueAdapter {
  private readonly injected: QueueLike | undefined
  private readonly redisUrl: string | undefined
  private queue: QueueLike | undefined

  constructor(queue?: QueueLike) {
    this.injected = queue
    if (!queue) {
      // Validate config eagerly (fail fast); the bullmq import itself is deferred.
      const redisUrl = process.env['REDIS_URL']
      if (!redisUrl) throw new Error('Missing required env var: REDIS_URL')
      this.redisUrl = redisUrl
    }
  }

  /**
   * Resolve the underlying queue. A real bullmq Queue is created lazily via an
   * ESM dynamic import on first use (the package is "type":"module", so a
   * top-level require() is not defined at runtime). When a fake QueueLike is
   * injected (tests), bullmq is never imported and no Redis connection opens.
   */
  private async getQueue(): Promise<QueueLike> {
    if (this.injected) return this.injected
    if (!this.queue) {
      const { Queue } = await import('bullmq')
      this.queue = new Queue('generate', { connection: { url: this.redisUrl } })
    }
    return this.queue
  }

  async enqueue(jobName: string, payload: unknown): Promise<void> {
    const queue = await this.getQueue()
    await queue.add(jobName, payload)
  }
}
