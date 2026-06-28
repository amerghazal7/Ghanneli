import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
      'Provide a Neon connection string before importing the DB client.',
  )
}

export const db = drizzle(neon(url), { schema })
