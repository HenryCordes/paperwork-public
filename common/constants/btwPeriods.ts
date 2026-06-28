/**
 * BTW-specific period constants for Dutch tax reporting
 * Extends the existing period system with BTW-specific functionality
 */

interface PeriodBoundary {
  month: number
  day: number
}

interface QuarterDef {
  label: string
  start: PeriodBoundary
  end: PeriodBoundary
  deadline: PeriodBoundary
  name: string
}

interface MonthDef {
  label: string
  name: string
  deadline: PeriodBoundary
}

interface TaxRate {
  rate: number
  label: string
  field: string
}

export const BTW_PERIOD_TYPES = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
} as const

export const BTW_QUARTERS: Record<string, QuarterDef> = {
  Q1: {
    label: 'Q1',
    start: { month: 1, day: 1 },
    end: { month: 3, day: 31 },
    deadline: { month: 4, day: 30 },
    name: 'Eerste kwartaal',
  },
  Q2: {
    label: 'Q2',
    start: { month: 4, day: 1 },
    end: { month: 6, day: 30 },
    deadline: { month: 7, day: 31 },
    name: 'Tweede kwartaal',
  },
  Q3: {
    label: 'Q3',
    start: { month: 7, day: 1 },
    end: { month: 9, day: 30 },
    deadline: { month: 10, day: 31 },
    name: 'Derde kwartaal',
  },
  Q4: {
    label: 'Q4',
    start: { month: 10, day: 1 },
    end: { month: 12, day: 31 },
    deadline: { month: 1, day: 31 }, // Next year January 31st
    name: 'Vierde kwartaal',
  },
}

export const BTW_MONTHS: Record<number, MonthDef> = {
  1: { label: 'Januari', name: 'januari', deadline: { month: 2, day: 20 } },
  2: { label: 'Februari', name: 'februari', deadline: { month: 3, day: 20 } },
  3: { label: 'Maart', name: 'maart', deadline: { month: 4, day: 20 } },
  4: { label: 'April', name: 'april', deadline: { month: 5, day: 20 } },
  5: { label: 'Mei', name: 'mei', deadline: { month: 6, day: 20 } },
  6: { label: 'Juni', name: 'juni', deadline: { month: 7, day: 20 } },
  7: { label: 'Juli', name: 'juli', deadline: { month: 8, day: 20 } },
  8: { label: 'Augustus', name: 'augustus', deadline: { month: 9, day: 20 } },
  9: {
    label: 'September',
    name: 'september',
    deadline: { month: 10, day: 20 },
  },
  10: { label: 'Oktober', name: 'oktober', deadline: { month: 11, day: 20 } },
  11: { label: 'November', name: 'november', deadline: { month: 12, day: 20 } },
  12: { label: 'December', name: 'december', deadline: { month: 1, day: 20 } }, // Next year January 20th
}

export const BTW_TAX_RATES: Record<string, TaxRate> = {
  HIGH: { rate: 21, label: 'Hoog tarief (21%)', field: 'tax' },
  LOW: { rate: 9, label: 'Laag tarief (9%)', field: 'taxLow' },
  LOWEST: { rate: 6, label: 'Laagste tarief (6%)', field: 'taxLowest' },
  ZERO: { rate: 0, label: 'Vrijgesteld (0%)', field: 'taxZero' },
}

/**
 * Calculate BTW deadline for a given period
 */
export function calculateBTWDeadline(
  periodType: string,
  period: string | number,
  year: number,
): Date {
  let deadlineYear = year
  let deadlineMonth: number
  let deadlineDay: number

  switch (periodType) {
    case BTW_PERIOD_TYPES.MONTHLY: {
      const monthData = BTW_MONTHS[period as number]
      if (!monthData) throw new Error(`Invalid month: ${period}`)

      deadlineMonth = monthData.deadline.month
      deadlineDay = monthData.deadline.day

      // Handle December -> January next year
      if (period === 12) {
        deadlineYear = year + 1
      }
      break
    }

    case BTW_PERIOD_TYPES.QUARTERLY: {
      const quarterData = BTW_QUARTERS[period as string]
      if (!quarterData) throw new Error(`Invalid quarter: ${period}`)

      deadlineMonth = quarterData.deadline.month
      deadlineDay = quarterData.deadline.day

      // Handle Q4 -> January next year
      if (period === 'Q4') {
        deadlineYear = year + 1
      }
      break
    }

    case BTW_PERIOD_TYPES.YEARLY:
      // Yearly BTW deadline is March 31st of following year
      deadlineYear = year + 1
      deadlineMonth = 3
      deadlineDay = 31
      break

    default:
      throw new Error(`Invalid period type: ${periodType}`)
  }

  return new Date(deadlineYear, deadlineMonth - 1, deadlineDay)
}

/**
 * Get period date range
 */
export function getBTWPeriodRange(
  periodType: string,
  period: string | number,
  year: number,
): { startDate: Date; endDate: Date } {
  let startDate: Date
  let endDate: Date

  switch (periodType) {
    case BTW_PERIOD_TYPES.MONTHLY:
      startDate = new Date(year, (period as number) - 1, 1)
      endDate = new Date(year, period as number, 0) // Last day of month
      break

    case BTW_PERIOD_TYPES.QUARTERLY: {
      const quarterData = BTW_QUARTERS[period as string]
      if (!quarterData) throw new Error(`Invalid quarter: ${period}`)

      startDate = new Date(
        year,
        quarterData.start.month - 1,
        quarterData.start.day,
      )
      endDate = new Date(year, quarterData.end.month - 1, quarterData.end.day)
      break
    }

    case BTW_PERIOD_TYPES.YEARLY:
      startDate = new Date(year, 0, 1) // January 1st
      endDate = new Date(year, 11, 31) // December 31st
      break

    default:
      throw new Error(`Invalid period type: ${periodType}`)
  }

  return { startDate, endDate }
}

/**
 * Format period label for display
 */
export function formatBTWPeriodLabel(
  periodType: string,
  period: string | number,
  year: number,
): string {
  switch (periodType) {
    case BTW_PERIOD_TYPES.MONTHLY: {
      const monthData = BTW_MONTHS[period as number]
      return `${monthData.label} ${year}`
    }

    case BTW_PERIOD_TYPES.QUARTERLY: {
      const quarterData = BTW_QUARTERS[period as string]
      return `${quarterData.label} ${year}`
    }

    case BTW_PERIOD_TYPES.YEARLY:
      return `Jaar ${year}`

    default:
      throw new Error(`Invalid period type: ${periodType}`)
  }
}
