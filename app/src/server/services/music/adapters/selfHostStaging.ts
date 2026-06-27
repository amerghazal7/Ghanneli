import type { MusicGenerationService, MusicRequest, MusicResult } from '../types'
import { postGenerate } from './httpEngine'

export class SelfHostStagingAdapter implements MusicGenerationService {
  private readonly baseUrl: string
  private readonly token: string

  constructor(config: { baseUrl: string; token: string }) {
    this.baseUrl = config.baseUrl
    this.token = config.token
  }

  generate(req: MusicRequest): Promise<MusicResult> {
    return postGenerate({
      baseUrl: this.baseUrl,
      headers: { 'X-AIBackend-Token': this.token },
      req,
    })
  }
}
