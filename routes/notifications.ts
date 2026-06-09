import express from 'express'

import {
  registerToken,
  removeToken,
  getTokens,
  updateSettings,
  testNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  markAsReceived,
} from '../controllers/notifications'
import { protect } from '../middleware/auth'
import { bindCurrentNamespace as tenantMiddleware } from '../middleware/tenantHelper'

const router = express.Router()

router.use(protect)
router.use(tenantMiddleware)

router.post('/register-token', registerToken)
router.delete('/remove-token', removeToken)
router.get('/tokens', getTokens)
router.put('/settings', updateSettings)
router.post('/test', testNotification)

router.get('/', getNotifications)
router.get('/unread-count', getUnreadCount)
router.put('/mark-all-read', markAllAsRead)
router.put('/:id/read', markAsRead)
router.put('/:id/received', markAsReceived)
router.delete('/:id', deleteNotification)

export = router
