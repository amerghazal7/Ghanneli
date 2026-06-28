import { describe, it, expect, vi } from 'vitest'
import { AceStepLocalAdapter } from '../../src/server/services/music/adapters/aceStepLocal'
import { EngineError } from '../../src/server/services/music/errors'

// Minimal valid MusicRequest for tests
const REQ = {
  taggedLyrics: '[verse] يا ليل يا عين',
  transliteration: 'ya leil ya ain',
  styleTags: ['khaleeji', 'romantic', 'slow'],
  dialect: 'khaleeji' as const,
  genre: 'khaleeji',
  mood: 'romantic',
  voiceGender: 'female' as const,
  durationSec: 45,
  numTakes: 1,
}

// A tiny base64-encoded 3-byte payload — stands in for real mp3 bytes
const FAKE_BYTES_HEX = 'aabbcc'
const FAKE_BASE64 = Buffer.from([0xaa, 0xbb, 0xcc]).toString('base64')
const FAKE_DATA_URL = `data:audio/mpeg;base64,${FAKE_BASE64}`

function makeFakeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

/** Helper: get typed fetch call args from mock */
function getFetchCall(fakeFetch: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const calls = fakeFetch.mock.calls as unknown as Array<[string, RequestInit]>
  return calls[0]!
}

/** Helper: get typed writeFile call args from mock */
function getWriteFileCall(fakeWriteFile: ReturnType<typeof vi.fn>): [string, Buffer] {
  const calls = fakeWriteFile.mock.calls as unknown as Array<[string, Buffer]>
  return calls[0]!
}

describe('AceStepLocalAdapter', () => {
  describe('request shape', () => {
    it('POSTs to /v1/chat/completions with correct body fields', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-1.5',
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})

      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )

      await adapter.generate(REQ)

      expect(fakeFetch).toHaveBeenCalledOnce()
      const [url, init] = getFetchCall(fakeFetch)
      expect(url).toBe('http://localhost:8001/v1/chat/completions')
      expect(init.method).toBe('POST')

      const sent = JSON.parse(init.body as string)
      expect(sent.stream).toBe(false)
      expect(sent.task_type).toBe('text2music')
      expect(sent.modalities).toEqual(['audio'])
      expect(sent.lyrics).toBe(REQ.taggedLyrics)
      expect(sent.audio_config.duration).toBe(REQ.durationSec)
      expect(sent.audio_config.format).toBe('mp3')
      expect(sent.audio_config.instrumental).toBe(false)
      expect(sent.audio_config.vocal_language).toBe('arabic')
      // caption in messages[0].content must include genre and dialect
      expect(sent.messages[0].role).toBe('user')
      const caption: string = sent.messages[0].content
      expect(caption).toContain('khaleeji')
    })

    it('caption contains NO artist names — only genre/dialect/mood/styleTags', async () => {
      const reqWithSafeTags = {
        ...REQ,
        styleTags: ['pop', 'upbeat', 'female-vocal'],
      }
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-1.5',
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await adapter.generate(reqWithSafeTags)

      const [, init] = getFetchCall(fakeFetch)
      const sent = JSON.parse(init.body as string)
      const caption: string = sent.messages[0].content
      // Must not contain any well-known Arabic artist name — guard the legal constraint
      const BANNED = ['fairuz', 'فيروز', 'umm kulthum', 'أم كلثوم', 'amr diab', 'عمرو دياب']
      for (const name of BANNED) {
        expect(caption.toLowerCase()).not.toContain(name.toLowerCase())
      }
    })
  })

  describe('response handling', () => {
    it('decodes base64, writes temp file, returns correct MusicResult', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-v2',
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})

      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      const result = await adapter.generate(REQ)

      // writeFile received the decoded bytes
      expect(fakeWriteFile).toHaveBeenCalledOnce()
      const [writtenPath, writtenBytes] = getWriteFileCall(fakeWriteFile)
      expect(writtenPath).toMatch(/\.mp3$/)
      expect(Buffer.isBuffer(writtenBytes)).toBe(true)
      expect(writtenBytes.toString('hex')).toBe(FAKE_BYTES_HEX)

      // returned result shape
      expect(result.engineId).toBe('acestep-local')
      expect(result.engineVersion).toBe('ace-step-v2')
      expect(result.takes).toHaveLength(1)
      expect(result.takes[0]!.audioUri).toBe(writtenPath)
      expect(result.takes[0]!.durationSec).toBe(REQ.durationSec)
    })

    it('uses constructor model fallback when resp.model is missing', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          // no model field
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001', model: 'my-override' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      const result = await adapter.generate(REQ)
      expect(result.engineVersion).toBe('my-override')
    })

    it('falls back to "ace-step-1.5" when resp.model and constructor model both absent', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      const result = await adapter.generate(REQ)
      expect(result.engineVersion).toBe('ace-step-1.5')
    })
  })

  describe('error handling', () => {
    it('throws EngineError on non-2xx response', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(503, { error: 'service unavailable' }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await expect(adapter.generate(REQ)).rejects.toBeInstanceOf(EngineError)
    })

    it('throws EngineError with status code on non-2xx', async () => {
      const fakeFetch = vi.fn(async () => makeFakeResponse(422, { error: 'bad request' }))
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      const err = await adapter.generate(REQ).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(EngineError)
      expect((err as EngineError).status).toBe(422)
    })

    it('throws EngineError when audio data URL is missing from response', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-1.5',
          choices: [{ message: { audio: [] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await expect(adapter.generate(REQ)).rejects.toBeInstanceOf(EngineError)
    })

    it('throws EngineError on network failure', async () => {
      const fakeFetch = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await expect(adapter.generate(REQ)).rejects.toBeInstanceOf(EngineError)
    })
  })

  describe('auth header', () => {
    it('includes Authorization header when token is provided', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-1.5',
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001', token: 'secret-token' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await adapter.generate(REQ)

      const [, init] = getFetchCall(fakeFetch)
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer secret-token')
    })

    it('omits Authorization header when token is not provided', async () => {
      const fakeFetch = vi.fn(async () =>
        makeFakeResponse(200, {
          model: 'ace-step-1.5',
          choices: [{ message: { audio: [{ audio_url: { url: FAKE_DATA_URL } }] } }],
        }),
      )
      const fakeWriteFile = vi.fn(async (_p: string, _d: Buffer) => {})
      const adapter = new AceStepLocalAdapter(
        { baseUrl: 'http://localhost:8001' },
        { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
      )
      await adapter.generate(REQ)

      const [, init] = getFetchCall(fakeFetch)
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })
  })
})
