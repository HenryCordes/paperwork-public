import { createMollieClient } from '@mollie/api-client'
import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import { availablePlans } from '../common/plans'
import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Subscription from '../models/Subscription'
import { createControllerLogger } from '../services/logger/utils'
import { queueWelcomeEmail } from '../services/queues/emailQueue'

const logger = createControllerLogger('payments')

// Loose facade over the Mollie client describing exactly the surface this
// controller uses. The @mollie/api-client types are stricter/narrower than the
// legacy usage here (extra fields like nextPaymentDate/links/url, loose create
// params), so we cast once at the boundary instead of scattering casts.
type MolliePayment = {
  id: string
  status: string
  sequenceType?: string
  subscriptionId?: string
  customerId?: string
  profileId?: string
  createdAt?: string
  amount: { value: string; currency: string }
  metadata?: { tenantId?: string; companyName?: string } | null
  nextPaymentDate?: string
  url?: string
  links?: { checkout?: string | { href?: string } }
  _links?: { checkout?: { href?: string } }
}
type MollieSubscription = {
  id: string
  mandateId?: string
  nextPaymentDate?: string
}
type MollieCustomer = { id: string; email?: string }
type MollieMandate = { status: string }

type MollieParams = Record<string, unknown>

interface MollieFacade {
  payments: {
    get(id: string): Promise<MolliePayment>
    create(params: MollieParams): Promise<MolliePayment>
  }
  customerPayments: {
    create(params: MollieParams): Promise<MolliePayment>
  }
  customerSubscriptions: {
    get(id: string, params: MollieParams): Promise<MollieSubscription>
    create(params: MollieParams): Promise<MollieSubscription>
    update(id: string, params: MollieParams): Promise<MollieSubscription>
    cancel(id: string, params: MollieParams): Promise<unknown>
  }
  customers: {
    iterate(): AsyncIterable<MollieCustomer>
    create(params: MollieParams): Promise<MollieCustomer>
  }
  customerMandates: {
    list(params: MollieParams): Promise<{ items: MollieMandate[] }>
  }
}

const mollie = createMollieClient({
  apiKey: process.env.MOLLIE_API_KEY as string,
}) as unknown as MollieFacade

const paymentSuccessPage = process.env.MOLLIE_PAYMENT_SUCCESS_PAGE
const mollieWebhook = process.env.MOLLIE_WEBHOOK

// Mollie returns ISO date strings; the Subscription model types these fields as
// Date (mongoose coerces on save). Cast at the assignment to keep the runtime
// behavior identical.
const asDate = (value: string | undefined): Date => value as unknown as Date

type SubscriptionInput = {
  _id?: string
  name?: string
  email?: string
  companyName?: string
  password?: string
  plan?: string
  price?: string
  currency?: string
  organizationId?: unknown
}

// @Method: POST
// @Route : api/payment/mollie/webhook
// @Desc  : Mollie Webhook
export const processMollieWebhook = asyncHandlers(
  async (req: Request, res: Response) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'processMollieWebhook' })
    reqLogger.info('==MOLLIE-WEBHOOK== Processing Mollie webhook', {
      query: req.query,
      body: req.body,
    })

    let payment: MolliePayment | undefined

    try {
      const { orderId } = req.query
      const { id } = req.body
      let aborted = false

      if (id && orderId) {
        payment = await mollie.payments.get(id)

        // Enhanced debugging to see what's actually in the payment object
        reqLogger.info('Payment metadata received:', {
          metadata: payment.metadata,
          hasMetadata: !!payment.metadata,
          paymentId: id,
          orderId: orderId,
        })

        // Use the established pattern for tenant ID resolution in webhooks
        // This follows the exact pattern from memory guidance
        const tenantId =
          payment.metadata && payment.metadata.tenantId
            ? payment.metadata.tenantId
            : getCurrentTenantId()

        // Log the resolved tenant ID for debugging
        reqLogger.info(`Webhook resolved tenant ID: ${tenantId || 'UNDEFINED'}`)

        // Ensure we have a valid tenantId (log for debugging)
        reqLogger.info(`Webhook using tenant ID: ${tenantId || 'UNDEFINED'}`)

        // If this was a first payment (check for sequenceType === 'first')
        if (payment.sequenceType === 'first') {
          // Create the subscription automatically
          reqLogger.info('Found first payment', { payment })
          const filter = { orderId: orderId }
          const subscription = await Subscription.findOne(filter).exec()
          reqLogger.info('Subscription found: ', { subscription })
          if (subscription) {
            try {
              // Variable to store Mollie subscription data regardless of code path
              let mollieSubscription: MollieSubscription | undefined

              if (payment.subscriptionId) {
                try {
                  // Get existing subscription details
                  mollieSubscription = await mollie.customerSubscriptions.get(
                    payment.subscriptionId,
                    { customerId: payment.customerId },
                  )

                  if (mollieSubscription) {
                    await mollie.customerSubscriptions.update(
                      payment.subscriptionId,
                      {
                        mandateId: mollieSubscription.mandateId,
                        customerId: payment.customerId,
                        amount: {
                          currency: payment.amount.currency,
                          value: payment.amount.value,
                        },
                        interval:
                          subscription.plan === 'Essentials Year'
                            ? '1 year'
                            : '1 month',
                        description: `paperwork ${subscription.plan} - ref: ${orderId}`,
                        webhookUrl: mollieWebhook,
                      },
                    )

                    reqLogger.info(
                      'Subscription updated in Mollie for recurring payment',
                      {
                        subscriptionId: payment.subscriptionId,
                        customerId: payment.customerId,
                        amount: {
                          currency: payment.amount.currency,
                          value: payment.amount.value,
                        },
                        interval:
                          subscription.plan === 'Essentials Year'
                            ? '1 year'
                            : '1 month',
                        description: `paperwork ${subscription.plan} - ref: ${orderId}`,
                        webhookUrl: mollieWebhook,
                      },
                    )
                  }
                } catch (subError) {
                  reqLogger.error('Failed to update subscription:', {
                    error: subError,
                  })
                }
              } else {
                // Only create a new subscription if one doesn't exist already
                // and if the subscription in our DB doesn't have a mollieSubscriptionId yet
                if (!subscription.mollieSubscriptionId) {
                  reqLogger.info(
                    'Creating subscription in Mollie for recurring payment',
                    {
                      customerId: payment.customerId,
                      amount: {
                        currency: payment.amount.currency,
                        value: payment.amount.value,
                      },
                      interval:
                        subscription.plan === 'Essentials Year'
                          ? '1 year'
                          : '1 month',
                      description: `paperwork ${subscription.plan} - ref: ${orderId}`,
                      webhookUrl: mollieWebhook,
                    },
                  )

                  try {
                    mollieSubscription =
                      await mollie.customerSubscriptions.create({
                        customerId: payment.customerId,
                        amount: {
                          currency: payment.amount.currency,
                          value: payment.amount.value,
                        },
                        interval:
                          subscription.plan === 'Essentials Year'
                            ? '1 year'
                            : '1 month',
                        description: `paperwork ${subscription.plan} - ref: ${orderId}`,
                        webhookUrl: mollieWebhook,
                      })

                    reqLogger.info(
                      `Subscription automatically created for recurring payment: ${mollieSubscription.id}`,
                      {
                        mollieSubscription: mollieSubscription,
                      },
                    )

                    // Only update the mollieSubscriptionId if we successfully created one
                    if (mollieSubscription && mollieSubscription.id) {
                      subscription.mollieSubscriptionId = mollieSubscription.id
                      // Store nextPaymentDate from Mollie subscription when available (Req 4.1, 6.4)
                      if (mollieSubscription.nextPaymentDate) {
                        subscription.nextPaymentDate = asDate(
                          mollieSubscription.nextPaymentDate,
                        )
                      }
                    }
                  } catch (createError) {
                    reqLogger.error('Failed to create Mollie subscription:', {
                      error: createError,
                    })
                  }
                } else {
                  reqLogger.info(
                    `Skipping Mollie subscription creation - subscription already has ID: ${subscription.mollieSubscriptionId}`,
                  )
                }
              }

              // Update subscription status based on payment status (Req 4.3)
              // This happens regardless of whether Mollie subscription creation succeeded or failed (Req 4.4)
              subscription.subscriptionStatus =
                payment.status === 'paid' ? 'active' : 'payment_issue'
              subscription.subscriptionPayDate = asDate(payment.createdAt)

              // Send welcome email if it hasn't been sent yet
              if (!subscription.welcomeEmailSent) {
                // Don't need to set welcomeEmailSent=true here as the queue processor will do that
                // Queue the welcome email job
                try {
                  await queueWelcomeEmail(
                    tenantId as string,
                    subscription.userId as string,
                    {
                      subscriptionId: subscription._id.toString(),
                    },
                  )
                  reqLogger.info('Welcome email queued successfully', {
                    tenantId,
                    userId: subscription.userId,
                    subscriptionId: subscription._id,
                  })
                } catch (emailError) {
                  reqLogger.error('Failed to queue welcome email', {
                    tenantId,
                    userId: subscription.userId,
                    error: (emailError as Error).message,
                    subscriptionId: subscription._id,
                  })
                  // Don't throw the error - we don't want to fail the whole webhook process just for email
                }
              }

              // Always save the subscription — even if Mollie subscription creation failed (Req 4.4)
              await subscription.save()

              reqLogger.info(
                `Subscription in paperwork updated after first payment webhook`,
                {
                  subscription: subscription,
                  mollieSubscriptionId: subscription.mollieSubscriptionId,
                },
              )
            } catch (subError) {
              reqLogger.error('Failed to create subscription:', {
                error: subError,
              })
            }
          } else {
            reqLogger.info(
              `Subscription not found, NO Mollie subscription (re occurring payment) created for payment: ${payment.id}`,
            )
          }
        }
        // If this payment is part of a subscription
        if (payment.subscriptionId && payment.sequenceType !== 'first') {
          // Get subscription details
          reqLogger.info(
            `Found subscription SubscriptionId: ${payment.subscriptionId}`,
          )
          reqLogger.info(`CustomerId: ${payment.customerId}`)
          reqLogger.info(`ProfileId: ${payment.profileId}`)
          reqLogger.info(`Companyname: ${payment.metadata?.companyName}`)
          const subscription = await Subscription.findOne({
            orderId: orderId,
            customerId: payment.customerId,
          })
            .lean()
            .exec()

          if (subscription && subscription.mollieSubscriptionId) {
            // Get subscription info from Mollie
            const subscriptionDetails = await mollie.customerSubscriptions.get(
              payment.subscriptionId,
              { customerId: payment.customerId },
            )

            reqLogger.info(`Mollie SubscriptionDetails: ${subscriptionDetails}`)
            reqLogger.info(
              `Updating nextPaymentdate: ${subscriptionDetails.nextPaymentDate}`,
            )

            // Update subscription status and next payment date
            subscription.nextPaymentDate = asDate(
              subscriptionDetails.nextPaymentDate,
            )
          }
        }

        if (payment.status === 'paid') {
          reqLogger.info(`Payment: ${payment.id} is paid`)
          reqLogger.info(`Status: ${payment.status}`)
          reqLogger.info(
            `Price: ${payment.amount.value} ${payment.amount.currency}`,
          )
          reqLogger.info(`CustomerId: ${payment.customerId}`)
          reqLogger.info(`ProfileId: ${payment.profileId}`)
          reqLogger.info(`Companyname: ${payment.metadata?.companyName}`)

          // For successful payments, ensure subscription is active
          if (payment.subscriptionId) {
            // This is a subscription payment, make sure subscription remains active
            reqLogger.info(
              `Successful subscription payment for: ${payment.subscriptionId}`,
            )
          }
        } else if (payment.status === 'failed') {
          // Payment explicitly failed
          reqLogger.info(`Payment ${payment.id} failed`)
          aborted = true

          // If this is a subscription payment that failed, we might want to mark the subscription
          if (payment.subscriptionId) {
            reqLogger.info(
              `Failed subscription payment for: ${payment.subscriptionId}`,
            )
          }
        } else if (payment.status !== 'open') {
          aborted = true
          reqLogger.info(
            'The payment isn"t paid and has expired. We can assume it was aborted',
          )

          // If this is a subscription payment that got aborted
          if (payment.subscriptionId) {
            reqLogger.info(
              `Aborted subscription payment for: ${payment.subscriptionId}`,
            )
            // Similar to failed payments
          }
        }

        // Use tenant-scoped query to prevent tenant field loss
        const filter = { orderId: orderId }
        const tenantSubscription = Subscription.byTenant(tenantId)
        const subscription = await tenantSubscription.findOne(filter).exec()
        if (subscription) {
          // Update basic payment information
          subscription.paymentState = aborted ? 'aborted' : payment.status
          subscription.subscriptionPayDate = asDate(
            payment.createdAt || new Date().toISOString(),
          )
          subscription.paymentId = payment.id
          // NOTE: payment.profileId was assigned here, but `profileId` is not a
          // field on the Subscription schema (strict mode dropped it), so the
          // write never persisted. Removed the dead assignment.
          subscription.paymentPrice = payment.amount.value
          subscription.paymentCurrency = payment.amount.currency

          // Handle subscription status updates based on payment status
          if (payment.status === 'paid') {
            // Successful payment - keep or set subscription as active
            if (subscription.subscriptionStatus !== 'active') {
              subscription.subscriptionStatus = 'active'
            }

            // If this is a recurring payment, update next payment date from Mollie
            if (payment.subscriptionId && subscription.mollieSubscriptionId) {
              try {
                const subscriptionDetails =
                  await mollie.customerSubscriptions.get(
                    payment.subscriptionId,
                    {
                      customerId: subscription.customerId,
                    },
                  )
                subscription.nextPaymentDate = asDate(
                  subscriptionDetails.nextPaymentDate,
                )
                reqLogger.info('Updated next payment date', {
                  nextPaymentDate: subscription.nextPaymentDate,
                })
              } catch (subError) {
                reqLogger.error('Error fetching subscription details:', {
                  error: subError,
                })
                // Don't fail the webhook if we can't get subscription details
              }
            }

            reqLogger.info(
              `Payment ${payment.id} successful - subscription status: ${subscription.subscriptionStatus}`,
            )
          } else if (payment.status === 'failed') {
            // Failed payment - mark subscription as problematic immediately
            // We don't fully cancel as Mollie might retry, but we do restrict access
            subscription.paymentFailCount =
              (subscription.paymentFailCount || 0) + 1

            // Immediately set to payment_issue to restrict access
            subscription.subscriptionStatus = 'payment_issue'

            reqLogger.info(
              `Payment ${payment.id} failed - marking subscription as payment_issue immediately`,
            )
          } else if (aborted) {
            // Aborted/canceled payment
            if (payment.subscriptionId) {
              // This was a subscription payment that got canceled
              subscription.paymentFailCount =
                (subscription.paymentFailCount || 0) + 1

              // Immediately mark as payment_issue
              subscription.subscriptionStatus = 'payment_issue'

              reqLogger.info(
                `Payment ${payment.id} aborted - marking subscription as payment_issue immediately`,
              )
            } else {
              // This was a first payment that got aborted, mark subscription as canceled
              subscription.subscriptionStatus = 'canceled'
            }
          }

          // Save the updated subscription using the tenant-scoped model to preserve tenant field
          // Convert the lean subscription object to a proper $set update operation
          const updateData: Record<string, unknown> = {}
          const subscriptionRecord = subscription as unknown as Record<
            string,
            unknown
          >
          Object.keys(subscriptionRecord).forEach((key) => {
            // Skip _id field as it shouldn't be part of the update
            if (key !== '_id') {
              updateData[key] = subscriptionRecord[key]
            }
          })

          reqLogger.info('Updating subscription with data:', {
            subscriptionStatus: updateData.subscriptionStatus,
            paymentState: updateData.paymentState,
            paymentId: updateData.paymentId,
          })

          const doc = await tenantSubscription
            .findOneAndUpdate(filter, { $set: updateData }, { new: true })
            .exec()

          reqLogger.info(
            `Updated subscription status to: ${
              doc ? doc.subscriptionStatus : 'unknown'
            }`,
          )
        }
      }
      // `payment` is only set when both id and orderId were present. For a
      // malformed/irrelevant webhook, acknowledge with 200 (so Mollie does not
      // retry) instead of dereferencing an undefined payment.
      return res.status(200).json({ status: payment?.status ?? 'ignored' })
    } catch (error) {
      reqLogger.error('Error updating subscription:', {
        error: error,
      })

      return res.status(500).json({ status: error })
    }
  },
)

// @Method: POST
// @Route : api/payment/mollie/subscription
// @Desc  : Create a mollie subscription
export const createMollieSubscription = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'createMollieSubscription' })
    reqLogger.info('Creating subscription with data:', req.body)

    // Check if we're creating a subscription for an existing user
    const isExistingUser = req.body.userId && !req.body.password

    let incoming: SubscriptionInput

    if (isExistingUser) {
      reqLogger.info('Creating subscription for existing user')
      // For existing user - get user data from the database
      const userId = req.body.userId
      const User = (await import('../models/User')).default

      try {
        const user = await User.findById(userId)
        if (!user) {
          reqLogger.info('User not found')
          return res
            .status(404)
            .json({ success: false, message: 'User not found' })
        }

        // Use existing user data
        incoming = {
          _id: userId,
          name: user.name,
          email: user.email,
          companyName: user.companyName || '',
          plan: req.body.plan,
          price: req.body.price,
          currency: req.body.currency,
          organizationId: user.organization,
        }

        reqLogger.info('Using existing user data:', incoming)
      } catch (error) {
        reqLogger.error('Error fetching user data', { error })
        return res.status(500).json({
          success: false,
          message: 'Error fetching user data',
          error: (error as Error).message,
        })
      }
    } else {
      reqLogger.info('Creating subscription for new user')
      // For new user - use data from the request body
      incoming = _.pick(req.body, [
        '_id',
        'name',
        'email',
        'companyName',
        'password',
        'plan',
        'price',
        'currency',
        'organizationId',
      ])

      // Validate required fields for new users
      if (!incoming.email || !incoming.password || !incoming.name) {
        reqLogger.info('Missing required fields: email, password, name')
        return res.status(400).json({
          success: false,
          message: 'Please enter name, email, and password.',
        })
      }
    }

    // Common validation for all users
    if (!incoming.plan || !incoming.price || !incoming.currency) {
      reqLogger.info('Missing required fields: plan, price, currency')
      return res.status(400).json({
        success: false,
        message: 'Please provide plan, price, and currency.',
      })
    }

    try {
      let customer: MollieCustomer | null = null
      for await (const cust of mollie.customers.iterate()) {
        if (cust.email === incoming.email) {
          customer = cust
          break
        }
      }

      if (!customer) {
        reqLogger.info('Mollie customer not found, creating new customer')
        customer = await mollie.customers.create({
          name: incoming.name,
          email: incoming.email,
          metadata: {
            companyName: incoming.companyName,
          },
        })
        reqLogger.info('Mollie customer created', { customer: customer })
      } else {
        reqLogger.info(
          'Mollie customer found in Mollie system while creating subscription - customer id: ' +
            customer.id,
        )
      }

      const orderId = new Date().getTime()
      const subscriptionPayDate = new Date().toISOString()

      reqLogger.info('Creating mollie first payment', {
        amount: incoming.price,
        currency: incoming.currency,
        description: `paperwork ${incoming.plan} - ref: ${orderId}`,
        redirectUrl: `${paymentSuccessPage}?orderId=${orderId}`,
        webhookUrl: `${mollieWebhook}?orderId=${orderId}`,
        sequenceType: 'first',
        customerId: customer.id,
      })

      const payment = await mollie.customerPayments.create({
        amount: { value: incoming.price, currency: incoming.currency },
        description: `paperwork ${incoming.plan} - ref: ${orderId}`,
        redirectUrl: `${paymentSuccessPage}?orderId=${orderId}`,
        webhookUrl: `${mollieWebhook}?orderId=${orderId}`,
        sequenceType: 'first',
        customerId: customer.id,
        metadata: {
          companyName: incoming.companyName,
          tenantId: getCurrentTenantId() || incoming.organizationId,
        },
      })
      reqLogger.info('First mollie payment created', { payment: payment })

      // Use getCurrentTenantId() consistently with a fallback to incoming.organizationId
      const tenantId = getCurrentTenantId() || incoming.organizationId
      reqLogger.info('Using tenant ID for subscription:', { tenantId })

      const tenantSubscription = Subscription.byTenant(tenantId as string)
      const subscription = await tenantSubscription.findOne().lean().exec()
      let result: unknown
      if (subscription) {
        reqLogger.info('Subscription found', { subscription: subscription })
        subscription.plan = incoming.plan
        subscription.orderId = String(orderId)
        subscription.paymentId = payment.id
        // `profileId` is not a Subscription schema field; the original write was
        // dropped by mongoose strict mode and never persisted. Removed.
        subscription.paymentPrice = payment.amount.value
        subscription.paymentCurrency = payment.amount.currency
        subscription.paymentState = payment.status
        subscription.nextPaymentDate = asDate(payment.nextPaymentDate)
        subscription.subscriptionPayDate = asDate(subscriptionPayDate)
        subscription.userId = incoming._id
        const existingUserId = subscription.userIds?.find(
          (c) => c === incoming._id,
        )
        if (!existingUserId) {
          reqLogger.info('User ID not found in subscription', {
            userId: incoming._id,
          })
          subscription.userIds?.push(incoming._id as string)
        }

        const filter = { _id: subscription._id }
        result = await tenantSubscription
          .findOneAndUpdate(
            filter,
            subscription as unknown as Parameters<
              typeof tenantSubscription.findOneAndUpdate
            >[1],
            {
              new: true,
            },
          )
          .lean()
          .exec()

        reqLogger.info('Subscription updated', { subscription: result })
      } else {
        const newSubscription = {
          plan: incoming.plan,
          customerId: customer.id,
          orderId: String(orderId),
          paymentId: payment.id,
          profileId: payment.profileId,
          paymentPrice: payment.amount.value,
          paymentCurrency: payment.amount.currency,
          paymentState: payment.status,
          nextPaymentDate: payment.nextPaymentDate,
          subscriptionPayDate: subscriptionPayDate,
          userId: incoming._id,
          userIds: [incoming._id],
        }
        reqLogger.info('Trying to create subscription', {
          subscription: newSubscription,
        })

        result = await tenantSubscription.create(newSubscription)
        reqLogger.info('Subscription created', { subscription: result })
      }

      reqLogger.info('Payment created returning response success true', {
        payment: payment,
      })
      return res.status(200).json({ success: true, data: payment })
    } catch (error) {
      reqLogger.error('Payment creation failed returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/subscription/:id
// @Desc  : get a subscription
export const getSubscription = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'getSubscription' })
    reqLogger.info(`Getting subscription with id: ${req.params.id}`)

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSubscription = Subscription.byTenant(tenantId)
      const subscription = await tenantSubscription
        .findById(req.params.id)
        .lean()
        .exec()

      if (!subscription) {
        return res
          .status(404)
          .json({ success: false, message: 'Subscription not found..' })
      }
      res.status(200).json({ success: true, data: subscription })
    } catch (error) {
      reqLogger.error('Subscription not found returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/subscription/order/:id
// @Desc  : get a subscription by orderId
export const getSubscriptionByOrderId = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'getSubscriptionByOrderId' })
    reqLogger.info(`Getting subscription by orderId: ${req.params.id}`)

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSubscription = Subscription.byTenant(tenantId)
      const subscription = await tenantSubscription
        .findOne({ orderId: req.params.id })
        .lean()
        .exec()

      if (!subscription) {
        return res
          .status(404)
          .json({ success: false, message: 'Subscription not found..' })
      }
      res.status(200).json({ success: true, data: subscription })
    } catch (error) {
      reqLogger.error('Subscription not found returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

//V2 api additions
// TODO: Probable never use this, see if we need to remove, if staying add support for plans
// @Method: POST
// @Route : api/subscription/activate
// @Desc  : Activate a subscription
export const setupRecurringSubscription = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'setupRecurringSubscription' })
    reqLogger.info('Setting up recurring subscription', {
      body: req.body,
    })
    try {
      const { customerId, orderId } = req.body

      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSubscription = Subscription.byTenant(tenantId)
      const subscription = await tenantSubscription
        .findOne({ orderId })
        .lean()
        .exec()

      if (!subscription) {
        return res
          .status(404)
          .json({ success: false, message: 'Subscription not found' })
      }

      // Check if customer has valid mandate
      const mandates = await mollie.customerMandates.list({ customerId })
      const validMandate = mandates.items.find(
        (mandate) => mandate.status === 'valid' || mandate.status === 'pending',
      )

      if (!validMandate) {
        return res.status(400).json({
          success: false,
          message:
            'No valid mandate found. Customer needs to make a first payment.',
        })
      }

      // Create subscription in Mollie
      const mollieSubscription = await mollie.customerSubscriptions.create({
        customerId: subscription.customerId,
        amount: {
          currency: subscription.paymentCurrency,
          value: subscription.paymentPrice,
        },
        interval: '1 month', // Monthly billing
        description: `Monthly subscription - ${subscription.plan}`,
        webhookUrl: `${mollieWebhook}?orderId=${subscription.orderId}`,
      })

      const subscriptionPayDate = new Date().toISOString()
      const nextPaymentDate = new Date()
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1)

      // Update subscription in your database
      subscription.mollieSubscriptionId = mollieSubscription.id
      subscription.subscriptionStatus = 'active'
      subscription.subscriptionPayDate = asDate(subscriptionPayDate)
      subscription.nextPaymentDate = asDate(nextPaymentDate.toISOString())

      const result = await tenantSubscription
        .findOneAndUpdate(
          { _id: subscription._id },
          subscription as unknown as Parameters<
            typeof tenantSubscription.findOneAndUpdate
          >[1],
          { new: true },
        )
        .lean()
        .exec()

      return res.status(200).json({ success: true, data: result })
    } catch (error) {
      reqLogger.error('Subscription activation failed returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/subscription/:id/cancel
// @Desc  : Cancel a subscription
export const cancelSubscription = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'cancelSubscription' })
    reqLogger.info(`Canceling subscription with id: ${req.params.id}`)

    try {
      const subscriptionId = req.params.id
      // Fall back to req.organizationId (set by `protect`) like the other
      // protected handlers -- the CLS namespace is empty here because
      // bindCurrentNamespace runs before `protect` populates req.user.
      const tenantId = getCurrentTenantId(req.organizationId)
      const tenantSubscription = Subscription.byTenant(tenantId)
      const subscription = await tenantSubscription
        .findById(subscriptionId)
        .lean()
        .exec()

      if (!subscription || !subscription.mollieSubscriptionId) {
        return res
          .status(404)
          .json({ success: false, message: 'Subscription not found' })
      }

      // Cancel the subscription at Mollie
      await mollie.customerSubscriptions.cancel(
        subscription.mollieSubscriptionId,
        { customerId: subscription.customerId },
      )

      // Update status in your database
      subscription.subscriptionStatus = 'canceled'
      const result = await tenantSubscription
        .findOneAndUpdate(
          { _id: subscription._id },
          subscription as unknown as Parameters<
            typeof tenantSubscription.findOneAndUpdate
          >[1],
          { new: true },
        )
        .lean()
        .exec()

      return res.status(200).json({ success: true, data: result })
    } catch (error) {
      reqLogger.error('Subscription cancellation failed returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/subscriptions
// @Desc  : List all subscriptions for the current tenant
export const listSubscriptions = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'listSubscriptions' })
    reqLogger.info('Listing subscriptions')

    try {
      const tenantId = getCurrentTenantId()
      const tenantSubscription = Subscription.byTenant(tenantId)

      // Get subscriptions with optional filtering
      const query: Record<string, unknown> = {}

      // Allow filtering by status if provided
      if (req.query.status) {
        query.subscriptionStatus = req.query.status
      }

      const subscriptions = await tenantSubscription.find(query).lean().exec()

      return res.status(200).json({
        success: true,
        count: subscriptions.length,
        data: subscriptions,
      })
    } catch (error) {
      reqLogger.error('Listing subscriptions failed returning error', {
        error: error,
      })
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/subscription/handle-payment-issues/:id
// @Desc  : Handle a subscription with payment issues (multiple failed payments)
export const handleSubscriptionPaymentIssues = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger ||
      logger.child({ operation: 'handleSubscriptionPaymentIssues' })
    reqLogger.info('Handling subscription payment issues', {
      body: req.body,
    })
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)

      const { id } = req.params

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        })
      }

      const tenantSubscription = Subscription.byTenant(tenantId)

      // Find the subscription
      const subscription = await tenantSubscription.findById(id).exec()

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found',
        })
      }

      // Check if this subscription has payment issues
      if (
        !['payment_issue', 'payment_overdue', 'pending'].includes(
          subscription.subscriptionStatus as string,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This subscription does not have payment issues that need handling',
        })
      }

      // Get action to take from request body
      const { action } = req.body

      // Validate action
      if (!action || !['retry', 'cancel'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Must be 'retry' or 'cancel'",
        })
      }

      if (action === 'cancel') {
        // Cancel the subscription in Mollie if it exists
        if (subscription.mollieSubscriptionId && subscription.customerId) {
          try {
            await mollie.customerSubscriptions.cancel(
              subscription.mollieSubscriptionId,
              { customerId: subscription.customerId },
            )
          } catch (error) {
            // Log but continue - the subscription might already be canceled in Mollie
            reqLogger.error('Error canceling Mollie subscription', {
              error: error,
            })
          }
        }

        // Update subscription in our database
        subscription.subscriptionStatus = 'canceled'
        subscription.cancelDate = asDate(new Date().toISOString())
        await subscription.save()

        return res.status(200).json({
          success: true,
          message: 'Subscription has been canceled due to payment issues',
          data: subscription,
        })
      } else if (action === 'retry') {
        // Reset payment failure count so webhook doesn't trigger payment_issue again immediately
        subscription.paymentFailCount = 0

        // Create a new payment for the subscription
        try {
          // Use Mollie to create a new payment
          const payment = await mollie.payments.create({
            amount: {
              currency: subscription.paymentCurrency || 'EUR',
              value: parseFloat(String(subscription.paymentPrice || 0)).toFixed(
                2,
              ),
            },
            description: `Retry payment for ${
              (subscription as unknown as { description?: string })
                .description || 'subscription'
            }`,
            redirectUrl: process.env.MOLLIE_PAYMENT_SUCCESS_PAGE,
            webhookUrl:
              process.env.MOLLIE_WEBHOOK + `?orderId=${subscription._id}`,
            metadata: {
              orderId: subscription._id.toString(),
              customerId: subscription.customerId,
              tenantId: tenantId,
            },
            customerId: subscription.customerId,
            sequenceType: 'recurring',
          })

          // Update subscription status
          subscription.subscriptionStatus = 'pending'
          await subscription.save()

          return res.status(200).json({
            success: true,
            message: 'Payment retry initiated',
            data: {
              // Extract checkout URL and make sure it's a string
              checkoutUrl:
                typeof payment.links?.checkout === 'string'
                  ? payment.links.checkout
                  : typeof payment._links?.checkout?.href === 'string'
                    ? payment._links.checkout.href
                    : typeof payment.url === 'string'
                      ? payment.url
                      : // If it's an object, try to get href property
                        (typeof payment.links?.checkout === 'object'
                          ? payment.links?.checkout?.href
                          : undefined) ||
                        payment._links?.checkout?.href ||
                        '',
              // Debug the payment object structure
              debug:
                process.env.NODE_ENV === 'development'
                  ? {
                      paymentType: typeof payment,
                      hasLinks: !!payment.links,
                      hasCheckout: !!payment.links?.checkout,
                      linksCheckoutType: typeof payment.links?.checkout,
                      has_Links: !!payment._links,
                      has_LinksCheckout: !!payment._links?.checkout,
                      _linksCheckoutType: typeof payment._links?.checkout,
                    }
                  : undefined,
              paymentId: payment.id,
            },
          })
        } catch (error) {
          reqLogger.error('Error creating retry payment', {
            error: error,
          })
          return res.status(500).json({
            success: false,
            message: 'Failed to create retry payment',
            error: (error as Error).message,
          })
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Use 'cancel' or 'retry'",
        })
      }
    } catch (error) {
      reqLogger.error('Error handling subscription payment issues', {
        error: error,
      })
      return next(error)
    }
  },
)

export const getSubscriptionManagement = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'getSubscriptionManagement' })
    reqLogger.info('Getting subscription management')

    try {
      let tenantId

      // 1. First try the request's organizationId that was set by the auth middleware
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

      // If no tenant ID found, return info for unauthenticated user
      // This helps the frontend display appropriate subscription options
      if (!tenantId) {
        return res.status(200).json({
          success: true,
          data: {
            subscriptions: [],
            activeSubscription: null,
            hasActiveSubscription: false,
            isNewUser: true,
            needsReactivation: false,
            paymentOverdue: false,
            latestPaymentDate: null,
            nextPaymentDate: null,
            availablePlans,
          },
        })
      }

      const tenantSubscription = Subscription.byTenant(tenantId)

      const subscriptions = await tenantSubscription
        .find()
        .sort({ createdAt: -1 })
        .lean()
        .exec()

      // Find the active subscription — trust the database subscriptionStatus field (Req 2.1, 2.2, 2.3)
      const activeSubscription = subscriptions.find(
        (sub) => sub.subscriptionStatus === 'active',
      )

      // Find the pending subscription if there's no active one
      const pendingSubscription = !activeSubscription
        ? subscriptions.find((sub) => sub.subscriptionStatus === 'pending')
        : null

      // Get latest payment date from subscriptions
      const latestPaymentDate =
        subscriptions.length > 0
          ? Math.max(
              ...subscriptions
                .filter((s) => s.subscriptionPayDate)
                .map((s) => new Date(s.subscriptionPayDate as Date).getTime()),
            )
          : null

      const isNewUser = subscriptions.length === 0 || !activeSubscription
      const needsReactivation =
        !activeSubscription &&
        subscriptions.some((s) => s.subscriptionStatus === 'canceled')

      // Derive paymentOverdue from nextPaymentDate on the active subscription (Req 2.4)
      const paymentOverdue =
        activeSubscription &&
        activeSubscription.nextPaymentDate &&
        new Date(activeSubscription.nextPaymentDate) < new Date()

      return res.status(200).json({
        success: true,
        data: {
          subscriptions,
          activeSubscription,
          // hasActiveSubscription is solely determined by subscriptionStatus in the DB (Req 2.1, 2.2, 2.3)
          hasActiveSubscription: !!activeSubscription,
          hasPendingSubscription: !!pendingSubscription,
          isNewUser,
          needsReactivation,
          paymentOverdue: !!paymentOverdue,
          latestPaymentDate: latestPaymentDate
            ? new Date(latestPaymentDate)
            : null,
          nextPaymentDate: activeSubscription
            ? activeSubscription.nextPaymentDate
            : null,
          availablePlans,
        },
      })
    } catch (error) {
      reqLogger.error('Error getting subscription management', {
        error: error,
      })
      return next(error)
    }
  },
)
