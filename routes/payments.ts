import express, { Request, Response, NextFunction } from 'express'

import {
  createMollieSubscription,
  processMollieWebhook,
  getSubscription,
  getSubscriptionByOrderId,
  setupRecurringSubscription,
  cancelSubscription,
  getSubscriptionManagement,
  handleSubscriptionPaymentIssues,
} from '../controllers/payments'
import { protect } from '../middleware/auth'
import { setCurrentTenantId } from '../middleware/tenantHelper'

const router = express.Router()

//TODO add protect into the mix
router.get('/subscription/:id', protect, getSubscription)
router.get('/subscription/order/:id', protect, getSubscriptionByOrderId)
router.post('/mollie/subscription', protect, createMollieSubscription)
router.post('/mollie/webhook', processMollieWebhook)

// V2 additions
// Activate is probably never goinfg to be used, we do this in the webhook handler
router.post('/subscription/activate', protect, setupRecurringSubscription)
router.post('/subscription/:id/cancel', protect, cancelSubscription)

// Subscription management route (users are redirected here when subscription is inactive)
router.get('/subscriptions', protect, getSubscriptionManagement)

// Middleware to ensure tenant context is set from organizationId
const ensureTenantContext = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.organizationId) {
    console.log('Setting tenant context explicitly:', req.organizationId)
    setCurrentTenantId(req.organizationId)
  } else if (req.user && req.user.organization) {
    console.log(
      'Setting tenant context from user.organization:',
      req.user.organization,
    )
    setCurrentTenantId(req.user.organization.toString())
  } else {
    console.log('No organization ID found in request for tenant context')
  }
  next()
}

// Route for handling subscriptions with payment issues
// Must keep protect middleware because the controller needs tenant context
router.post(
  '/subscription/handle-payment-issues/:id',
  protect,
  ensureTenantContext, // Add middleware to explicitly set tenant context
  handleSubscriptionPaymentIssues,
)

//Sample route with authorization example for roles.
//router.get('/me', protect, authorize('admin', 'user'),anySecureOperation);

export = router
