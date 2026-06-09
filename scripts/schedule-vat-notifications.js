#!/usr/bin/env node

/**
 * Script to schedule VAT return notifications for all users
 * This script should be run daily via Heroku Scheduler
 */

const mongoose = require('mongoose')
const dotenv = require('dotenv')
const {
  scheduleNotificationsForAllUsers,
} = require('../services/vatReturnNotificationScheduler')

// Load environment variables - same approach as reset-password script
dotenv.config({ path: './config/config.env' })

// Usage: node scripts/schedule-vat-notifications.js
// This should be run daily via Heroku Scheduler

async function runScheduler() {
  try {
    console.log('[VAT Scheduler] Starting VAT return notification scheduler')

    // Connect to MongoDB - using the same approach as reset-password script
    await mongoose.connect(process.env.MONGO_URI)

    console.log('[VAT Scheduler] Connected to MongoDB')

    // Run the scheduler
    const result = await scheduleNotificationsForAllUsers()

    console.log(
      '[VAT Scheduler] Scheduling completed:',
      JSON.stringify(result, null, 2),
    )
  } catch (error) {
    console.error('[VAT Scheduler] Error running scheduler:', error)
    process.exit(1)
  } finally {
    // Disconnect from MongoDB - same as reset-password script
    await mongoose.disconnect()
    console.log('[VAT Scheduler] Disconnected from MongoDB')
  }
}

runScheduler()
