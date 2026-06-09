import express from 'express'

import { getInvoices, getInvoicesList } from '../controllers/invoices'
import { protect } from '../middleware/auth'

const router = express.Router()

// Main routes to get all invoices
router.get('/', protect, getInvoices)
// List format
router.get('/list', protect, getInvoicesList)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
