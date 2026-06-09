import express from 'express'

import {
  register,
  login,
  getMe,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  sendResetEmail,
} from '../controllers/auth'
import { protect } from '../middleware/auth'

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/send-reset-email', sendResetEmail)
router.get('/me', protect, getMe)
router.get('/profile', protect, getProfile)
router.post('/profile', protect, updateProfile)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
