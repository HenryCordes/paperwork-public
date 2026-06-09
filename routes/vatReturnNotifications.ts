import express from 'express'

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerScheduleNotifications,
  getQueueStatus,
} from '../controllers/vatReturnNotifications'
import { protect } from '../middleware/auth'

const router = express.Router()

/**
 * @route   GET /api/vat-return-notifications/preferences
 * @desc    Get VAT return notification preferences for current user
 * @access  Private
 */
router.get('/preferences', protect, getNotificationPreferences)

/**
 * @route   PUT /api/vat-return-notifications/preferences
 * @desc    Update VAT return notification preferences
 * @access  Private
 */
router.put('/preferences', protect, updateNotificationPreferences)

/**
 * @route   POST /api/vat-return-notifications/schedule
 * @desc    Manually trigger scheduling of VAT return notifications for current user
 * @access  Private
 */
router.post('/schedule', protect, triggerScheduleNotifications)

/**
 * @route   GET /api/vat-return-notifications/queue-status
 * @desc    Get queue status for debugging
 * @access  Private
 */
router.get('/queue-status', protect, getQueueStatus)

/**
 * Note: Push notification tokens are managed centrally via:
 * - POST /api/notifications/register-token (register/update token)
 * - DELETE /api/notifications/remove-token (remove token)
 */

export = router
