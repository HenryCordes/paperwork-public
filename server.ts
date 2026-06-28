import 'colors'
import './config/loadEnv'
// Import queue processors (they will start listening when imported)
import './services/queues/emailQueue'
import './services/queues/vatReturnNotificationQueue'

import app from './app'
import connectDb from './config/db'
import { errorLogger } from './middleware/logging'
import { setupScheduledJobs } from './services/dashboardAggregation'
import { getLogger } from './services/logger'
import { initializeQueueSystems } from './services/queues/index'

const logger = getLogger()

// Initialize queue systems
initializeQueueSystems()

//Db connection
connectDb()

if (process.env.ACTIVATE_DASHBOARD_AGGREGATION_JOBS === 'true') {
  // Setup scheduled jobs for dashboard aggregation
  setupScheduledJobs()
}

//Configure the port
const PORT = process.env.PORT || 5001
const server = app.listen(PORT, () =>
  logger.info(
    `Server running in "${process.env.NODE_ENV}" mode on port "${PORT}"`.yellow
      .bold,
  ),
)

//Handle the promise rejection error
// Add error logging middleware before the error handler
app.use(errorLogger())

// Process-level error handlers with structured logging
process.on('unhandledRejection', (err: unknown) => {
  logger.fatal(`Unhandled Promise Rejection: ${(err as Error).message}`, {
    error: err,
    stack: (err as Error).stack,
  })
  server.close(() => process.exit(1))
})

process.on('uncaughtException', (err: Error) => {
  logger.fatal(`Uncaught Exception: ${err.message}`, {
    error: err,
    stack: err.stack,
  })
  server.close(() => process.exit(1))
})

process.on('SIGTERM', () => {
  logger.warn('SIGTERM signal received: closing HTTP server')
  server.close(() => process.exit(0))
})
