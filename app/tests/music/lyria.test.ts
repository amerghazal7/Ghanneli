import { describe, it, expect, vi } from 'vitest'
import { LyriaAdapter } from '../../src/server/services/music/adapters/lyria'
import { EngineError } from '../../src/server/services/music/errors'

const REQ = {
  taggedLyrics: '[verse] يا ليل يا عين\n[chorus] كل عام وأنت بخير',
  transliteration: 'ya leil ya ain',
  styleTags: ['khaleeji', 'pop', 'upbeat'],
  dialect: 'khaleeji' as const,
  genre: 'khaleeji',
  mood: 'فرِح',
  voiceGender: 'male' as const,
  durationSec: 90,
  numTakes: 1,
}

const FAKE_BASE64 = Buffer.from([0xaa, 0xbb, 0xcc]).toString('base64')

function audioResponse(status: number): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              { text: '[[A0]] composition notes' },
              { inlineData: { mimeType: 'audio/mpeg', data: FAKE_BASE64 } },
            ],
          },
        },
      ],
    }),
    { status },
  )
}

function getFetchCall(f: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return f.mock.calls[0] as unknown as [string, RequestInit]
}

describe('LyriaAdapter', () => {
  it('POSTs generateContent with AUDIO modality and lyrics in the prompt', async () => {
    const fakeFetch = vi.fn(async () => audioResponse(200))
    const fakeWriteFile = vi.fn(async () => {})
    const adapter = new LyriaAdapter(
      { apiKey: 'KEY123', baseUrl: 'https://example.com' },
      { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
    )
    await adapter.generate(REQ)

    const [url, init] = getFetchCall(fakeFetch)
    expect(url).toBe('https://example.com/v1beta/models/lyria-3-pro-preview:generateContent?key=KEY123')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body as string)
    expect(sent.generationConfig.responseModalities).toEqual(['AUDIO'])
    const prompt: string = sent.contents[0].parts[0].text
    expect(prompt).toContain(REQ.taggedLyrics)
    expect(prompt).toContain('khaleeji')
    // No artist names leak into the prompt (legal constraint).
    for (const name of ['fairuz', 'فيروز', 'amr diab', 'عمرو دياب']) {
      expect(prompt.toLowerCase()).not.toContain(name.toLowerCase())
    }
  })

  it('decodes inline audio, writes a temp file, returns a Lyria MusicResult', async () => {
    const fakeFetch = vi.fn(async () => audioResponse(200))
    const fakeWriteFile = vi.fn(async () => {})
    const adapter = new LyriaAdapter(
      { apiKey: 'KEY123' },
      { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: fakeWriteFile },
    )
    const result = await adapter.generate(REQ)

    expect(fakeWriteFile).toHaveBeenCalledOnce()
    const [writtenPath, writtenBytes] = fakeWriteFile.mock.calls[0] as unknown as [string, Buffer]
    expect(writtenPath).toMatch(/\.mp3$/)
    expect(writtenBytes.toString('hex')).toBe('aabbcc')
    expect(result.engineId).toBe('lyria-3-pro')
    expect(result.engineVersion).toBe('lyria-3-pro-preview')
    expect(result.takes[0]!.audioUri).toBe(writtenPath)
    expect(result.takes[0]!.durationSec).toBe(90)
  })

  it('throws EngineError on non-2xx', async () => {
    const fakeFetch = vi.fn(async () => audioResponse(429))
    const adapter = new LyriaAdapter(
      { apiKey: 'K' },
      { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: vi.fn(async () => {}) },
    )
    const err = await adapter.generate(REQ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EngineError)
    expect((err as EngineError).status).toBe(429)
  })

  it('throws EngineError when no inline audio part is present', async () => {
    const fakeFetch = vi.fn(
      async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] }), { status: 200 }),
    )
    const adapter = new LyriaAdapter(
      { apiKey: 'K' },
      { fetchImpl: fakeFetch as unknown as typeof fetch, writeFile: vi.fn(async () => {}) },
    )
    await expect(adapter.generate(REQ)).rejects.toBeInstanceOf(EngineError)
  })
})
