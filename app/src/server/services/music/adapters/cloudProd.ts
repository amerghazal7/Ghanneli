import type { MusicGenerationService, MusicRequest, MusicResult } from '../types'
import { postGenerate } from './httpEngine'

// TODO(cloud): if the chosen provider is Replicate (async predictions API), this needs
// create-prediction + poll-until-complete instead of a single synchronous POST.

export class AceStepCloudProd implements MusicGenerationService {
  private readonly baseUrl: string
  private readonly apiToken: string
  private readonly enginePath: string

  constructor(config: { baseUrl: string; apiToken: string; enginePath?: string }) {
    this.baseUrl = config.baseUrl
    this.apiToken = config.apiToken
    this.enginePath = config.enginePath ?? '/generate'
  }

  generate(req: MusicRequest): Promise<MusicResult> {
    // enginePath is already the full path; baseUrl + /generate is handled by postGenerate,
    // but we honour enginePath by swapping baseUrl to include the custom path prefix when set.
    // postGenerate always appends /generate, so we derive an effective baseUrl that makes
    // `${effectiveBase}/generate` resolve correctly.
    const effectiveBase =
      this.enginePath === '/generate'
        ? this.baseUrl
        : this.baseUrl + this.enginePath.replace(/\/generate$/, '')

    return postGenerate({
      baseUrl: effectiveBase,
      headers: { Authorization: `Bearer ${this.apiToken}` },
      req,
    })
  }
}

export { AceStepCloudProd as CloudProdAdapter }
