// The currently released cloud engine version the app stamps onto songs for
// provenance. Set from ACTIVE_ENGINE_VERSION (injected on Cloud Run from Secret
// Manager when a validated checkpoint is promoted). Defaults to the stock model.
export function getActiveEngineVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.ACTIVE_ENGINE_VERSION || 'stock-0'
}
