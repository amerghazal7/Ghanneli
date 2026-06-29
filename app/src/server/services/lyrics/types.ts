import type { LanguageModel } from 'ai'
import type { AgeBand, Dialect, Gender, Tempo } from '../music/types'

export type { Dialect, LanguageModel }

export interface LyricsRequest {
  occasion: string
  recipient: string
  sender: string
  relationship: string
  dialect: Dialect
  mood: string
  lengthHint: 'short' | 'standard'
  // Optional personalization — older callers/tests may omit these; buildPrompt
  // applies safe defaults (include name + occasion, no traits/story).
  tempo?: Tempo
  includeName?: boolean
  mentionOccasion?: boolean
  traits?: string[]
  story?: string
  recipientGender?: Gender
  recipientAge?: AgeBand
  senderGender?: Gender
  senderAge?: AgeBand
  /** @deprecated pre-redesign free-text details; no longer used by the prompt. */
  details?: string[]
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
