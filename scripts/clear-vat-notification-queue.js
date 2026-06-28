#!/usr/bin/env node

/**
 * Script to clear all VAT notification jobs from the queue
 * Run this if you need to clean up old jobs and reschedule with new system
 */

const Bull = require('bull')
const dotenv = require('dotenv')

// Load environment variables
dotenv.config({ path: './config/config.env' })

const clearQueue = async () => {
  try {
    console.log('[Clear Queue] Starting to clear VAT notification queue')

    // Use the same Redis config as the main app
    const redisConfig = process.env.REDISCLOUD_URL ||
      process.env.REDIS_URL || {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      }

    console.log(
      '[Clear Queue] Connecting to Redis:',
      typeof redisConfig === 'string'
        ? 'Cloud URL'
        : `${redisConfig.host}:${redisConfig.port}`,
    )

    // Connect to the same Redis and queue as the app
    const vatQueue = new Bull('vat-return-notification-queue', {
      redis: redisConfig,
    })

    // Get all jobs
    const waiting = await vatQueue.getWaiting()
    const delayed = await vatQueue.getDelayed()
    const active = await vatQueue.getActive()

    console.log(`[Clear Queue] Found ${waiting.length} waiting jobs`)
    console.log(`[Clear Queue] Found ${delayed.length} delayed jobs`)
    console.log(`[Clear Queue] Found ${active.length} active jobs`)

    // Remove all jobs
    await vatQueue.empty()
    console.log('[Clear Queue] All jobs removed from queue')

    // Clean up completed and failed jobs
    await vatQueue.clean(0, 'completed')
    await vatQueue.clean(0, 'failed')
    console.log('[Clear Queue] Cleaned up completed and failed jobs')

    await vatQueue.close()
    console.log('[Clear Queue] Queue cleared successfully')

    process.exit(0)
  } catch (error) {
    console.error('[Clear Queue] Error:', error)
    process.exit(1)
  }
}

clearQueue()
