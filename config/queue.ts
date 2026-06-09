/**
 * Queue configuration for Bull/Redis
 *
 * This file contains standard configuration for all Bull queues in the application
 * following the queue-system-architecture rules.
 */
import { Queue, Job } from 'bull'

import LoggerInterface from '../services/logger/adapters/interface'

// Redis configuration from environment variables
export const redisConfig = {
  redis:
    process.env.NODE_ENV === 'production' && process.env.REDISCLOUD_URL
      ? process.env.REDISCLOUD_URL // Use Heroku Redis URL in production
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          // Optional TLS settings if needed
          tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
          // Enable retry strategy for Redis connections
          retryStrategy: (times: number) => {
            // Exponential backoff strategy
            return Math.min(Math.exp(times), 20000)
          },
        },
}

// Standard options for all Bull jobs
export const defaultJobOptions = {
  attempts: 3, // Retry up to 3 times
  backoff: {
    type: 'exponential', // Exponential backoff strategy
    delay: 1000, // Starting with 1 second delay
  },
  removeOnComplete: true, // Remove jobs from queue when completed
  removeOnFail: false, // Keep failed jobs for later inspection
}

// Queue names following naming convention [domain]-[action]-queue
export const queueNames = {
  EXPORT_EXPENSE: 'export-expense-queue',
  EXPORT_INVOICE: 'export-invoice-queue',
  EMAIL_WELCOME: 'email-welcome-queue',
  VAT_RETURN_NOTIFICATION: 'vat-return-notification-queue',
  // Add more queue names here as needed
}

// Event handler registration helper
export const registerQueueEvents = (
  queue: Queue,
  logger: LoggerInterface,
): Queue | undefined => {
  if (!queue || !logger) return

  queue.on('completed', (job: Job) => {
    logger.info(`Job ${job.id} in ${queue.name} completed successfully`, {
      jobId: job.id,
      queueName: queue.name,
      tenantId: job.data.tenantId,
      userId: job.data.userId,
      requestId: job.data.requestId,
      processingTime: Date.now() - new Date(job.data.createdAt).getTime(),
    })
  })

  queue.on('failed', (job: Job, err: Error) => {
    logger.error(`Job ${job.id} in ${queue.name} failed`, {
      jobId: job.id,
      queueName: queue.name,
      tenantId: job.data.tenantId,
      userId: job.data.userId,
      requestId: job.data.requestId,
      error: err.message,
      stack: err.stack,
      attempts: job.attemptsMade,
    })
  })

  queue.on('stalled', (job: Job) => {
    logger.warn(`Job ${job.id} in ${queue.name} stalled`, {
      jobId: job.id,
      queueName: queue.name,
      tenantId: job.data.tenantId,
      userId: job.data.userId,
      requestId: job.data.requestId,
    })
  })

  queue.on('error', (error: Error) => {
    logger.error(`Error in queue ${queue.name}`, {
      queueName: queue.name,
      error: error.message,
      stack: error.stack,
    })
  })

  // Return queue with events registered for chaining
  return queue
}

interface JobOptionsInput {
  requestId?: string
  priority?: number
  notifyEmail?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

// Helper to create standardized job data
export const createJobData = (
  tenantId: unknown,
  userId: unknown,
  data: unknown,
  options: JobOptionsInput = {},
) => {
  const requestId =
    options.requestId ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`

  return {
    tenantId, // Required for multi-tenant context
    userId, // User who initiated the job
    requestId, // Unique identifier for tracking
    data, // Job-specific data
    options, // Job-specific options
    createdAt: new Date(), // Creation timestamp
    priority: options.priority || 0, // Optional priority
    notifyEmail: options.notifyEmail, // Optional email for notification
    metadata: options.metadata || {}, // Additional metadata
  }
}
