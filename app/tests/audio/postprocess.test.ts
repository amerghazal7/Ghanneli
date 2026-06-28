/**
 * Tests for postProcess: ffmpeg invocations + R2 uploads.
 *
 * Correctness gates:
 * - Full track: loudnorm + encode MP3, NO watermark filter.
 * - Preview:    30-second trim + loudnorm + watermark overlay (amix/afilter).
 * - Both objects uploaded via R2 putObject (called twice, audio/mpeg).
 * - Returned { fullUri, previewUri } are non-empty R2 URIs.
 *
 * Nothing touches the real FS or shells out — readFile/unlink are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostProcessDeps } from '../../src/server/services/audio/postprocess'
import { postProcess } from '../../src/server/services/audio/postprocess'
import type { MusicTake } from '../../src/server/services/music/types'

const take: MusicTake = { audioUri: 'gs://bucket/raw/song-abc.wav', durationSec: 90 }
const FAKE_BUF = Buffer.from('fake-mp3-data')

function makeDeps() {
  const runFfmpegCalls: string[][] = []
  const putObjectCalls: { key: string; contentType: string }[] = []

  const runFfmpeg = vi.fn(async (args: string[]) => {
    runFfmpegCalls.push(args)
  })

  const r2 = {
    putObject: vi.fn(async (params: { key: string; body: Buffer; contentType: string }) => {
      putObjectCalls.push({ key: params.key, contentType: params.contentType })
    }),
    publicUri: (key: string) => `https://cdn.example.com/${key}`,
  }

  const deps: PostProcessDeps = {
    runFfmpeg,
    r2,
    config: {
      watermarkPath: '/assets/watermark.mp3',
      previewLengthSec: 30,
      bucket: 'ghanneli-audio',
      publicBaseUrl: 'https://cdn.example.com',
    },
    // Never touch the real FS
    readFile: vi.fn(async (_path: string) => FAKE_BUF),
    unlinkFile: vi.fn(async (_path: string) => {}),
  }

  return { deps, runFfmpegCalls, putObjectCalls, runFfmpeg, r2 }
}

describe('postProcess', () => {
  let ctx: ReturnType<typeof makeDeps>

  beforeEach(() => {
    ctx = makeDeps()
  })

  it('calls ffmpeg exactly twice — once for full, once for preview', async () => {
    await postProcess(take, ctx.deps)
    expect(ctx.runFfmpeg).toHaveBeenCalledTimes(2)
  })

  it('full-track ffmpeg does NOT include watermark', async () => {
    await postProcess(take, ctx.deps)
    const argsStr = ctx.runFfmpegCalls[0].join(' ')
    expect(argsStr).not.toContain('watermark')
    expect(argsStr).not.toContain('amix')
    expect(argsStr).not.toContain('afilter')
    expect(argsStr).not.toContain('amerge')
    // Must normalize and encode MP3
    expect(argsStr).toContain('loudnorm')
    expect(argsStr).toMatch(/mp3|libmp3lame/)
  })

  it('preview ffmpeg includes 30-second trim', async () => {
    await postProcess(take, ctx.deps)
    const argsStr = ctx.runFfmpegCalls[1].join(' ')
    expect(argsStr).toMatch(/-t 30/)
  })

  it('preview ffmpeg includes watermark input and overlay filter', async () => {
    await postProcess(take, ctx.deps)
    const argsStr = ctx.runFfmpegCalls[1].join(' ')
    expect(argsStr).toContain('/assets/watermark.mp3')
    expect(argsStr).toMatch(/amix|afilter|amerge/)
  })

  it('uploads both objects to R2 with content-type audio/mpeg', async () => {
    await postProcess(take, ctx.deps)
    expect(ctx.r2.putObject).toHaveBeenCalledTimes(2)
    for (const call of ctx.putObjectCalls) {
      expect(call.contentType).toBe('audio/mpeg')
    }
  })

  it('uses distinct R2 keys for full and preview', async () => {
    await postProcess(take, ctx.deps)
    const [first, second] = ctx.putObjectCalls
    expect(first.key).toBeTruthy()
    expect(second.key).toBeTruthy()
    expect(first.key).not.toBe(second.key)
  })

  it('returns non-empty distinct fullUri and previewUri', async () => {
    const result = await postProcess(take, ctx.deps)
    expect(result.fullUri).toBeTruthy()
    expect(result.previewUri).toBeTruthy()
    expect(result.fullUri).not.toBe(result.previewUri)
  })

  it('returned URIs correspond to the uploaded R2 keys', async () => {
    const result = await postProcess(take, ctx.deps)
    const [fullUpload, previewUpload] = ctx.putObjectCalls
    expect(result.fullUri).toBe(`https://cdn.example.com/${fullUpload.key}`)
    expect(result.previewUri).toBe(`https://cdn.example.com/${previewUpload.key}`)
  })
})
