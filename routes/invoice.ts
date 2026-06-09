import express from 'express'

import {
  getInvoice,
  createOrUpdateInvoice,
  deleteInvoice,
  downloadInvoice,
} from '../controllers/invoices'
import { protect } from '../middleware/auth'

const router = express.Router()

// Individual invoice operations
router.get('/:id', protect, getInvoice)
router.post('/', protect, createOrUpdateInvoice)
router.delete('/:id', protect, deleteInvoice)
router.get('/download/:id', protect, downloadInvoice)

export = router
