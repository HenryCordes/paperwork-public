/**
 * Queue Worker Process
 * Processes background jobs from Bull queues
 */
import './config/loadEnv'
// Import queue modules to register processors
import './services/queues/vatReturnNotificationQueue'
import './services/queues/emailQueue'

import mongoose from 'mongoose'

import { getLogger } from './services/logger'

const logger = getLogger()

async function startWorker(): Promise<void> {
  try {
    logger.info('Starting queue worker process')

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI as string)
    logger.info('MongoDB connected for worker process')

    logger.info('Queue worker is ready to process jobs')
    logger.info('Listening for jobs on VAT notification queue and email queue')

    // Keep the process alive
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down worker gracefully')
      await mongoose.disconnect()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down worker gracefully')
      await mongoose.disconnect()
      process.exit(0)
    })
  } catch (error) {
    logger.error(
      'Failed to start queue worker:',
      error as Record<string, unknown>,
    )
    process.exit(1)
  }
}

startWorker()
