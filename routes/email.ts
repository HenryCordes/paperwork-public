import express from 'express'

import {
  getEmail,
  createOrUpdateEmail,
  deleteEmail,
  sendEmail,
  sendTestEmail,
} from '../controllers/emails'
import { protect } from '../middleware/auth'

const router = express.Router()

// Single email operations
router.get('/:id', protect, getEmail)
router.post('/', protect, createOrUpdateEmail)
router.delete('/:id', protect, deleteEmail)
router.post('/send', protect, sendEmail)
router.post('/test-template', protect, sendTestEmail)

export = router
