/**
 * Test script to verify Firebase configuration
 * Run with: node scripts/test-firebase.js
 */

require('dotenv').config({ path: './config/config.env' })
const firebaseService = require('../services/firebaseService')
const { getLogger } = require('../services/logger')

const logger = getLogger()

async function testFirebaseConnection() {
  try {
    logger.info('[TestFirebase] Testing Firebase Admin SDK initialization...')

    // Initialize Firebase service
    firebaseService.initialize()

    logger.info(
      '[TestFirebase] ✅ Firebase Admin SDK initialized successfully!',
    )

    // Test token validation with a dummy token (this will fail but shows the service works)
    const testToken = 'dummy-token-for-testing'
    const validation = await firebaseService.validateToken(testToken)

    logger.info('[TestFirebase] Token validation test completed', {
      valid: validation.valid,
      error: validation.error,
    })

    logger.info(
      '[TestFirebase] 🎉 Firebase service is ready for push notifications!',
    )
  } catch (error) {
    logger.error('[TestFirebase] ❌ Firebase initialization failed:', {
      error: error.message,
      stack: error.stack,
    })

    logger.info(
      '[TestFirebase] Please check your Firebase environment variables in config/config.env',
    )
    process.exit(1)
  }
}

testFirebaseConnection()
