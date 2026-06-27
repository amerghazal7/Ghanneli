export class EngineError extends Error {
  readonly status?: number
  readonly cause?: unknown

  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, { cause: opts?.cause })
    this.name = 'EngineError'
    this.status = opts?.status
  }
}
