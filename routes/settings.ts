import express from 'express'

import { getSettings, createOrUpdateSettings } from '../controllers/settings'
import { protect } from '../middleware/auth'

const router = express.Router()

// Get and update settings
router.get('/', protect, getSettings)
router.post('/', protect, createOrUpdateSettings)

export = router
