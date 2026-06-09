import { Request, Response } from 'express'

import { getCurrentTenantId } from '../middleware/tenantHelper'
import VATReturnNotificationPreferences from '../models/VATReturnNotificationPreferences'
import { getLogger } from '../services/logger'
import { scheduleNotificationsForUser } from '../services/vatReturnNotificationScheduler'

const logger = getLogger()

/**
 * Get VAT return notification preferences for current user
 */
export const getNotificationPreferences = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id as string
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    logger.info(
      `Ophalen VAT notificatie voorkeuren voor gebruiker ${userId}, tenant ${tenantId}`,
    )

    const preferences =
      await VATReturnNotificationPreferences.getOrCreatePreferences(
        userId,
        tenantId,
      )

    res.status(200).json({
      success: true,
      data: preferences,
    })
  } catch (error) {
    logger.error(
      'Fout bij ophalen VAT notificatie voorkeuren:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Update VAT return notification preferences
 */
export const updateNotificationPreferences = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id as string
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    const {
      emailNotifications,
      inAppNotifications,
      pushNotifications,
      advanceWarningDays,
      secondReminderEnabled,
      secondReminderDays,
      monthlyNotifications,
      quarterlyNotifications,
      yearlyNotifications,
      preferredLanguage,
      timezone,
    } = req.body

    logger.info(
      `Bijwerken VAT notificatie voorkeuren voor gebruiker ${userId}, tenant ${tenantId}`,
    )

    // Validation
    if (
      advanceWarningDays &&
      (advanceWarningDays < 1 || advanceWarningDays > 30)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Voorwaarschuwing moet tussen 1 en 30 dagen zijn',
      })
    }

    if (
      secondReminderDays &&
      (secondReminderDays < 1 || secondReminderDays > 15)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tweede herinnering moet tussen 1 en 15 dagen zijn',
      })
    }

    const preferences =
      await VATReturnNotificationPreferences.getOrCreatePreferences(
        userId,
        tenantId,
      )

    // Update preferences
    if (emailNotifications !== undefined)
      preferences.emailNotifications = emailNotifications
    if (inAppNotifications !== undefined)
      preferences.inAppNotifications = inAppNotifications
    if (pushNotifications !== undefined)
      preferences.pushNotifications = pushNotifications
    if (advanceWarningDays !== undefined)
      preferences.advanceWarningDays = advanceWarningDays
    if (secondReminderEnabled !== undefined)
      preferences.secondReminderEnabled = secondReminderEnabled
    if (secondReminderDays !== undefined)
      preferences.secondReminderDays = secondReminderDays
    if (monthlyNotifications !== undefined)
      preferences.monthlyNotifications = monthlyNotifications
    if (quarterlyNotifications !== undefined)
      preferences.quarterlyNotifications = quarterlyNotifications
    if (yearlyNotifications !== undefined)
      preferences.yearlyNotifications = yearlyNotifications
    if (preferredLanguage !== undefined)
      preferences.preferredLanguage = preferredLanguage
    if (timezone !== undefined) preferences.timezone = timezone

    await preferences.save()

    logger.info(
      `VAT notificatie voorkeuren bijgewerkt voor gebruiker ${userId}`,
    )

    res.status(200).json({
      success: true,
      data: preferences,
      message: 'Notificatie voorkeuren succesvol bijgewerkt',
    })
  } catch (error) {
    logger.error(
      'Fout bij bijwerken VAT notificatie voorkeuren:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Note: Push notification tokens are managed centrally via /api/notifications endpoints
 * No need for separate VAT-specific token management
 */

/**
 * Debug endpoint to check queue status
 */
export const getQueueStatus = async (req: Request, res: Response) => {
  try {
    // Lazy-loaded so the web process does not open the queue's Redis
    // connection unless this debug endpoint is actually called.
    const { getQueueStats } =
      await import('../services/queues/vatReturnNotificationQueue')
    const stats = await getQueueStats()

    logger.info('Queue status aangevraagd', stats)

    res.status(200).json({
      success: true,
      data: stats,
    })
  } catch (error) {
    logger.error(
      'Fout bij ophalen queue status:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}

/**
 * Manually trigger scheduling of VAT return notifications for current user
 * This is useful for testing and can be called after updating preferences
 */
export const triggerScheduleNotifications = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id as string
    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)

    logger.info(
      `Handmatig triggeren VAT notificatie planning voor gebruiker ${userId}, tenant ${tenantId}`,
    )

    const result = await scheduleNotificationsForUser(userId, tenantId)

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    })
  } catch (error) {
    logger.error(
      'Fout bij triggeren VAT notificatie planning:',
      error as Record<string, unknown>,
    )
    res.status(500).json({
      success: false,
      message: `Er is een fout opgetreden: ${(error as Error).message}`,
    })
  }
}
