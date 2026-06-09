// __tests__/integration/payments.test.ts
//
// Integration coverage for controllers/payments.ts. The @mollie/api-client is
// globally neutralized in __tests__/setup/externalMocks.ts, but that global
// mock only exposes payments/customers/subscriptions. This controller uses a
// wider surface (customerPayments, customerSubscriptions, customers.iterate,
// customerMandates), so we re-mock the module here with the full facade and
// expose the jest.fn()s so each test can drive Mollie return values.

const mollieMock = {
  payments: { get: jest.fn(), create: jest.fn() },
  customerPayments: { create: jest.fn() },
  customerSubscriptions: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  },
  customers: { iterate: jest.fn(), create: jest.fn() },
  customerMandates: { list: jest.fn() },
}

jest.mock('@mollie/api-client', () => ({
  createMollieClient: jest.fn(() => mollieMock),
}))

import request from 'supertest'

import app from '../../app'
import Subscription from '../../models/Subscription'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

type Doc = Record<string, unknown>

// Helper: make customers.iterate yield a given list as an async iterator.
const iterateYielding = (items: Array<{ id: string; email?: string }>) =>
  jest.fn(() => {
    let i = 0
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (i < items.length) {
              return Promise.resolve({ value: items[i++], done: false })
            }
            return Promise.resolve({ value: undefined, done: true })
          },
        }
      },
    }
  })

const seedSubscription = (tenantId: string, over: Doc = {}) =>
  Subscription.create({
    tenantId,
    owner: undefined,
    plan: 'Essentials',
    subscriptionStatus: 'active',
    orderId: '1000',
    customerId: 'cst_seed',
    paymentPrice: '9.99',
    paymentCurrency: 'EUR',
    ...over,
  })

describe('payments API', () => {
  let a: AuthedTenant
  let b: AuthedTenant

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    jest.clearAllMocks()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    b = await createAuthedTenant()
  })

  // ---------------------------------------------------------------------------
  // getSubscription — GET /api/payment/subscription/:id (protected)
  // ---------------------------------------------------------------------------
  describe('GET /api/payment/subscription/:id', () => {
    it('returns the caller tenant subscription', async () => {
      const sub = await seedSubscription(a.organizationId, { orderId: '5001' })

      const res = await request(app)
        .get(`/api/payment/subscription/${sub._id}`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data._id).toBe(sub._id.toString())
      expect(res.body.data.orderId).toBe('5001')
    })

    it("cannot read another tenant's subscription (404)", async () => {
      const sub = await seedSubscription(b.organizationId, { orderId: '5002' })

      const res = await request(app)
        .get(`/api/payment/subscription/${sub._id}`)
        .set(authHeader(a.token))

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      // b's record is untouched
      expect(await Subscription.findById(sub._id)).not.toBeNull()
    })

    it('returns 401 without a token', async () => {
      const sub = await seedSubscription(a.organizationId)
      const res = await request(app).get(`/api/payment/subscription/${sub._id}`)
      expect(res.status).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // getSubscriptionByOrderId — GET /api/payment/subscription/order/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/payment/subscription/order/:id', () => {
    it('returns the subscription matching the orderId for the caller tenant', async () => {
      await seedSubscription(a.organizationId, { orderId: 'order-aaa' })

      const res = await request(app)
        .get('/api/payment/subscription/order/order-aaa')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.orderId).toBe('order-aaa')
    })

    it("cannot read another tenant's subscription by orderId (404)", async () => {
      await seedSubscription(b.organizationId, { orderId: 'order-bbb' })

      const res = await request(app)
        .get('/api/payment/subscription/order/order-bbb')
        .set(authHeader(a.token))

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // getSubscriptionManagement — GET /api/payment/subscriptions (protected)
  // ---------------------------------------------------------------------------
  describe('GET /api/payment/subscriptions', () => {
    it('reports an active subscription and includes availablePlans', async () => {
      // The auth harness already seeds one active subscription per tenant.
      const res = await request(app)
        .get('/api/payment/subscriptions')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.hasActiveSubscription).toBe(true)
      expect(data.activeSubscription).not.toBeNull()
      expect(Array.isArray(data.subscriptions)).toBe(true)
      expect(Array.isArray(data.availablePlans)).toBe(true)
      // Req 2.4: nextPaymentDate from the active subscription is surfaced.
      expect(data.nextPaymentDate).toBeTruthy()
    })

    it('returns only the caller tenant subscriptions (isolation)', async () => {
      await seedSubscription(b.organizationId, {
        orderId: 'b-only',
        customerId: 'cst_b',
      })

      const res = await request(app)
        .get('/api/payment/subscriptions')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const subs = res.body.data.subscriptions as Doc[]
      // Only a's harness-seeded subscription; none of b's.
      expect(subs.every((s) => s.orderId !== 'b-only')).toBe(true)
    })

    it('reports payment issues without an active subscription', async () => {
      // Replace a's harness subscription with a payment_issue one.
      await Subscription.deleteMany({ tenantId: a.organizationId })
      await seedSubscription(a.organizationId, {
        subscriptionStatus: 'payment_issue',
        orderId: 'issue-1',
        nextPaymentDate: undefined,
      })

      const res = await request(app)
        .get('/api/payment/subscriptions')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.data.hasActiveSubscription).toBe(false)
      expect(res.body.data.isNewUser).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // createMollieSubscription — POST /api/payment/mollie/subscription (protected)
  // ---------------------------------------------------------------------------
  describe('POST /api/payment/mollie/subscription', () => {
    it('creates a first Mollie payment and persists the subscription for a new user', async () => {
      // No existing Mollie customer -> create one, then create first payment.
      mollieMock.customers.iterate = iterateYielding([])
      mollieMock.customers.create.mockResolvedValue({
        id: 'cst_new',
        email: 'new@example.com',
      })
      mollieMock.customerPayments.create.mockResolvedValue({
        id: 'tr_first',
        status: 'open',
        amount: { value: '9.99', currency: 'EUR' },
      })

      // Remove the harness subscription so the controller takes the "create
      // new subscription" branch under this tenant.
      await Subscription.deleteMany({ tenantId: a.organizationId })

      const res = await request(app)
        .post('/api/payment/mollie/subscription')
        .set(authHeader(a.token))
        .send({
          name: 'New User',
          email: 'new@example.com',
          password: 'secret123',
          plan: 'Essentials',
          price: '9.99',
          currency: 'EUR',
          organizationId: a.organizationId,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('tr_first')
      expect(mollieMock.customerPayments.create).toHaveBeenCalledTimes(1)

      // A subscription for this tenant now carries the new payment id.
      const persisted = (await Subscription.findOne({
        tenantId: a.organizationId,
        paymentId: 'tr_first',
      }).lean()) as Doc | null
      expect(persisted).not.toBeNull()
      expect(persisted?.customerId).toBe('cst_new')
      expect(persisted?.tenantId).toBe(a.organizationId)
    })

    it('reuses an existing Mollie customer matched by email', async () => {
      mollieMock.customers.iterate = iterateYielding([
        { id: 'cst_existing', email: 'reuse@example.com' },
      ])
      mollieMock.customerPayments.create.mockResolvedValue({
        id: 'tr_reuse',
        status: 'open',
        amount: { value: '19.99', currency: 'EUR' },
      })
      await Subscription.deleteMany({ tenantId: a.organizationId })

      const res = await request(app)
        .post('/api/payment/mollie/subscription')
        .set(authHeader(a.token))
        .send({
          name: 'Reuse User',
          email: 'reuse@example.com',
          password: 'secret123',
          plan: 'Premium',
          price: '19.99',
          currency: 'EUR',
          organizationId: a.organizationId,
        })

      expect(res.status).toBe(200)
      expect(mollieMock.customers.create).not.toHaveBeenCalled()
      // The first-payment create call carried the existing customer id.
      const createArg = mollieMock.customerPayments.create.mock
        .calls[0][0] as Doc
      expect(createArg.customerId).toBe('cst_existing')
    })

    it('rejects a new-user request missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/payment/mollie/subscription')
        .set(authHeader(a.token))
        .send({ plan: 'Essentials', price: '9.99', currency: 'EUR' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('rejects a request missing plan/price/currency (400)', async () => {
      const res = await request(app)
        .post('/api/payment/mollie/subscription')
        .set(authHeader(a.token))
        .send({
          name: 'No Plan',
          email: 'noplan@example.com',
          password: 'secret123',
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // processMollieWebhook — POST /api/payment/mollie/webhook (PUBLIC, no auth)
  // ---------------------------------------------------------------------------
  describe('POST /api/payment/mollie/webhook', () => {
    it('fetches the payment from Mollie and activates the matching subscription on a paid recurring payment', async () => {
      await seedSubscription(a.organizationId, {
        orderId: 'wh-1',
        customerId: 'cst_wh',
        mollieSubscriptionId: 'sub_wh',
        subscriptionStatus: 'payment_issue',
      })

      mollieMock.payments.get.mockResolvedValue({
        id: 'tr_wh',
        status: 'paid',
        sequenceType: 'recurring',
        subscriptionId: 'sub_wh',
        customerId: 'cst_wh',
        createdAt: new Date().toISOString(),
        amount: { value: '9.99', currency: 'EUR' },
        metadata: { tenantId: a.organizationId },
      })
      mollieMock.customerSubscriptions.get.mockResolvedValue({
        id: 'sub_wh',
        nextPaymentDate: '2099-01-01',
      })

      const res = await request(app)
        .post('/api/payment/mollie/webhook?orderId=wh-1')
        .send({ id: 'tr_wh' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('paid')
      expect(mollieMock.payments.get).toHaveBeenCalledWith('tr_wh')

      const updated = (await Subscription.findOne({
        tenantId: a.organizationId,
        orderId: 'wh-1',
      }).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('active')
      expect(updated?.paymentId).toBe('tr_wh')
      expect(updated?.paymentState).toBe('paid')
    })

    it('marks the subscription as payment_issue and increments failCount on a failed payment', async () => {
      await seedSubscription(a.organizationId, {
        orderId: 'wh-fail',
        customerId: 'cst_f',
        subscriptionId: 'sub_f',
        subscriptionStatus: 'active',
        paymentFailCount: 0,
      })

      mollieMock.payments.get.mockResolvedValue({
        id: 'tr_fail',
        status: 'failed',
        sequenceType: 'recurring',
        subscriptionId: 'sub_f',
        customerId: 'cst_f',
        createdAt: new Date().toISOString(),
        amount: { value: '9.99', currency: 'EUR' },
        metadata: { tenantId: a.organizationId },
      })

      const res = await request(app)
        .post('/api/payment/mollie/webhook?orderId=wh-fail')
        .send({ id: 'tr_fail' })

      expect(res.status).toBe(200)
      const updated = (await Subscription.findOne({
        tenantId: a.organizationId,
        orderId: 'wh-fail',
      }).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('payment_issue')
      expect(updated?.paymentFailCount).toBe(1)
    })

    it('acknowledges a webhook with no id/orderId as a no-op (200) without fetching a payment', async () => {
      // A malformed/irrelevant webhook (missing id or orderId) must not crash:
      // the handler skips the processing block and acknowledges with 200 so
      // Mollie does not retry, without dereferencing the undefined payment.
      const res = await request(app)
        .post('/api/payment/mollie/webhook')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ignored')
      expect(mollieMock.payments.get).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // setupRecurringSubscription — POST /api/payment/subscription/activate
  // ---------------------------------------------------------------------------
  describe('POST /api/payment/subscription/activate', () => {
    it('activates a subscription when the customer has a valid mandate', async () => {
      await seedSubscription(a.organizationId, {
        orderId: 'act-1',
        customerId: 'cst_act',
        subscriptionStatus: 'pending',
      })

      mollieMock.customerMandates.list.mockResolvedValue({
        items: [{ status: 'valid' }],
      })
      mollieMock.customerSubscriptions.create.mockResolvedValue({
        id: 'sub_act',
        nextPaymentDate: '2099-02-02',
      })

      const res = await request(app)
        .post('/api/payment/subscription/activate')
        .set(authHeader(a.token))
        .send({ customerId: 'cst_act', orderId: 'act-1' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.subscriptionStatus).toBe('active')
      expect(res.body.data.mollieSubscriptionId).toBe('sub_act')

      const updated = (await Subscription.findOne({
        tenantId: a.organizationId,
        orderId: 'act-1',
      }).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('active')
      expect(updated?.mollieSubscriptionId).toBe('sub_act')
    })

    it('returns 404 when the subscription is not found', async () => {
      const res = await request(app)
        .post('/api/payment/subscription/activate')
        .set(authHeader(a.token))
        .send({ customerId: 'cst_x', orderId: 'does-not-exist' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when the customer has no valid mandate', async () => {
      await seedSubscription(a.organizationId, {
        orderId: 'act-nomandate',
        customerId: 'cst_nm',
      })
      mollieMock.customerMandates.list.mockResolvedValue({
        items: [{ status: 'invalid' }],
      })

      const res = await request(app)
        .post('/api/payment/subscription/activate')
        .set(authHeader(a.token))
        .send({ customerId: 'cst_nm', orderId: 'act-nomandate' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it("cannot activate another tenant's subscription (404)", async () => {
      await seedSubscription(b.organizationId, {
        orderId: 'b-act',
        customerId: 'cst_b_act',
      })

      const res = await request(app)
        .post('/api/payment/subscription/activate')
        .set(authHeader(a.token))
        .send({ customerId: 'cst_b_act', orderId: 'b-act' })

      expect(res.status).toBe(404)
      // b's subscription is untouched.
      const bSub = (await Subscription.findOne({
        tenantId: b.organizationId,
        orderId: 'b-act',
      }).lean()) as Doc | null
      expect(bSub?.subscriptionStatus).toBe('active')
      expect(bSub?.mollieSubscriptionId).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // cancelSubscription — POST /api/payment/subscription/:id/cancel (protected)
  // ---------------------------------------------------------------------------
  describe('POST /api/payment/subscription/:id/cancel', () => {
    it('cancels its own subscription (200, status canceled, Mollie cancel called)', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'cancel-1',
        customerId: 'cst_cancel',
        mollieSubscriptionId: 'sub_cancel',
      })
      mollieMock.customerSubscriptions.cancel.mockResolvedValue({})

      const res = await request(app)
        .post(`/api/payment/subscription/${sub._id}/cancel`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // Mollie cancel is called with (mollieSubscriptionId, { customerId }).
      expect(mollieMock.customerSubscriptions.cancel).toHaveBeenCalledWith(
        'sub_cancel',
        { customerId: 'cst_cancel' },
      )
      const updated = (await Subscription.findById(
        sub._id,
      ).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('canceled')
    })

    it('returns 404 when the subscription has no mollieSubscriptionId', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'cancel-nomollie',
        customerId: 'cst_nomollie',
        // no mollieSubscriptionId -> handler treats as not found
      })

      const res = await request(app)
        .post(`/api/payment/subscription/${sub._id}/cancel`)
        .set(authHeader(a.token))

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(mollieMock.customerSubscriptions.cancel).not.toHaveBeenCalled()
    })

    it("cannot cancel another tenant's subscription (404)", async () => {
      const sub = await seedSubscription(b.organizationId, {
        orderId: 'cancel-b',
        customerId: 'cst_b_cancel',
        mollieSubscriptionId: 'sub_b_cancel',
      })
      mollieMock.customerSubscriptions.cancel.mockResolvedValue({})

      const res = await request(app)
        .post(`/api/payment/subscription/${sub._id}/cancel`)
        .set(authHeader(a.token))

      expect(res.status).toBe(404)
      // b's subscription remains active regardless of a's request.
      const bSub = (await Subscription.findById(sub._id).lean()) as Doc | null
      expect(bSub?.subscriptionStatus).toBe('active')
    })
  })

  // ---------------------------------------------------------------------------
  // handleSubscriptionPaymentIssues — POST /api/payment/subscription/
  //   handle-payment-issues/:id (protected, ensureTenantContext middleware)
  // ---------------------------------------------------------------------------
  describe('POST /api/payment/subscription/handle-payment-issues/:id', () => {
    it('cancels a payment_issue subscription via the cancel action', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'pi-cancel',
        customerId: 'cst_pi',
        mollieSubscriptionId: 'sub_pi',
        subscriptionStatus: 'payment_issue',
      })
      mollieMock.customerSubscriptions.cancel.mockResolvedValue({})

      const res = await request(app)
        .post(`/api/payment/subscription/handle-payment-issues/${sub._id}`)
        .set(authHeader(a.token))
        .send({ action: 'cancel' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const updated = (await Subscription.findById(
        sub._id,
      ).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('canceled')
      expect(updated?.cancelDate).toBeTruthy()
    })

    it('initiates a retry payment via the retry action', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'pi-retry',
        customerId: 'cst_retry',
        subscriptionStatus: 'payment_issue',
        paymentFailCount: 3,
      })
      mollieMock.payments.create.mockResolvedValue({
        id: 'tr_retry',
        status: 'open',
        amount: { value: '9.99', currency: 'EUR' },
        _links: { checkout: { href: 'https://pay.mollie/checkout' } },
      })

      const res = await request(app)
        .post(`/api/payment/subscription/handle-payment-issues/${sub._id}`)
        .set(authHeader(a.token))
        .send({ action: 'retry' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.paymentId).toBe('tr_retry')
      const updated = (await Subscription.findById(
        sub._id,
      ).lean()) as Doc | null
      expect(updated?.subscriptionStatus).toBe('pending')
      expect(updated?.paymentFailCount).toBe(0)
    })

    it('returns 400 for an invalid action', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'pi-bad',
        subscriptionStatus: 'payment_issue',
      })

      const res = await request(app)
        .post(`/api/payment/subscription/handle-payment-issues/${sub._id}`)
        .set(authHeader(a.token))
        .send({ action: 'frobnicate' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when the subscription has no payment issues', async () => {
      const sub = await seedSubscription(a.organizationId, {
        orderId: 'pi-active',
        subscriptionStatus: 'active',
      })

      const res = await request(app)
        .post(`/api/payment/subscription/handle-payment-issues/${sub._id}`)
        .set(authHeader(a.token))
        .send({ action: 'cancel' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 404 for a subscription that does not exist', async () => {
      const res = await request(app)
        .post(
          '/api/payment/subscription/handle-payment-issues/000000000000000000000000',
        )
        .set(authHeader(a.token))
        .send({ action: 'cancel' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it("cannot handle another tenant's subscription (404)", async () => {
      const sub = await seedSubscription(b.organizationId, {
        orderId: 'pi-b',
        subscriptionStatus: 'payment_issue',
        mollieSubscriptionId: 'sub_b_pi',
        customerId: 'cst_b_pi',
      })

      const res = await request(app)
        .post(`/api/payment/subscription/handle-payment-issues/${sub._id}`)
        .set(authHeader(a.token))
        .send({ action: 'cancel' })

      expect(res.status).toBe(404)
      const bSub = (await Subscription.findById(sub._id).lean()) as Doc | null
      expect(bSub?.subscriptionStatus).toBe('payment_issue')
    })
  })
})
