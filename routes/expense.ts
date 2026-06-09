import express from 'express'

import {
  getExpense,
  createOrUpdateExpense,
  deleteExpense,
} from '../controllers/expenses'
import { protect } from '../middleware/auth'

const router = express.Router()

// Individual expense operations
router.get('/:id', protect, getExpense)
router.post('/', protect, createOrUpdateExpense)
router.delete('/:id', protect, deleteExpense)

export = router
