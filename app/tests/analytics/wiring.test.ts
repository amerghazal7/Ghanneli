/**
 * TDD: analytics wiring — write first, watch fail, then implement.
 *
 * Covers:
 * 1. generationCompletedToEvents() maps payload → [preview_generated, generation_completed]
 *    with correct fields; assertNoPii passes for each.
 * 2. runGeneration emits a single 'generation.completed' with engineVersion + numeric latencyMs.
 * 3. rateSong stores rating=5 in DB and calls emitEvent; cross-user → NotFoundError.
 * 4. createSong calls emitEvent with {type:'wizard_started'} once.
 */

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../src/server/db/schema'
import { users, songs } from '../../src/server/db/schema'
import type { Db } from '../../src/server/db/client'

// --- modules under test ---
import {
  generationCompletedToEvents,
  type GenerationCompletedPayload,
} from '../../src/server/services/analytics/wiring'
import { assertNoPii } from '../../src/server/services/analytics/emit'
import { runGeneration } from '../../src/server/services/pipeline'
import { rateSong, NotFoundError } from '../../src/app/api/songs/[id]/rate/rate'
import { createSong } from '../../src/app/api/songs/create'

import type { LyricsService, LyricsResult } from '../../src/server/services/lyrics/types'
import type { MusicGenerationService, MusicResult } from '../../src/server/services/music/types'
import type { StoreDep } from '../../src/server/services/pipeline'
import type { AnalyticsEvent } from '../../src/server/services/analytics/events'

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

// ---------------------------------------------------------------------------
// Fake pipeline deps
// ---------------------------------------------------------------------------

const fakeLyrics: LyricsService = {
  generateLyrics: async (): Promise<LyricsResult> => ({
    taggedLyricsArabic: '[verse] يا عيد ميلاد [/verse]',
    transliteration: 'ya eid milad',
    language: 'ar',
    meta: { model: 'claude-3-haiku-20240307' },
  }),
}

const fakeMusicWithVersion = (engineVersion = 'stock-0', engineId = 'acestep'): MusicGenerationService => ({
  generate: async (): Promise<MusicResult> => ({
    takes: [{ audioUri: 'gs://fake/audio.wav', durationSec: 60 }],
    engineId,
    engineVersion,
  }),
})

const fakeStore: StoreDep = {
  postProcess: async () => ({
    fullUri: 'https://cdn.example.com/full.mp3',
    previewUri: 'https://cdn.example.com/preview.mp3',
  }),
}

// ---------------------------------------------------------------------------
// 1. generationCompletedToEvents
// ---------------------------------------------------------------------------

describe('generationCompletedToEvents', () => {
  const payload: GenerationCompletedPayload = {
    songId: 'song-abc',
    engineId: 'acestep',
    engineVersion: 'v2.1.0',
    dialect: 'egyptian',
    genre: 'ballad',
    latencyMs: 1450,
    regenerated: false,
  }

  it('returns exactly [preview_generated, generation_completed]', () => {
    const events = generationCompletedToEvents(payload)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('preview_generated')
    expect(events[1].type).toBe('generation_completed')
  })

  it('preview_generated carries songId, dialect, genre, regenerated', () => {
    const [preview] = generationCompletedToEvents(payload)
    expect(preview).toMatchObject({
      type: 'preview_generated',
      songId: 'song-abc',
      dialect: 'egyptian',
      genre: 'ballad',
      regenerated: false,
    })
  })

  it('generation_completed carries engineVersion, latencyMs, engineId', () => {
    const [, completed] = generationCompletedToEvents(payload)
    expect(completed).toMatchObject({
      type: 'generation_completed',
      songId: 'song-abc',
      engineId: 'acestep',
      engineVersion: 'v2.1.0',
      latencyMs: 1450,
      regenerated: false,
    })
  })

  it('assertNoPii passes for all produced events', () => {
    const events = generationCompletedToEvents(payload)
    for (const ev of events) {
      expect(() => assertNoPii(ev as unknown as Record<string, unknown>)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. runGeneration emits 'generation.completed' with engineVersion + latencyMs
// ---------------------------------------------------------------------------

describe('runGeneration pipeline events', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  async function seedSong(): Promise<schema.Song> {
    const [u] = await db
      .insert(users)
      .values({ authUid: `auth-wiring-${Math.random()}`, email: `wiring-${Math.random()}@example.com` })
      .returning()
    const [s] = await db
      .insert(songs)
      .values({
        userId: u.id,
        occasion: 'birthday',
        dialect: 'egyptian',
        genre: 'ballad',
        voiceGender: 'female',
        status: 'pending',
        inputs: {
          recipient: 'Layla',
          sender: 'Ahmed',
          relationship: 'friend',
          details: ['loves music'],
          mood: 'joyful',
          lengthHint: 'short',
        },
      })
      .returning()
    return s
  }

  it('emits exactly one generation.completed event with engineVersion + numeric latencyMs', async () => {
    const song = await seedSong()

    const emitted: Array<{ name: string; payload: unknown }> = []
    const spyEvents = {
      emit(name: string, payload: unknown) {
        emitted.push({ name, payload })
      },
    }

    await runGeneration(song.id, {
      lyrics: fakeLyrics,
      music: fakeMusicWithVersion('stock-0', 'acelstep'),
      store: fakeStore,
      db,
      events: spyEvents,
    })

    const completed = emitted.filter((e) => e.name === 'generation.completed')
    expect(completed).toHaveLength(1)

    const p = completed[0].payload as GenerationCompletedPayload
    expect(p.engineVersion).toBe('stock-0')
    expect(typeof p.latencyMs).toBe('number')
    expect(p.latencyMs).toBeGreaterThanOrEqual(0)
    expect(p.songId).toBe(song.id)
  })
})

// ---------------------------------------------------------------------------
// 3. rateSong (DB + emitEvent)
// ---------------------------------------------------------------------------

describe('rateSong', () => {
  let db: TestDb
  let tdb: Db
  let userId: string
  let otherUserId: string
  let songId: string

  beforeEach(async () => {
    db = await testDb()
    tdb = db as unknown as Db

    const [u] = await db
      .insert(users)
      .values({ authUid: `uid-rate-${Math.random()}`, email: `rate-${Math.random()}@example.com` })
      .returning()
    userId = u.id

    const [u2] = await db
      .insert(users)
      .values({ authUid: `uid-other-${Math.random()}`, email: `other-rate-${Math.random()}@example.com` })
      .returning()
    otherUserId = u2.id

    const [s] = await db
      .insert(songs)
      .values({
        userId,
        occasion: 'عيد ميلاد',
        dialect: 'egyptian',
        genre: 'pop',
        voiceGender: 'female',
        status: 'ready',
        fullUri: 'https://cdn.example.com/full.mp3',
        previewUri: 'https://cdn.example.com/preview.mp3',
        inputs: {
          recipient: 'Layla',
          sender: 'Ahmed',
          relationship: 'friend',
          details: [],
          mood: 'happy',
          lengthHint: 'standard',
        },
      })
      .returning()
    songId = s.id
  })

  it('sets songs.rating = 5 and calls emitEvent with song_rated', async () => {
    const emitted: AnalyticsEvent[] = []
    const emitFn = async (e: AnalyticsEvent) => { emitted.push(e) }

    await rateSong(songId, userId, 5, tdb, emitFn)

    const [row] = await db.select({ rating: songs.rating }).from(songs).where(eq(songs.id, songId))
    expect(row.rating).toBe(5)

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual({ type: 'song_rated', songId, rating: 5 })
  })

  it('cross-user rating throws NotFoundError and does not write DB', async () => {
    await expect(rateSong(songId, otherUserId, 4, tdb)).rejects.toThrow(NotFoundError)

    const [row] = await db.select({ rating: songs.rating }).from(songs).where(eq(songs.id, songId))
    expect(row.rating).toBeNull()
  })

  it('non-integer rating throws RangeError', async () => {
    await expect(rateSong(songId, userId, 2.5, tdb)).rejects.toThrow(RangeError)
  })

  it('out-of-range rating (0) throws RangeError', async () => {
    await expect(rateSong(songId, userId, 0, tdb)).rejects.toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// 4. createSong calls emitEvent with {type:'wizard_started'}
// ---------------------------------------------------------------------------

describe('createSong emitEvent', () => {
  let db: TestDb
  let tdb: Db
  let userId: string

  beforeEach(async () => {
    db = await testDb()
    tdb = db as unknown as Db

    const [u] = await db
      .insert(users)
      .values({ authUid: `uid-create-${Math.random()}`, email: `create-${Math.random()}@example.com` })
      .returning()
    userId = u.id
  })

  it('calls emitEvent once with {type:wizard_started}', async () => {
    const emitted: AnalyticsEvent[] = []
    const emitFn = async (e: AnalyticsEvent) => { emitted.push(e) }

    await createSong(
      {
        occasion: 'birthday',
        recipient: 'Ali',
        sender: 'Sara',
        relationship: 'friend',
        mood: 'happy',
        lengthHint: 'short',
        tempo: 'medium',
        dialect: 'egyptian',
        genre: 'pop',
        voiceGender: 'male',
        includeName: true,
        mentionOccasion: true,
        traits: [],
      },
      {
        db: tdb,
        userId,
        enqueue: async () => {},
        emitEvent: emitFn,
      },
    )

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual({ type: 'wizard_started' })
  })
})
