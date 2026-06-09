/**
 * Queue System Initialization
 * Centralizes the initialization of all queue systems
 */

// Import all queue initializers (importing the modules starts the queues)
import { getLogger } from '../logger'

import * as emailQueue from './emailQueue'
import * as exportQueue from './exportQueue'
import * as vatReturnNotificationQueue from './vatReturnNotificationQueue'

const logger = getLogger()

/**
 * Initialize all queue systems
 */
function initializeQueueSystems() {
  logger.info('Initializing all queue systems')

  // The queues are initialized when their modules are imported,
  // so we just need to log that they've been initialized.
  logger.info('Queue systems initialized successfully', {
    queues: ['exportQueue', 'emailQueue', 'vatReturnNotificationQueue'],
  })

  return {
    exportQueue,
    emailQueue,
    vatReturnNotificationQueue,
  }
}

export { initializeQueueSystems }
