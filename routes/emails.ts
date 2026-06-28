import express from 'express'

import { getEmails } from '../controllers/emails'
import { protect } from '../middleware/auth'

const router = express.Router()

// Only list operations for emails
router.get('/', protect, getEmails)

export = router
