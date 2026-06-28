/**
 * Diagnostic script: check-subscriptions.js
 *
 * Connects to the database and Mollie API, then for each Subscription with a
 * customerId it fetches:
 *   - Mollie mandate status (valid / invalid / none)
 *   - Whether a Mollie subscription exists for the stored mollieSubscriptionId
 *
 * Outputs a structured report to stdout.
 *
 * Usage:
 *   node scripts/check-subscriptions.js
 *
 * Requirements: 7.1, 7.2, 7.3
 */

const dotenv = require('dotenv')
dotenv.config({ path: './config/config.env' })

const mongoose = require('mongoose')
const { createMollieClient } = require('@mollie/api-client')

const Subscription = require('../models/Subscription')

const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY })

async function getMandateStatus(customerId) {
  try {
    const mandates = mollieClient.mandates.iterate({ customerId })
    for await (const mandate of mandates) {
      if (mandate.status === 'valid') {
        return 'valid'
      }
    }
    return 'invalid'
  } catch (err) {
    return `error: ${err.message}`
  }
}

async function getMollieSubscriptionExists(customerId, mollieSubscriptionId) {
  if (!mollieSubscriptionId) return 'no'
  try {
    await mollieClient.customerSubscriptions.get(mollieSubscriptionId, {
      customerId,
    })
    return 'yes'
  } catch (err) {
    if (
      err.statusCode === 404 ||
      (err.message && err.message.includes('404'))
    ) {
      return 'no'
    }
    return `error: ${err.message}`
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected to database.\n')

  // Requirement 7.1: query all Subscription records that have a customerId set
  const subscriptions = await Subscription.find({
    customerId: { $exists: true, $ne: null, $ne: '' },
  }).lean()

  console.log(
    `Found ${subscriptions.length} subscription(s) with a customerId.\n`,
  )

  const report = []

  for (const sub of subscriptions) {
    // Requirement 7.2: call Mollie Mandates API for each subscription with a customerId
    const mandateStatus = await getMandateStatus(sub.customerId)
    const mollieSubscriptionExists = await getMollieSubscriptionExists(
      sub.customerId,
      sub.mollieSubscriptionId,
    )

    report.push({
      subscriptionId: sub._id.toString(),
      customerId: sub.customerId,
      localStatus: sub.subscriptionStatus || 'unknown',
      mandateStatus,
      mollieSubscriptionExists,
      mollieSubscriptionId: sub.mollieSubscriptionId || '(none)',
      nextPaymentDate: sub.nextPaymentDate
        ? sub.nextPaymentDate.toISOString().split('T')[0]
        : '(none)',
    })
  }

  // Requirement 7.3: output structured report
  console.log('='.repeat(80))
  console.log('SUBSCRIPTION DIAGNOSTIC REPORT')
  console.log('='.repeat(80))
  console.log(
    `${'Subscription ID'.padEnd(26)} ${'Customer ID'.padEnd(
      16,
    )} ${'Local Status'.padEnd(16)} ${'Mandate'.padEnd(
      10,
    )} ${'Mollie Sub?'.padEnd(12)} ${'Next Payment'}`,
  )
  console.log('-'.repeat(100))

  for (const row of report) {
    console.log(
      `${row.subscriptionId.padEnd(26)} ${row.customerId.padEnd(
        16,
      )} ${row.localStatus.padEnd(16)} ${row.mandateStatus.padEnd(
        10,
      )} ${row.mollieSubscriptionExists.padEnd(12)} ${row.nextPaymentDate}`,
    )
  }

  console.log('-'.repeat(100))
  console.log(`\nTotal: ${report.length} subscription(s) checked.`)

  // Also emit as JSON for easy programmatic consumption
  console.log('\n--- JSON Report ---')
  console.log(JSON.stringify(report, null, 2))

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
