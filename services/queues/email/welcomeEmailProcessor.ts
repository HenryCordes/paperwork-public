/**
 * Welcome Email Processor
 * Processes welcome email jobs from the queue
 */

import { Job } from 'bull'
import mongoose from 'mongoose'

import Subscription from '../../../models/Subscription'
import User from '../../../models/User'
import welcomeEmailTemplate from '../../../templates/welcomeEmailTemplate'
import { sendEmail } from '../../emailService'
import { getLogger } from '../../logger'

const logger = getLogger()

/**
 * Process a welcome email job
 */
async function processWelcomeEmail(job: Job) {
  const { tenantId, userId, data } = job.data
  logger.info(`Processing welcome email for subscription`, {
    jobId: job.id,
    tenantId,
    userId,
    subscriptionId: data.subscriptionId,
  })

  try {
    // Set the MongoDB tenant context
    const session = await mongoose.startSession()
    session.withTransaction(async () => {
      // Find the subscription
      const subscription = await Subscription.findById(data.subscriptionId)
      if (!subscription) {
        throw new Error(`Subscription not found: ${data.subscriptionId}`)
      }

      // Find the user
      const user = await User.findById(subscription.userId)
      if (!user) {
        throw new Error(
          `User not found for subscription: ${subscription.userId}`,
        )
      }

      // Only proceed if welcome email wasn't sent yet
      if (subscription.welcomeEmailSent) {
        logger.info(
          'Welcome email already sent for this subscription, skipping',
          {
            subscriptionId: data.subscriptionId,
          },
        )
        return { success: true, skipped: true }
      }

      // Generate email content
      const emailContent = welcomeEmailTemplate({
        name: user.name,
        plan: subscription.plan,
        subscriptionDate: subscription.subscriptionDate,
      })

      // Send the email
      await sendEmail({
        to: user.email,
        from: {
          email: process.env.EMAIL_FROM || 'paperworkdevelopment@gmail.com',
          name: 'Paperwork',
        },
        subject: 'Welkom bij Paperwork!',
        text: 'Bedankt voor je inschrijving bij Paperwork! Bekijk deze email in HTML-formaat voor meer informatie over je abonnement.',
        html: emailContent,
      })

      // Mark the subscription as having sent the welcome email
      subscription.welcomeEmailSent = true
      await subscription.save()

      logger.info('Welcome email sent successfully', {
        subscriptionId: data.subscriptionId,
        userId: user._id,
      })

      return { success: true }
    })

    return { success: true }
  } catch (error) {
    logger.error('Error sending welcome email', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      subscriptionId: data.subscriptionId,
    })

    throw error // Re-throw for Bull to handle retries
  }
}

export { processWelcomeEmail }
