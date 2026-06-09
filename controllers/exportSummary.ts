import { Request, Response } from 'express'
import { Parser } from 'json2csv'
import * as xlsx from 'xlsx'

import { getCurrentTenantId } from '../middleware/tenantHelper'
import Expense from '../models/Expense'
import Invoice from '../models/Invoice'
import { getLogger } from '../services/logger'

const logger = getLogger()

/**
 * Controller for financial summary exports
 * Creates quarterly and yearly summaries for tax returns
 */

/**
 * Generate yearly financial summary with quarterly breakdown
 */
export const generateFinancialSummary = async (req: Request, res: Response) => {
  try {
    const { year, format = 'csv' } = req.query
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    logger.info(
      `Generating financial summary for tenant ${tenantId} for year ${year} in ${format} format`,
    )

    // Validate parameters
    if (!year) {
      return res.status(400).json({
        success: false,
        message: 'Jaar is verplicht',
      })
    }

    // Parse year and validate
    const parsedYear = parseInt(year as string, 10)
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Ongeldig jaar',
      })
    }

    // Define date ranges for each quarter
    const quarters = [
      {
        name: 'Q1',
        start: new Date(`${parsedYear}-01-01`),
        end: new Date(`${parsedYear}-03-31T23:59:59.999Z`),
      },
      {
        name: 'Q2',
        start: new Date(`${parsedYear}-04-01`),
        end: new Date(`${parsedYear}-06-30T23:59:59.999Z`),
      },
      {
        name: 'Q3',
        start: new Date(`${parsedYear}-07-01`),
        end: new Date(`${parsedYear}-09-30T23:59:59.999Z`),
      },
      {
        name: 'Q4',
        start: new Date(`${parsedYear}-10-01`),
        end: new Date(`${parsedYear}-12-31T23:59:59.999Z`),
      },
    ]

    // Function to format currency for Dutch locale with exactly two decimals
    const formatCurrency = (value: number) => {
      // Format with two decimals and use Dutch locale formatting
      return Number(value).toLocaleString('nl-NL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }

    // Calculate data for each quarter
    const summaryData = await Promise.all(
      quarters.map(async (quarter) => {
        logger.info(
          `Processing quarter ${
            quarter.name
          } from ${quarter.start.toISOString()} to ${quarter.end.toISOString()}`,
        )

        // Calculate invoices (revenue) for the quarter
        const invoices = await Invoice.find({
          tenantId,
          invoiceDate: { $gte: quarter.start, $lte: quarter.end },
        }).lean()

        logger.info(
          `Found ${invoices.length} invoices for quarter ${quarter.name}`,
        )

        const paidInvoices = invoices.filter((inv) => inv.state === 'Betaald')
        const unpaidInvoices = invoices.filter((inv) => inv.state !== 'Betaald')

        const totalRevenue = invoices.reduce(
          (sum, inv) => sum + (inv.price || 0),
          0,
        )
        const paidRevenue = paidInvoices.reduce(
          (sum, inv) => sum + (inv.price || 0),
          0,
        )
        const unpaidRevenue = unpaidInvoices.reduce(
          (sum, inv) => sum + (inv.price || 0),
          0,
        )

        // Calculate expenses for the quarter using aggregation (same as dashboard calculation)
        const expenseStats = await Expense.aggregate([
          {
            $match: {
              tenantId: tenantId, // Using same variable format as dashboard
              expenseDate: { $gte: quarter.start, $lte: quarter.end },
            },
          },
          {
            $group: {
              _id: null,
              totalExpenses: { $sum: '$price' }, // Using same aggregation as dashboard
              expenseCount: { $sum: 1 },
            },
          },
        ])

        // Extract expense total and count (safely handling empty results)
        const totalExpenses = expenseStats[0]?.totalExpenses || 0
        const expenseCount = expenseStats[0]?.expenseCount || 0

        logger.info(
          `Found ${expenseCount} expenses for quarter ${quarter.name}`,
        )

        // Calculate margin
        const margin = totalRevenue - totalExpenses

        // Log the quarter summary
        logger.info(
          `Quarter ${quarter.name} summary: Revenue=${totalRevenue}, Expenses=${totalExpenses}, Margin=${margin}`,
        )

        return {
          quarter: quarter.name,
          nettoInkomsten: totalRevenue,
          betaaldeFacturen: paidRevenue,
          onbetaaldeFacturen: unpaidRevenue,
          nettoOnkosten: totalExpenses,
          betaaldeOnkosten: totalExpenses, // Assuming all expenses are paid
          onbetaaldeOnkosten: 0, // Assuming all expenses are paid
          marge: margin,
        }
      }),
    )

    // Calculate yearly totals from the quarterly data (more accurate than potentially stale aggregates)
    // This ensures we're using the most up-to-date data directly from invoices and expenses
    const yearTotals = {
      nettoInkomsten: summaryData.reduce((sum, q) => sum + q.nettoInkomsten, 0),
      betaaldeFacturen: summaryData.reduce(
        (sum, q) => sum + q.betaaldeFacturen,
        0,
      ),
      onbetaaldeFacturen: summaryData.reduce(
        (sum, q) => sum + q.onbetaaldeFacturen,
        0,
      ),
      nettoOnkosten: summaryData.reduce((sum, q) => sum + q.nettoOnkosten, 0),
      betaaldeOnkosten: summaryData.reduce(
        (sum, q) => sum + q.betaaldeOnkosten,
        0,
      ),
      onbetaaldeOnkosten: summaryData.reduce(
        (sum, q) => sum + q.onbetaaldeOnkosten,
        0,
      ),
      marge: summaryData.reduce((sum, q) => sum + q.marge, 0),
    }

    // Log the yearly totals for debugging
    logger.info(
      `Yearly totals for ${parsedYear}: Revenue=${yearTotals.nettoInkomsten}, Expenses=${yearTotals.nettoOnkosten}, Margin=${yearTotals.marge}`,
    )

    // Force recalculation of dashboard stats for the year and all quarters
    try {
      // Import the aggregation functions directly
      const { quarterlyAggregation, yearlyAggregation } =
        await import('../services/dashboardAggregation')

      // First, recalculate the yearly stats
      logger.info(`Forcing recalculation of yearly stats for ${parsedYear}`)
      await yearlyAggregation(tenantId, parsedYear)

      // Then recalculate all quarterly stats
      for (let quarterNum = 1; quarterNum <= 4; quarterNum++) {
        logger.info(
          `Forcing recalculation of quarterly stats for Q${quarterNum} ${parsedYear}`,
        )
        await quarterlyAggregation(tenantId, parsedYear, quarterNum)
      }

      logger.info(`Dashboard stats recalculation completed for ${parsedYear}`)
    } catch (error) {
      // Don't fail the export if the dashboard stats update fails
      logger.error(
        `Error forcing dashboard stats recalculation: ${(error as Error).message}`,
      )
    }

    // Add header rows for the export
    const exportHeader = [
      {
        'Inkomsten en onkosten': `Inkomsten en onkosten ${parsedYear}`,
      },
      {}, // Empty row for spacing
    ]

    // Format data for export - moving totals to last column instead of year column
    const exportData = [
      {
        Categorie: 'Netto Inkomsten',
        Q1: formatCurrency(summaryData[0].nettoInkomsten),
        Q2: formatCurrency(summaryData[1].nettoInkomsten),
        Q3: formatCurrency(summaryData[2].nettoInkomsten),
        Q4: formatCurrency(summaryData[3].nettoInkomsten),
        Totaal: formatCurrency(yearTotals.nettoInkomsten),
      },
      {
        Categorie: 'Betaalde facturen',
        Q1: formatCurrency(summaryData[0].betaaldeFacturen),
        Q2: formatCurrency(summaryData[1].betaaldeFacturen),
        Q3: formatCurrency(summaryData[2].betaaldeFacturen),
        Q4: formatCurrency(summaryData[3].betaaldeFacturen),
        Totaal: formatCurrency(yearTotals.betaaldeFacturen),
      },
      {
        Categorie: 'Onbetaalde facturen',
        Q1: formatCurrency(summaryData[0].onbetaaldeFacturen),
        Q2: formatCurrency(summaryData[1].onbetaaldeFacturen),
        Q3: formatCurrency(summaryData[2].onbetaaldeFacturen),
        Q4: formatCurrency(summaryData[3].onbetaaldeFacturen),
        Totaal: formatCurrency(yearTotals.onbetaaldeFacturen),
      },
      {
        Categorie: 'Netto Onkosten',
        Q1: formatCurrency(summaryData[0].nettoOnkosten),
        Q2: formatCurrency(summaryData[1].nettoOnkosten),
        Q3: formatCurrency(summaryData[2].nettoOnkosten),
        Q4: formatCurrency(summaryData[3].nettoOnkosten),
        Totaal: formatCurrency(yearTotals.nettoOnkosten),
      },
      {
        Categorie: 'Betaalde onkosten',
        Q1: formatCurrency(summaryData[0].betaaldeOnkosten),
        Q2: formatCurrency(summaryData[1].betaaldeOnkosten),
        Q3: formatCurrency(summaryData[2].betaaldeOnkosten),
        Q4: formatCurrency(summaryData[3].betaaldeOnkosten),
        Totaal: formatCurrency(yearTotals.betaaldeOnkosten),
      },
      {
        Categorie: 'Onbetaalde onkosten',
        Q1: formatCurrency(summaryData[0].onbetaaldeOnkosten),
        Q2: formatCurrency(summaryData[1].onbetaaldeOnkosten),
        Q3: formatCurrency(summaryData[2].onbetaaldeOnkosten),
        Q4: formatCurrency(summaryData[3].onbetaaldeOnkosten),
        Totaal: formatCurrency(yearTotals.onbetaaldeOnkosten),
      },
      {
        Categorie: 'Marge',
        Q1: formatCurrency(summaryData[0].marge),
        Q2: formatCurrency(summaryData[1].marge),
        Q3: formatCurrency(summaryData[2].marge),
        Q4: formatCurrency(summaryData[3].marge),
        Totaal: formatCurrency(yearTotals.marge),
      },
    ]

    // Generate file based on format
    const filename = `Inkomsten_en_onkosten_${parsedYear}.${format}`

    if (format === 'xlsx') {
      // Create XLSX file
      const wb = xlsx.utils.book_new()

      // Add header rows
      const headerWs = xlsx.utils.json_to_sheet(exportHeader, {
        skipHeader: true,
      })

      // Convert data to worksheet
      const ws = xlsx.utils.json_to_sheet(exportData)

      // Merge the header and data worksheets
      // Copy the header data to the beginning of the main worksheet
      const headerRange = xlsx.utils.decode_range(headerWs['!ref'] as string)
      const dataRange = xlsx.utils.decode_range(ws['!ref'] as string)

      // Adjust the worksheet reference to include both header and data
      ws['!ref'] = xlsx.utils.encode_range({
        s: { r: 0, c: 0 },
        e: {
          r: dataRange.e.r + headerRange.e.r + 1,
          c: Math.max(dataRange.e.c, headerRange.e.c),
        },
      })

      // Copy header data to the main worksheet
      for (let R = 0; R <= headerRange.e.r; ++R) {
        for (let C = 0; C <= headerRange.e.c; ++C) {
          const headerCell = headerWs[xlsx.utils.encode_cell({ r: R, c: C })]
          if (headerCell) {
            ws[xlsx.utils.encode_cell({ r: R, c: C })] = headerCell
          }
        }
      }

      // Set column widths
      const colWidths = [
        { wch: 20 }, // Categorie
        { wch: 12 }, // Q1
        { wch: 12 }, // Q2
        { wch: 12 }, // Q3
        { wch: 12 }, // Q4
        { wch: 15 }, // Totaal
      ]

      ws['!cols'] = colWidths

      // Add some styling to the header
      const headerStyle = { font: { bold: true, size: 14 } }
      ws[xlsx.utils.encode_cell({ r: 0, c: 0 })].s = headerStyle

      xlsx.utils.book_append_sheet(wb, ws, `Overzicht ${parsedYear}`)

      // Convert to buffer
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.send(buffer)
    } else {
      // Create CSV
      const parser = new Parser({ header: false })
      const headerCsv = parser.parse(exportHeader)
      const dataCsv = parser.parse(exportData)
      const csv = headerCsv + '\n' + dataCsv

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.send(csv)
    }
  } catch (error) {
    logger.error(
      'Error generating financial summary:',
      error as Record<string, unknown>,
    )
    logger.error('Error stack:', { stack: (error as Error).stack })
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}
