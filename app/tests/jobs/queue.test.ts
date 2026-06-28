import { describe, it, expect, vi } from 'vitest'

// ─── factory tests ────────────────────────────────────────────────────────────

describe('createQueue factory', () => {
  it('returns a CloudTasksQueue when QUEUE_DRIVER is unset', async () => {
    delete process.env.QUEUE_DRIVER
    const { createQueue } = await import('../../src/server/jobs/queue/factory')
    const q = createQueue()
    expect(q.constructor.name).toBe('CloudTasksQueue')
  })

  it('returns a CloudTasksQueue when QUEUE_DRIVER=cloud-tasks', async () => {
    process.env.QUEUE_DRIVER = 'cloud-tasks'
    const { createQueue } = await import('../../src/server/jobs/queue/factory')
    const q = createQueue()
    expect(q.constructor.name).toBe('CloudTasksQueue')
  })

  it('throws "not yet implemented" for QUEUE_DRIVER=bullmq', async () => {
    process.env.QUEUE_DRIVER = 'bullmq'
    const { createQueue } = await import('../../src/server/jobs/queue/factory')
    expect(() => createQueue()).toThrow('not yet implemented')
  })

  it('throws on unknown QUEUE_DRIVER', async () => {
    process.env.QUEUE_DRIVER = 'unknown-driver'
    const { createQueue } = await import('../../src/server/jobs/queue/factory')
    expect(() => createQueue()).toThrow()
  })
})

// ─── CloudTasksQueue.enqueue tests ───────────────────────────────────────────

describe('CloudTasksQueue.enqueue', () => {
  it('calls createTask once with correct parent, url, oidc token, and base64 body', async () => {
    // Set required env vars
    process.env.CLOUD_TASKS_PROJECT = 'test-project'
    process.env.CLOUD_TASKS_LOCATION = 'us-central1'
    process.env.CLOUD_TASKS_QUEUE = 'test-queue'
    process.env.WORKER_URL = 'https://worker.example.com/api/jobs/generate'
    process.env.WORKER_SERVICE_ACCOUNT = 'sa@project.iam.gserviceaccount.com'

    const createTaskMock = vi.fn().mockResolvedValue([{}])
    const queuePathMock = vi.fn().mockReturnValue('projects/test-project/locations/us-central1/queues/test-queue')

    const fakeClient = {
      createTask: createTaskMock,
      queuePath: queuePathMock,
    }

    const { CloudTasksQueue } = await import('../../src/server/jobs/queue/cloud-tasks')
    const queue = new CloudTasksQueue(fakeClient as never)

    await queue.enqueue('generate', { songId: 's1' })

    expect(createTaskMock).toHaveBeenCalledOnce()

    const [call] = createTaskMock.mock.calls
    const req = call[0] as {
      parent: string
      task: {
        httpRequest: {
          url: string
          oidcToken: { serviceAccountEmail: string; audience: string }
          body: string
        }
      }
    }

    expect(req.parent).toBe('projects/test-project/locations/us-central1/queues/test-queue')
    expect(req.task.httpRequest.url).toBe('https://worker.example.com/api/jobs/generate')
    expect(req.task.httpRequest.oidcToken.serviceAccountEmail).toBe('sa@project.iam.gserviceaccount.com')
    expect(req.task.httpRequest.oidcToken.audience).toBe('https://worker.example.com/api/jobs/generate')

    // Body must be base64 JSON of the payload
    const decoded = JSON.parse(Buffer.from(req.task.httpRequest.body, 'base64').toString('utf8'))
    expect(decoded).toEqual({ songId: 's1' })
  })
})
