import express from 'express'

import { scanInvoice } from '../controllers/invoiceExtraction'
import { getInvoices, getInvoicesList } from '../controllers/invoices'
import { protect } from '../middleware/auth'
import scanUpload from '../services/invoiceExtraction/upload'

const router = express.Router()

// Main routes to get all invoices
router.get('/', protect, getInvoices)
// List format
router.get('/list', protect, getInvoicesList)

// LLM-based extraction for a scanned invoice/receipt image — behind
// LLM_INVOICE_EXTRACTION_ENABLED. Persists the uploaded image to S3 as a
// side effect (see controllers/invoiceExtraction.ts) and returns its
// location as `data.fileLocation`; callers should reuse that location
// instead of uploading the same image again when saving the record.
router.post(
  '/scan',
  protect,
  (req, res, next) => {
    scanUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message })
      }
      next()
    })
  },
  scanInvoice,
)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
