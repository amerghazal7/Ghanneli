import { CloudTasksClient } from '@google-cloud/tasks'
import type { QueueAdapter } from './types'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export class CloudTasksQueue implements QueueAdapter {
  private readonly client: CloudTasksClient

  constructor(client?: CloudTasksClient) {
    this.client = client ?? new CloudTasksClient()
  }

  async enqueue(_jobName: string, payload: unknown): Promise<void> {
    const project = requireEnv('CLOUD_TASKS_PROJECT')
    const location = requireEnv('CLOUD_TASKS_LOCATION')
    const queue = requireEnv('CLOUD_TASKS_QUEUE')
    const workerUrl = requireEnv('WORKER_URL')
    const serviceAccount = requireEnv('WORKER_SERVICE_ACCOUNT')

    const parent = this.client.queuePath(project, location, queue)
    const body = Buffer.from(JSON.stringify(payload)).toString('base64')

    await this.client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: workerUrl,
          headers: { 'Content-Type': 'application/json' },
          body,
          oidcToken: {
            serviceAccountEmail: serviceAccount,
            audience: workerUrl,
          },
        },
      },
    })
  }
}
