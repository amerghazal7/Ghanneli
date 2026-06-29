import { nanoid } from 'nanoid'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AgeBand, Gender, Tempo } from '../services/music/types'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const songStatusEnum = pgEnum('song_status', [
  'pending',
  'lyrics',
  'generating',
  'postprocess',
  'ready',
  'failed',
])

export const dialectEnum = pgEnum('dialect', [
  'khaleeji',
  'egyptian',
  'levantine',
  'maghrebi',
  'iraqi',
])

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUid: text('auth_uid').notNull().unique(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// ---------------------------------------------------------------------------
// songs
// ---------------------------------------------------------------------------

export interface SongInputs {
  recipient: string
  sender: string
  relationship: string
  /** The "vibe" / emotional atmosphere (الأجواء). */
  mood: string
  lengthHint: 'short' | 'standard'
  // The fields below are required by the create API for new songs, but are
  // optional on the stored shape so pre-redesign rows (and tests that seed
  // legacy inputs) remain valid. The pipeline applies safe defaults when absent.
  tempo?: Tempo
  /** Whether the recipient's name should literally appear in the lyrics. */
  includeName?: boolean
  /** Whether the occasion should be named in the lyrics. */
  mentionOccasion?: boolean
  /** Personality-trait chips the user selected (used only to flavour lyrics). */
  traits?: string[]
  /** Optional free-text story / memory in the user's own words. */
  story?: string
  /** Recipient demographics — fine-tune voice & address; never quoted literally. */
  recipientGender?: Gender
  recipientAge?: AgeBand
  /** Sender demographics — set the narrative perspective. */
  senderGender?: Gender
  senderAge?: AgeBand
  /** @deprecated pre-redesign free-text details; superseded by traits + story. */
  details?: string[]
}

export const songs = pgTable(
  'songs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    occasion: text('occasion').notNull(),
    dialect: dialectEnum('dialect').notNull(),
    genre: text('genre').notNull(),
    voiceGender: text('voice_gender').notNull(),
    status: songStatusEnum('status').notNull().default('pending'),
    previewUri: text('preview_uri'),
    fullUri: text('full_uri'),
    shareSlug: text('share_slug')
      .notNull()
      .unique()
      .$defaultFn(() => nanoid(12)),
    unlocked: boolean('unlocked').notNull().default(false),
    engineId: text('engine_id'),
    engineVersion: text('engine_version'),
    // A/B second engine output (e.g. Lyria) for the same lyrics — lets the
    // listener compare and pick a favorite. Null when only one engine ran.
    altPreviewUri: text('alt_preview_uri'),
    altFullUri: text('alt_full_uri'),
    altEngineId: text('alt_engine_id'),
    altEngineVersion: text('alt_engine_version'),
    /** Which version the user picked: the primary or alt engineId. */
    chosenEngine: text('chosen_engine'),
    lyricsModel: text('lyrics_model'),
    rating: integer('rating'),
    inputs: jsonb('inputs').$type<SongInputs>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('songs_user_id_idx').on(table.userId)],
)

export type Song = typeof songs.$inferSelect
export type NewSong = typeof songs.$inferInsert

// ---------------------------------------------------------------------------
// credit_ledger
// ---------------------------------------------------------------------------

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    refId: text('ref_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('credit_ledger_reason_ref_id_uniq').on(table.reason, table.refId)],
)

export type CreditLedgerEntry = typeof creditLedger.$inferSelect
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  packId: text('pack_id').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  stripeSessionId: text('stripe_session_id'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
