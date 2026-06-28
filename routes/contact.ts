import express from 'express'

import {
  getContact,
  createOrUpdateContact,
  deleteContact,
} from '../controllers/contacts'
import { protect } from '../middleware/auth'

const router = express.Router()

// Individual contact operations
router.get('/:id', protect, getContact)
router.post('/', protect, createOrUpdateContact)
router.delete('/:id', protect, deleteContact)

export = router
