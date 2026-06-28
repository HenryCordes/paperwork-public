import {
  BTW_PERIOD_TYPES,
  getBTWPeriodRange,
  calculateBTWDeadline,
  formatBTWPeriodLabel,
} from '../common/constants/btwPeriods'
import Expense from '../models/Expense'
import Invoice from '../models/Invoice'

import { getLogger } from './logger'

const logger = getLogger()

type TaxBucket = {
  totalExcl: number
  totalTax: number
  totalIncl: number
  count: number
}

interface InvoiceAggregation {
  tax21: TaxBucket
  tax9: TaxBucket
  tax6: TaxBucket
  tax0: TaxBucket
  count: number
}

interface ExpenseAggregation {
  totalTax: number
  tax21: number
  tax9: number
  tax6: number
  totalExcl: number
  totalIncl: number
  count: number
}

/**
 * BTW Calculation Service
 * Handles aggregation and calculation of BTW data for Dutch tax reporting
 */

/**
 * Calculate BTW summary for a given period
 */
async function calculateBTWForPeriod(
  tenantId: string,
  periodType: string,
  period: string | number,
  year: number,
) {
  try {
    logger.info(
      `BTW berekening voor tenant ${tenantId}, periode: ${periodType} ${period} ${year}`,
    )

    const { startDate, endDate } = getBTWPeriodRange(periodType, period, year)
    const deadline = calculateBTWDeadline(periodType, period, year)
    const periodLabel = formatBTWPeriodLabel(periodType, period, year)

    // Get invoice and expense data in parallel
    const [invoiceData, expenseData] = await Promise.all([
      aggregateInvoicesByTaxRate(tenantId, startDate, endDate),
      aggregateExpensesByTaxRate(tenantId, startDate, endDate),
    ])

    // Calculate BTW totals
    const omzet = {
      hoogTarief21: {
        excl: invoiceData.tax21.totalExcl,
        btw: invoiceData.tax21.totalTax,
        incl: invoiceData.tax21.totalIncl,
      },
      laagTarief9: {
        excl: invoiceData.tax9.totalExcl,
        btw: invoiceData.tax9.totalTax,
        incl: invoiceData.tax9.totalIncl,
      },
      laagsteTarief6: {
        excl: invoiceData.tax6.totalExcl,
        btw: invoiceData.tax6.totalTax,
        incl: invoiceData.tax6.totalIncl,
      },
      overige: {
        excl: invoiceData.tax0.totalExcl,
        btw: invoiceData.tax0.totalTax,
        incl: invoiceData.tax0.totalIncl,
      },
    }

    const subtotaalOmzet =
      omzet.hoogTarief21.excl +
      omzet.laagTarief9.excl +
      omzet.laagsteTarief6.excl +
      omzet.overige.excl

    const verschuldigdeBTW =
      omzet.hoogTarief21.btw +
      omzet.laagTarief9.btw +
      omzet.laagsteTarief6.btw +
      omzet.overige.btw

    const voorbelasting = expenseData.totalTax

    const teBetalen = verschuldigdeBTW - voorbelasting

    const result = {
      period: {
        type: periodType,
        period: period,
        year: year,
        label: periodLabel,
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        deadline: deadline.toISOString().split('T')[0],
      },
      omzet,
      subtotaalOmzet,
      verschuldigdeBTW,
      voorbelasting,
      teBetalen,
      invoiceCount: invoiceData.count,
      expenseCount: expenseData.count,
      calculatedAt: new Date().toISOString(),
    }

    logger.info(
      `BTW berekening voltooid voor ${periodLabel}: te betalen €${teBetalen.toFixed(
        2,
      )}`,
    )
    return result
  } catch (error) {
    logger.error(
      `Fout bij BTW berekening voor periode ${periodType} ${period} ${year}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Aggregate invoice data by tax rates for BTW calculation
 */
async function aggregateInvoicesByTaxRate(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<InvoiceAggregation> {
  try {
    const invoices = await Invoice.find({
      tenantId,
      invoiceDate: { $gte: startDate, $lte: endDate },
    }).lean()

    const aggregation: InvoiceAggregation = {
      tax21: { totalExcl: 0, totalTax: 0, totalIncl: 0, count: 0 },
      tax9: { totalExcl: 0, totalTax: 0, totalIncl: 0, count: 0 },
      tax6: { totalExcl: 0, totalTax: 0, totalIncl: 0, count: 0 },
      tax0: { totalExcl: 0, totalTax: 0, totalIncl: 0, count: 0 },
      count: invoices.length,
    }

    invoices.forEach((invoice) => {
      const priceExcl = invoice.priceWithoutTaxes || 0
      const tax21 = invoice.tax || 0
      const tax9 = invoice.taxLow || 0
      const tax6 = invoice.taxLowest || 0

      // Calculate exclusive amounts per tax rate
      // This is an approximation - invoices should specify amounts per tax rate
      const totalTax = tax21 + tax9 + tax6

      if (tax21 > 0) {
        const excl21 = tax21 / 0.21 // Reverse calculate from tax amount
        aggregation.tax21.totalExcl += excl21
        aggregation.tax21.totalTax += tax21
        aggregation.tax21.totalIncl += excl21 + tax21
        aggregation.tax21.count++
      }

      if (tax9 > 0) {
        const excl9 = tax9 / 0.09 // Reverse calculate from tax amount
        aggregation.tax9.totalExcl += excl9
        aggregation.tax9.totalTax += tax9
        aggregation.tax9.totalIncl += excl9 + tax9
        aggregation.tax9.count++
      }

      if (tax6 > 0) {
        const excl6 = tax6 / 0.06 // Reverse calculate from tax amount
        aggregation.tax6.totalExcl += excl6
        aggregation.tax6.totalTax += tax6
        aggregation.tax6.totalIncl += excl6 + tax6
        aggregation.tax6.count++
      }

      // Handle 0% tax (if no tax but has amount)
      if (totalTax === 0 && priceExcl > 0) {
        aggregation.tax0.totalExcl += priceExcl
        aggregation.tax0.totalTax += 0
        aggregation.tax0.totalIncl += priceExcl
        aggregation.tax0.count++
      }
    })

    return aggregation
  } catch (error) {
    logger.error(
      'Fout bij aggregeren facturen per BTW-tarief:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Aggregate expense data by tax rates for BTW calculation (voorbelasting)
 */
async function aggregateExpensesByTaxRate(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<ExpenseAggregation> {
  try {
    const expenses = await Expense.find({
      tenantId,
      expenseDate: { $gte: startDate, $lte: endDate },
    }).lean()

    const aggregation: ExpenseAggregation = {
      totalTax: 0,
      tax21: 0,
      tax9: 0,
      tax6: 0,
      totalExcl: 0,
      totalIncl: 0,
      count: expenses.length,
    }

    expenses.forEach((expense) => {
      const tax21 = expense.tax || 0
      const tax9 = expense.taxLow || 0
      const priceExcl = expense.priceWOTaxes || 0
      const priceIncl = expense.price || 0

      aggregation.tax21 += tax21
      aggregation.tax9 += tax9
      aggregation.totalTax += tax21 + tax9
      aggregation.totalExcl += priceExcl
      aggregation.totalIncl += priceIncl
    })

    return aggregation
  } catch (error) {
    logger.error(
      'Fout bij aggregeren uitgaven per BTW-tarief:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Get company information for BTW export
 */
async function getCompanyInfoForBTW(_tenantId: string) {
  try {
    // This would typically fetch from Settings model.
    // For now, return placeholder structure.
    return {
      companyName: 'Bedrijfsnaam',
      kvkNumber: '12345678',
      btwNumber: 'NL123456789B01',
      address: {
        street: 'Straatnaam',
        houseNumber: '123',
        postalCode: '1234 AB',
        city: 'Plaatsnaam',
      },
    }
  } catch (error) {
    logger.error(
      'Fout bij ophalen bedrijfsgegevens voor BTW:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Calculate next BTW deadline for a tenant
 */
async function getNextBTWDeadline(
  _tenantId: string,
  periodType: string = BTW_PERIOD_TYPES.QUARTERLY,
) {
  try {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    let nextPeriod: string | number
    let nextYear: number

    switch (periodType) {
      case BTW_PERIOD_TYPES.MONTHLY: {
        // Start with current month
        nextPeriod = currentMonth
        nextYear = currentYear

        // Check if current month's deadline has passed
        const monthDeadline = calculateBTWDeadline(
          periodType,
          nextPeriod,
          nextYear,
        )
        if (monthDeadline.getTime() < now.getTime()) {
          // Move to next month
          nextPeriod = currentMonth === 12 ? 1 : currentMonth + 1
          nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
        }
        break
      }

      case BTW_PERIOD_TYPES.QUARTERLY: {
        // Determine current quarter
        let currentQuarter: string
        if (currentMonth <= 3) currentQuarter = 'Q1'
        else if (currentMonth <= 6) currentQuarter = 'Q2'
        else if (currentMonth <= 9) currentQuarter = 'Q3'
        else currentQuarter = 'Q4'

        nextPeriod = currentQuarter
        nextYear = currentYear

        // Check if current quarter's deadline has passed
        const quarterDeadline = calculateBTWDeadline(
          periodType,
          nextPeriod,
          nextYear,
        )
        if (quarterDeadline.getTime() < now.getTime()) {
          // Move to next quarter
          const quarters = ['Q1', 'Q2', 'Q3', 'Q4']
          const currentIndex = quarters.indexOf(currentQuarter)
          if (currentIndex === 3) {
            nextPeriod = 'Q1'
            nextYear = currentYear + 1
          } else {
            nextPeriod = quarters[currentIndex + 1]
          }
        }
        break
      }

      case BTW_PERIOD_TYPES.YEARLY: {
        nextPeriod = currentYear
        nextYear = currentYear

        // Check if current year's deadline has passed
        const yearDeadline = calculateBTWDeadline(
          periodType,
          nextPeriod,
          nextYear,
        )
        if (yearDeadline.getTime() < now.getTime()) {
          nextPeriod = currentYear + 1
          nextYear = currentYear + 1
        }
        break
      }

      default:
        throw new Error(`Invalid period type: ${periodType}`)
    }

    const deadline = calculateBTWDeadline(periodType, nextPeriod, nextYear)
    const daysUntilDeadline = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    const result = {
      periodType,
      period: nextPeriod,
      year: nextYear,
      deadline: deadline.toISOString().split('T')[0],
      daysUntilDeadline,
      isOverdue: daysUntilDeadline < 0,
      label: formatBTWPeriodLabel(periodType, nextPeriod, nextYear),
    }

    logger.info('BTW deadline berekend:', {
      periodType,
      period: nextPeriod,
      year: nextYear,
      deadline: result.deadline,
      daysUntilDeadline,
      currentDate: now.toISOString().split('T')[0],
    })

    return result
  } catch (error) {
    logger.error(
      'Fout bij berekenen volgende BTW deadline:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

export {
  calculateBTWForPeriod,
  aggregateInvoicesByTaxRate,
  aggregateExpensesByTaxRate,
  getCompanyInfoForBTW,
  getNextBTWDeadline,
}
