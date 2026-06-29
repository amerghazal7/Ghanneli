import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, it, expect, beforeEach } from 'vitest'
import * as schema from '../src/server/db/schema'
import { users, songs } from '../src/server/db/schema'
import { eq } from 'drizzle-orm'
import { runGeneration } from '../src/server/services/pipeline'
import type { LyricsService, LyricsResult } from '../src/server/services/lyrics/types'
import type { MusicGenerationService, MusicResult } from '../src/server/services/music/types'
import type { StoreDep } from '../src/server/services/pipeline'

type TestDb = ReturnType<typeof drizzle<typeof schema>>

async function testDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

// Fake deps
const fakeLyrics: LyricsService = {
  generateLyrics: async (): Promise<LyricsResult> => ({
    taggedLyricsArabic: '[verse] يا عيد ميلاد [/verse]',
    transliteration: 'ya eid milad',
    language: 'ar',
    meta: { model: 'claude-3-haiku-20240307' },
  }),
}

const fakeMusic: MusicGenerationService = {
  generate: async (): Promise<MusicResult> => ({
    takes: [{ audioUri: 'gs://fake/audio.wav', durationSec: 60 }],
    engineId: 'stock',
    engineVersion: 'stock-0',
  }),
}

const fakeMusicAlt: MusicGenerationService = {
  generate: async (): Promise<MusicResult> => ({
    takes: [{ audioUri: 'gs://fake/alt.wav', durationSec: 60 }],
    engineId: 'lyria-3-pro',
    engineVersion: 'lyria-3-pro-preview',
  }),
}

const fakeStore: StoreDep = {
  postProcess: async () => ({
    fullUri: 'https://cdn.example.com/full.mp3',
    previewUri: 'https://cdn.example.com/preview.mp3',
  }),
}

describe('runGeneration pipeline', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await testDb()
  })

  async function seedSong(status: schema.Song['status']): Promise<schema.Song> {
    const [u] = await db
      .insert(users)
      .values({ authUid: 'auth-uid-pipeline', email: 'pipeline@example.com' })
      .returning()

    const [s] = await db
      .insert(songs)
      .values({
        userId: u.id,
        occasion: 'birthday',
        dialect: 'egyptian',
        genre: 'ballad',
        voiceGender: 'female',
        status,
        inputs: {
          recipient: 'Layla',
          sender: 'Ahmed',
          relationship: 'friend',
          details: ['loves music', 'turning 30'],
          mood: 'joyful',
          lengthHint: 'short',
        },
      })
      .returning()

    return s
  }

  async function getSong(id: string): Promise<schema.Song> {
    const [s] = await db.select().from(songs).where(eq(songs.id, id))
    if (!s) throw new Error(`Song ${id} not found`)
    return s
  }

  it('drives a song to ready with provenance', async () => {
    const song = await seedSong('pending')
    await runGeneration(song.id, { lyrics: fakeLyrics, music: fakeMusic, store: fakeStore, db })
    const updated = await getSong(song.id)
    expect(updated.status).toBe('ready')
    expect(updated.engineVersion).toBe('stock-0')
    expect(updated.previewUri).toBeTruthy()
  })

  it('stamps provenance fields', async () => {
    const song = await seedSong('pending')
    await runGeneration(song.id, { lyrics: fakeLyrics, music: fakeMusic, store: fakeStore, db })
    const updated = await getSong(song.id)
    expect(updated.engineId).toBe('stock')
    expect(updated.engineVersion).toBe('stock-0')
    expect(updated.lyricsModel).toBe('claude-3-haiku-20240307')
    expect(updated.fullUri).toBe('https://cdn.example.com/full.mp3')
  })

  it('A/B: when musicAlt is provided, stores the alt version + engine', async () => {
    const song = await seedSong('pending')
    await runGeneration(song.id, {
      lyrics: fakeLyrics,
      music: fakeMusic,
      musicAlt: fakeMusicAlt,
      store: fakeStore,
      db,
    })
    const updated = await getSong(song.id)
    expect(updated.status).toBe('ready')
    expect(updated.engineId).toBe('stock')
    expect(updated.altEngineId).toBe('lyria-3-pro')
    expect(updated.altEngineVersion).toBe('lyria-3-pro-preview')
    expect(updated.altFullUri).toBeTruthy()
    expect(updated.altPreviewUri).toBeTruthy()
  })

  it('A/B: an alt-engine failure does not fail the song (primary still ships)', async () => {
    const song = await seedSong('pending')
    const badAlt: MusicGenerationService = {
      generate: async () => { throw new Error('lyria down') },
    }
    await runGeneration(song.id, {
      lyrics: fakeLyrics,
      music: fakeMusic,
      musicAlt: badAlt,
      store: fakeStore,
      db,
    })
    const updated = await getSong(song.id)
    expect(updated.status).toBe('ready')
    expect(updated.altFullUri).toBeNull()
  })

  it('sets status to failed on error', async () => {
    const song = await seedSong('pending')
    const badLyrics: LyricsService = {
      generateLyrics: async () => {
        throw new Error('lyrics service down')
      },
    }
    await expect(
      runGeneration(song.id, { lyrics: badLyrics, music: fakeMusic, store: fakeStore, db }),
    ).rejects.toThrow('lyrics service down')
    const updated = await getSong(song.id)
    expect(updated.status).toBe('failed')
  })
})
