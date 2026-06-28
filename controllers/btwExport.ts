import { Request, Response } from 'express'

import { BTW_PERIOD_TYPES } from '../common/constants/btwPeriods'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import { getNextBTWDeadline as getNextBTWDeadlineForTenant } from '../services/btwCalculationService'
import { generateBTWExport } from '../services/btwExportService'
import { getLogger } from '../services/logger'

const logger = getLogger()

/**
 * BTW Export Controller
 * Handles BTW export requests with period filtering and format selection
 */

/**
 * Export BTW aangifte for specified period
 */
export const exportBTWAangifte = async (req: Request, res: Response) => {
  try {
    const {
      periodType,
      period,
      year,
      format = 'excel',
      includeDetails = false,
    } = req.query
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    // Validate required parameters
    if (!periodType || !period || !year) {
      return res.status(400).json({
        success: false,
        message: 'Periodetype, periode en jaar zijn verplicht',
      })
    }

    // Validate period type
    if (
      !(Object.values(BTW_PERIOD_TYPES) as string[]).includes(
        periodType as string,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Ongeldig periodetype. Gebruik 'monthly', 'quarterly' of 'yearly'",
      })
    }

    // Validate year
    const yearNum = parseInt(year as string)
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Ongeldig jaar',
      })
    }

    // Validate format
    if (!['excel', 'csv'].includes(format as string)) {
      return res.status(400).json({
        success: false,
        message: "Ongeldig formaat. Gebruik 'excel' of 'csv'",
      })
    }

    logger.info(
      `BTW export aanvraag voor tenant ${tenantId}: ${periodType} ${period} ${year} (${format})`,
    )

    // Generate the export
    const result = await generateBTWExport(
      tenantId as string,
      periodType as string,
      period as string,
      yearNum,
      format as string,
      includeDetails === 'true',
    )

    if (!result.success) {
      return res.status(404).json(result)
    }

    // Set response headers for file download
    res.setHeader('Content-Type', result.contentType as string)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    )

    // Send file data
    res.status(200).send(result.fileData)
  } catch (error) {
    logger.error(
      'Fout in exportBTWAangifte controller:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Get BTW summary for specified period (without generating file)
 */
export const getBTWSummary = async (req: Request, res: Response) => {
  try {
    const { periodType, period, year } = req.query
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    // Validate required parameters
    if (!periodType || !period || !year) {
      return res.status(400).json({
        success: false,
        message: 'Periodetype, periode en jaar zijn verplicht',
      })
    }

    // Validate period type
    if (
      !(Object.values(BTW_PERIOD_TYPES) as string[]).includes(
        periodType as string,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Ongeldig periodetype',
      })
    }

    const yearNum = parseInt(year as string)
    if (isNaN(yearNum)) {
      return res.status(400).json({
        success: false,
        message: 'Ongeldig jaar',
      })
    }

    logger.info(
      `BTW samenvatting aanvraag voor tenant ${tenantId}: ${periodType} ${period} ${year}`,
    )

    // Import calculation service here to avoid circular dependency
    const { calculateBTWForPeriod } =
      await import('../services/btwCalculationService')

    // Calculate BTW data
    const btwData = await calculateBTWForPeriod(
      tenantId as string,
      periodType as string,
      period as string,
      yearNum,
    )

    res.status(200).json({
      success: true,
      data: btwData,
    })
  } catch (error) {
    logger.error(
      'Fout in getBTWSummary controller:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Get next BTW deadline for tenant
 */
export const getNextBTWDeadline = async (req: Request, res: Response) => {
  try {
    const { periodType = BTW_PERIOD_TYPES.QUARTERLY } = req.query
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    logger.info(
      `Volgende BTW deadline aanvraag voor tenant ${tenantId}: ${periodType}`,
    )

    const deadlineInfo = await getNextBTWDeadlineForTenant(
      tenantId as string,
      periodType as string,
    )

    res.status(200).json({
      success: true,
      data: deadlineInfo,
    })
  } catch (error) {
    logger.error(
      'Fout in getNextBTWDeadline controller:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Get available periods for BTW export
 */
export const getBTWPeriods = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

    const periods = {
      monthly: Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: new Date(2000, i).toLocaleDateString('nl-NL', { month: 'long' }),
        labelShort: new Date(2000, i).toLocaleDateString('nl-NL', {
          month: 'short',
        }),
      })),
      quarterly: [
        { value: 'Q1', label: 'Q1 (Januari - Maart)', labelShort: 'Q1' },
        { value: 'Q2', label: 'Q2 (April - Juni)', labelShort: 'Q2' },
        { value: 'Q3', label: 'Q3 (Juli - September)', labelShort: 'Q3' },
        { value: 'Q4', label: 'Q4 (Oktober - December)', labelShort: 'Q4' },
      ],
      yearly: years.map((year) => ({
        value: year,
        label: `Jaar ${year}`,
        labelShort: year.toString(),
      })),
    }

    res.status(200).json({
      success: true,
      data: {
        years,
        periods,
        periodTypes: [
          { value: BTW_PERIOD_TYPES.MONTHLY, label: 'Maandelijks' },
          { value: BTW_PERIOD_TYPES.QUARTERLY, label: 'Per kwartaal' },
          { value: BTW_PERIOD_TYPES.YEARLY, label: 'Jaarlijks' },
        ],
      },
    })
  } catch (error) {
    logger.error(
      'Fout in getBTWPeriods controller:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}
