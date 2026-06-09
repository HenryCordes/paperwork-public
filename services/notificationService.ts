import { Types } from 'mongoose'

import FCMToken from '../models/FCMToken'
import Notification from '../models/Notification'

import firebaseService from './firebaseService'
import { getLogger } from './logger'

const logger = getLogger()

type IdLike = Types.ObjectId | string

interface SendNotificationArgs {
  userId: IdLike
  tenantId: IdLike
  title: string
  body: string
  type?: string
  targetId?: string | null
  action?: string
  data?: Record<string, unknown>
}

class NotificationService {
  async sendNotification({
    userId,
    tenantId,
    title,
    body,
    type = 'general',
    targetId = null,
    action = 'view',
    data = {},
  }: SendNotificationArgs) {
    try {
      const notificationRecord = await Notification.create({
        userId,
        tenantId,
        title,
        body,
        type,
        targetId,
        action,
        read: false,
        received: false,
        data,
      })

      logger.info(
        `[NotificationService] Created notification record ${notificationRecord._id}`,
        {
          userId,
          tenantId,
          type,
        },
      )

      const tokens = await FCMToken.find({
        userId,
        tenantId,
        isActive: true,
      })

      if (tokens.length === 0) {
        logger.warn(
          `[NotificationService] No active FCM tokens found for user`,
          {
            userId,
            tenantId,
          },
        )
        return {
          success: true,
          notificationId: notificationRecord._id.toString(),
          sent: false,
          reason: 'No active tokens',
        }
      }

      const pushData = {
        notificationId: notificationRecord._id.toString(),
        type,
        targetId: targetId || '',
        action,
        ...data,
      }

      const results = []
      for (const tokenDoc of tokens) {
        const result = await firebaseService.sendPushNotification(
          tokenDoc.token,
          { title, body },
          pushData,
        )

        if (result.shouldRemoveToken) {
          await FCMToken.deleteOne({ _id: tokenDoc._id })
          logger.info(`[NotificationService] Removed invalid FCM token`, {
            userId,
            tenantId,
            platform: tokenDoc.platform,
          })
        }

        results.push({
          platform: tokenDoc.platform,
          success: result.success,
          error: result.error,
        })
      }

      const successCount = results.filter((r) => r.success).length

      logger.info(
        `[NotificationService] Push notifications sent ${successCount}/${results.length}`,
        {
          userId,
          tenantId,
          notificationId: notificationRecord._id.toString(),
        },
      )

      return {
        success: true,
        notificationId: notificationRecord._id.toString(),
        sent: true,
        results,
      }
    } catch (error) {
      logger.error(`[NotificationService] Failed to send notification`, {
        userId,
        tenantId,
        error: (error as Error).message,
      })
      throw error
    }
  }
}

export = new NotificationService()
