import { Request, Response } from 'express'

import asyncHandler from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import FCMToken from '../models/FCMToken'
import Notification from '../models/Notification'
import firebaseService from '../services/firebaseService'
import { createControllerLogger } from '../services/logger/utils'
import notificationService from '../services/notificationService'

const logger = createControllerLogger('notifications')

/**
 * @desc    Register FCM token for push notifications
 * @route   POST /api/notifications/register-token
 * @access  Private
 */
export const registerToken = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger = req.logger || logger.child({ operation: 'registerToken' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id
    const { token, platform } = req.body

    reqLogger.info('Registering FCM token', {
      platform,
      tokenPrefix: token ? `${token.substring(0, 10)}...` : null,
    })

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Token and platform are required',
      })
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Platform must be ios, android, or web',
      })
    }

    try {
      const validation = await firebaseService.validateToken(token)
      if (!validation.valid) {
        reqLogger.warn('Invalid FCM token provided', {
          platform,
          error: validation.error,
        })

        return res.status(400).json({
          success: false,
          error: 'Invalid FCM token',
        })
      }

      const existingToken = await FCMToken.findOne({ token })

      if (existingToken) {
        if (
          existingToken.userId.toString() === userId &&
          existingToken.tenantId.toString() === tenantId
        ) {
          existingToken.lastUsed = new Date()
          existingToken.isActive = true
          existingToken.platform = platform
          await existingToken.save()

          reqLogger.info('Updated existing FCM token', {
            platform,
          })
        } else {
          await FCMToken.deleteOne({ token })

          await FCMToken.create({
            userId,
            tenantId,
            token,
            platform,
            isActive: true,
            lastUsed: new Date(),
          })

          reqLogger.info('Replaced FCM token with new user', {
            platform,
          })
        }
      } else {
        await FCMToken.deleteMany({ userId, tenantId, platform })

        await FCMToken.create({
          userId,
          tenantId,
          token,
          platform,
          isActive: true,
          lastUsed: new Date(),
        })

        reqLogger.info('Created new FCM token', {
          platform,
        })
      }

      res.status(200).json({
        success: true,
        message: 'FCM token registered successfully',
      })
    } catch (error) {
      reqLogger.error('Failed to register FCM token', {
        platform,
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to register FCM token',
      })
    }
  },
)

/**
 * @desc    Remove FCM token
 * @route   DELETE /api/notifications/remove-token
 * @access  Private
 */
export const removeToken = asyncHandler(async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger.child({ operation: 'removeToken' })

  const tenantIdFromOrg = req.organizationId
  const tenantId = getCurrentTenantId(tenantIdFromOrg)
  const userId = req.user?.id
  const { token } = req.body

  reqLogger.info('Removing FCM token', {
    tokenPrefix: token ? `${token.substring(0, 10)}...` : null,
  })

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Token is required',
    })
  }

  try {
    const result = await FCMToken.deleteOne({
      token,
      userId,
      tenantId,
    })

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    reqLogger.info('FCM token removed successfully')

    res.status(200).json({
      success: true,
      message: 'FCM token removed successfully',
    })
  } catch (error) {
    reqLogger.error('Failed to remove FCM token', {
      error: (error as Error).message,
    })

    res.status(500).json({
      success: false,
      error: 'Failed to remove FCM token',
    })
  }
})

/**
 * @desc    Get user's FCM tokens
 * @route   GET /api/notifications/tokens
 * @access  Private
 */
export const getTokens = asyncHandler(async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger.child({ operation: 'getTokens' })

  const tenantIdFromOrg = req.organizationId
  const tenantId = getCurrentTenantId(tenantIdFromOrg)
  const userId = req.user?.id

  try {
    const tokens = await FCMToken.find({
      userId,
      tenantId,
      isActive: true,
    }).select('platform createdAt lastUsed')

    res.status(200).json({
      success: true,
      data: tokens,
    })
  } catch (error) {
    reqLogger.error('Failed to get FCM tokens', {
      error: (error as Error).message,
    })

    res.status(500).json({
      success: false,
      error: 'Failed to get FCM tokens',
    })
  }
})

/**
 * @desc    Update push notification settings
 * @route   PUT /api/notifications/settings
 * @access  Private
 */
export const updateSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'updateSettings' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id
    const { enabled } = req.body

    reqLogger.info('Updating push notification settings', {
      enabled,
    })

    try {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'enabled must be a boolean value',
        })
      }

      if (enabled) {
        await FCMToken.updateMany({ userId, tenantId }, { isActive: true })
      } else {
        await FCMToken.updateMany({ userId, tenantId }, { isActive: false })
      }

      reqLogger.info('Push notification settings updated', {
        enabled,
      })

      res.status(200).json({
        success: true,
        message: `Push notifications ${
          enabled ? 'enabled' : 'disabled'
        } successfully`,
      })
    } catch (error) {
      reqLogger.error('Failed to update push notification settings', {
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to update push notification settings',
      })
    }
  },
)

/**
 * @desc    Test push notification
 * @route   POST /api/notifications/test
 * @access  Private
 */
export const testNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'testNotification' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id as string

    const { type = 'general', targetId } = req.body

    const validTypes = ['general', 'vat_deadline']
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid notification type. Must be one of: ${validTypes.join(
          ', ',
        )}`,
      })
    }

    const testMessages: Record<string, { title: string; body: string }> = {
      general: {
        title: 'Test Notificatie',
        body: 'Dit is een test notificatie van Paperwork!',
      },
      vat_deadline: {
        title: 'Test BTW Herinnering',
        body: 'BTW aangifte deadline nadert - Dit is een test',
      },
    }

    const message = testMessages[type]

    reqLogger.info('Sending test notification', {
      type,
      targetId,
    })

    try {
      const result = await notificationService.sendNotification({
        userId,
        tenantId,
        title: message.title,
        body: message.body,
        type,
        targetId: targetId || undefined,
        action: 'view',
        data: {
          timestamp: Date.now().toString(),
          isTest: 'true',
        },
      })

      reqLogger.info('Test notification sent successfully', {
        notificationId: result.notificationId,
        sent: result.sent,
      })

      res.status(200).json({
        success: true,
        message: 'Test notification sent',
        notificationId: result.notificationId,
        sent: result.sent,
        results: result.results || [],
      })
    } catch (error) {
      reqLogger.error('Failed to send test notification', {
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to send test notification',
      })
    }
  },
)

/**
 * @desc    Get all notifications for the current user
 * @route   GET /api/notifications
 * @access  Private
 */
export const getNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'getNotifications' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id
    const { status, type } = req.query

    try {
      const query: Record<string, unknown> = { userId, tenantId }

      if (status === 'unread') {
        query.read = false
      } else if (status === 'read') {
        query.read = true
      }

      if (
        type &&
        ['expense', 'invoice', 'vat_deadline', 'general'].includes(
          type as string,
        )
      ) {
        query.type = type
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .lean()

      res.status(200).json({
        success: true,
        data: notifications,
      })
    } catch (error) {
      reqLogger.error('Failed to get notifications', {
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to get notifications',
      })
    }
  },
)

/**
 * @desc    Mark a notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const reqLogger = req.logger || logger.child({ operation: 'markAsRead' })

  const tenantIdFromOrg = req.organizationId
  const tenantId = getCurrentTenantId(tenantIdFromOrg)
  const userId = req.user?.id
  const { id } = req.params
  const { read } = req.body

  try {
    const notification = await Notification.findOne({
      _id: id,
      userId,
      tenantId,
    })

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      })
    }

    notification.read = typeof read === 'boolean' ? read : true
    await notification.save()

    reqLogger.info('Notification marked as read', {
      notificationId: id,
      read: notification.read,
    })

    res.status(200).json({
      success: true,
      data: notification,
    })
  } catch (error) {
    reqLogger.error('Failed to mark notification as read', {
      notificationId: id,
      error: (error as Error).message,
    })

    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    })
  }
})

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/mark-all-read
 * @access  Private
 */
export const markAllAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger = req.logger || logger.child({ operation: 'markAllAsRead' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id

    try {
      const result = await Notification.updateMany(
        { userId, tenantId, read: false },
        { read: true },
      )

      reqLogger.info('All notifications marked as read', {
        count: result.modifiedCount,
      })

      res.status(200).json({
        success: true,
        count: result.modifiedCount,
      })
    } catch (error) {
      reqLogger.error('Failed to mark all notifications as read', {
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read',
      })
    }
  },
)

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
export const deleteNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'deleteNotification' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id
    const { id } = req.params

    try {
      const result = await Notification.deleteOne({
        _id: id,
        userId,
        tenantId,
      })

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
        })
      }

      reqLogger.info('Notification deleted', {
        notificationId: id,
      })

      res.status(200).json({
        success: true,
      })
    } catch (error) {
      reqLogger.error('Failed to delete notification', {
        notificationId: id,
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to delete notification',
      })
    }
  },
)

/**
 * @desc    Get unread notification count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'getUnreadCount' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id

    try {
      const count = await Notification.countDocuments({
        userId,
        tenantId,
        read: false,
      })

      res.status(200).json({
        success: true,
        count,
      })
    } catch (error) {
      reqLogger.error('Failed to get unread count', {
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to get unread count',
      })
    }
  },
)

/**
 * @desc    Mark a notification as received
 * @route   PUT /api/notifications/:id/received
 * @access  Private
 */
export const markAsReceived = asyncHandler(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'markAsReceived' })

    const tenantIdFromOrg = req.organizationId
    const tenantId = getCurrentTenantId(tenantIdFromOrg)
    const userId = req.user?.id
    const { id } = req.params

    try {
      const notification = await Notification.findOne({
        _id: id,
        userId,
        tenantId,
      })

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
        })
      }

      notification.received = true
      notification.receivedAt = new Date()
      await notification.save()

      reqLogger.info('Notification marked as received', {
        notificationId: id,
      })

      res.status(200).json({
        success: true,
        data: notification,
      })
    } catch (error) {
      reqLogger.error('Failed to mark notification as received', {
        notificationId: id,
        error: (error as Error).message,
      })

      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as received',
      })
    }
  },
)
