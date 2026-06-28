/**
 * VAT Return Notification Queue Service
 * Manages scheduled notifications for VAT return deadlines with multi-channel support
 */

import Bull from 'bull'

import {
  redisConfig,
  defaultJobOptions,
  queueNames,
  registerQueueEvents,
  createJobData,
} from '../../config/queue'
import FCMToken from '../../models/FCMToken'
import { getLogger } from '../logger'

import { processVATReturnNotification } from './notifications/vatReturnNotificationProcessor'

const logger = getLogger()

// Initialize Bull queue for VAT return notifications
const vatReturnNotificationQueue = new Bull(
  queueNames.VAT_RETURN_NOTIFICATION,
  redisConfig,
)

// Register event handlers and logging
registerQueueEvents(vatReturnNotificationQueue, logger)

// Register processors for different notification types
vatReturnNotificationQueue.process(
  'email-reminder',
  1, // Process 1 job at a time
  processVATReturnNotification,
)
vatReturnNotificationQueue.process(
  'push-notification',
  1, // Process 1 job at a time
  processVATReturnNotification,
)
vatReturnNotificationQueue.process(
  'in-app-notification',
  1, // Process 1 job at a time
  processVATReturnNotification,
)

logger.info('VAT Return notification queue processors registered and ready')
logger.info(
  'Queue will process: email-reminder, push-notification, in-app-notification',
)

interface NotificationData {
  deadline: string
  periodType: string
  period: string | number
  year: number
  daysUntilDeadline: number
  userPreferences: UserPreferences
  pushToken?: string | null
  pushPlatform?: string | null
  userEmail?: string
  userName?: string
  companyName?: string
  isSecondReminder?: boolean
}

interface UserPreferences {
  advanceWarningDays: number
  secondReminderDays: number
  secondReminderEnabled: boolean
  emailNotifications: boolean
  pushNotifications: boolean
  inAppNotifications: boolean
}

interface DeadlineInfo {
  deadline: string
  periodType: string
  period: string | number
  year: number
  isOverdue?: boolean
}

interface UserInfo {
  email?: string
  name?: string
  companyName?: string
}

interface ScheduledJob {
  jobId: Bull.JobId
  scheduledDate: Date
  notificationType: string
  delay: number
}

/**
 * Schedule a VAT return deadline notification
 */
const scheduleVATReturnNotification = async (
  tenantId: string,
  userId: string,
  notificationData: NotificationData,
  scheduledDate: Date,
  notificationType = 'email-reminder',
): Promise<ScheduledJob | null> => {
  try {
    const delay = scheduledDate.getTime() - Date.now()

    if (delay <= 0) {
      logger.warn(
        `Poging om VAT notificatie in het verleden te plannen voor gebruiker ${userId}`,
        {
          tenantId,
          userId,
          scheduledDate,
          notificationType,
        },
      )
      return null
    }

    const jobData = createJobData(
      tenantId,
      userId,
      {
        notificationType,
        deadline: notificationData.deadline,
        periodType: notificationData.periodType,
        period: notificationData.period,
        year: notificationData.year,
        daysUntilDeadline: notificationData.daysUntilDeadline,
        userPreferences: notificationData.userPreferences,
        // Mobile push notification data
        pushToken: notificationData.pushToken,
        pushPlatform: notificationData.pushPlatform,
        // Email data
        userEmail: notificationData.userEmail,
        userName: notificationData.userName,
        companyName: notificationData.companyName,
      },
      {
        priority: notificationData.daysUntilDeadline <= 3 ? 10 : 5, // urgent first
        metadata: {
          notificationCategory: 'vat-return-deadline',
          scheduledFor: scheduledDate.toISOString(),
          createdBy: 'vat-notification-scheduler',
        },
      },
    )

    const reminderSuffix = notificationData.isSecondReminder
      ? '-reminder2'
      : '-reminder1'
    const job = await vatReturnNotificationQueue.add(
      notificationType,
      jobData,
      {
        ...defaultJobOptions,
        delay,
        jobId: `vat-${notificationType}-${tenantId}-${userId}-${notificationData.deadline}${reminderSuffix}`, // Unique job ID to prevent duplicates
        removeOnComplete: false, // Keep completed jobs for debugging
        removeOnFail: false, // Keep failed jobs for debugging
      },
    )

    logger.info(`VAT return notificatie gepland voor gebruiker ${userId}`, {
      tenantId,
      userId,
      jobId: job.id,
      notificationType,
      scheduledDate: scheduledDate.toISOString(),
      deadline: notificationData.deadline,
      daysUntilDeadline: notificationData.daysUntilDeadline,
    })

    return {
      jobId: job.id,
      scheduledDate,
      notificationType,
      delay,
    }
  } catch (error) {
    logger.error(
      `Fout bij plannen VAT return notificatie voor gebruiker ${userId}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Cancel a scheduled VAT return notification
 */
const cancelVATReturnNotification = async (jobId: string): Promise<boolean> => {
  try {
    const job = await vatReturnNotificationQueue.getJob(jobId)

    if (job) {
      await job.remove()
      logger.info(`VAT return notificatie geannuleerd: ${jobId}`)
      return true
    }

    logger.warn(`VAT return notificatie job niet gevonden: ${jobId}`)
    return false
  } catch (error) {
    logger.error(
      `Fout bij annuleren VAT return notificatie ${jobId}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Schedule all notification types for a user based on their preferences
 */
const scheduleAllVATReturnNotifications = async (
  tenantId: string,
  userId: string,
  deadlineInfo: DeadlineInfo,
  userPreferences: UserPreferences,
  userInfo: UserInfo,
): Promise<ScheduledJob[]> => {
  const scheduledJobs: ScheduledJob[] = []

  try {
    const deadlineDate = new Date(deadlineInfo.deadline)

    // Calculate notification date by subtracting days properly
    const notificationDate = new Date(deadlineDate.getTime())
    notificationDate.setDate(
      notificationDate.getDate() - userPreferences.advanceWarningDays,
    )

    // Set notification time to 9:00 AM in user's timezone
    notificationDate.setHours(9, 0, 0, 0)

    // If notification date is in the past, schedule it for now + 1 minute
    const now = new Date()
    if (notificationDate < now) {
      notificationDate.setTime(now.getTime() + 60000) // 1 minute from now
    }

    // Get FCM token from the central FCMToken model (single source of truth)
    const fcmToken = await FCMToken.findOne({
      userId,
      tenantId,
      isActive: true,
      platform: { $in: ['ios', 'android'] },
    })

    const notificationData: NotificationData = {
      deadline: deadlineInfo.deadline,
      periodType: deadlineInfo.periodType,
      period: deadlineInfo.period,
      year: deadlineInfo.year,
      daysUntilDeadline: userPreferences.advanceWarningDays,
      userPreferences,
      userEmail: userInfo.email,
      userName: userInfo.name,
      companyName: userInfo.companyName,
      pushToken: fcmToken?.token || null,
      pushPlatform: fcmToken?.platform || null,
    }

    // Schedule email notification
    if (userPreferences.emailNotifications) {
      const emailJob = await scheduleVATReturnNotification(
        tenantId,
        userId,
        notificationData,
        notificationDate,
        'email-reminder',
      )
      if (emailJob) scheduledJobs.push(emailJob)
    }

    // Schedule push notification - check if FCM token exists
    if (userPreferences.pushNotifications && fcmToken) {
      const pushJob = await scheduleVATReturnNotification(
        tenantId,
        userId,
        notificationData,
        notificationDate,
        'push-notification',
      )
      if (pushJob) scheduledJobs.push(pushJob)
    }

    // Schedule in-app notification
    if (userPreferences.inAppNotifications) {
      const inAppJob = await scheduleVATReturnNotification(
        tenantId,
        userId,
        notificationData,
        notificationDate,
        'in-app-notification',
      )
      if (inAppJob) scheduledJobs.push(inAppJob)
    }

    // Schedule second reminder if enabled
    if (userPreferences.secondReminderEnabled) {
      const secondReminderDate = new Date(deadlineDate.getTime())
      secondReminderDate.setDate(
        secondReminderDate.getDate() - userPreferences.secondReminderDays,
      )
      secondReminderDate.setHours(9, 0, 0, 0)

      // If second reminder date is in the past, schedule it for now + 2 minutes
      if (secondReminderDate < now) {
        secondReminderDate.setTime(now.getTime() + 120000) // 2 minutes from now
      }

      const secondReminderData: NotificationData = {
        ...notificationData,
        daysUntilDeadline: userPreferences.secondReminderDays,
        isSecondReminder: true,
      }

      if (userPreferences.emailNotifications) {
        const emailJob = await scheduleVATReturnNotification(
          tenantId,
          userId,
          secondReminderData,
          secondReminderDate,
          'email-reminder',
        )
        if (emailJob) scheduledJobs.push(emailJob)
      }

      if (userPreferences.pushNotifications && fcmToken) {
        const pushJob = await scheduleVATReturnNotification(
          tenantId,
          userId,
          secondReminderData,
          secondReminderDate,
          'push-notification',
        )
        if (pushJob) scheduledJobs.push(pushJob)
      }

      if (userPreferences.inAppNotifications) {
        const inAppJob = await scheduleVATReturnNotification(
          tenantId,
          userId,
          secondReminderData,
          secondReminderDate,
          'in-app-notification',
        )
        if (inAppJob) scheduledJobs.push(inAppJob)
      }
    }

    logger.info(
      `${scheduledJobs.length} VAT return notificaties gepland voor gebruiker ${userId}`,
      {
        tenantId,
        userId,
        deadline: deadlineInfo.deadline,
        scheduledJobsCount: scheduledJobs.length,
      },
    )

    return scheduledJobs
  } catch (error) {
    logger.error(
      `Fout bij plannen VAT return notificaties voor gebruiker ${userId}:`,
      error as Record<string, unknown>,
    )
    throw error
  }
}

/**
 * Get queue statistics and health information
 */
const getQueueStats = async () => {
  try {
    const waiting = await vatReturnNotificationQueue.getWaiting()
    const active = await vatReturnNotificationQueue.getActive()
    const completed = await vatReturnNotificationQueue.getCompleted()
    const failed = await vatReturnNotificationQueue.getFailed()
    const delayed = await vatReturnNotificationQueue.getDelayed()

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total:
        waiting.length +
        active.length +
        completed.length +
        failed.length +
        delayed.length,
    }
  } catch (error) {
    logger.error(
      'Fout bij ophalen queue statistieken:',
      error as Record<string, unknown>,
    )
    throw error
  }
}

export {
  vatReturnNotificationQueue,
  scheduleVATReturnNotification,
  cancelVATReturnNotification,
  scheduleAllVATReturnNotifications,
  getQueueStats,
}
