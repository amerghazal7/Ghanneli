export class EngineError extends Error {
  readonly status?: number

  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, { cause: opts?.cause })
    this.name = 'EngineError'
    this.status = opts?.status
  }
}
