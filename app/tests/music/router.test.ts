import { createMusicService } from '../../src/server/services/music/router'
import { it, expect } from 'vitest'
const REQ = { taggedLyrics:'[verse] x', transliteration:'x', styleTags:[], dialect:'egyptian', genre:'ballad', voiceGender:'male', durationSec:1, numTakes:1 } as const
it('falls back on primary failure', async () => {
  const bad = { generate: async () => { throw new Error('down') } }
  const good = { generate: async () => ({ takes:[{audioUri:'x',durationSec:1}], engineId:'e', engineVersion:'v' }) }
  const svc = createMusicService({ mode:'fallback', primary: bad, secondary: good } as any)
  const r = await svc.generate(REQ as any)
  expect(r.engineVersion).toBe('v')
})
