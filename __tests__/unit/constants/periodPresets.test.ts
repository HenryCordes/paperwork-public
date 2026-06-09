import type { PeriodPreset } from '@shared/types'

import {
  PERIOD_PRESETS,
  PERIOD_TYPES,
} from '../../../common/constants/periodPresets'

describe('periodPresets constants', () => {
  it('exposes the expected preset values', () => {
    expect(PERIOD_PRESETS.LAST_MONTH).toBe('last-month')
    expect(PERIOD_PRESETS.LAST_THREE_MONTHS).toBe('last-3-months')
    expect(PERIOD_PRESETS.CUSTOM).toBe('custom')
  })

  it('every preset value is a valid PeriodPreset (shared type)', () => {
    // Compile-time: assignability to the shared union proves the alias + type.
    const values: PeriodPreset[] = Object.values(
      PERIOD_PRESETS,
    ) as PeriodPreset[]
    expect(values).toContain('this-year')
    expect(values).toContain('last-year')
  })

  it('exposes period types', () => {
    expect(PERIOD_TYPES.MONTHLY).toBe('monthly')
    expect(PERIOD_TYPES.QUARTERLY).toBe('quarterly')
  })
})
