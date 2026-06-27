import { t } from '../src/lib/i18n'
import { describe, it, expect } from 'vitest'
describe('i18n', () => {
  it('returns Arabic for known key', () => { expect(t('app.name')).toBe('غنّيلي') })
})
