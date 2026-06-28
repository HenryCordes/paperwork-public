// __tests__/integration/dashboard.test.ts
import request from 'supertest'

import app from '../../app'
import DashboardStats from '../../models/DashboardStats'
import Expense from '../../models/Expense'
import Invoice from '../../models/Invoice'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

interface StatsBody {
  success: boolean
  source?: string
  data: {
    labels: string[]
    turnover: number[]
    expenses: number[]
    rawData?: unknown[]
    summaryMetrics?: {
      totalRevenue: number
      totalExpenses: number
      netProfit: number
    }
  }
}

const seedInvoice = (
  tenantId: string,
  owner: string,
  over: Record<string, unknown> = {},
) =>
  Invoice.create({
    tenantId,
    owner,
    invoiceNumber: Math.floor(Math.random() * 1_000_000),
    invoiceDate: new Date('2023-06-15T12:00:00.000Z'),
    price: 1000,
    priceIncludingTax: 1210,
    tax: 210,
    taxLow: 0,
    taxLowest: 0,
    state: 'Betaald',
    ...over,
  })

const seedExpense = (
  tenantId: string,
  owner: string,
  over: Record<string, unknown> = {},
) =>
  Expense.create({
    tenantId,
    owner,
    expenseNumber: Math.floor(Math.random() * 1_000_000),
    expenseDate: new Date('2023-06-15T12:00:00.000Z'),
    price: 400,
    tax: 84,
    taxLow: 0,
    ...over,
  })

const seedMonthlyStat = (
  tenantId: string,
  periodKey: string,
  over: Partial<{
    totalRevenue: number
    totalExpenses: number
    invoiceCount: number
  }> = {},
) =>
  DashboardStats.create({
    tenantId,
    periodKey,
    periodType: 'monthly',
    periodStart: new Date(`${periodKey}-01T00:00:00.000Z`),
    periodEnd: new Date(`${periodKey}-28T23:59:59.999Z`),
    stats: {
      totalRevenue: 5000,
      paidRevenue: 5000,
      invoiceCount: 3,
      totalExpenses: 1500,
      paidExpenses: 1500,
      expenseCount: 2,
      netProfit: 3500,
      expensesByCategory: {},
      revenueByClient: {},
      taxCollected: 1050,
      taxPaid: 315,
      ...over,
    },
    lastUpdated: new Date(),
  })

describe('dashboard API', () => {
  let a: AuthedTenant
  let b: AuthedTenant

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    b = await createAuthedTenant()
  })

  describe('GET /api/dashboard/stats (dynamic aggregation)', () => {
    it('returns tenant-scoped turnover and expenses for a custom date range', async () => {
      await seedInvoice(a.organizationId, a.userId)
      await seedExpense(a.organizationId, a.userId)

      const res = await request(app)
        .get('/api/dashboard/stats')
        .query({ startDate: '2023-06-01', endDate: '2023-06-30' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as StatsBody
      expect(body.success).toBe(true)
      expect(body.source).toBe('dynamic')
      // dynamicAggregation groups revenue by $price (1000) and expenses by $price (400)
      const totalTurnover = body.data.turnover.reduce((s, n) => s + n, 0)
      const totalExpenses = body.data.expenses.reduce((s, n) => s + n, 0)
      expect(totalTurnover).toBe(1000)
      expect(totalExpenses).toBe(400)
    })

    it("does not expose another tenant's figures (tenant isolation)", async () => {
      // tenant b has data, tenant a has none in the range
      await seedInvoice(b.organizationId, b.userId, { price: 9999 })
      await seedExpense(b.organizationId, b.userId, { price: 8888 })

      const res = await request(app)
        .get('/api/dashboard/stats')
        .query({ startDate: '2023-06-01', endDate: '2023-06-30' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as StatsBody
      expect(body.success).toBe(true)
      // Empty periods are filtered out, so a sees nothing of b's data
      expect(body.data.turnover).toEqual([])
      expect(body.data.expenses).toEqual([])
      expect(body.data.turnover).not.toContain(9999)
      expect(body.data.expenses).not.toContain(8888)
    })

    it('returns 400 with success:false for an invalid date format', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .query({ startDate: 'not-a-date', endDate: '2023-06-30' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app).get('/api/dashboard/stats')
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/dashboard/stats (pre-calculated path)', () => {
    it('returns pre-calculated monthly stats for the caller tenant only', async () => {
      await seedMonthlyStat(a.organizationId, '2023-06', {
        totalRevenue: 5000,
        totalExpenses: 1500,
      })
      await seedMonthlyStat(b.organizationId, '2023-06', {
        totalRevenue: 7777,
        totalExpenses: 2222,
      })

      const res = await request(app)
        .get('/api/dashboard/stats')
        .query({ periodType: 'monthly' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as StatsBody
      expect(body.success).toBe(true)
      expect(body.source).toBe('pre-calculated')
      expect(body.data.turnover).toContain(5000)
      expect(body.data.expenses).toContain(1500)
      // tenant b's figures must never leak into tenant a's response
      expect(body.data.turnover).not.toContain(7777)
      expect(body.data.expenses).not.toContain(2222)
    })

    it('accepts a preset period range and stays tenant-scoped', async () => {
      const thisYearMonth = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, '0')}`
      await seedMonthlyStat(a.organizationId, thisYearMonth, {
        totalRevenue: 4200,
        totalExpenses: 900,
      })

      const res = await request(app)
        .get('/api/dashboard/stats')
        .query({ periodType: 'monthly', periodPreset: 'this-year' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as StatsBody
      expect(body.success).toBe(true)
      expect(body.data.turnover).toContain(4200)
      expect(body.data.expenses).toContain(900)
    })
  })

  describe('GET /api/dashboard/ (root visualization endpoint)', () => {
    it('is the same handler and returns dynamic stats for the caller tenant', async () => {
      await seedInvoice(a.organizationId, a.userId, { price: 2500 })

      const res = await request(app)
        .get('/api/dashboard/')
        .query({ startDate: '2023-06-01', endDate: '2023-06-30' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as StatsBody
      expect(body.success).toBe(true)
      expect(body.data.turnover.reduce((s, n) => s + n, 0)).toBe(2500)
    })
  })

  describe('POST /api/dashboard/regenerate', () => {
    it('regenerates daily stats and persists a DashboardStats doc for the tenant', async () => {
      await seedInvoice(a.organizationId, a.userId)
      await seedExpense(a.organizationId, a.userId)

      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'daily', date: '2023-06-15' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const doc = await DashboardStats.findOne({
        tenantId: a.organizationId,
        periodType: 'daily',
        periodKey: '2023-06-15',
      }).lean()
      expect(doc).not.toBeNull()
    })

    it('returns 400 when daily regeneration is missing the date', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'daily' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for an invalid date format', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'daily', date: 'not-a-date' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for an unknown period type', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'weekly' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when quarterly regeneration is missing year/quarter', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'quarterly', year: 2023 })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('rejects an out-of-range quarter (400)', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'quarterly', year: 2023, quarter: 5 })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when yearly regeneration is missing the year', async () => {
      const res = await request(app)
        .post('/api/dashboard/regenerate')
        .set(authHeader(a.token))
        .send({ periodType: 'yearly' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/dashboard/report-templates', () => {
    it('returns 200 with the (placeholder) templates for an authenticated tenant', async () => {
      const res = await request(app)
        .get('/api/dashboard/report-templates')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app).get('/api/dashboard/report-templates')
      expect(res.status).toBe(401)
    })
  })
})
