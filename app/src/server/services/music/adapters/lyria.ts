/**
 * LyriaAdapter — MusicGenerationService backed by Google's Lyria 3 Pro
 * (model `lyria-3-pro-preview`) via the Generative Language API.
 *
 * Unlike ACE-Step, Lyria is called with `generateContent` and
 * `responseModalities: ['AUDIO']`; it returns the song as inline base64
 * audio (audio/mpeg) plus a text part describing the composition. It sings
 * the lyrics we pass in the prompt.
 *
 * Caption is built ONLY from style attributes — never artist names (the same
 * legal constraint as the ACE-Step adapter).
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFile as fsWriteFile } from 'node:fs/promises'
import type { MusicGenerationService, MusicRequest, MusicResult } from '../types'
import { EngineError } from '../errors'

/** Dependency-injection seam for tests (defaults to real fetch + fs.writeFile). */
export interface LyriaDeps {
  fetchImpl?: typeof fetch
  writeFile?: (path: string, data: Buffer) => Promise<void>
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'

export class LyriaAdapter implements MusicGenerationService {
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly writeFile: (path: string, data: Buffer) => Promise<void>

  constructor(
    config: { apiKey: string; model?: string; baseUrl?: string },
    deps: LyriaDeps = {},
  ) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'lyria-3-pro-preview'
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.writeFile = deps.writeFile ?? ((p, d) => fsWriteFile(p, d))
  }

  async generate(req: MusicRequest): Promise<MusicResult> {
    // Style caption from attributes only — NO artist names (legal constraint).
    const caption =
      req.styleTags.length > 0
        ? req.styleTags.join(', ')
        : [req.genre, req.dialect].filter(Boolean).join(', ')

    const voice = req.voiceGender === 'male' ? 'male' : 'female'
    const prompt = [
      `Compose a complete, well-produced ${caption} song with clear ${voice} Arabic vocals.`,
      `Sing exactly these Arabic lyrics, honouring the [verse] / [chorus] structure:`,
      req.taggedLyrics,
    ].join('\n')

    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'] as const },
    }

    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new EngineError(`Network error reaching Lyria at ${this.baseUrl}`, { cause })
    }

    if (!res.ok) {
      throw new EngineError(`Lyria returned HTTP ${res.status}`, { status: res.status })
    }

    let parsed: unknown
    try {
      parsed = await res.json()
    } catch (cause) {
      throw new EngineError('Lyria response is not valid JSON', { status: res.status, cause })
    }

    // Walk candidates[0].content.parts[] for the inline audio part.
    const p = parsed as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }
      }>
    }
    const parts = p.candidates?.[0]?.content?.parts ?? []
    const audioPart = parts.find(
      (part) => part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data,
    )
    const b64 = audioPart?.inlineData?.data
    if (!b64) {
      throw new EngineError('Lyria response missing inline audio data')
    }

    const audioBytes = Buffer.from(b64, 'base64')
    const subtype = audioPart!.inlineData!.mimeType!.split('/')[1] ?? 'mp3'
    const ext = subtype === 'mpeg' ? 'mp3' : subtype
    const tempPath = join(tmpdir(), `lyria-${randomUUID()}.${ext}`)
    await this.writeFile(tempPath, audioBytes)

    return {
      takes: [{ audioUri: tempPath, durationSec: req.durationSec }],
      engineId: 'lyria-3-pro',
      engineVersion: this.model,
    }
  }
}
