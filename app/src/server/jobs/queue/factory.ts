import { CloudTasksQueue } from './cloud-tasks'
import type { QueueAdapter } from './types'

export function createQueue(): QueueAdapter {
  const driver = process.env.QUEUE_DRIVER ?? 'cloud-tasks'

  if (driver === 'cloud-tasks') {
    return new CloudTasksQueue()
  }

  if (driver === 'bullmq') {
    throw new Error('bullmq queue driver not yet implemented')
  }

  throw new Error(`Unknown QUEUE_DRIVER: "${driver}"`)
}
