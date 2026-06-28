import { it, expect } from 'vitest'
import { MockLanguageModelV1 } from 'ai/test'
import { createLyricsService } from '../../src/server/services/lyrics/service'

function mockModel(result: unknown) {
  return new MockLanguageModelV1({
    defaultObjectGenerationMode: 'json',
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify(result),
    }),
  })
}

it('produces tagged dialect lyrics', async () => {
  const svc = createLyricsService({
    model: mockModel({ taggedLyricsArabic: '[verse] يا ...', transliteration: 'ya ...', language: 'ar' }),
  })
  const r = await svc.generateLyrics({
    occasion: 'birthday',
    recipient: 'سارة',
    sender: 'أحمد',
    relationship: 'sister',
    details: ['تحب البحر'],
    dialect: 'egyptian',
    mood: 'romantic',
    lengthHint: 'standard',
  })
  expect(r.taggedLyricsArabic).toContain('[verse]')
  expect(r.meta.model).toBeTruthy()
})
