import { describe, it, expect } from 'vitest'
import { emit, assertNoPii, type EventPublisher } from '../../src/server/services/analytics/emit'
import type { GenerationCompletedEvent } from '../../src/server/services/analytics/events'

/** In-memory fake publisher — collects published messages; no network. */
function fakePublisher(): EventPublisher & { messages: string[] } {
  const messages: string[] = []
  return {
    messages,
    publish(data: Buffer | string): Promise<string> {
      messages.push(typeof data === 'string' ? data : data.toString('utf8'))
      return Promise.resolve('msg-id-fake')
    },
  }
}

describe('analytics emit', () => {
  it('publishes a typed event and the JSON round-trips correctly', async () => {
    const pub = fakePublisher()
    const event: GenerationCompletedEvent = {
      type: 'generation_completed',
      songId: 's1',
      engineId: 'acestep',
      engineVersion: 'stock-0',
      dialect: 'egyptian',
      genre: 'ballad',
      latencyMs: 1200,
      regenerated: false,
    }
    await emit(event, pub)
    expect(pub.messages).toHaveLength(1)
    const parsed = JSON.parse(pub.messages[0])
    expect(parsed.engineId).toBe('acestep')
    expect(parsed.latencyMs).toBe(1200)
    expect(parsed.type).toBe('generation_completed')
  })

  it('assertNoPii throws when a forbidden free-text key is present', () => {
    expect(() =>
      assertNoPii({ type: 'wizard_started', story: 'secret' } as any),
    ).toThrow()
  })

  it('assertNoPii does not throw for a clean event', () => {
    expect(() =>
      assertNoPii({ type: 'wizard_started', userId: 'u1', sessionId: 'sess-1' }),
    ).not.toThrow()
  })

  it('assertNoPii rejects all known PII field names', () => {
    const piiFields = [
      'story', 'recipient', 'sender', 'details', 'email',
      'lyrics', 'transliteration', 'taggedLyrics',
    ]
    for (const field of piiFields) {
      expect(() =>
        assertNoPii({ type: 'wizard_started', [field]: 'some text' } as any),
      ).toThrow(`PII field "${field}"`)
    }
  })

  // Type-level: `story` is not assignable to any AnalyticsEvent variant.
  // satisfies-style check: casting an object with `story` to AE must fail.
  // We use a helper function whose parameter type is AE to trigger excess-property checks.
  it('story field is not assignable to any typed event (compile-time check)', () => {
    type AE = import('../../src/server/services/analytics/events').AnalyticsEvent
    // This function is never called at runtime; its signature is the compile-time assertion.
    function acceptEvent(_e: AE): void { /* no-op */ }
    // @ts-expect-error — object literal with `story` is not assignable to AE
    acceptEvent({ type: 'wizard_started', story: 'oops' })
    expect(true).toBe(true)
  })
})
