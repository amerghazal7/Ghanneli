/**
 * Thin R2 wrapper over the S3-compatible API.
 *
 * The S3Client is injected so tests can pass a mock without hitting the network.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export interface R2Config {
  bucket: string
  publicBaseUrl: string
}

export interface R2Client {
  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>
  publicUri(key: string): string
}

export function createR2Client(s3: S3Client, config: R2Config): R2Client {
  return {
    async putObject({ key, body, contentType }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      )
    },
    publicUri(key: string): string {
      return `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`
    },
  }
}

/** Build a production R2Client from environment variables.
 *
 * When `R2_ENDPOINT` is set (local dev / MinIO), the S3 client uses that
 * endpoint and enables path-style addressing (`forcePathStyle: true`) which
 * MinIO requires.  When unset the behaviour is identical to the original
 * Cloudflare R2 endpoint — prod is completely unaffected.
 */
export function createProdR2Client(): R2Client {
  const accountId = process.env['R2_ACCOUNT_ID'] ?? ''
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'] ?? ''
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'] ?? ''
  const bucket = process.env['R2_BUCKET'] ?? ''
  const publicBaseUrl = process.env['R2_PUBLIC_BASE_URL'] ?? ''

  // R2_ENDPOINT override: when set, use that endpoint with forcePathStyle (MinIO).
  // When unset, fall back to the standard Cloudflare R2 endpoint (prod behaviour).
  const customEndpoint = process.env['R2_ENDPOINT']
  const endpoint = customEndpoint ?? `https://${accountId}.r2.cloudflarestorage.com`
  const forcePathStyle = customEndpoint !== undefined && customEndpoint !== ''

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  })

  return createR2Client(s3, { bucket, publicBaseUrl })
}
