/**
 * Email Queue Service
 * Initializes and manages queues for sending different types of emails
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

import { processWelcomeEmail } from './email/welcomeEmailProcessor'

const logger = getLogger()

// Initialize Bull queue for welcome emails
const welcomeEmailQueue = new Bull(queueNames.EMAIL_WELCOME, redisConfig)

// Register event handlers and logging
registerQueueEvents(welcomeEmailQueue, logger)

// Register processors
welcomeEmailQueue.process('send', processWelcomeEmail)

logger.info('Email queue system initialized with Redis')

interface SubscriptionData {
  subscriptionId?: string
}

interface QueueOptions {
  priority?: number
  [key: string]: unknown
}

/**
 * Add a job to the welcome email queue
 */
async function queueWelcomeEmail(
  tenantId: string,
  userId: string,
  subscriptionData: SubscriptionData,
  options: QueueOptions = {},
) {
  try {
    // Validate required parameters
    if (!tenantId) {
      throw new Error('Tenant ID is required')
    }

    if (!subscriptionData || !subscriptionData.subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    // Create standardized job data
    const jobData = createJobData(
      tenantId,
      userId,
      {
        subscriptionId: subscriptionData.subscriptionId,
      },
      options,
    )

    // Add job to queue with default options
    const job = await welcomeEmailQueue.add('send', jobData, {
      ...defaultJobOptions,
      priority: options.priority || 0,
      jobId: jobData.requestId, // Use requestId as jobId for idempotency
    })

    logger.info(`Welcome email job added to queue`, {
      jobId: job.id,
      tenantId,
      userId,
      requestId: jobData.requestId,
      subscriptionId: subscriptionData.subscriptionId,
    })

    return {
      success: true,
      jobId: job.id,
      requestId: jobData.requestId,
      message: 'Welcome email job queued successfully',
    }
  } catch (error) {
    logger.error('Error queueing welcome email', {
      tenantId,
      userId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return {
      success: false,
      message: `Error queueing welcome email: ${(error as Error).message}`,
    }
  }
}

export { queueWelcomeEmail }
