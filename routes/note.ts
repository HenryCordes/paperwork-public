import express from 'express'

import { getNote, createOrUpdateNote, deleteNote } from '../controllers/notes'
import { protect } from '../middleware/auth'

const router = express.Router()

// Single note operations
router.get('/:id', protect, getNote)
router.post('/', protect, createOrUpdateNote)
router.delete('/:id', protect, deleteNote)

export = router
