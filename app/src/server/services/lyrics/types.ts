import type { LanguageModel } from 'ai'
import type { Dialect } from '../music/types'

export type { Dialect, LanguageModel }

export interface LyricsRequest {
  occasion: string
  recipient: string
  sender: string
  relationship: string
  details: string[]
  dialect: Dialect
  mood: string
  lengthHint: 'short' | 'standard'
}

export interface LyricsResult {
  taggedLyricsArabic: string
  transliteration: string
  language: 'ar'
  meta: { model: string }
}

export interface LyricsService {
  generateLyrics(r: LyricsRequest): Promise<LyricsResult>
}
