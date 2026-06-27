import { SelfHostStagingAdapter } from '../../src/server/services/music/adapters/selfHostStaging'
import { it, expect, vi } from 'vitest'
it('maps response to MusicResult', async () => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ takes:[{audioUri:'r2://a.mp3',durationSec:60}], engineId:'acestep', engineVersion:'stock-0' }), {status:200})) as any
  const a = new SelfHostStagingAdapter({ baseUrl:'https://lab.example', token:'t' })
  const r = await a.generate({ taggedLyrics:'[verse] x', transliteration:'x', styleTags:['ballad'], dialect:'egyptian', genre:'ballad', voiceGender:'male', durationSec:60, numTakes:1 })
  expect(r.takes[0].audioUri).toBe('r2://a.mp3'); expect(r.engineVersion).toBe('stock-0')
})
