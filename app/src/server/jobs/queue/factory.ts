import { CloudTasksQueue } from './cloud-tasks'
import { BullMqQueue } from './bullmq'
import type { QueueAdapter } from './types'

export function createQueue(): QueueAdapter {
  const driver = process.env.QUEUE_DRIVER ?? 'cloud-tasks'

  if (driver === 'cloud-tasks') {
    return new CloudTasksQueue()
  }

  if (driver === 'bullmq') {
    return new BullMqQueue()
  }

  throw new Error(`Unknown QUEUE_DRIVER: "${driver}"`)
}
