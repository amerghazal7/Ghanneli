/**
 * Generation orchestrator — drives a Song through all pipeline stages:
 * pending → lyrics → generating → postprocess → ready
 *
 * Deps are injected so the function is fully unit-testable without real services.
 */

import { eq } from 'drizzle-orm'
import { songs } from '../db/schema'
import type { LyricsService, LyricsRequest } from './lyrics/types'
import type { MusicGenerationService, MusicRequest, MusicTake } from './music/types'

// Structural DB type: accepts both the production Neon db and the pglite test db.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { select: any; update: any }

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface StoreDep {
  postProcess(take: MusicTake): Promise<{ fullUri: string; previewUri: string }>
}

export interface GenerationDeps {
  lyrics: LyricsService
  music: MusicGenerationService
  store: StoreDep
  db: AnyDb
  events?: { emit(name: string, payload: unknown): void }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runGeneration(songId: string, deps: GenerationDeps): Promise<void> {
  const { lyrics, music, store, db, events } = deps

  // 1. Load song from DB
  const [song] = await db.select().from(songs).where(eq(songs.id, songId))
  if (!song) throw new Error(`Song not found: ${songId}`)

  try {
    // 2. Status → lyrics
    await db.update(songs).set({ status: 'lyrics' }).where(eq(songs.id, songId))

    // 3. Build LyricsRequest from song fields + personalization inputs
    const lyricsReq: LyricsRequest = {
      occasion: song.occasion,
      dialect: song.dialect,
      recipient: song.inputs.recipient,
      sender: song.inputs.sender,
      relationship: song.inputs.relationship,
      details: song.inputs.details,
      mood: song.inputs.mood,
      lengthHint: song.inputs.lengthHint,
    }

    // 4. Generate lyrics
    const lyricsResult = await lyrics.generateLyrics(lyricsReq)

    // 5. Status → generating
    await db.update(songs).set({ status: 'generating' }).where(eq(songs.id, songId))

    // 6. Build MusicRequest
    const durationSec = song.inputs.lengthHint === 'short' ? 60 : 120
    const musicReq: MusicRequest = {
      taggedLyrics: lyricsResult.taggedLyricsArabic,
      transliteration: lyricsResult.transliteration,
      dialect: song.dialect,
      genre: song.genre,
      voiceGender: song.voiceGender as 'male' | 'female',
      styleTags: [song.genre, song.inputs.mood, song.dialect],
      durationSec,
      numTakes: 1,
    }

    // 7. Generate music
    const musicResult = await music.generate(musicReq)

    // 8. Status → postprocess
    await db.update(songs).set({ status: 'postprocess' }).where(eq(songs.id, songId))

    // 9. Post-process best take
    const { fullUri, previewUri } = await store.postProcess(musicResult.takes[0])

    // 10. Update song → ready with provenance
    await db
      .update(songs)
      .set({
        status: 'ready',
        previewUri,
        fullUri,
        engineId: musicResult.engineId,
        engineVersion: musicResult.engineVersion,
        lyricsModel: lyricsResult.meta.model,
      })
      .where(eq(songs.id, songId))

    // 11. Optionally emit success event
    events?.emit('generation.completed', { songId })
  } catch (e) {
    // On any error: mark failed and emit, but never let a secondary failure
    // (e.g. the status write itself throwing) mask the original error.
    try {
      await db.update(songs).set({ status: 'failed' }).where(eq(songs.id, songId))
    } catch {
      // swallow: the original error `e` is the one worth surfacing
    }
    events?.emit('generation.failed', { songId, error: e })
    throw e
  }
}
