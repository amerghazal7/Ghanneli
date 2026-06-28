/**
 * Typed analytics event definitions for Ghanneli.
 *
 * PII excluded by construction:
 * - No free-text fields (story, recipient, sender, details, email, lyrics,
 *   transliteration, taggedLyrics) appear in ANY event variant.
 * - Money is integer minor units (e.g. gpuCostMinor: number).
 * - Dialect is reused from the canonical music/types Dialect type.
 * - All fields are IDs, enums, or numeric/boolean metrics.
 */

import type { Dialect } from '../music/types'

// ---------------------------------------------------------------------------
// Individual event variants
// ---------------------------------------------------------------------------

export interface WizardStartedEvent {
  readonly type: 'wizard_started'
  /** Opaque session/correlation ID — no user PII. */
  readonly sessionId?: string
}

export interface PreviewGeneratedEvent {
  readonly type: 'preview_generated'
  readonly songId: string
  readonly dialect: Dialect
  readonly genre: string
  /** Whether this was a re-generation (user clicked "regenerate"). */
  readonly regenerated: boolean
}

export interface PurchaseCompletedEvent {
  readonly type: 'purchase_completed'
  readonly songId: string
  /** Amount charged in integer minor units (e.g. 499 = $4.99 USD). */
  readonly amountMinor: number
  /** ISO 4217 currency code (e.g. "USD"). */
  readonly currency: string
}

export interface SongRatedEvent {
  readonly type: 'song_rated'
  readonly songId: string
  /** Integer rating value, e.g. 1–5. */
  readonly rating: number
}

export interface GenerationCompletedEvent {
  readonly type: 'generation_completed'
  readonly songId: string
  readonly engineId: string
  readonly engineVersion: string
  readonly dialect: Dialect
  readonly genre: string
  /** Wall-clock latency in milliseconds for the generation round-trip. */
  readonly latencyMs: number
  /** GPU cost in integer minor units (e.g. 12 = $0.12). Optional. */
  readonly gpuCostMinor?: number
  /** Whether this was a re-generation (user clicked "regenerate"). */
  readonly regenerated: boolean
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type AnalyticsEvent =
  | WizardStartedEvent
  | PreviewGeneratedEvent
  | PurchaseCompletedEvent
  | SongRatedEvent
  | GenerationCompletedEvent

// ---------------------------------------------------------------------------
// Utility: look up a variant by its `type` discriminant
// ---------------------------------------------------------------------------

export type EventByType<T extends AnalyticsEvent['type']> = Extract<
  AnalyticsEvent,
  { type: T }
>
