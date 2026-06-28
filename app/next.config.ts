import type { NextConfig } from 'next'

const config: NextConfig = {
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/pubsub',
    'bullmq',
    'ioredis',
  ],
}

export default config
