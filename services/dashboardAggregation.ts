import schedule from 'node-schedule'

import DashboardStats from '../models/DashboardStats'
import Expense from '../models/Expense'
import Invoice from '../models/Invoice'
import Organization from '../models/Organization'
import { createServiceLogger } from '../services/logger/utils'

// Create a service-specific logger
const logger = createServiceLogger('dashboardAggregation')

interface StatsAccumulator {
  totalRevenue: number
  paidRevenue: number
  invoiceCount: number
  totalExpenses: number
  expenseCount: number
  netProfit: number
  revenueByClient: Record<string, number>
  expensesByCategory: Record<string, number>
  taxCollected: number
  taxPaid: number
}

interface PeriodId {
  year: number
  month?: number
  day?: number
  quarter?: number
}

/**
 * Aggregation Service for Dashboard Statistics
 * Implements the three-tier aggregation strategy:
 * 1. Pre-calculated daily stats (background jobs)
 * 2. Cascading aggregation for monthly/quarterly/yearly (from daily stats)
 * 3. On-demand dynamic aggregation for custom date ranges
 */

/**
 * Aggregates daily financial statistics for a specific tenant and date
 */
async function dailyAggregation(tenantId: string, date: Date) {
  logger.info('Starting daily aggregation', {
    tenantId,
    date: date.toISOString(),
  })

  // Format period key (YYYY-MM-DD)
  const periodKey = date.toISOString().split('T')[0]

  // Build the match window from the UTC periodKey, not the server's local
  // timezone (Date#setHours operates in local time, which would shift this
  // window away from the day periodKey actually names).
  const startOfDay = new Date(`${periodKey}T00:00:00.000Z`)
  const endOfDay = new Date(`${periodKey}T23:59:59.999Z`)
  logger.info('Calculated period range', {
    periodKey,
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString(),
  })

  // Aggregate invoices for the day
  logger.info('Querying invoices', {
    tenantId,
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString(),
  })
  let invoiceStats = []
  try {
    invoiceStats = await Invoice.aggregate([
      {
        $match: {
          tenantId: tenantId, // Already a string
          invoiceDate: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$priceIncludingTax' },
          paidRevenue: {
            $sum: {
              $cond: [{ $eq: ['$state', 'Betaald'] }, '$priceIncludingTax', 0],
            },
          },
          invoiceCount: { $sum: 1 },
          // Group revenue by client
          revenueByClient: {
            $push: {
              contactId: '$contactId',
              contactName: '$contactName',
              amount: '$priceIncludingTax',
            },
          },
          // Sum tax amounts
          taxCollected: { $sum: { $add: ['$tax', '$taxLow', '$taxLowest'] } },
        },
      },
    ])
    logger.info('Invoice aggregation results', { count: invoiceStats.length })
  } catch (error) {
    logger.error('Error in invoice aggregation', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
  }

  // Aggregate expenses for the day
  logger.info('Querying expenses', {
    tenantId,
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString(),
  })
  let expenseStats = []
  try {
    expenseStats = await Expense.aggregate([
      {
        $match: {
          tenantId: tenantId, // Already a string
          expenseDate: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$price' },
          expenseCount: { $sum: 1 },
          // Calculate tax paid
          taxPaid: { $sum: { $add: ['$tax', '$taxLow'] } },
        },
      },
    ])
    logger.info('Expense aggregation results', { count: expenseStats.length })
  } catch (error) {
    logger.error('Error in expense aggregation', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
  }

  // Process client revenue data into a map
  logger.info('Processing revenue by client')
  const revenueByClient: Record<string, number> = {}
  if (invoiceStats[0]?.revenueByClient) {
    logger.info('Revenue by client data structure', {
      revenueByClientSample: invoiceStats[0].revenueByClient.slice(0, 2),
    })

    invoiceStats[0].revenueByClient.forEach(
      (item: { contactId?: string; amount?: number }) => {
        if (
          item.contactId &&
          typeof item.amount === 'number' &&
          !isNaN(item.amount)
        ) {
          revenueByClient[item.contactId] =
            (revenueByClient[item.contactId] || 0) + item.amount
        } else {
          logger.warn('Invalid revenue item found', {
            contactId: item.contactId,
            amount: item.amount,
            type: typeof item.amount,
          })
        }
      },
    )
  }

  // Log the actual stats data
  logger.info('Raw aggregation results', {
    invoiceStatsFirstRow: invoiceStats[0] || 'No invoice stats',
    expenseStatsFirstRow: expenseStats[0] || 'No expense stats',
  })

  // Process expenses by category
  logger.info('Processing expenses by category')
  const expensesByCategory: Record<string, number> = {}

  // Query raw expenses to get categories
  try {
    const dayExpenses = await Expense.find({
      tenantId: tenantId,
      expenseDate: { $gte: startOfDay, $lte: endOfDay },
    }).lean()

    // Group expenses by category (category is not a schema field; defensive)
    dayExpenses.forEach((expense) => {
      const category =
        (expense as { category?: string }).category || 'Uncategorized'
      expensesByCategory[category] =
        (expensesByCategory[category] || 0) + (expense.price || 0)
    })

    logger.info('Expense categories processed', {
      expenseCount: dayExpenses.length,
      categoryCount: Object.keys(expensesByCategory).length,
    })
  } catch (error) {
    logger.error('Error processing expense categories', {
      error: (error as Error).message,
    })
  }

  // Combine stats into a single object
  const combinedStats: StatsAccumulator = {
    totalRevenue: invoiceStats[0]?.totalRevenue || 0,
    paidRevenue: invoiceStats[0]?.paidRevenue || 0,
    invoiceCount: invoiceStats[0]?.invoiceCount || 0,
    totalExpenses: expenseStats[0]?.totalExpenses || 0,
    expenseCount: expenseStats[0]?.expenseCount || 0,
    netProfit:
      (invoiceStats[0]?.totalRevenue || 0) -
      (expenseStats[0]?.totalExpenses || 0),
    revenueByClient:
      Object.keys(revenueByClient).length > 0 ? revenueByClient : {},
    expensesByCategory:
      Object.keys(expensesByCategory).length > 0 ? expensesByCategory : {},
    taxCollected: invoiceStats[0]?.taxCollected || 0,
    taxPaid: expenseStats[0]?.taxPaid || 0,
  }

  logger.info('Combined stats to save', {
    totalRevenue: combinedStats.totalRevenue,
    invoiceCount: combinedStats.invoiceCount,
    totalExpenses: combinedStats.totalExpenses,
    clientCount: Object.keys(revenueByClient).length,
  })

  // Store in DashboardStats collection
  logger.info('Saving to DashboardStats', {
    tenantId,
    periodType: 'daily',
    periodKey,
    stats: {
      totalRevenue: combinedStats.totalRevenue,
      totalExpenses: combinedStats.totalExpenses,
      netProfit: combinedStats.netProfit,
    },
  })

  try {
    const result = await DashboardStats.updateStats(
      tenantId,
      'daily',
      periodKey,
      combinedStats,
    )

    logger.info('Successfully saved daily stats', {
      resultId: result?._id,
      hasStats: !!result?.stats,
    })

    return result
  } catch (error) {
    logger.error('Failed to save daily stats', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error // Rethrow to be caught by the calling function
  }
}

/**
 * Aggregates monthly financial statistics by combining daily stats
 */
async function monthlyAggregation(
  tenantId: string,
  year: number,
  month: number,
) {
  // Format period key (YYYY-MM)
  const periodKey = `${year}-${month.toString().padStart(2, '0')}`
  const yearMonth = `${year}-${month.toString().padStart(2, '0')}`

  // Match daily keys like 2024-07-15 belonging to this year-month
  const regexPattern = `^${yearMonth}-\\d{2}$`

  const dailyStats = await DashboardStats.find({
    tenantId,
    periodType: 'daily',
    periodKey: new RegExp(regexPattern),
  }).lean()

  // Initialize accumulators
  const monthStats: StatsAccumulator = {
    totalRevenue: 0,
    paidRevenue: 0,
    invoiceCount: 0,
    totalExpenses: 0,
    expenseCount: 0,
    netProfit: 0,
    revenueByClient: {},
    expensesByCategory: {},
    taxCollected: 0,
    taxPaid: 0,
  }

  // Aggregate from daily stats
  dailyStats.forEach((day) => {
    monthStats.totalRevenue += day.stats.totalRevenue || 0
    monthStats.paidRevenue += day.stats.paidRevenue || 0
    monthStats.invoiceCount += day.stats.invoiceCount || 0
    monthStats.totalExpenses += day.stats.totalExpenses || 0
    monthStats.expenseCount += day.stats.expenseCount || 0
    monthStats.taxCollected += day.stats.taxCollected || 0
    monthStats.taxPaid += day.stats.taxPaid || 0

    // Merge revenue by client
    if (day.stats.revenueByClient) {
      for (const [clientId, amount] of Object.entries(
        day.stats.revenueByClient,
      )) {
        monthStats.revenueByClient[clientId] =
          (monthStats.revenueByClient[clientId] || 0) + amount
      }
    }

    // Merge expenses by category
    if (day.stats.expensesByCategory) {
      for (const [category, amount] of Object.entries(
        day.stats.expensesByCategory,
      )) {
        monthStats.expensesByCategory[category] =
          (monthStats.expensesByCategory[category] || 0) + amount
      }
    }
  })

  // Calculate net profit
  monthStats.netProfit = monthStats.totalRevenue - monthStats.totalExpenses

  // Store monthly aggregation
  return DashboardStats.updateStats(tenantId, 'monthly', periodKey, monthStats)
}

/**
 * Aggregates quarterly financial statistics by combining monthly stats
 */
async function quarterlyAggregation(
  tenantId: string,
  year: number,
  quarter: number,
) {
  // Calculate start and end month (1-indexed) for this quarter
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2

  // Create period key in format YYYY-QX (e.g., "2024-Q1")
  const periodKey = `${year}-Q${quarter}`

  // Get the months that belong to this quarter (1-indexed)
  const monthsInQuarter: string[] = []
  for (let m = startMonth; m <= endMonth; m++) {
    monthsInQuarter.push(`${year}-${m.toString().padStart(2, '0')}`)
  }

  const monthlyStats = await DashboardStats.find({
    tenantId,
    periodType: 'monthly',
    periodKey: { $in: monthsInQuarter },
  }).lean()

  const quarterStats: StatsAccumulator = {
    totalRevenue: 0,
    paidRevenue: 0,
    invoiceCount: 0,
    totalExpenses: 0,
    expenseCount: 0,
    netProfit: 0,
    revenueByClient: {},
    expensesByCategory: {},
    taxCollected: 0,
    taxPaid: 0,
  }

  // Combine monthly stats
  monthlyStats.forEach((month) => {
    quarterStats.totalRevenue += month.stats.totalRevenue || 0
    quarterStats.paidRevenue += month.stats.paidRevenue || 0
    quarterStats.invoiceCount += month.stats.invoiceCount || 0
    quarterStats.totalExpenses += month.stats.totalExpenses || 0
    quarterStats.expenseCount += month.stats.expenseCount || 0
    quarterStats.taxCollected += month.stats.taxCollected || 0
    quarterStats.taxPaid += month.stats.taxPaid || 0

    if (month.stats.revenueByClient) {
      for (const [clientId, amount] of Object.entries(
        month.stats.revenueByClient,
      )) {
        quarterStats.revenueByClient[clientId] =
          (quarterStats.revenueByClient[clientId] || 0) + amount
      }
    }

    if (month.stats.expensesByCategory) {
      for (const [category, amount] of Object.entries(
        month.stats.expensesByCategory,
      )) {
        quarterStats.expensesByCategory[category] =
          (quarterStats.expensesByCategory[category] || 0) + amount
      }
    }
  })

  // Calculate net profit
  quarterStats.netProfit =
    quarterStats.totalRevenue - quarterStats.totalExpenses

  // Store quarterly aggregation
  return DashboardStats.updateStats(
    tenantId,
    'quarterly',
    periodKey,
    quarterStats,
  )
}

/**
 * Aggregates yearly financial statistics by combining quarterly stats
 */
async function yearlyAggregation(tenantId: string, year: number) {
  // Format period key (YYYY)
  const periodKey = year.toString()

  // Create an array of quarterly periodKeys for this year
  const quarterlyKeys = [1, 2, 3, 4].map((q) => `${year}-Q${q}`)

  const quarterlyStats = await DashboardStats.find({
    tenantId,
    periodType: 'quarterly',
    periodKey: { $in: quarterlyKeys },
  }).lean()

  const yearStats: StatsAccumulator = {
    totalRevenue: 0,
    paidRevenue: 0,
    invoiceCount: 0,
    totalExpenses: 0,
    expenseCount: 0,
    netProfit: 0,
    revenueByClient: {},
    expensesByCategory: {},
    taxCollected: 0,
    taxPaid: 0,
  }

  // Combine quarterly stats
  quarterlyStats.forEach((quarter) => {
    yearStats.totalRevenue += quarter.stats.totalRevenue || 0
    yearStats.paidRevenue += quarter.stats.paidRevenue || 0
    yearStats.invoiceCount += quarter.stats.invoiceCount || 0
    yearStats.totalExpenses += quarter.stats.totalExpenses || 0
    yearStats.expenseCount += quarter.stats.expenseCount || 0
    yearStats.taxCollected += quarter.stats.taxCollected || 0
    yearStats.taxPaid += quarter.stats.taxPaid || 0

    if (quarter.stats.revenueByClient) {
      for (const [clientId, amount] of Object.entries(
        quarter.stats.revenueByClient,
      )) {
        yearStats.revenueByClient[clientId] =
          (yearStats.revenueByClient[clientId] || 0) + amount
      }
    }

    if (quarter.stats.expensesByCategory) {
      for (const [category, amount] of Object.entries(
        quarter.stats.expensesByCategory,
      )) {
        yearStats.expensesByCategory[category] =
          (yearStats.expensesByCategory[category] || 0) + amount
      }
    }
  })

  // Calculate net profit
  yearStats.netProfit = yearStats.totalRevenue - yearStats.totalExpenses

  // Store yearly aggregation
  return DashboardStats.updateStats(tenantId, 'yearly', periodKey, yearStats)
}

/**
 * Refreshes daily aggregation for a specific date (used after data changes)
 */
async function refreshDailyAggregation(tenantId: string, date: Date) {
  logger.info('Starting refresh of daily aggregation', {
    tenantId,
    date: date.toISOString(),
  })
  try {
    const dailyResult = await dailyAggregation(tenantId, date)
    logger.info('Daily aggregation completed', { resultId: dailyResult?._id })

    // Get month and year to cascade updates
    const year = date.getFullYear()
    const month = date.getMonth() + 1 // 0-indexed to 1-indexed
    const quarter = Math.ceil(month / 3)
    logger.info('Calculated period info for cascading updates', {
      year,
      month,
      quarter,
    })

    // Cascade updates to higher time periods
    logger.info('Starting monthly aggregation', { year, month })
    const monthlyResult = await monthlyAggregation(tenantId, year, month)
    logger.info('Monthly aggregation completed', {
      resultId: monthlyResult?._id,
    })

    logger.info('Starting quarterly aggregation', { year, quarter })
    const quarterlyResult = await quarterlyAggregation(tenantId, year, quarter)
    logger.info('Quarterly aggregation completed', {
      resultId: quarterlyResult?._id,
    })

    logger.info('Starting yearly aggregation', { year })
    const yearlyResult = await yearlyAggregation(tenantId, year)
    logger.info('Yearly aggregation completed', {
      resultId: yearlyResult?._id,
    })

    logger.info('All aggregation steps completed successfully')
    return {
      success: true,
      dailyId: dailyResult?._id,
      monthlyId: monthlyResult?._id,
      quarterlyId: quarterlyResult?._id,
      yearlyId: yearlyResult?._id,
    }
  } catch (err) {
    logger.error('Failed to refresh aggregation', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    })
    return { success: false, error: (err as Error).message }
  }
}

/**
 * Performs dynamic aggregation for custom date ranges
 */
async function dynamicAggregation(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  groupBy = 'day',
) {
  // Format for MongoDB date grouping
  let dateFormat
  let sortStage: Record<string, 1 | -1> = {}

  switch (groupBy) {
    case 'day':
      dateFormat = {
        year: { $year: '$invoiceDate' },
        month: { $month: '$invoiceDate' },
        day: { $dayOfMonth: '$invoiceDate' },
      }
      sortStage = { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      break
    case 'month':
      dateFormat = {
        year: { $year: '$invoiceDate' },
        month: { $month: '$invoiceDate' },
      }
      sortStage = { '_id.year': 1, '_id.month': 1 }
      break
    case 'quarter':
      dateFormat = {
        year: { $year: '$invoiceDate' },
        quarter: { $ceil: { $divide: [{ $month: '$invoiceDate' }, 3] } },
      }
      sortStage = { '_id.year': 1, '_id.quarter': 1 }
      break
    case 'year':
      dateFormat = {
        year: { $year: '$invoiceDate' },
      }
      sortStage = { '_id.year': 1 }
      break
  }

  // Revenue aggregation pipeline
  const revenuePipeline = [
    {
      $match: {
        tenantId: tenantId, // Already a string
        invoiceDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: dateFormat,
        totalRevenue: { $sum: '$price' },
        paidRevenue: {
          $sum: {
            $cond: [{ $eq: ['$state', 'Betaald'] }, '$price', 0],
          },
        },
        invoiceCount: { $sum: 1 },
        taxCollected: { $sum: { $add: ['$tax', '$taxLow', '$taxLowest'] } },
      },
    },
    {
      $sort: sortStage,
    },
  ]

  // Expense aggregation pipeline (adjust field names for expense collection)
  const expensePipeline = [
    {
      $match: {
        tenantId: tenantId, // Already a string
        expenseDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id:
          groupBy === 'day'
            ? {
                year: { $year: '$expenseDate' },
                month: { $month: '$expenseDate' },
                day: { $dayOfMonth: '$expenseDate' },
              }
            : groupBy === 'month'
              ? {
                  year: { $year: '$expenseDate' },
                  month: { $month: '$expenseDate' },
                }
              : groupBy === 'quarter'
                ? {
                    year: { $year: '$expenseDate' },
                    quarter: {
                      $ceil: { $divide: [{ $month: '$expenseDate' }, 3] },
                    },
                  }
                : { year: { $year: '$expenseDate' } },
        totalExpenses: { $sum: '$price' },
        expenseCount: { $sum: 1 },
        taxPaid: { $sum: { $add: ['$tax', '$taxLow'] } },
      },
    },
    {
      $sort: sortStage,
    },
  ]

  try {
    // Run aggregations in parallel
    const [revenueResults, expenseResults] = await Promise.all([
      Invoice.aggregate(revenuePipeline),
      Expense.aggregate(expensePipeline),
    ])

    // Merge revenue and expense results by period
    const mergedResults = mergeAggregationResults(
      revenueResults,
      expenseResults,
      groupBy,
    )

    return mergedResults
  } catch (err) {
    console.error('Dynamic aggregation error:', err)
    throw err
  }
}

interface MergedPeriodResult {
  period: string
  periodKey: string
  periodType: string
  totalRevenue: number
  paidRevenue: number
  invoiceCount: number
  taxCollected: number
  totalExpenses: number
  expenseCount: number
  taxPaid: number
  netProfit: number
}

/**
 * Helper function to merge revenue and expense aggregation results
 */
function mergeAggregationResults(
  revenueResults: { _id: PeriodId; [key: string]: unknown }[],
  expenseResults: { _id: PeriodId; [key: string]: unknown }[],
  groupBy: string,
): MergedPeriodResult[] {
  const mergedMap = new Map<string, MergedPeriodResult>()

  // Create a map key based on the groupBy level. Month and day are zero-padded
  // so the localeCompare sort below is chronological (e.g. "2026-02" before
  // "2026-11") and the key matches the persisted DashboardStats convention.
  const getMapKey = (idObj: PeriodId) => {
    if (groupBy === 'day')
      return `${idObj.year}-${idObj.month!.toString().padStart(2, '0')}-${idObj
        .day!.toString()
        .padStart(2, '0')}`
    if (groupBy === 'month')
      return `${idObj.year}-${idObj.month!.toString().padStart(2, '0')}`
    if (groupBy === 'quarter') return `${idObj.year}-Q${idObj.quarter}`
    return `${idObj.year}`
  }

  // Process revenue results
  revenueResults.forEach((item) => {
    const key = getMapKey(item._id)
    mergedMap.set(key, {
      period: formatPeriodLabel(item._id, groupBy),
      periodKey: key,
      periodType: groupBy,
      totalRevenue: (item.totalRevenue as number) || 0,
      paidRevenue: (item.paidRevenue as number) || 0,
      invoiceCount: (item.invoiceCount as number) || 0,
      taxCollected: (item.taxCollected as number) || 0,
      // Initialize expense fields
      totalExpenses: 0,
      expenseCount: 0,
      taxPaid: 0,
      // Calculate net values
      netProfit: (item.totalRevenue as number) || 0,
    })
  })

  // Merge expense results
  expenseResults.forEach((item) => {
    const key = getMapKey(item._id)

    const existing = mergedMap.get(key)
    if (existing) {
      // Update existing entry
      existing.totalExpenses = (item.totalExpenses as number) || 0
      existing.expenseCount = (item.expenseCount as number) || 0
      existing.taxPaid = (item.taxPaid as number) || 0
      existing.netProfit =
        existing.totalRevenue - ((item.totalExpenses as number) || 0)
    } else {
      // Create new entry with only expense data
      mergedMap.set(key, {
        period: formatPeriodLabel(item._id, groupBy),
        periodKey: key,
        periodType: groupBy,
        totalRevenue: 0,
        paidRevenue: 0,
        invoiceCount: 0,
        taxCollected: 0,
        totalExpenses: (item.totalExpenses as number) || 0,
        expenseCount: (item.expenseCount as number) || 0,
        taxPaid: (item.taxPaid as number) || 0,
        netProfit: -((item.totalExpenses as number) || 0),
      })
    }
  })

  // Convert map back to array and sort by period
  return Array.from(mergedMap.values()).sort((a, b) => {
    return a.periodKey.localeCompare(b.periodKey)
  })
}

/**
 * Helper function to format period labels
 */
function formatPeriodLabel(idObj: PeriodId, groupBy: string): string {
  if (groupBy === 'day') {
    return `${idObj.year}-${idObj.month!.toString().padStart(2, '0')}-${idObj
      .day!.toString()
      .padStart(2, '0')}`
  }
  if (groupBy === 'month') {
    return `${idObj.year}-${idObj.month!.toString().padStart(2, '0')}`
  }
  if (groupBy === 'quarter') {
    return `${idObj.year} Q${idObj.quarter}`
  }
  return idObj.year.toString()
}

/**
 * Setup background jobs for periodic aggregation
 */
function setupScheduledJobs() {
  // Schedule daily aggregation at 1 AM
  schedule.scheduleJob('0 1 * * *', async () => {
    console.log('Running daily aggregation job')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    try {
      const tenants = await Organization.find({}, '_id')

      for (const tenant of tenants) {
        try {
          const tenantId = tenant._id.toString()
          await dailyAggregation(tenantId, yesterday)
          console.log(`Daily aggregation completed for tenant ${tenantId}`)
        } catch (error) {
          console.error(
            `Error in daily aggregation for tenant ${tenant._id.toString()}:`,
            error,
          )
        }
      }
    } catch (err) {
      console.error('Failed to run scheduled daily aggregation:', err)
    }
  })

  // Schedule monthly aggregation on the 1st of each month at 2 AM
  schedule.scheduleJob('0 2 1 * *', async () => {
    console.log('Running monthly aggregation job')
    const lastMonth = new Date()
    lastMonth.setDate(0) // Go to last day of previous month

    const year = lastMonth.getFullYear()
    const month = lastMonth.getMonth() + 1 // 0-indexed to 1-indexed

    try {
      const tenants = await Organization.find({}, '_id')

      for (const tenant of tenants) {
        try {
          const tenantId = tenant._id.toString()
          await monthlyAggregation(tenantId, year, month)
          console.log(`Monthly aggregation completed for tenant ${tenantId}`)
        } catch (error) {
          console.error(
            `Error in monthly aggregation for tenant ${tenant._id.toString()}:`,
            error,
          )
        }
      }
    } catch (err) {
      console.error('Failed to run scheduled monthly aggregation:', err)
    }
  })

  // Schedule quarterly aggregation on the 1st of Jan, Apr, Jul, Oct at 3 AM
  schedule.scheduleJob('0 3 1 1,4,7,10 *', async () => {
    console.log('Running quarterly aggregation job')
    const now = new Date()
    const lastQuarter = new Date(now)

    // Set to previous quarter
    if (now.getMonth() < 3) {
      // Jan-Mar, so previous quarter is Q4 of previous year
      lastQuarter.setFullYear(now.getFullYear() - 1)
      lastQuarter.setMonth(10) // November
    } else {
      // Previous quarter is in same year
      lastQuarter.setMonth(now.getMonth() - 3)
    }

    const year = lastQuarter.getFullYear()
    const quarter = Math.ceil((lastQuarter.getMonth() + 1) / 3)

    try {
      const tenants = await Organization.find({}, '_id')

      for (const tenant of tenants) {
        try {
          const tenantId = tenant._id.toString()
          await quarterlyAggregation(tenantId, year, quarter)
          console.log(`Quarterly aggregation completed for tenant ${tenantId}`)
        } catch (error) {
          console.error(
            `Error in quarterly aggregation for tenant ${tenant._id.toString()}:`,
            error,
          )
        }
      }
    } catch (err) {
      console.error('Failed to run scheduled quarterly aggregation:', err)
    }
  })

  // Schedule yearly aggregation on January 2nd at 4 AM
  schedule.scheduleJob('0 4 2 1 *', async () => {
    console.log('Running yearly aggregation job')
    const lastYear = new Date().getFullYear() - 1

    try {
      const tenants = await Organization.find({}, '_id')

      for (const tenant of tenants) {
        try {
          const tenantId = tenant._id.toString()
          await yearlyAggregation(tenantId, lastYear)
          console.log(`Yearly aggregation completed for tenant ${tenantId}`)
        } catch (error) {
          console.error(
            `Error in yearly aggregation for tenant ${tenant._id.toString()}:`,
            error,
          )
        }
      }
    } catch (err) {
      console.error('Failed to run scheduled yearly aggregation:', err)
    }
  })

  console.log('Dashboard aggregation scheduled jobs have been set up')
}

/**
 * Refresh all days in a month that have invoice/expense data.
 * Ensures monthly aggregation is complete even if only one invoice changes.
 */
async function refreshMonthFromRawData(
  tenantId: string,
  year: number,
  month: number,
) {
  logger.info(`Refreshing entire month ${year}-${month} from raw data`, {
    tenantId,
  })

  // Get start and end of month in UTC, to match the UTC periodKey scheme
  // dailyAggregation/monthlyAggregation use (a local-time window here would
  // select raw docs into a different month than their periodKey ends up in).
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  // Find all unique dates with invoices or expenses in this month, plus any
  // day that already has a daily stats doc for this month (so a day whose
  // raw data has since moved away gets re-aggregated down to zero, instead
  // of leaving a stale doc that monthlyAggregation keeps summing forever).
  const monthPeriodKeyPrefix = `${year}-${month.toString().padStart(2, '0')}`
  const [invoices, expenses, existingDailyDocs] = await Promise.all([
    Invoice.find({
      tenantId,
      invoiceDate: { $gte: startDate, $lte: endDate },
    })
      .select('invoiceDate')
      .lean(),
    Expense.find({
      tenantId,
      expenseDate: { $gte: startDate, $lte: endDate },
    })
      .select('expenseDate')
      .lean(),
    DashboardStats.find({
      tenantId,
      periodType: 'daily',
      periodKey: new RegExp(`^${monthPeriodKeyPrefix}-\\d{2}$`),
    })
      .select('periodKey')
      .lean(),
  ])

  // Get unique dates
  const uniqueDates = new Set<string>()
  invoices.forEach((inv) => {
    const date = new Date(inv.invoiceDate)
    uniqueDates.add(date.toISOString().split('T')[0])
  })
  expenses.forEach((exp) => {
    const date = new Date(exp.expenseDate)
    uniqueDates.add(date.toISOString().split('T')[0])
  })
  existingDailyDocs.forEach((doc) => uniqueDates.add(doc.periodKey))

  logger.info(
    `Found ${uniqueDates.size} unique dates with data in ${year}-${month}`,
  )

  // Refresh each date
  for (const dateStr of uniqueDates) {
    const date = new Date(dateStr)
    await dailyAggregation(tenantId, date)
  }

  // Now aggregate monthly (which will sum all the daily stats we just created)
  const monthlyResult = await monthlyAggregation(tenantId, year, month)

  // Cascade to quarterly and yearly
  const quarter = Math.ceil(month / 3)
  await quarterlyAggregation(tenantId, year, quarter)
  await yearlyAggregation(tenantId, year)

  logger.info(
    `Successfully refreshed month ${year}-${month} with ${uniqueDates.size} days`,
  )

  return {
    success: true,
    datesRefreshed: Array.from(uniqueDates),
    monthlyId: monthlyResult?._id,
  }
}

// Export service functions
export {
  dailyAggregation,
  monthlyAggregation,
  quarterlyAggregation,
  yearlyAggregation,
  refreshDailyAggregation,
  refreshMonthFromRawData,
  dynamicAggregation,
  setupScheduledJobs,
  // Exported for unit testing (Phase 3 pure-helper coverage)
  mergeAggregationResults,
  formatPeriodLabel,
}
