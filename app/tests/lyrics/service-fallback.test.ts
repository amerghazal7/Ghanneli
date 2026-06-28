import { it, expect, vi } from 'vitest'
import { MockLanguageModelV1 } from 'ai/test'
import { createLyricsService } from '../../src/server/services/lyrics/service'

const baseRequest = {
  occasion: 'birthday',
  recipient: 'سارة',
  sender: 'أحمد',
  relationship: 'sister',
  details: ['تحب البحر'],
  dialect: 'egyptian' as const,
  mood: 'happy',
  lengthHint: 'standard' as const,
}

function mockModel(modelId: string, result: unknown) {
  return new MockLanguageModelV1({
    modelId,
    defaultObjectGenerationMode: 'json',
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify(result),
    }),
  })
}

function failingModel(modelId: string) {
  return new MockLanguageModelV1({
    modelId,
    defaultObjectGenerationMode: 'json',
    doGenerate: async () => {
      throw new Error(`Provider error from ${modelId}`)
    },
  })
}

it('primary succeeds → result from primary, meta.model === primary id, fallback never invoked', async () => {
  const primaryPayload = {
    taggedLyricsArabic: '[verse] يا حبيبي',
    transliteration: 'ya habibi',
    language: 'ar',
  }
  const primary = mockModel('gemini-2.5-flash', primaryPayload)
  const fallbackDoGenerate = vi.fn()
  const fallback = new MockLanguageModelV1({
    modelId: 'claude-3-5-haiku-latest',
    defaultObjectGenerationMode: 'json',
    doGenerate: fallbackDoGenerate,
  })

  const svc = createLyricsService({ model: primary, fallbackModel: fallback })
  const result = await svc.generateLyrics(baseRequest)

  expect(result.taggedLyricsArabic).toBe('[verse] يا حبيبي')
  expect(result.meta.model).toBe('gemini-2.5-flash')
  expect(fallbackDoGenerate).not.toHaveBeenCalled()
})

it('primary throws → fallback invoked, result from fallback, meta.model === fallback id', async () => {
  const fallbackPayload = {
    taggedLyricsArabic: '[chorus] أنا أحبك',
    transliteration: 'ana uhibbuk',
    language: 'ar',
  }
  const primary = failingModel('gemini-2.5-flash')
  const fallback = mockModel('claude-3-5-haiku-latest', fallbackPayload)

  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const svc = createLyricsService({ model: primary, fallbackModel: fallback })
  const result = await svc.generateLyrics(baseRequest)
  warnSpy.mockRestore()

  expect(result.taggedLyricsArabic).toBe('[chorus] أنا أحبك')
  expect(result.meta.model).toBe('claude-3-5-haiku-latest')
})

it('primary throws and no fallback → throws the error', async () => {
  const primary = failingModel('gemini-2.5-flash')

  const svc = createLyricsService({ model: primary })
  await expect(svc.generateLyrics(baseRequest)).rejects.toThrow('Provider error from gemini-2.5-flash')
})

it('both primary and fallback fail → throws', async () => {
  const primary = failingModel('gemini-2.5-flash')
  const fallback = failingModel('claude-3-5-haiku-latest')

  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const svc = createLyricsService({ model: primary, fallbackModel: fallback })
  await expect(svc.generateLyrics(baseRequest)).rejects.toThrow()
  warnSpy.mockRestore()
})
