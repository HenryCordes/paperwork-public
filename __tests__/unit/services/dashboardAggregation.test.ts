import {
  mergeAggregationResults,
  formatPeriodLabel,
} from '../../../services/dashboardAggregation'

describe('formatPeriodLabel', () => {
  it('formats a day group as zero-padded YYYY-MM-DD', () => {
    expect(formatPeriodLabel({ year: 2026, month: 3, day: 5 }, 'day')).toBe(
      '2026-03-05',
    )
  })

  it('formats a month group as zero-padded YYYY-MM', () => {
    expect(formatPeriodLabel({ year: 2026, month: 3 }, 'month')).toBe('2026-03')
  })

  it('formats a quarter group as "<year> Q<quarter>"', () => {
    expect(formatPeriodLabel({ year: 2026, quarter: 2 }, 'quarter')).toBe(
      '2026 Q2',
    )
  })

  it('formats any other group (year) as the year string', () => {
    expect(formatPeriodLabel({ year: 2026 }, 'year')).toBe('2026')
  })
})

describe('mergeAggregationResults', () => {
  it('keeps revenue-only periods with zero expenses and netProfit === totalRevenue', () => {
    const revenue = [
      {
        _id: { year: 2026, month: 3 },
        totalRevenue: 1000,
        paidRevenue: 800,
        invoiceCount: 4,
        taxCollected: 210,
      },
    ]

    const [row] = mergeAggregationResults(revenue, [], 'month')

    expect(row.totalRevenue).toBe(1000)
    expect(row.paidRevenue).toBe(800)
    expect(row.taxCollected).toBe(210)
    expect(row.totalExpenses).toBe(0)
    expect(row.expenseCount).toBe(0)
    expect(row.taxPaid).toBe(0)
    expect(row.netProfit).toBe(1000)
  })

  it('merges a matching expense period into the revenue period (netProfit = revenue - expenses)', () => {
    const revenue = [
      { _id: { year: 2026, month: 3 }, totalRevenue: 1000, invoiceCount: 4 },
    ]
    const expenses = [
      { _id: { year: 2026, month: 3 }, totalExpenses: 300, expenseCount: 2 },
    ]

    const merged = mergeAggregationResults(revenue, expenses, 'month')

    expect(merged).toHaveLength(1)
    const [row] = merged
    expect(row.totalRevenue).toBe(1000)
    expect(row.totalExpenses).toBe(300)
    expect(row.expenseCount).toBe(2)
    expect(row.netProfit).toBe(700)
  })

  it('keeps expense-only periods with zero revenue and netProfit === -totalExpenses', () => {
    const expenses = [
      { _id: { year: 2026, month: 3 }, totalExpenses: 250, expenseCount: 1 },
    ]

    const [row] = mergeAggregationResults([], expenses, 'month')

    expect(row.totalRevenue).toBe(0)
    expect(row.invoiceCount).toBe(0)
    expect(row.totalExpenses).toBe(250)
    expect(row.netProfit).toBe(-250)
  })

  it('sorts month periods chronologically using zero-padded periodKeys', () => {
    const revenue = [
      { _id: { year: 2026, month: 11 }, totalRevenue: 50 },
      { _id: { year: 2026, month: 2 }, totalRevenue: 10 },
    ]

    const merged = mergeAggregationResults(revenue, [], 'month')

    // periodKey is zero-padded ("2026-02"), so the lexicographic localeCompare
    // sort is also chronological: February precedes November within the year.
    expect(merged.map((r) => r.periodKey)).toEqual(['2026-02', '2026-11'])
    expect(merged.map((r) => r.period)).toEqual(['2026-02', '2026-11'])
  })

  it('sorts day periods chronologically using zero-padded periodKeys', () => {
    const revenue = [
      { _id: { year: 2026, month: 3, day: 15 }, totalRevenue: 50 },
      { _id: { year: 2026, month: 3, day: 5 }, totalRevenue: 10 },
    ]

    const merged = mergeAggregationResults(revenue, [], 'day')

    expect(merged.map((r) => r.periodKey)).toEqual(['2026-03-05', '2026-03-15'])
    expect(merged.map((r) => r.period)).toEqual(['2026-03-05', '2026-03-15'])
  })
})
