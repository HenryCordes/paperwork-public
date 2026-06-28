/**
 * VAT Return Notification Processor
 * Processes different types of VAT return deadline notifications
 */

import { Job } from 'bull'

import FCMToken from '../../../models/FCMToken'
import vatReturnReminderTemplate from '../../../templates/vatReturnReminderTemplate'
import { sendEmail } from '../../emailService'
import { getLogger } from '../../logger'
import notificationService from '../../notificationService'

const logger = getLogger()

interface VATNotificationData {
  notificationType?: string
  deadline?: string
  periodType?: string
  period?: string | number
  year?: number
  daysUntilDeadline?: number
  isSecondReminder?: boolean
  userEmail?: string
  userName?: string
  companyName?: string
  [key: string]: unknown
}

interface VATJobData {
  tenantId: string
  userId: string
  data: VATNotificationData
}

/**
 * Process VAT return notification job
 */
const processVATReturnNotification = async (job: Job) => {
  const jobData = job.data as VATJobData
  const {
    tenantId,
    userId,
    data: {
      notificationType,
      deadline,
      daysUntilDeadline,
      isSecondReminder = false,
    },
  } = jobData

  logger.info(
    `Verwerken VAT return notificatie: ${notificationType} voor gebruiker ${userId}`,
    {
      tenantId,
      userId,
      notificationType,
      deadline,
      daysUntilDeadline,
      isSecondReminder,
    },
  )

  try {
    let result

    switch (notificationType) {
      case 'email-reminder':
        result = await processEmailReminder(jobData)
        break
      case 'push-notification':
        result = await processPushNotification(jobData)
        break
      case 'in-app-notification':
        result = await processInAppNotification(jobData)
        break
      default:
        throw new Error(`Onbekend notificatie type: ${notificationType}`)
    }

    // Update notification preferences with last sent timestamp
    await updateNotificationHistory(userId, tenantId)

    logger.info(
      `VAT return notificatie succesvol verwerkt: ${notificationType} voor gebruiker ${userId}`,
      {
        tenantId,
        userId,
        notificationType,
        result,
      },
    )

    return result
  } catch (error) {
    logger.error(
      `Fout bij verwerken VAT return notificatie: ${notificationType} voor gebruiker ${userId}`,
      {
        tenantId,
        userId,
        notificationType,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    )
    throw error
  }
}

/**
 * Process email reminder notification
 */
const processEmailReminder = async (jobData: VATJobData) => {
  const {
    data: {
      deadline,
      periodType,
      period,
      year,
      daysUntilDeadline,
      userEmail,
      userName,
      companyName,
      isSecondReminder,
    },
  } = jobData

  // Format period label in Dutch
  const periodLabel = formatPeriodLabel(periodType, period, year)
  const deadlineFormatted = formatDate(deadline)

  const subject = isSecondReminder
    ? `Laatste herinnering: BTW aangifte deadline ${deadlineFormatted}`
    : `BTW aangifte herinnering: ${periodLabel}`

  const templateData = {
    userName: userName || 'Gebruiker',
    companyName: companyName || 'Uw bedrijf',
    periodLabel,
    deadline: deadlineFormatted,
    daysUntilDeadline,
    isSecondReminder,
    // Links for quick actions
    exportUrl: `${process.env.CLIENT_URL}/taxes`,
    loginUrl: `${process.env.CLIENT_URL}/login`,
  }

  const htmlContent = vatReturnReminderTemplate(templateData)

  const emailData = {
    to: userEmail as string,
    from: process.env.FROM_EMAIL || 'noreply@paper-work.nl',
    subject,
    html: htmlContent,
    text: `BTW Aangifte Herinnering\n\nPeriode: ${periodLabel}\nDeadline: ${deadlineFormatted}\nNog ${daysUntilDeadline} dagen\n\nMaak uw BTW export: ${process.env.CLIENT_URL}/taxes`,
  }

  logger.info(`Versturen BTW herinnering email naar ${userEmail}`, {
    subject,
    periodLabel,
    deadline: deadlineFormatted,
    daysUntilDeadline,
    isSecondReminder,
  })

  const result = await sendEmail(emailData)

  return {
    type: 'email',
    success: true,
    recipient: userEmail,
    subject,
    messageId: (result as { messageId?: string }).messageId,
  }
}

/**
 * Process push notification
 */
const processPushNotification = async (jobData: VATJobData) => {
  const { tenantId, userId, data } = jobData

  const {
    deadline,
    periodType,
    period,
    year,
    daysUntilDeadline,
    isSecondReminder,
  } = data

  logger.info(`Push notification data ontvangen`, {
    tenantId,
    userId,
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    year,
    periodType,
    period,
  })

  const periodLabel = formatPeriodLabel(periodType, period, year)
  const deadlineFormatted = formatDate(deadline)

  try {
    const tokens = await FCMToken.find({
      userId,
      tenantId,
      isActive: true,
    })

    if (tokens.length === 0) {
      logger.info(`Geen actieve FCM tokens gevonden voor gebruiker ${userId}`, {
        tenantId,
        userId,
      })

      return {
        type: 'push',
        success: false,
        error: 'No active FCM tokens found',
        userId,
        tenantId,
      }
    }

    const title = isSecondReminder
      ? 'Laatste BTW herinnering!'
      : 'BTW Aangifte Herinnering'
    const body = `${periodLabel} - Deadline: ${deadlineFormatted} (${daysUntilDeadline} dagen)`

    logger.info(`Versturen BTW notificatie voor gebruiker ${userId}`, {
      tenantId,
      userId,
      title,
      daysUntilDeadline,
      isSecondReminder,
    })

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title,
      body,
      type: 'vat_deadline',
      action: 'view',
      data: {
        deadline,
        periodType,
        period,
        year: year?.toString() || new Date().getFullYear().toString(),
        daysUntilDeadline: daysUntilDeadline?.toString() || '0',
        isSecondReminder: isSecondReminder?.toString() || 'false',
      },
    })

    logger.info(`BTW notificatie verwerkt voor gebruiker ${userId}`, {
      tenantId,
      userId,
      notificationId: result.notificationId,
      sent: result.sent,
      successCount: result.results?.filter((r) => r.success).length || 0,
      totalDevices: result.results?.length || 0,
    })

    return {
      type: 'push',
      success: result.sent && result.results?.some((r) => r.success),
      title,
      body,
      notificationId: result.notificationId,
      sent: result.sent,
      results: result.results || [],
    }
  } catch (error) {
    logger.error(
      `Fout bij verwerken push notificatie voor gebruiker ${userId}`,
      {
        tenantId,
        userId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    )

    return {
      type: 'push',
      success: false,
      error: (error as Error).message,
      userId,
      tenantId,
    }
  }
}

/**
 * Process in-app notification
 */
const processInAppNotification = async (jobData: VATJobData) => {
  const { tenantId, userId, data } = jobData

  const {
    deadline,
    periodType,
    period,
    year,
    daysUntilDeadline,
    isSecondReminder,
  } = data

  const periodLabel = formatPeriodLabel(periodType, period, year)
  const deadlineFormatted = formatDate(deadline)

  // TODO: Implement in-app notification storage (a notifications collection
  // the frontend can query).

  const notificationData = {
    userId,
    tenantId,
    type: 'vat-return-reminder',
    title: isSecondReminder
      ? 'Laatste BTW herinnering!'
      : 'BTW Aangifte Herinnering',
    message: `${periodLabel} - Deadline: ${deadlineFormatted} (${daysUntilDeadline} dagen)`,
    data: {
      deadline,
      periodType,
      period,
      year,
      daysUntilDeadline,
      isSecondReminder,
    },
    read: false,
    createdAt: new Date(),
  }

  logger.info(`In-app notificatie voorbereid voor gebruiker ${userId}`, {
    tenantId,
    userId,
    title: notificationData.title,
    daysUntilDeadline,
    isSecondReminder,
  })

  logger.info('In-app notificatie data voorbereid (implementatie volgt)', {
    notificationData,
  })

  return {
    type: 'in-app',
    success: true,
    title: notificationData.title,
    message: notificationData.message,
    prepared: true,
    note: 'In-app notification prepared for future implementation',
  }
}

/**
 * Update notification history in user preferences
 */
const updateNotificationHistory = async (userId: string, _tenantId: string) => {
  try {
    // TODO: Re-enable when circular dependency is resolved.
    logger.info(
      `Notificatie geschiedenis bijwerken voor gebruiker ${userId} (tijdelijk uitgeschakeld)`,
    )
  } catch (error) {
    logger.error(
      `Fout bij bijwerken notificatie geschiedenis voor gebruiker ${userId}:`,
      error as Record<string, unknown>,
    )
    // Don't throw error as this is not critical for the notification process
  }
}

/**
 * Format period label in Dutch
 */
const formatPeriodLabel = (
  periodType?: string,
  period?: string | number,
  year?: number,
): string => {
  switch (periodType) {
    case 'monthly': {
      const months: Record<number, string> = {
        1: 'Januari',
        2: 'Februari',
        3: 'Maart',
        4: 'April',
        5: 'Mei',
        6: 'Juni',
        7: 'Juli',
        8: 'Augustus',
        9: 'September',
        10: 'Oktober',
        11: 'November',
        12: 'December',
      }
      return `${months[parseInt(String(period))]} ${year}`
    }
    case 'quarterly':
      return `${period} ${year}`
    case 'yearly':
      return `Jaar ${year}`
    default:
      return `${period} ${year}`
  }
}

/**
 * Format date in Dutch format
 */
const formatDate = (dateString?: string): string => {
  return new Date(dateString as string).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export {
  processVATReturnNotification,
  // Exported for unit testing (Phase 3 pure-helper coverage)
  formatPeriodLabel,
  formatDate,
}
