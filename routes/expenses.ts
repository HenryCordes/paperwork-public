import express from 'express'

import { getExpenses } from '../controllers/expenses'
import { protect } from '../middleware/auth'

const router = express.Router()

// Main route to get all expenses
router.get('/', protect, getExpenses)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
