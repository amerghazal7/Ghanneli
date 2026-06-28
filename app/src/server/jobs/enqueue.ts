/**
 * Enqueues a song generation job onto Google Cloud Tasks.
 * The worker route at WORKER_URL will receive an HTTP POST with { songId }.
 *
 * Required env vars:
 *   CLOUD_TASKS_PROJECT   — GCP project id
 *   CLOUD_TASKS_LOCATION  — region, e.g. "us-central1"
 *   CLOUD_TASKS_QUEUE     — queue id
 *   WORKER_URL            — full URL of the /api/jobs/generate route
 *   WORKER_SERVICE_ACCOUNT — service account email for OIDC token
 */

import { CloudTasksClient } from '@google-cloud/tasks'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export async function enqueueGeneration(
  songId: string,
  client?: CloudTasksClient,
): Promise<void> {
  const project = requireEnv('CLOUD_TASKS_PROJECT')
  const location = requireEnv('CLOUD_TASKS_LOCATION')
  const queue = requireEnv('CLOUD_TASKS_QUEUE')
  const workerUrl = requireEnv('WORKER_URL')
  const serviceAccount = requireEnv('WORKER_SERVICE_ACCOUNT')

  const tasksClient = client ?? new CloudTasksClient()

  const parent = tasksClient.queuePath(project, location, queue)
  const body = Buffer.from(JSON.stringify({ songId })).toString('base64')

  await tasksClient.createTask({
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
