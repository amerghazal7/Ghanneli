/**
 * Audio post-processing: normalize, encode MP3 (full track) + trim/watermark (preview).
 *
 * postProcess(take, deps) → { fullUri, previewUri }
 *
 * Deps are fully injected so unit tests can mock ffmpeg, file I/O, and R2
 * without touching the real filesystem or network.
 *
 * Production callers build a StoreDep closure:
 *   const store: StoreDep = { postProcess: (take) => postProcess(take, prodDeps) }
 */

import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink, readFile } from 'node:fs/promises'
import type { MusicTake } from '../music/types'
import type { R2Client } from '../storage/r2'

export interface PostProcessConfig {
  /** Absolute path to the watermark audio asset mixed into previews. */
  watermarkPath: string
  /** Preview duration in seconds (default 30). */
  previewLengthSec: number
  /** R2 bucket name (informational; actual upload goes through r2.putObject). */
  bucket: string
  /** Public base URL for R2 (used to derive URIs). */
  publicBaseUrl: string
}

export interface PostProcessDeps {
  /** Runs ffmpeg with the given CLI args. Injected so tests mock without shelling out. */
  runFfmpeg(args: string[]): Promise<void>
  /** R2 client for uploading objects and deriving public URIs. */
  r2: R2Client
  config: PostProcessConfig
  /**
   * Read a file from disk into a Buffer. Injected so tests never touch the real FS.
   * Defaults to the real `fs/promises.readFile` in production.
   */
  readFile?(path: string): Promise<Buffer>
  /**
   * Delete a file from disk. Injected for testability; defaults to `fs/promises.unlink`.
   * Failures are swallowed — temp cleanup must never mask the original error.
   */
  unlinkFile?(path: string): Promise<void>
}

export async function postProcess(
  take: MusicTake,
  deps: PostProcessDeps,
): Promise<{ fullUri: string; previewUri: string }> {
  const { runFfmpeg, r2, config } = deps
  const readFileFn = deps.readFile ?? readFile
  const unlinkFn = deps.unlinkFile ?? unlink

  const id = randomUUID()

  // Temp output paths used as ffmpeg targets, then cleaned up after upload.
  const fullTmp = join(tmpdir(), `ghanneli-full-${id}.mp3`)
  const previewTmp = join(tmpdir(), `ghanneli-preview-${id}.mp3`)

  try {
    // ------------------------------------------------------------------
    // 1. Full track — loudnorm + encode MP3, NO watermark
    // ------------------------------------------------------------------
    await runFfmpeg([
      '-i', take.audioUri,
      '-af', 'loudnorm',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',
      '-y',
      fullTmp,
    ])

    // ------------------------------------------------------------------
    // 2. Preview — trim to previewLengthSec + loudnorm + watermark overlay
    // ------------------------------------------------------------------
    await runFfmpeg([
      '-i', take.audioUri,
      '-i', config.watermarkPath,
      '-t', String(config.previewLengthSec),
      '-filter_complex', 'amix=inputs=2:duration=first:dropout_transition=3,loudnorm',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',
      '-y',
      previewTmp,
    ])

    // ------------------------------------------------------------------
    // 3. Read encoded files and upload both to R2
    // ------------------------------------------------------------------
    const fullKey = `audio/full/${id}.mp3`
    const previewKey = `audio/preview/${id}.mp3`

    const [fullBuf, previewBuf] = await Promise.all([
      readFileFn(fullTmp),
      readFileFn(previewTmp),
    ])

    await r2.putObject({ key: fullKey, body: fullBuf, contentType: 'audio/mpeg' })
    await r2.putObject({ key: previewKey, body: previewBuf, contentType: 'audio/mpeg' })

    // ------------------------------------------------------------------
    // 4. Return public URIs
    // ------------------------------------------------------------------
    return {
      fullUri: r2.publicUri(fullKey),
      previewUri: r2.publicUri(previewKey),
    }
  } finally {
    // Clean up temp files — swallow errors so they never mask the original.
    await Promise.allSettled([unlinkFn(fullTmp), unlinkFn(previewTmp)])
  }
}
