import { Request, Response, NextFunction } from 'express'

import Subscription from '../models/Subscription'

import asyncHandlers from './async'
import { getCurrentTenantId } from './tenantHelper'

/**
 * Middleware to verify if a user has an active subscription.
 * Checks both subscription status and payment date.
 */
export const verifySubscriptionActive = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Public routes that should always be accessible regardless of subscription
      const publicPaths = [
        // Auth routes
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',

        // Mollie webhook - must remain accessible
        '/api/payment/mollie/webhook',

        // Subscription management routes
        '/api/subscriptions',
        '/api/subscription',
        '/api/payment/subscription',
        '/api/payment/subscription/handle-payment-issues',
        '/api/payment/mollie/subscription',
      ]

      // Check if path starts with any of the public paths
      const currentPath = req.originalUrl.split('?')[0] // Remove query parameters
      if (
        publicPaths.some((path) => currentPath.startsWith(path)) ||
        currentPath.includes('/payment/subscription/')
      ) {
        return next()
      }

      // Try multiple sources to get the tenant ID
      let tenantId: string | undefined

      // 1. First try the request's organizationId set by the auth middleware
      if (req.organizationId) {
        tenantId = req.organizationId
      }
      // 2. Then try the CLS namespace (original approach)
      else if (getCurrentTenantId()) {
        tenantId = getCurrentTenantId()
      }
      // 3. Finally check user object directly as a last resort
      else if (req.user && req.user.organization) {
        tenantId = req.user.organization.toString()
      }

      if (!tenantId) {
        return next()
      }

      // Find active subscription for this tenant
      const tenantSubscription = Subscription.byTenant(tenantId)
      const subscription = await tenantSubscription
        .findOne({
          subscriptionStatus: { $in: ['active', 'pending', 'payment_issue'] },
        })
        .sort({ createdAt: -1 })
        .lean()

      // Check if there's a subscription with payment issues
      const hasPaymentIssues =
        subscription && subscription.subscriptionStatus === 'payment_issue'

      // Handle no subscription case
      if (!subscription) {
        console.log(`No active subscription found for tenant: ${tenantId}`)
        return res.status(402).json({
          success: false,
          message: 'Subscription required',
          redirectTo: '/subscriptions',
          requiresSetup: true,
        })
      }

      // Pending subscriptions that might be stale (created > 15 minutes ago).
      // Handles the case where a payment was started but failed/aborted.
      if (
        subscription.subscriptionStatus === 'pending' &&
        subscription.createdAt &&
        Date.now() - new Date(subscription.createdAt).getTime() > 1000 * 60 * 15
      ) {
        console.log(`Pending subscription is stale: ${subscription._id}`)
        return res.status(402).json({
          success: false,
          message: 'Your subscription process was not completed',
          redirectTo: '/subscriptions',
          subscriptionId: subscription._id,
          requiresPaymentIssueHandling: true,
        })
      }

      // Check if payment is overdue based on nextPaymentDate
      if (
        subscription.subscriptionStatus === 'active' &&
        subscription.nextPaymentDate &&
        new Date(subscription.nextPaymentDate) < new Date()
      ) {
        console.log(`Payment overdue for subscription: ${subscription._id}`)
        return res.status(402).json({
          success: false,
          message: 'Your subscription payment is overdue',
          redirectTo: '/subscriptions',
          subscriptionId: subscription._id,
          requiresPayment: true,
        })
      }

      // Check if subscription has payment issues
      if (hasPaymentIssues) {
        console.log(`Subscription has payment issues: ${subscription._id}`)
        return res.status(402).json({
          success: false,
          message:
            'Your subscription has payment issues that need to be resolved',
          redirectTo: '/subscriptions',
          subscriptionId: subscription._id,
          requiresPaymentIssueHandling: true,
          paymentFailCount: subscription.paymentFailCount || 0,
        })
      }

      // All checks passed, continue to next middleware
      next()
    } catch (error) {
      console.error('Subscription verification error:', error)
      // On error, allow access rather than blocking user incorrectly
      next()
    }
  },
)
