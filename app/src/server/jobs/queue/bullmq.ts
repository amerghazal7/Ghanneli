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
  private readonly queue: QueueLike

  constructor(queue?: QueueLike) {
    if (queue) {
      this.queue = queue
    } else {
      const redisUrl = process.env['REDIS_URL']
      if (!redisUrl) throw new Error('Missing required env var: REDIS_URL')
      // Dynamic require keeps bullmq out of the module graph when a fake is injected.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Queue } = require('bullmq') as typeof import('bullmq')
      this.queue = new Queue('generate', { connection: { url: redisUrl } })
    }
  }

  async enqueue(jobName: string, payload: unknown): Promise<void> {
    await this.queue.add(jobName, payload)
  }
}
