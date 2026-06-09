import {
  formatPeriodLabel,
  formatDate,
} from '../../../services/queues/notifications/vatReturnNotificationProcessor'

describe('formatPeriodLabel', () => {
  it('formats a monthly period with the Dutch month name', () => {
    expect(formatPeriodLabel('monthly', '3', 2026)).toBe('Maart 2026')
  })

  it('formats a quarterly period as "<period> <year>"', () => {
    expect(formatPeriodLabel('quarterly', 'Q2', 2026)).toBe('Q2 2026')
  })

  it('formats a yearly period as "Jaar <year>"', () => {
    expect(formatPeriodLabel('yearly', undefined, 2026)).toBe('Jaar 2026')
  })
})

describe('formatDate', () => {
  it('formats a date in the Dutch long-month locale', () => {
    // Mid-day UTC avoids a timezone day-rollover; assert the locale contract
    // (Dutch long month + year) without pinning the exact day.
    const result = formatDate('2026-03-15T12:00:00Z')
    expect(result).toContain('maart')
    expect(result).toContain('2026')
  })
})
