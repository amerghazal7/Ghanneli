import { generateObject } from 'ai'
import { z } from 'zod'
import type { LanguageModel } from 'ai'
import { buildPrompt } from './prompts'
import type { LyricsRequest, LyricsResult, LyricsService } from './types'

const LyricsOutputSchema = z.object({
  taggedLyricsArabic: z.string().min(1),
  transliteration: z.string().min(1),
  language: z.literal('ar'),
})

export function createLyricsService(opts: { model: LanguageModel }): LyricsService {
  return {
    async generateLyrics(r: LyricsRequest): Promise<LyricsResult> {
      const prompt = buildPrompt(r)
      const { object } = await generateObject({
        model: opts.model,
        schema: LyricsOutputSchema,
        prompt,
      })
      return {
        taggedLyricsArabic: object.taggedLyricsArabic,
        transliteration: object.transliteration,
        language: 'ar',
        meta: { model: opts.model.modelId },
      }
    },
  }
}
