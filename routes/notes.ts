import express from 'express'

import { getNotes } from '../controllers/notes'
import { protect } from '../middleware/auth'

const router = express.Router()

// Only list operations for notes
router.get('/', protect, getNotes)

export = router
