/**
 * Export Queue Service
 * Initializes and manages queues for exporting expenses and invoices.
 */

import Bull from 'bull'

import {
  redisConfig,
  defaultJobOptions,
  queueNames,
  registerQueueEvents,
  createJobData,
} from '../../config/queue'
import { getLogger } from '../logger'

import { processExpenseExport } from './export/expenseProcessor'
import { processInvoiceExport } from './export/invoiceProcessor'

const logger = getLogger()

// Initialize Bull queues for expense and invoice exports
const expenseExportQueue = new Bull(queueNames.EXPORT_EXPENSE, redisConfig)
const invoiceExportQueue = new Bull(queueNames.EXPORT_INVOICE, redisConfig)

// Register event handlers and logging
registerQueueEvents(expenseExportQueue, logger)
registerQueueEvents(invoiceExportQueue, logger)

// Register processors
expenseExportQueue.process('generate', processExpenseExport)
invoiceExportQueue.process('generate', processInvoiceExport)

logger.info('Export queue system initialized with Redis')

interface ExportFilters {
  startDate?: string | Date
  endDate?: string | Date
  [key: string]: unknown
}

interface QueueOptions {
  priority?: number
  [key: string]: unknown
}

/**
 * Add a job to the expense export queue
 */
async function queueExpenseExport(
  tenantId: string,
  userId: string,
  filters: ExportFilters,
  options: QueueOptions = {},
) {
  try {
    // Validate required parameters
    if (!tenantId) {
      throw new Error('Tenant ID is required')
    }

    if (!filters || !filters.startDate || !filters.endDate) {
      throw new Error('Start date and end date filters are required')
    }

    // Create standardized job data
    const jobData = createJobData(tenantId, userId, { filters }, options)

    // Add job to queue with default options
    const job = await expenseExportQueue.add('generate', jobData, {
      ...defaultJobOptions,
      priority: options.priority || 0,
      jobId: jobData.requestId, // Use requestId as jobId for idempotency
    })

    logger.info(`Expense export job added to queue`, {
      jobId: job.id,
      tenantId,
      userId,
      requestId: jobData.requestId,
    })

    return {
      success: true,
      jobId: job.id,
      requestId: jobData.requestId,
      message: 'Export job queued successfully',
    }
  } catch (error) {
    logger.error('Error queueing expense export', {
      tenantId,
      userId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return {
      success: false,
      message: `Error queueing export: ${(error as Error).message}`,
    }
  }
}

/**
 * Get the status of an export job
 */
async function getExportJobStatus(jobId: string) {
  try {
    const job = await expenseExportQueue.getJob(jobId)

    if (!job) {
      return {
        success: false,
        message: `Job ${jobId} not found`,
      }
    }

    // Get job state and calculate progress
    const state = await job.getState()
    let progress: unknown = 0
    let result: unknown = null
    let failReason: unknown = null

    if (job.progress) {
      progress = job.progress
    }

    if (state === 'completed' && job.returnvalue) {
      result = job.returnvalue
    }

    if (state === 'failed' && job.failedReason) {
      failReason = job.failedReason
    }

    return {
      success: true,
      jobId: job.id,
      requestId: job.data.requestId,
      tenantId: job.data.tenantId,
      userId: job.data.userId,
      state,
      progress,
      result,
      failReason,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    }
  } catch (error) {
    logger.error('Error getting export job status', {
      jobId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return {
      success: false,
      message: `Error getting job status: ${(error as Error).message}`,
    }
  }
}

/**
 * Add a job to the invoice export queue
 */
async function queueInvoiceExport(
  tenantId: string,
  userId: string,
  filters: ExportFilters,
  options: QueueOptions = {},
) {
  try {
    // Validate required parameters
    if (!tenantId) {
      throw new Error('Tenant ID is required')
    }

    if (!filters || !filters.startDate || !filters.endDate) {
      throw new Error('Start date and end date filters are required')
    }

    // Create standardized job data
    const jobData = createJobData(tenantId, userId, { filters }, options)

    // Add job to queue with default options
    const job = await invoiceExportQueue.add('generate', jobData, {
      ...defaultJobOptions,
      priority: options.priority || 0,
      jobId: jobData.requestId, // Use requestId as jobId for idempotency
    })

    logger.info(`Invoice export job added to queue`, {
      jobId: job.id,
      tenantId,
      userId,
      requestId: jobData.requestId,
    })

    return {
      success: true,
      jobId: job.id,
      requestId: jobData.requestId,
      message: 'Export job queued successfully',
    }
  } catch (error) {
    logger.error('Error queueing invoice export', {
      tenantId,
      userId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return {
      success: false,
      message: `Error queueing export: ${(error as Error).message}`,
    }
  }
}

export {
  expenseExportQueue,
  invoiceExportQueue,
  queueExpenseExport,
  queueInvoiceExport,
  getExportJobStatus,
}
