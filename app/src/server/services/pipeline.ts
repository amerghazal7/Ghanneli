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
  /**
   * Optional second engine for A/B comparison. When present, the same lyrics
   * are rendered by both engines and stored as the song's alt version so the
   * listener can compare and pick a favorite. A failure here never fails the
   * song — the primary result still ships.
   */
  musicAlt?: MusicGenerationService
  store: StoreDep
  db: AnyDb
  events?: { emit(name: string, payload: unknown): void }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runGeneration(songId: string, deps: GenerationDeps): Promise<void> {
  const { lyrics, music, musicAlt, store, db, events } = deps

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
      mood: song.inputs.mood,
      lengthHint: song.inputs.lengthHint,
      tempo: song.inputs.tempo,
      includeName: song.inputs.includeName,
      mentionOccasion: song.inputs.mentionOccasion,
      traits: song.inputs.traits,
      story: song.inputs.story,
      recipientGender: song.inputs.recipientGender,
      recipientAge: song.inputs.recipientAge,
      senderGender: song.inputs.senderGender,
      senderAge: song.inputs.senderAge,
    }

    // 4. Generate lyrics
    const lyricsResult = await lyrics.generateLyrics(lyricsReq)

    // 5. Status → generating
    await db.update(songs).set({ status: 'generating' }).where(eq(songs.id, songId))

    // 6. Build MusicRequest
    const durationSec = song.inputs.lengthHint === 'short' ? 90 : 180
    const bpmByTempo = { slow: 80, medium: 110, fast: 140 } as const
    const tempo: 'slow' | 'medium' | 'fast' = song.inputs.tempo ?? 'medium'
    const musicReq: MusicRequest = {
      taggedLyrics: lyricsResult.taggedLyricsArabic,
      transliteration: lyricsResult.transliteration,
      dialect: song.dialect,
      genre: song.genre,
      voiceGender: song.voiceGender as 'male' | 'female',
      bpm: bpmByTempo[tempo],
      styleTags: [song.genre, song.inputs.mood, tempo, song.dialect],
      durationSec,
      numTakes: 1,
    }

    // 7. Generate music
    const t0 = Date.now()
    const musicResult = await music.generate(musicReq)
    const latencyMs = Date.now() - t0

    // 8. Status → postprocess
    await db.update(songs).set({ status: 'postprocess' }).where(eq(songs.id, songId))

    // 9. Post-process the primary take
    const { fullUri, previewUri } = await store.postProcess(musicResult.takes[0])

    // 9b. Optional A/B: render the SAME lyrics with the alt engine. Best-effort
    // — if it fails, the song still ships with just the primary version.
    let alt: {
      altPreviewUri: string
      altFullUri: string
      altEngineId: string
      altEngineVersion: string
    } | null = null
    if (musicAlt) {
      try {
        const altResult = await musicAlt.generate(musicReq)
        const altUris = await store.postProcess(altResult.takes[0])
        alt = {
          altPreviewUri: altUris.previewUri,
          altFullUri: altUris.fullUri,
          altEngineId: altResult.engineId,
          altEngineVersion: altResult.engineVersion,
        }
      } catch (altErr) {
        console.warn('[pipeline] alt engine failed; shipping primary only:', altErr)
      }
    }

    // 10. Update song → ready with provenance (+ alt version when present)
    await db
      .update(songs)
      .set({
        status: 'ready',
        previewUri,
        fullUri,
        engineId: musicResult.engineId,
        engineVersion: musicResult.engineVersion,
        lyricsModel: lyricsResult.meta.model,
        ...(alt ?? {}),
      })
      .where(eq(songs.id, songId))

    // 11. Optionally emit success event
    events?.emit('generation.completed', {
      songId,
      engineId: musicResult.engineId,
      engineVersion: musicResult.engineVersion,
      dialect: song.dialect,
      genre: song.genre,
      latencyMs,
      regenerated: false,
    })
  } catch (e) {
    // On any error: mark failed and emit, but never let a secondary failure
    // (e.g. the status write itself throwing) mask the original error.
    try {
      await db.update(songs).set({ status: 'failed' }).where(eq(songs.id, songId))
    } catch {
      // swallow: the original error `e` is the one worth surfacing
    }
    events?.emit('generation.failed', { songId, error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
