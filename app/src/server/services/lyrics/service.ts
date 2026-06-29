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

export function createLyricsService(opts: {
  model: LanguageModel
  fallbackModel?: LanguageModel
}): LyricsService {
  return {
    async generateLyrics(r: LyricsRequest): Promise<LyricsResult> {
      const prompt = buildPrompt(r)

      async function tryGenerate(m: LanguageModel): Promise<LyricsResult> {
        const { object } = await generateObject({
          model: m,
          schema: LyricsOutputSchema,
          prompt,
          // Lyrics are creative writing — a higher temperature yields more
          // natural, less "templated" Arabic phrasing and rhyme.
          temperature: 0.9,
        })
        return {
          taggedLyricsArabic: object.taggedLyricsArabic,
          transliteration: object.transliteration,
          language: 'ar',
          meta: { model: m.modelId },
        }
      }

      try {
        return await tryGenerate(opts.model)
      } catch (primaryErr) {
        if (opts.fallbackModel) {
          console.warn(
            `[lyrics] Primary model "${opts.model.modelId}" failed, falling back to "${opts.fallbackModel.modelId}":`,
            primaryErr,
          )
          return await tryGenerate(opts.fallbackModel)
        }
        throw primaryErr
      }
    },
  }
}
