import {
  formatDutchPrice,
  formatDate,
  translatePlanInterval,
} from './stringUtils'

describe('formatDutchPrice', () => {
  it.each([undefined, null, ''])('returns the default for %p', (input) => {
    expect(formatDutchPrice(input as undefined | null | string)).toBe('9,99')
  })

  it('honours a custom default', () => {
    expect(formatDutchPrice(null, '0,00')).toBe('0,00')
  })

  it('replaces the decimal dot with a comma', () => {
    expect(formatDutchPrice(9.99)).toBe('9,99')
    expect(formatDutchPrice('12.50')).toBe('12,50')
  })

  it('leaves integer-like values unchanged', () => {
    expect(formatDutchPrice(10)).toBe('10')
  })
})

describe('translatePlanInterval', () => {
  it.each([
    ['1 month', 'Betaal per maand'],
    ['12 months', 'Betaal per jaar'],
    ['1 year', 'Betaal per jaar'],
  ])('translates %s', (input, expected) => {
    expect(translatePlanInterval(input)).toBe(expected)
  })

  it('returns the input unchanged for an unknown interval', () => {
    expect(translatePlanInterval('3 weeks')).toBe('3 weeks')
  })
})

describe('formatDate', () => {
  it('returns "nvt" for falsy input', () => {
    expect(formatDate(undefined)).toBe('nvt')
    expect(formatDate(null)).toBe('nvt')
    expect(formatDate('')).toBe('nvt')
  })

  it('formats a date in Dutch long form', () => {
    // Local-time constructor avoids a UTC-midnight timezone shift.
    const result = formatDate(new Date(2026, 0, 15))
    expect(result).toContain('januari')
    expect(result).toContain('2026')
    expect(result).toContain('15')
  })
})
