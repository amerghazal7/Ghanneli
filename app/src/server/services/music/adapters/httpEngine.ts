import type { MusicRequest, MusicResult } from '../types'
import { EngineError } from '../errors'

export async function postGenerate(opts: {
  baseUrl: string
  headers?: Record<string, string>
  req: MusicRequest
}): Promise<MusicResult> {
  const { baseUrl, headers = {}, req } = opts

  let res: Response
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(req),
    })
  } catch (cause) {
    throw new EngineError(`Network error reaching ${baseUrl}`, { cause })
  }

  if (!res.ok) {
    throw new EngineError(`Engine returned HTTP ${res.status}`, { status: res.status })
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (cause) {
    throw new EngineError('Engine response is not valid JSON', { status: res.status, cause })
  }

  const b = body as Record<string, unknown>
  if (!Array.isArray(b['takes'])) {
    throw new EngineError('Engine response missing takes array')
  }

  return {
    takes: (b['takes'] as Array<Record<string, unknown>>).map((t) => ({
      audioUri: t['audioUri'] as string,
      durationSec: t['durationSec'] as number,
      ...(t['score'] !== undefined ? { score: t['score'] as number } : {}),
    })),
    engineId: b['engineId'] as string,
    engineVersion: b['engineVersion'] as string,
    ...(b['meta'] !== undefined ? { meta: b['meta'] as Record<string, unknown> } : {}),
  }
}
