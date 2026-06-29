import { z } from 'zod'

const dialectEnum = z.enum(['khaleeji', 'egyptian', 'levantine', 'maghrebi', 'iraqi'])
export type Dialect = z.infer<typeof dialectEnum>

/** Shared personalization value types used across the wizard → lyrics pipeline. */
export type Gender = 'male' | 'female'
export type AgeBand = 'child' | 'youth' | 'adult' | 'senior'
export type Tempo = 'slow' | 'medium' | 'fast'

export const MusicRequestSchema = z.object({
  taggedLyrics: z.string().min(1),
  transliteration: z.string(),
  styleTags: z.array(z.string()),
  dialect: dialectEnum,
  genre: z.string(),
  bpm: z.number().optional(),
  voiceGender: z.enum(['male', 'female']),
  voiceProfileId: z.string().optional(),
  durationSec: z.number(),
  numTakes: z.number().int().min(1).max(4),
})

export type MusicRequest = z.infer<typeof MusicRequestSchema>

export interface MusicTake {
  audioUri: string
  durationSec: number
  score?: number
}

export interface MusicResult {
  takes: MusicTake[]
  engineId: string
  engineVersion: string
  meta?: Record<string, unknown>
}

export interface MusicGenerationService {
  generate(req: MusicRequest): Promise<MusicResult>
}
