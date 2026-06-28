import { getActiveEngineVersion } from '../../src/server/services/music/version'
import { it, expect } from 'vitest'

it('reads active engine version', () => {
  process.env.ACTIVE_ENGINE_VERSION = 'stock-0'
  expect(getActiveEngineVersion()).toBe('stock-0')
})

it('defaults to stock-0 when unset', () => {
  const { ACTIVE_ENGINE_VERSION, ...rest } = process.env
  void ACTIVE_ENGINE_VERSION
  expect(getActiveEngineVersion(rest as NodeJS.ProcessEnv)).toBe('stock-0')
})
