import express from 'express'

import {
  queueExpenseExport,
  queueInvoiceExport,
  getExportStatus,
} from '../controllers/exportQueue'
import { generateFinancialSummary } from '../controllers/exportSummary'
import { protect } from '../middleware/auth'

const router = express.Router()

// Base path for these routes will be /api/export

// New unified queue-based POST endpoint for expense exports
router.post('/expenses', protect, queueExpenseExport)

// New unified queue-based POST endpoint for invoice exports
router.post('/invoices', protect, queueInvoiceExport)

// Get export job status
router.get('/status/:jobId', protect, getExportStatus)

// Financial summary export (CSV or XLSX)
router.get('/summary', protect, generateFinancialSummary)

export = router
