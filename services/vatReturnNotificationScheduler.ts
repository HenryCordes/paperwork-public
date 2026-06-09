/**
 * VAT Return Notification Scheduler Service
 * Automatically schedules VAT return deadline notifications for all users
 */

import User from '../models/User'
import VATReturnNotificationPreferences from '../models/VATReturnNotificationPreferences'

import { getNextBTWDeadline } from './btwCalculationService'
import { getLogger } from './logger'
import { scheduleAllVATReturnNotifications } from './queues/vatReturnNotificationQueue'

const logger = getLogger()

interface ScheduleError {
  userId: string
  email?: string
  error: string
}

/**
 * Schedule VAT return notifications for a specific user
 */
const scheduleNotificationsForUser = async (
  userId: string,
  tenantId: string,
) => {
  try {
    logger.info(
      `Planning VAT return notificaties voor gebruiker ${userId}, tenant ${tenantId}`,
    )

    // Get user information
    const user = await User.findById(userId)
    if (!user) {
      throw new Error(`Gebruiker niet gevonden: ${userId}`)
    }

    // Get or create notification preferences
    const preferences =
      await VATReturnNotificationPreferences.getOrCreatePreferences(
        userId,
        tenantId,
      )

    // Check if any notifications are enabled
    if (
      !preferences.emailNotifications &&
      !preferences.inAppNotifications &&
      !preferences.pushNotifications
    ) {
      logger.info(`Geen notificaties ingeschakeld voor gebruiker ${userId}`)
      return {
        success: true,
        message: 'Geen notificaties ingeschakeld',
        scheduledJobs: [] as unknown[],
      }
    }

    const scheduledJobs: unknown[] = []

    // Schedule notifications for each enabled period type
    const periodTypes: string[] = []
    if (preferences.monthlyNotifications) periodTypes.push('monthly')
    if (preferences.quarterlyNotifications) periodTypes.push('quarterly')
    if (preferences.yearlyNotifications) periodTypes.push('yearly')

    for (const periodType of periodTypes) {
      try {
        // Get next deadline for this period type
        const deadlineInfo = await getNextBTWDeadline(tenantId, periodType)

        if (deadlineInfo && !deadlineInfo.isOverdue) {
          const userInfo = {
            email: user.email,
            name: user.name,
            companyName: user.companyName,
          }

          // Schedule all notification types for this deadline
          const jobs = await scheduleAllVATReturnNotifications(
            tenantId,
            userId,
            deadlineInfo,
            preferences,
            userInfo,
          )

          scheduledJobs.push(...jobs)
        }
      } catch (error) {
        logger.error(
          `Fout bij plannen ${periodType} notificaties voor gebruiker ${userId}:`,
          error as Record<string, unknown>,
        )
        // Continue with other period types
      }
    }

    logger.info(
      `${scheduledJobs.length} VAT return notificaties gepland voor gebruiker ${userId}`,
      {
        userId,
        tenantId,
        scheduledJobsCount: scheduledJobs.length,
      },
    )

    return {
      success: true,
      message: `${scheduledJobs.length} notificaties gepland`,
      scheduledJobs,
    }
  } catch (error) {
    logger.error(
      `Fout bij plannen VAT return notificaties voor gebruiker ${userId}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Schedule VAT return notifications for all users.
 * Should be called periodically (e.g. daily).
 */
const scheduleNotificationsForAllUsers = async () => {
  try {
    logger.info(
      'Starten met plannen VAT return notificaties voor alle gebruikers',
    )

    // Get all users with active subscriptions
    const users = await User.find({
      role: 'user',
    }).select('_id email name companyName')

    if (!users || users.length === 0) {
      logger.info('Geen gebruikers gevonden om notificaties voor te plannen')
      return {
        success: true,
        message: 'Geen gebruikers gevonden',
        processedUsers: 0,
        totalScheduledJobs: 0,
      }
    }

    let processedUsers = 0
    let totalScheduledJobs = 0
    const errors: ScheduleError[] = []

    for (const user of users) {
      try {
        // For multi-tenant setup, derive the tenant ID for each user.
        const tenantId = user._id.toString() // Simplified - adjust per tenant logic

        const result = await scheduleNotificationsForUser(
          user._id.toString(),
          tenantId,
        )

        if (result.success) {
          processedUsers++
          totalScheduledJobs += result.scheduledJobs.length
        }

        // Add small delay to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        logger.error(
          `Fout bij plannen notificaties voor gebruiker ${user._id}:`,
          error as Record<string, unknown>,
        )
        errors.push({
          userId: user._id.toString(),
          email: user.email,
          error: (error as Error).message,
        })
      }
    }

    const result = {
      success: true,
      message: `Notificaties gepland voor ${processedUsers} van ${users.length} gebruikers`,
      totalUsers: users.length,
      processedUsers,
      totalScheduledJobs,
      errors: errors.length > 0 ? errors : undefined,
    }

    logger.info('VAT return notificaties planning voltooid', result)

    return result
  } catch (error) {
    logger.error(
      'Fout bij plannen VAT return notificaties voor alle gebruikers:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Cancel all scheduled notifications for a user.
 */
const cancelNotificationsForUser = async (userId: string, tenantId: string) => {
  try {
    logger.info(
      `Annuleren VAT return notificaties voor gebruiker ${userId}, tenant ${tenantId}`,
    )

    // TODO: implement job cancellation logic.
    logger.info('Notificatie annulering functionaliteit wordt geïmplementeerd')

    return {
      success: true,
      message: 'Notificaties geannuleerd (implementatie volgt)',
    }
  } catch (error) {
    logger.error(
      `Fout bij annuleren VAT return notificaties voor gebruiker ${userId}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Get scheduling statistics
 */
const getSchedulingStats = async () => {
  try {
    const totalUsersWithPreferences =
      await VATReturnNotificationPreferences.countDocuments()

    const emailNotificationUsers =
      await VATReturnNotificationPreferences.countDocuments({
        emailNotifications: true,
      })

    const pushNotificationUsers =
      await VATReturnNotificationPreferences.countDocuments({
        pushNotifications: true,
        pushNotificationToken: { $ne: null },
      })

    const inAppNotificationUsers =
      await VATReturnNotificationPreferences.countDocuments({
        inAppNotifications: true,
      })

    return {
      totalUsersWithPreferences,
      emailNotificationUsers,
      pushNotificationUsers,
      inAppNotificationUsers,
      lastUpdated: new Date(),
    }
  } catch (error) {
    logger.error(
      'Fout bij ophalen scheduling statistieken:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

export {
  scheduleNotificationsForUser,
  scheduleNotificationsForAllUsers,
  cancelNotificationsForUser,
  getSchedulingStats,
}
