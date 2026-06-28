import {
  BTW_PERIOD_TYPES,
  calculateBTWDeadline,
  getBTWPeriodRange,
  formatBTWPeriodLabel,
} from '../../../common/constants/btwPeriods'

describe('btwPeriods', () => {
  describe('calculateBTWDeadline', () => {
    it('monthly deadline is the 20th of the following month', () => {
      // March (3) -> 2024-04-20
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.MONTHLY, 3, 2024)).toEqual(
        new Date(2024, 3, 20),
      )
    })

    it('December monthly deadline rolls into next year', () => {
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.MONTHLY, 12, 2024)).toEqual(
        new Date(2025, 0, 20),
      )
    })

    it('Q4 quarterly deadline rolls into next January', () => {
      expect(
        calculateBTWDeadline(BTW_PERIOD_TYPES.QUARTERLY, 'Q4', 2024),
      ).toEqual(new Date(2025, 0, 31))
    })

    it('yearly deadline is March 31 of the following year', () => {
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.YEARLY, 2024, 2024)).toEqual(
        new Date(2025, 2, 31),
      )
    })

    it('throws on an invalid period type', () => {
      expect(() => calculateBTWDeadline('weekly', 1, 2024)).toThrow()
    })
  })

  describe('getBTWPeriodRange', () => {
    it('monthly range covers the whole month', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.MONTHLY,
        2,
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 1, 1))
      expect(endDate).toEqual(new Date(2024, 2, 0)) // Feb 29 2024 (leap)
    })

    it('quarterly range covers the quarter', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.QUARTERLY,
        'Q1',
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 0, 1))
      expect(endDate).toEqual(new Date(2024, 2, 31))
    })

    it('yearly range covers the whole year', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.YEARLY,
        2024,
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 0, 1))
      expect(endDate).toEqual(new Date(2024, 11, 31))
    })
  })

  describe('formatBTWPeriodLabel', () => {
    it('formats monthly, quarterly, and yearly labels', () => {
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.MONTHLY, 3, 2024)).toBe(
        'Maart 2024',
      )
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.QUARTERLY, 'Q2', 2024)).toBe(
        'Q2 2024',
      )
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.YEARLY, 2024, 2024)).toBe(
        'Jaar 2024',
      )
    })
  })
})
