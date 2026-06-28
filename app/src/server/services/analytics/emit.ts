/**
 * Analytics event emitter.
 *
 * Design:
 * - PII excluded by construction (event types carry no free-text fields).
 * - Runtime assertNoPii guard as defence-in-depth against `as any` bypasses.
 * - Publisher injected — unit tests pass a fake; production uses getPublisher().
 * - No batching, no retry (YAGNI).
 */

import type { AnalyticsEvent } from './events'

// ---------------------------------------------------------------------------
// Publisher interface
// ---------------------------------------------------------------------------

/**
 * Minimal publisher interface matching the @google-cloud/pubsub Topic API.
 * The `publish` method accepts a Buffer or UTF-8 string and returns the
 * server-assigned message ID.
 */
export interface EventPublisher {
  publish(data: Buffer | string): Promise<string>
}

// ---------------------------------------------------------------------------
// PII field blocklist (runtime guard)
// ---------------------------------------------------------------------------

const PII_FIELDS = [
  'story',
  'recipient',
  'sender',
  'details',
  'email',
  'lyrics',
  'transliteration',
  'taggedLyrics',
  'relationship',
  'mood',
] as const

/**
 * Runtime guard that throws if `event` carries any known PII field.
 * Defence-in-depth: catches objects that bypass TypeScript via `as any`.
 */
export function assertNoPii(event: Record<string, unknown>): void {
  for (const field of PII_FIELDS) {
    if (field in event) {
      throw new Error(
        `PII field "${field}" found in analytics event — events must not carry free-text user content`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

/**
 * Serialise `event` to JSON and publish it via the injected `publisher`.
 * Calls `assertNoPii` first so the runtime guard always fires.
 */
export async function emit(
  event: AnalyticsEvent,
  publisher: EventPublisher,
): Promise<void> {
  assertNoPii(event as unknown as Record<string, unknown>)
  const json = JSON.stringify(event)
  await publisher.publish(json)
}

// ---------------------------------------------------------------------------
// Production factory (not unit-tested; wired up at app startup)
// ---------------------------------------------------------------------------

/**
 * Build a production EventPublisher backed by a Google Cloud Pub/Sub topic.
 *
 * Reads env vars:
 *   PUBSUB_PROJECT  — GCP project ID
 *   PUBSUB_TOPIC    — topic name (e.g. "ghanneli-analytics")
 *
 * This factory is NOT called in tests; inject a fakePublisher() there instead.
 */
export function getPublisher(): EventPublisher {
  // Dynamic import keeps @google-cloud/pubsub out of the test-time module graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PubSub } = require('@google-cloud/pubsub') as typeof import('@google-cloud/pubsub')
  const projectId = process.env.PUBSUB_PROJECT
  const topicName = process.env.PUBSUB_TOPIC ?? 'ghanneli-analytics'
  const pubsub = new PubSub({ projectId })
  const topic = pubsub.topic(topicName)
  return {
    publish(data: Buffer | string): Promise<string> {
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
      return topic.publish(buf)
    },
  }
}
