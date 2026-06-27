import { MusicRequestSchema } from '../../src/server/services/music/types'
import { it, expect } from 'vitest'

it('rejects empty lyrics', () => {
  expect(() =>
    MusicRequestSchema.parse({
      taggedLyrics: '',
      transliteration: '',
      styleTags: [],
      dialect: 'egyptian',
      genre: 'ballad',
      voiceGender: 'male',
      durationSec: 60,
      numTakes: 2,
    })
  ).toThrow()
})
