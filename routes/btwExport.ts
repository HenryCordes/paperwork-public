import express from 'express'

import {
  exportBTWAangifte,
  getBTWSummary,
  getNextBTWDeadline,
  getBTWPeriods,
} from '../controllers/btwExport'
import { protect } from '../middleware/auth'

const router = express.Router()

/**
 * BTW Export Routes
 * All routes require authentication and use tenant isolation
 */

// @desc    Export BTW aangifte for specified period
// @route   GET /api/btw-export/export
// @access  Private
// @params  periodType, period, year, format (optional), includeDetails (optional)
router.get('/export', protect, exportBTWAangifte)

// @desc    Get BTW summary for specified period (preview without file)
// @route   GET /api/btw-export/summary
// @access  Private
// @params  periodType, period, year
router.get('/summary', protect, getBTWSummary)

// @desc    Get next BTW deadline for tenant
// @route   GET /api/btw-export/deadline
// @access  Private
// @params  periodType (optional, defaults to quarterly)
router.get('/deadline', protect, getNextBTWDeadline)

// @desc    Get available periods and years for BTW export
// @route   GET /api/btw-export/periods
// @access  Private
router.get('/periods', protect, getBTWPeriods)

export = router
