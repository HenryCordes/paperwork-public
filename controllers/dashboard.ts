import { Request, Response } from 'express'

import { PERIOD_PRESETS, PERIOD_TYPES } from '../common/constants/periodPresets'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import DashboardStats from '../models/DashboardStats'
import Expense from '../models/Expense'
import Invoice from '../models/Invoice'
import {
  refreshDailyAggregation,
  dynamicAggregation,
} from '../services/dashboardAggregation'
import { createControllerLogger } from '../services/logger/utils'

// Create a controller-specific logger
const logger = createControllerLogger('dashboard')

interface DateRange {
  startDate: Date
  endDate: Date
}

/**
 * Convert a preset period identifier to a date range
 */
function getDateRangeFromPreset(preset: string): DateRange | null {
  // Standardize on hyphenated format using our constants
  // This converts any legacy underscore format to our canonical hyphen format
  const normalizedPreset = preset.includes('_')
    ? preset.replace(/_/g, '-')
    : preset

  // Log what we received vs what we normalized to
  console.log(
    `Received period preset: ${preset}, normalized to: ${normalizedPreset}`,
  )

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // Initialize default range (this month)
  let startDate = new Date(currentYear, currentMonth, 1)
  let endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999) // End of current month

  switch (normalizedPreset) {
    case PERIOD_PRESETS.LAST_MONTH:
      // Last month: 1st day of previous month to last day of previous month
      startDate = new Date(currentYear, currentMonth - 1, 1)
      endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999) // Last day of previous month
      break

    case PERIOD_PRESETS.LAST_THREE_MONTHS:
      // Last 3 months: 3 months ago to today
      startDate = new Date(currentYear, currentMonth - 3, 1)
      endDate = new Date() // Current date and time
      break

    case PERIOD_PRESETS.LAST_TWELVE_MONTHS:
      // Last 12 months: 12 months ago to today
      startDate = new Date(currentYear - 1, currentMonth, 1)
      endDate = new Date() // Current date and time
      break

    case PERIOD_PRESETS.THIS_YEAR:
      // This year: January 1st to December 31st of current year
      startDate = new Date(currentYear, 0, 1)
      endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999)
      break

    case PERIOD_PRESETS.LAST_YEAR:
      // Last year: January 1st to December 31st of previous year
      startDate = new Date(currentYear - 1, 0, 1)
      endDate = new Date(currentYear - 1, 11, 31, 23, 59, 59, 999)
      break

    case PERIOD_PRESETS.CUSTOM:
      // Custom period - return null to indicate custom dates should be used
      return null

    default:
      // If preset isn't recognized, default to current month
      console.warn(
        `Unrecognized period preset: ${preset}, defaulting to current month`,
      )
      break
  }

  console.log(
    `Date range for preset ${preset}: ${startDate.toISOString()} to ${endDate.toISOString()}`,
  )

  return { startDate, endDate }
}

/**
 * Calculate real-time yearly metrics from invoice and expense data directly
 * This ensures consistency with export calculations
 */
async function calculateRealTimeYearlyMetrics(tenantId: string, year: number) {
  // Define quarters for the year
  const quarters = [
    {
      name: 'Q1',
      start: new Date(`${year}-01-01`),
      end: new Date(`${year}-03-31T23:59:59.999Z`),
    },
    {
      name: 'Q2',
      start: new Date(`${year}-04-01`),
      end: new Date(`${year}-06-30T23:59:59.999Z`),
    },
    {
      name: 'Q3',
      start: new Date(`${year}-07-01`),
      end: new Date(`${year}-09-30T23:59:59.999Z`),
    },
    {
      name: 'Q4',
      start: new Date(`${year}-10-01`),
      end: new Date(`${year}-12-31T23:59:59.999Z`),
    },
  ]

  // Calculate data for each quarter using the same approach as export-summary
  const quarterlyData = await Promise.all(
    quarters.map(async (quarter) => {
      // Calculate invoices (revenue) for the quarter
      const invoices = await Invoice.find({
        tenantId,
        invoiceDate: { $gte: quarter.start, $lte: quarter.end },
      }).lean()

      const totalRevenue = invoices.reduce(
        (sum, inv) => sum + (inv.priceIncludingTax || 0),
        0,
      )

      // Calculate expenses using aggregation (same as export-summary)
      const expenseStats = await Expense.aggregate([
        {
          $match: {
            tenantId: tenantId,
            expenseDate: { $gte: quarter.start, $lte: quarter.end },
          },
        },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: '$price' },
            expenseCount: { $sum: 1 },
          },
        },
      ])

      // Extract expense total (safely handling empty results)
      const totalExpenses = expenseStats[0]?.totalExpenses || 0

      return {
        quarter: quarter.name,
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: totalRevenue - totalExpenses,
      }
    }),
  )

  // Calculate yearly totals by summing quarters (exactly like export-summary)
  const yearlyTotals = {
    totalRevenue: quarterlyData.reduce((sum, q) => sum + q.revenue, 0),
    totalExpenses: quarterlyData.reduce((sum, q) => sum + q.expenses, 0),
    netProfit: quarterlyData.reduce((sum, q) => sum + q.profit, 0),
  }

  console.log(
    `Real-time yearly totals for ${year}: Revenue=${yearlyTotals.totalRevenue}, Expenses=${yearlyTotals.totalExpenses}, Profit=${yearlyTotals.netProfit}`,
  )

  return yearlyTotals
}

/**
 * Dashboard Controller - Handles API requests for dashboard data and report generation
 */

/**
 * Get dashboard statistics for a period
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { periodType, periodPreset, startDate, endDate } = req.query

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Tenant information not available',
      })
    }

    // Parse dates if provided
    let parsedStartDate = startDate ? new Date(startDate as string) : null
    let parsedEndDate = endDate ? new Date(endDate as string) : new Date()

    // Convert periodPreset to actual date range if provided
    if (periodPreset && !startDate) {
      const dateRange = getDateRangeFromPreset(periodPreset as string)
      if (dateRange) {
        parsedStartDate = dateRange.startDate
        parsedEndDate = dateRange.endDate
        console.log('Using date range from preset:', {
          preset: periodPreset,
          start: parsedStartDate,
          end: parsedEndDate,
        })
      }
    }

    // Check for invalid dates
    if (
      (parsedStartDate && isNaN(parsedStartDate.getTime())) ||
      isNaN(parsedEndDate.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      })
    }

    // Special handling for yearly data to ensure consistency with exports
    if (
      (periodType === PERIOD_TYPES.YEARLY ||
        periodPreset === PERIOD_PRESETS.THIS_YEAR ||
        periodPreset === PERIOD_PRESETS.LAST_YEAR) &&
      !startDate &&
      !endDate
    ) {
      console.log('Using real-time calculation for yearly data to match export')

      // Determine which year to use
      const targetYear =
        periodPreset === 'last-year'
          ? new Date().getFullYear() - 1
          : new Date().getFullYear()

      // Get real-time yearly metrics
      const yearlyMetrics = await calculateRealTimeYearlyMetrics(
        tenantId,
        targetYear,
      )

      // For yearly view, we still need pre-calculated stats for the graph display
      // but we'll replace the summary metrics with our real-time calculation
      const preCalculatedStats = await getPreCalculatedStats(
        tenantId,
        periodType as string,
        periodPreset as string,
      )

      if (preCalculatedStats && preCalculatedStats.length > 0) {
        // Filter out empty periods for cleaner graphs
        const filteredStats = preCalculatedStats.filter(
          (item) =>
            (item.totalRevenue || 0) > 0 ||
            (item.totalExpenses || 0) > 0 ||
            (item.invoiceCount || 0) > 0 ||
            (item.expenseCount || 0) > 0,
        )

        // Transform the data to match frontend expectations: {labels, turnover, expenses}
        const labels = filteredStats.map((item) => item.period)
        const turnover = filteredStats.map((item) => item.totalRevenue || 0)
        const expenses = filteredStats.map((item) => item.totalExpenses || 0)

        // Replace the yearly summary metrics with our real-time calculation
        // This ensures the dashboard's Winst/Uitgaven match the export's Marge/Netto Onkosten
        const summaryData = {
          totalRevenue: yearlyMetrics.totalRevenue,
          totalExpenses: yearlyMetrics.totalExpenses,
          netProfit: yearlyMetrics.netProfit,
        }

        return res.json({
          success: true,
          data: {
            labels,
            turnover,
            expenses,
            summaryMetrics: summaryData, // Real-time metrics for summaries
            rawData: preCalculatedStats, // Include raw data for the graph
          },
          source: 'hybrid-calculation', // Indicate we're using both pre-calculated and real-time
        })
      }
    }

    // Check for pre-calculated stats for other period types
    if (periodType) {
      console.log(
        `Checking for pre-calculated ${periodType} stats with preset ${periodPreset}`,
      )

      // Get pre-calculated stats if available
      const preCalculatedStats = await getPreCalculatedStats(
        tenantId,
        periodType as string,
        periodPreset as string,
      )

      if (preCalculatedStats && preCalculatedStats.length > 0) {
        // Filter out empty periods for cleaner graphs
        const filteredStats = preCalculatedStats.filter(
          (item) =>
            (item.totalRevenue || 0) > 0 ||
            (item.totalExpenses || 0) > 0 ||
            (item.invoiceCount || 0) > 0 ||
            (item.expenseCount || 0) > 0,
        )

        // Transform the data to match frontend expectations: {labels, turnover, expenses}
        const labels = filteredStats.map((item) => item.period)
        const turnover = filteredStats.map((item) => item.totalRevenue || 0)
        const expenses = filteredStats.map((item) => item.totalExpenses || 0)

        return res.json({
          success: true,
          data: {
            labels,
            turnover,
            expenses,
            rawData: preCalculatedStats, // Include raw data for debugging
          },
          source: 'pre-calculated',
        })
      }
    }

    // Default to dynamic aggregation if pre-calculated stats aren't available or custom date range
    if (!parsedStartDate) {
      // Set default start date based on period type
      parsedStartDate = getDefaultStartDate((periodType as string) || 'monthly')
    }

    // Determine grouping level based on date range or explicit periodType
    const groupingLevel = getGroupingLevel(
      periodType as string | undefined,
      parsedStartDate,
      parsedEndDate,
    )

    // Get dynamically calculated stats
    const stats = await dynamicAggregation(
      tenantId,
      parsedStartDate,
      parsedEndDate,
      groupingLevel,
    )

    // Filter out empty periods (days/months with no data) for cleaner graphs
    const filteredStats = stats.filter(
      (item) =>
        (item.totalRevenue || 0) > 0 ||
        (item.totalExpenses || 0) > 0 ||
        (item.invoiceCount || 0) > 0 ||
        (item.expenseCount || 0) > 0,
    )

    // Transform the data to match frontend expectations: {labels, turnover, expenses}
    const labels = filteredStats.map((item) => item.period)
    const turnover = filteredStats.map((item) => item.totalRevenue || 0)
    const expenses = filteredStats.map((item) => item.totalExpenses || 0)

    return res.json({
      success: true,
      data: {
        labels,
        turnover,
        expenses,
        rawData: stats, // Include raw data for debugging
      },
      source: 'dynamic',
      periodInfo: {
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        groupingLevel,
      },
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard statistics',
      error: (error as Error).message,
    })
  }
}

/**
 * Fetch pre-calculated statistics from the DashboardStats collection
 */
const getPreCalculatedStats = async (
  tenantId: string,
  periodType?: string,
  preset?: string,
) => {
  const query: Record<string, unknown> = {
    tenantId,
    periodType,
  }

  // Apply additional filters for presets or explicit date range
  if (preset) {
    const { startDate, endDate } = getPresetDateRange(preset)
    if (startDate && endDate) {
      // Filter by periodKey instead of periodStart/End for more reliable filtering
      // This handles the cases where periodStart/End might not be perfectly aligned with our expectations
      if (periodType === 'daily') {
        // For daily, filter by YYYY-MM-DD format
        const startStr = startDate.toISOString().split('T')[0] // YYYY-MM-DD
        const endStr = endDate.toISOString().split('T')[0] // YYYY-MM-DD
        query.periodKey = { $gte: startStr, $lte: endStr }
      } else if (periodType === 'monthly') {
        // For monthly, filter by YYYY-MM format
        const startMonth = `${startDate.getFullYear()}-${String(
          startDate.getMonth() + 1,
        ).padStart(2, '0')}`
        const endMonth = `${endDate.getFullYear()}-${String(
          endDate.getMonth() + 1,
        ).padStart(2, '0')}`
        query.periodKey = { $gte: startMonth, $lte: endMonth }
      } else if (periodType === 'quarterly') {
        // For quarterly, determine the quarters and construct filter
        const startQuarter = Math.floor(startDate.getMonth() / 3) + 1
        const endQuarter = Math.floor(endDate.getMonth() / 3) + 1
        const startPeriod = `${startDate.getFullYear()}-Q${startQuarter}`
        const endPeriod = `${endDate.getFullYear()}-Q${endQuarter}`
        query.periodKey = { $gte: startPeriod, $lte: endPeriod }
      } else if (periodType === 'yearly') {
        // For yearly, just filter by year
        query.periodKey = {
          $gte: startDate.getFullYear().toString(),
          $lte: endDate.getFullYear().toString(),
        }
      } else {
        // Fallback to traditional date range filtering
        query.periodStart = { $gte: startDate }
        query.periodEnd = { $lte: endDate }
      }
    }
  }

  // Get stats from DashboardStats collection
  let stats = await DashboardStats.find(query).lean()

  // Sort chronologically based on periodType
  if (stats.length > 0) {
    stats = stats.sort((a, b) => {
      // For daily, monthly, quarterly, yearly - sort by periodKey
      if (periodType === 'daily') {
        // Daily format is YYYY-MM-DD
        return a.periodKey.localeCompare(b.periodKey)
      } else if (periodType === 'monthly') {
        // Monthly format is YYYY-MM
        return a.periodKey.localeCompare(b.periodKey)
      } else if (periodType === 'quarterly') {
        // Quarterly format is YYYY-Q#
        const [aYear, aQuarter] = a.periodKey.split('-Q')
        const [bYear, bQuarter] = b.periodKey.split('-Q')
        return aYear !== bYear
          ? Number(aYear) - Number(bYear)
          : Number(aQuarter) - Number(bQuarter)
      } else if (periodType === 'yearly') {
        // Yearly format is just YYYY
        return parseInt(a.periodKey) - parseInt(b.periodKey)
      }

      // Fallback to periodStart if we have it
      if (a.periodStart && b.periodStart) {
        return (
          new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
        )
      }

      return 0
    })
  }

  // Format the results to match the dynamic aggregation format
  return stats.map((item) => ({
    period: formatPeriodLabel(item.periodKey, periodType),
    periodKey: item.periodKey,
    periodType: item.periodType,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    ...item.stats,
    lastUpdated: item.lastUpdated,
  }))
}

/**
 * Request regeneration of dashboard statistics for a specific period
 */
export const regenerateStats = async (req: Request, res: Response) => {
  // Create a request-specific child logger
  const reqLogger = req.logger || logger.child({ operation: 'regenerateStats' })
  reqLogger.info('Starting dashboard stats regeneration', { body: req.body })

  try {
    const { periodType, year, quarter, date } = req.body
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    reqLogger.info('Tenant resolution', {
      tenantIdFromOrg,
      resolvedTenantId: tenantId,
    })

    if (!tenantId) {
      reqLogger.warn('Unauthorized attempt - tenant information not available')
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Tenant information not available',
      })
    }

    // The three aggregation paths return different shapes (daily returns a
    // status object, quarterly/yearly return DashboardStats documents), so the
    // result is read loosely for logging and passed through to the response.
    let result: unknown
    reqLogger.info('Processing by period type', { periodType })

    // Handle different period types
    switch (periodType) {
      case 'daily': {
        reqLogger.info('Daily regeneration requested', { date })
        if (!date) {
          reqLogger.warn('Missing required parameter: date')
          return res.status(400).json({
            success: false,
            message: 'Date is required for daily statistics regeneration',
          })
        }

        // Create a date object from the provided date
        const targetDate = new Date(date)
        if (isNaN(targetDate.getTime())) {
          reqLogger.warn('Invalid date format provided', {
            providedDate: date,
          })
          return res.status(400).json({
            success: false,
            message: 'Invalid date format',
          })
        }

        // Trigger recalculation of daily statistics for the specified date
        reqLogger.info('Calling refreshDailyAggregation', {
          tenantId,
          targetDate,
        })
        result = await refreshDailyAggregation(tenantId, targetDate)
        reqLogger.info('Daily regeneration result', {
          resultId: (result as { _id?: unknown })?._id,
        })
        break
      }

      case 'quarterly': {
        reqLogger.info('Quarterly regeneration requested', { year, quarter })
        if (!year || !quarter) {
          reqLogger.warn(
            'Missing required parameters for quarterly regeneration',
          )
          return res.status(400).json({
            success: false,
            message:
              'Year and quarter are required for quarterly statistics regeneration',
          })
        }

        // Parse year and quarter
        const parsedYear = parseInt(year)
        const parsedQuarter = parseInt(quarter)
        reqLogger.info('Parsed quarterly parameters', {
          parsedYear,
          parsedQuarter,
        })

        if (
          isNaN(parsedYear) ||
          isNaN(parsedQuarter) ||
          parsedQuarter < 1 ||
          parsedQuarter > 4
        ) {
          reqLogger.warn('Invalid quarterly parameters', {
            parsedYear,
            parsedQuarter,
          })
          return res.status(400).json({
            success: false,
            message:
              'Invalid year or quarter format. Year should be a valid number and quarter should be 1-4.',
          })
        }

        // Trigger quarterly aggregation
        reqLogger.info('Loading quarterlyAggregation function')
        const { quarterlyAggregation } =
          await import('../services/dashboardAggregation')

        reqLogger.info('Calling quarterlyAggregation', {
          tenantId,
          parsedYear,
          parsedQuarter,
        })
        result = await quarterlyAggregation(tenantId, parsedYear, parsedQuarter)
        reqLogger.info('Quarterly regeneration result', {
          resultId: (result as { _id?: unknown })?._id,
        })
        break
      }

      case 'yearly': {
        reqLogger.info('Yearly regeneration requested', { year })
        if (!year) {
          reqLogger.warn('Missing required year parameter')
          return res.status(400).json({
            success: false,
            message: 'Year is required for yearly statistics regeneration',
          })
        }

        // Parse year
        const yearValue = parseInt(year)
        reqLogger.info('Parsed year parameter', { yearValue })

        if (isNaN(yearValue)) {
          reqLogger.warn('Invalid year parameter', { year })
          return res.status(400).json({
            success: false,
            message: 'Invalid year format. Year should be a valid number.',
          })
        }

        // Trigger yearly aggregation
        reqLogger.info('Loading yearlyAggregation function')
        const { yearlyAggregation } =
          await import('../services/dashboardAggregation')

        reqLogger.info('Calling yearlyAggregation', { tenantId, yearValue })
        result = await yearlyAggregation(tenantId, yearValue)
        reqLogger.info('Yearly regeneration result', {
          resultId: (result as { _id?: unknown })?._id,
        })
        break
      }

      default:
        reqLogger.warn('Invalid period type provided', {
          providedType: periodType,
        })
        return res.status(400).json({
          success: false,
          message:
            "Invalid period type. Must be 'daily', 'quarterly', or 'yearly'.",
        })
    }

    reqLogger.info('Regeneration completed successfully', {
      periodType,
      resultId: (result as { _id?: unknown })?._id,
      hasStats: !!(result as { stats?: unknown })?.stats,
    })

    // Check if we got back expected results
    if (!result) {
      reqLogger.warn('No result returned from aggregation function')
    } else if (!(result as { stats?: unknown }).stats) {
      reqLogger.warn('Result returned but no stats data present', { result })
    }

    return res.json({
      success: true,
      message: `${
        periodType.charAt(0).toUpperCase() + periodType.slice(1)
      } statistics regeneration completed successfully`,
      result,
    })
  } catch (error) {
    reqLogger.error('Error regenerating statistics', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    return res.status(500).json({
      success: false,
      message: 'Failed to regenerate statistics',
      error: (error as Error).message,
    })
  }
}

/**
 * Get report templates for the current tenant
 */
export const getReportTemplates = async (req: Request, res: Response) => {
  try {
    // Resolve the tenant from req.organizationId (populated by `protect`), the
    // same source the other dashboard handlers use.
    const tenant = req.organizationId

    if (!tenant) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Tenant information not available',
      })
    }

    // This is a placeholder - we'll implement this fully when we add the ReportTemplate model
    return res.json({
      success: true,
      data: [], // Will be populated when we implement report templates
      message: 'Report template functionality coming soon',
    })
  } catch (error) {
    console.error('Error fetching report templates:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve report templates',
      error: (error as Error).message,
    })
  }
}

/**
 * Get default start date based on period type
 */
function getDefaultStartDate(periodType?: string): Date {
  const now = new Date()

  switch (periodType) {
    case 'daily':
      // Last 7 days
      return new Date(now.setDate(now.getDate() - 7))

    case 'monthly':
      // Last 6 months
      return new Date(now.setMonth(now.getMonth() - 6))

    case 'quarterly':
      // Last 4 quarters (1 year)
      return new Date(now.setFullYear(now.getFullYear() - 1))

    case 'yearly':
      // Last 5 years
      return new Date(now.setFullYear(now.getFullYear() - 5))

    default:
      // Default to last 30 days
      return new Date(now.setDate(now.getDate() - 30))
  }
}

/**
 * Determine appropriate grouping level based on date range
 */
function getGroupingLevel(
  periodType: string | undefined,
  startDate: Date,
  endDate: Date,
): string {
  // If periodType is explicitly specified, use that
  if (periodType) {
    switch (periodType) {
      case 'daily':
        return 'day'
      case 'monthly':
        return 'month'
      case 'quarterly':
        return 'quarter'
      case 'yearly':
        return 'year'
    }
  }

  // Calculate the difference in days
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  // Determine grouping based on range size
  if (diffDays <= 31) {
    return 'day'
  } else if (diffDays <= 365) {
    return 'month'
  } else if (diffDays <= 365 * 2) {
    return 'quarter'
  } else {
    return 'year'
  }
}

/**
 * Get date range for preset period identifiers
 */
function getPresetDateRange(preset: string): {
  startDate: Date | null
  endDate: Date | null
} {
  // Normalize preset to use our canonical format (with hyphens)
  const normalizedPreset = preset.includes('_')
    ? preset.replace(/_/g, '-')
    : preset
  console.log(
    `getPresetDateRange received: ${preset}, using: ${normalizedPreset}`,
  )

  const now = new Date()
  const today = new Date(now.setHours(23, 59, 59, 999))

  switch (normalizedPreset) {
    case PERIOD_PRESETS.LAST_MONTH: {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      return { startDate, endDate }
    }

    case PERIOD_PRESETS.LAST_THREE_MONTHS: {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      const endDate = today
      return { startDate, endDate }
    }

    case PERIOD_PRESETS.LAST_TWELVE_MONTHS: {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1)
      const endDate = today
      return { startDate, endDate }
    }

    case PERIOD_PRESETS.THIS_YEAR: {
      const startDate = new Date(now.getFullYear(), 0, 1)
      const endDate = today
      return { startDate, endDate }
    }

    case PERIOD_PRESETS.LAST_YEAR: {
      const startDate = new Date(now.getFullYear() - 1, 0, 1)
      const endDate = new Date(now.getFullYear() - 1, 11, 31)
      return { startDate, endDate }
    }

    // NOTE: the original referenced PERIOD_PRESETS.ALL_TIME, which does not
    // exist on the constant (it was `undefined`), so that case never matched
    // and "all-time" fell through to the null range below. Removed the dead
    // case to keep behavior identical while compiling.

    default:
      return { startDate: null, endDate: null }
  }
}

/**
 * Format period label for display
 */
function formatPeriodLabel(periodKey: string, periodType?: string): string {
  switch (periodType) {
    case 'daily':
      return periodKey // Already in YYYY-MM-DD format

    case 'monthly': {
      const [year, month] = periodKey.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return date.toLocaleString('default', { month: 'long', year: 'numeric' })
    }

    case 'quarterly': {
      const [year, quarter] = periodKey.split('-Q')
      return `Q${quarter} ${year}`
    }

    case 'yearly':
      return periodKey // Already just the year

    default:
      return periodKey
  }
}
