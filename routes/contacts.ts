import express from 'express'

import { getContacts, getContactsByType } from '../controllers/contacts'
import { protect } from '../middleware/auth'

const router = express.Router()

// For /api/contacts endpoint
router.get('/', protect, getContacts)
router.get('/type/:typeName', protect, getContactsByType)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
