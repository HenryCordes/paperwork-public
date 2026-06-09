import express from 'express'

import {
  getDashboardStats,
  regenerateStats,
  getReportTemplates,
} from '../controllers/dashboard'
import { protect } from '../middleware/auth'

const router = express.Router()

/**
 * Dashboard routes - all protected by authentication
 */

// Get dashboard statistics with optional filtering
router.get('/stats', protect, getDashboardStats)

// Get dashboard data for frontend visualization
router.get('/', protect, getDashboardStats)

router.post('/regenerate', protect, regenerateStats)

// Get saved report templates for the current tenant
router.get('/report-templates', protect, getReportTemplates)

export = router
