import express from 'express'

import { getDocument, createDocument } from '../controllers/documents'
import { protect } from '../middleware/auth'

const router = express.Router()

// Individual document operations
router.get('/:organizationId/:id', getDocument)
router.post('/', protect, createDocument)

export = router
