import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | undefined

// Lazily initialised so merely importing this module never throws — the
// DATABASE_URL check happens on first real use (keeps route modules importable
// in tests, which inject their own pglite db instead). Production reads the
// Neon connection string injected from Secret Manager on Cloud Run.
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
          'Provide a Neon connection string before using the DB client.',
      )
    }
    _db = drizzle(neon(url), { schema })
  }
  return _db
}
