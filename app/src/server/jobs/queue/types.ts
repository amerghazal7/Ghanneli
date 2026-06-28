export interface QueueAdapter {
  enqueue(jobName: string, payload: unknown): Promise<void>
}
