export class EngineError extends Error {
  readonly status?: number
  readonly cause?: unknown

  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'EngineError'
    this.status = opts?.status
    this.cause = opts?.cause
  }
}
