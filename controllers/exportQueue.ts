/**
 * Queue-based Export Controller
 *
 * Handles expense and invoice export requests using Bull/Redis queue system
 * Follows queue-system-architecture rules defined in .windsurf.json
 */

import { Request, Response } from 'express'

import asyncHandler from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import { getLogger } from '../services/logger'
import {
  queueExpenseExport as queueExpenseExportJob,
  queueInvoiceExport as queueInvoiceExportJob,
  getExportJobStatus,
} from '../services/queues/exportQueue'

const logger = getLogger()

/**
 * Queue an expense export job
 * POST /api/export/expenses
 */
export const queueExpenseExport = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?._id as string

    // Extract filters from request body
    const { startDate, endDate, includeReceipts, notifyEmail } = req.body

    logger.info('Queueing expense export', {
      tenantId,
      userId,
      filters: { startDate, endDate, includeReceipts },
    })

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start- en einddatum zijn verplicht',
      })
    }

    try {
      // Parse dates for validation
      const parsedStartDate = new Date(startDate)
      const parsedEndDate = new Date(endDate)

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Ongeldige datumformaat',
        })
      }

      // Prepare options with notification email if provided
      const options = {
        notifyEmail: notifyEmail || req.user?.email,
        expirySeconds: 7200, // 2 hours
      }

      // Queue the export job
      const result = await queueExpenseExportJob(
        tenantId,
        userId,
        { startDate, endDate, includeReceipts },
        options,
      )

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message:
            result.message ||
            'Er is een fout opgetreden bij het verwerken van je export',
        })
      }

      res.status(202).json({
        success: true,
        jobId: result.jobId,
        requestId: result.requestId,
        message:
          'Export wordt verwerkt en zal per e-mail worden verzonden wanneer gereed',
      })
    } catch (error) {
      logger.error(
        'Error in queueExpenseExport controller:',
        error as Record<string, unknown>,
      )
      res.status(500).json({
        success: false,
        message: `Er is een fout opgetreden: ${(error as Error).message}`,
      })
    }
  },
)

/**
 * Queue an invoice export job
 * POST /api/export/invoices
 */
export const queueInvoiceExport = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?._id as string

    // Extract filters from request body
    const { startDate, endDate, includePdfs, notifyEmail } = req.body

    logger.info('Queueing invoice export', {
      tenantId,
      userId,
      filters: { startDate, endDate, includePdfs },
    })

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start- en einddatum zijn verplicht',
      })
    }

    try {
      // Parse dates for validation
      const parsedStartDate = new Date(startDate)
      const parsedEndDate = new Date(endDate)

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Ongeldige datumformaat',
        })
      }

      // Prepare options with notification email if provided
      const options = {
        notifyEmail: notifyEmail || req.user?.email,
        expirySeconds: 7200, // 2 hours
      }

      // Queue the export job
      const result = await queueInvoiceExportJob(
        tenantId,
        userId,
        { startDate, endDate, includePdfs },
        options,
      )

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message:
            result.message ||
            'Er is een fout opgetreden bij het verwerken van je export',
        })
      }

      res.status(202).json({
        success: true,
        jobId: result.jobId,
        requestId: result.requestId,
        message:
          'Export wordt verwerkt en zal per e-mail worden verzonden wanneer gereed',
      })
    } catch (error) {
      logger.error(
        'Error in queueInvoiceExport controller:',
        error as Record<string, unknown>,
      )
      res.status(500).json({
        success: false,
        message: `Er is een fout opgetreden: ${(error as Error).message}`,
      })
    }
  },
)

/**
 * Get the status of an export job
 * GET /api/export/status/:jobId
 */
export const getExportStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { jobId } = req.params
    const userId = req.user?._id as string

    logger.info(`Checking export job status: ${jobId}`, { userId })

    try {
      const status = await getExportJobStatus(jobId as string)

      if (!status.success) {
        return res.status(404).json({
          success: false,
          message: status.message || 'Export job niet gevonden',
        })
      }

      // Ensure the requesting user is the one who initiated the job
      // Skip this check for admin users (can be added later if needed)
      if (status.userId && String(status.userId) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Geen toegang tot deze export job',
        })
      }

      res.status(200).json({
        success: true,
        status,
      })
    } catch (error) {
      logger.error(
        'Error in getExportStatus controller:',
        error as Record<string, unknown>,
      )
      res.status(500).json({
        success: false,
        message: `Er is een fout opgetreden: ${(error as Error).message}`,
      })
    }
  },
)
