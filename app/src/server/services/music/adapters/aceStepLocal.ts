import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFile as fsWriteFile } from 'node:fs/promises'
import type { MusicGenerationService, MusicRequest, MusicResult } from '../types'
import { EngineError } from '../errors'

/** Dependency-injection seam for tests (defaults to real fetch + fs.writeFile). */
export interface AceStepDeps {
  fetchImpl?: typeof fetch
  writeFile?: (path: string, data: Buffer) => Promise<void>
}

export class AceStepLocalAdapter implements MusicGenerationService {
  private readonly baseUrl: string
  private readonly token?: string
  private readonly model?: string
  private readonly fetchImpl: typeof fetch
  private readonly writeFile: (path: string, data: Buffer) => Promise<void>

  private readonly steps: number
  private readonly guidanceScale: number

  constructor(
    config: { baseUrl: string; token?: string; model?: string; steps?: number; guidanceScale?: number },
    deps: AceStepDeps = {},
  ) {
    this.baseUrl = config.baseUrl
    this.token = config.token
    this.model = config.model
    // Higher inference steps → clearer vocals (the turbo model's floor of ~8
    // produces mumbled, non-native-sounding output). guidance_scale tightens
    // adherence to the lyrics/prompt. Both tunable via env (see config.ts).
    this.steps = config.steps ?? 50
    this.guidanceScale = config.guidanceScale ?? 7.5
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.writeFile = deps.writeFile ?? ((p, d) => fsWriteFile(p, d))
  }

  async generate(req: MusicRequest): Promise<MusicResult> {
    // Caption built ONLY from style attributes — NO artist names (legal constraint).
    const caption = req.styleTags.length > 0
      ? req.styleTags.join(', ')
      : [req.genre, req.dialect].filter(Boolean).join(', ')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const body: Record<string, unknown> = {
      messages: [{ role: 'user', content: caption }],
      modalities: ['audio'],
      lyrics: req.taggedLyrics,
      audio_config: {
        duration: req.durationSec,
        // WAV is exported via soundfile (no ffmpeg). MP3 export on the ACE-Step
        // host requires ffmpeg on its PATH; when absent, the server silently
        // returns audio:null. We request WAV and let the worker (which bundles
        // ffmpeg) transcode downstream.
        format: 'wav',
        instrumental: false,
        vocal_language: 'arabic',
      },
      task_type: 'text2music',
      stream: false,
      inference_steps: this.steps,
      guidance_scale: this.guidanceScale,
    }
    if (this.model) {
      body['model'] = this.model
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new EngineError(`Network error reaching ACE-Step at ${this.baseUrl}`, { cause })
    }

    if (!res.ok) {
      throw new EngineError(`ACE-Step returned HTTP ${res.status}`, { status: res.status })
    }

    let parsed: unknown
    try {
      parsed = await res.json()
    } catch (cause) {
      throw new EngineError('ACE-Step response is not valid JSON', { status: res.status, cause })
    }

    const p = parsed as Record<string, unknown>
    const choices = p['choices'] as Array<Record<string, unknown>> | undefined
    const audioUrl: unknown =
      choices?.[0]?.['message'] &&
      ((choices[0]!['message'] as Record<string, unknown>)['audio'] as Array<Record<string, unknown>>)?.[0]?.[
        'audio_url'
      ] &&
      (
        ((choices[0]!['message'] as Record<string, unknown>)['audio'] as Array<Record<string, unknown>>)[0]![
          'audio_url'
        ] as Record<string, unknown>
      )['url']

    if (typeof audioUrl !== 'string' || !audioUrl.startsWith('data:')) {
      throw new EngineError('ACE-Step response missing valid audio data URL')
    }

    // Strip "data:audio/<subtype>;base64," prefix and decode
    const base64Part = audioUrl.slice(audioUrl.indexOf(',') + 1)
    const audioBytes = Buffer.from(base64Part, 'base64')

    // Derive the temp-file extension from the data-URL mime so the downstream
    // ffmpeg step gets a correctly-named container (mpeg→mp3, wav→wav, etc.).
    const mimeSubtype = audioUrl.slice('data:audio/'.length, audioUrl.indexOf(';'))
    const ext = mimeSubtype === 'mpeg' ? 'mp3' : (mimeSubtype || 'wav')

    // Write to a temp file so ffmpeg (which can't read data: URLs) can open it
    const tempPath = join(tmpdir(), `acestep-${randomUUID()}.${ext}`)
    await this.writeFile(tempPath, audioBytes)

    const engineVersion = (p['model'] as string | undefined) ?? this.model ?? 'ace-step-1.5'

    return {
      takes: [{ audioUri: tempPath, durationSec: req.durationSec }],
      engineId: 'acestep-local',
      engineVersion,
    }
  }
}
