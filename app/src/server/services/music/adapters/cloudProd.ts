import type { MusicGenerationService, MusicRequest, MusicResult } from '../types'
import { postGenerate } from './httpEngine'

// TODO(cloud): if the chosen provider is Replicate (async predictions API), this needs
// create-prediction + poll-until-complete instead of a single synchronous POST.

export class AceStepCloudProd implements MusicGenerationService {
  private readonly baseUrl: string
  private readonly apiToken: string

  constructor(config: { baseUrl: string; apiToken: string }) {
    this.baseUrl = config.baseUrl
    this.apiToken = config.apiToken
  }

  generate(req: MusicRequest): Promise<MusicResult> {
    return postGenerate({
      baseUrl: this.baseUrl,
      headers: { Authorization: `Bearer ${this.apiToken}` },
      req,
    })
  }
}

export { AceStepCloudProd as CloudProdAdapter }
