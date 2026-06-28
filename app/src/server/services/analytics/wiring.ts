import type { AnalyticsEvent } from './events'
import type { Dialect } from '../music/types'
import { emit, getPublisher, type EventPublisher } from './emit'

// Shape the pipeline emits on success (mirror of pipeline payload).
export interface GenerationCompletedPayload {
  songId: string
  engineId: string
  engineVersion: string
  dialect: Dialect
  genre: string
  latencyMs: number
  regenerated: boolean
}

// Pure: map one domain success payload to the analytics events it produces.
export function generationCompletedToEvents(p: GenerationCompletedPayload): AnalyticsEvent[] {
  return [
    { type: 'preview_generated', songId: p.songId, dialect: p.dialect, genre: p.genre, regenerated: p.regenerated },
    { type: 'generation_completed', songId: p.songId, engineId: p.engineId, engineVersion: p.engineVersion, dialect: p.dialect, genre: p.genre, latencyMs: p.latencyMs, regenerated: p.regenerated },
  ]
}

// Build the GenerationDeps.events adapter that publishes analytics events.
// emit failures are swallowed so they never fail the generation job.
export function createAnalyticsEvents(publisher: EventPublisher): { emit(name: string, payload: unknown): void } {
  return {
    emit(name, payload) {
      if (name !== 'generation.completed') return
      const events = generationCompletedToEvents(payload as GenerationCompletedPayload)
      for (const ev of events) {
        emit(ev, publisher).catch((err) => console.warn('[analytics] publish failed', err))
      }
    },
  }
}

// Lazy app-wide singleton emitter for request paths (createSong, webhook, rate).
let _publisher: EventPublisher | undefined
export async function emitDefault(event: AnalyticsEvent): Promise<void> {
  try {
    _publisher ??= getPublisher()
    await emit(event, _publisher)
  } catch (err) {
    console.warn('[analytics] publish failed', err)
  }
}
