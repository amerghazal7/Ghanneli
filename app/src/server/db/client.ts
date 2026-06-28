import { drizzle } from 'drizzle-orm/neon-http'
import { neon, neonConfig } from '@neondatabase/serverless'
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
    // Local-dev only: route the neon-http driver at a local Neon HTTP proxy
    // (e.g. local-neon-http-proxy in docker-compose) so the SAME neon-http
    // driver works against a local Postgres — no node-postgres driver toggle,
    // so the `Db` type stays identical to production. Unset in prod → no-op.
    const proxyEndpoint = process.env.NEON_LOCAL_PROXY_URL
    if (proxyEndpoint) {
      neonConfig.fetchEndpoint = proxyEndpoint
      // The local proxy speaks plain HTTP; disable the driver's TLS assumptions.
      neonConfig.useSecureWebSocket = false
      neonConfig.poolQueryViaFetch = true
    }
    _db = drizzle(neon(url), { schema })
  }
  return _db
}
