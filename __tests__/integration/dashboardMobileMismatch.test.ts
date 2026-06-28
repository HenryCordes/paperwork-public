// __tests__/integration/dashboardMobileMismatch.test.ts
//
// Bug condition exploration tests for the dashboard mobile/web data mismatch.
// These tests assert the CORRECT (post-fix) behaviour and are EXPECTED TO FAIL
// on unfixed code — failure confirms the bug exists.
//
// Bug: getDashboardStats guards calculateRealTimeYearlyMetrics with
// `!startDate && !endDate`. The web app sends only `periodPreset=last-year`
// (hits the real-time path → correct figures). The mobile app sends
// `periodPreset=last-year` + explicit `startDate`/`endDate` (bypasses the
// guard → falls to dynamicAggregation → wrong figures).

import request from 'supertest'

import app from '../../app'
import Expense from '../../models/Expense'
import Invoice from '../../models/Invoice'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

// ─── Type helpers ────────────────────────────────────────────────────────────

interface SummaryMetrics {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
}

interface StatsBody {
  success: boolean
  source?: string
  data: {
    labels: string[]
    turnover: number[]
    expenses: number[]
    rawData?: unknown[]
    summaryMetrics?: SummaryMetrics
  }
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** Seed a paid invoice in the given year for the tenant. */
const seedInvoice = (
  tenantId: string,
  owner: string,
  year: number,
  price = 1000,
  priceIncludingTax = 1210,
) =>
  Invoice.create({
    tenantId,
    owner,
    invoiceNumber: Math.floor(Math.random() * 1_000_000),
    invoiceDate: new Date(`${year}-06-15T12:00:00.000Z`),
    price,
    priceIncludingTax,
    tax: priceIncludingTax - price,
    taxLow: 0,
    taxLowest: 0,
    state: 'Betaald',
  })

/** Seed an expense in the given year for the tenant. */
const seedExpense = (
  tenantId: string,
  owner: string,
  year: number,
  price = 400,
) =>
  Expense.create({
    tenantId,
    owner,
    expenseNumber: Math.floor(Math.random() * 1_000_000),
    expenseDate: new Date(`${year}-06-15T12:00:00.000Z`),
    price,
    tax: Math.round(price * 0.21),
    taxLow: 0,
  })

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Dashboard mobile/web data mismatch - bug condition exploration', () => {
  let tenant: AuthedTenant

  const lastYear = new Date().getFullYear() - 1
  const thisYear = new Date().getFullYear()

  beforeAll(async () => {
    await dbHandler.connect()
  })

  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  beforeEach(async () => {
    await dbHandler.clearDatabase()
    tenant = await createAuthedTenant()

    // Seed non-zero Invoice and Expense docs in the previous calendar year so
    // calculateRealTimeYearlyMetrics returns non-zero summaryMetrics.
    await seedInvoice(
      tenant.organizationId,
      tenant.userId,
      lastYear,
      5000,
      6050,
    )
    await seedInvoice(
      tenant.organizationId,
      tenant.userId,
      lastYear,
      3000,
      3630,
    )
    await seedExpense(tenant.organizationId, tenant.userId, lastYear, 1200)
    await seedExpense(tenant.organizationId, tenant.userId, lastYear, 800)

    // Seed docs for the current year so `this-year` tests also have data.
    await seedInvoice(
      tenant.organizationId,
      tenant.userId,
      thisYear,
      2000,
      2420,
    )
    await seedExpense(tenant.organizationId, tenant.userId, thisYear, 500)
  })

  // ── Task 1.1 ──────────────────────────────────────────────────────────────
  // last-year preset + explicit dates → must return source: 'hybrid-calculation'
  // FAILS on unfixed code (returns 'dynamic' instead), confirming the bug.
  it('1.1 last-year preset + explicit dates returns source: hybrid-calculation', async () => {
    // Mobile-style request: carries the yearly preset AND explicit date bounds.
    const res = await request(app)
      .get('/api/dashboard/stats')
      .query({
        periodType: 'monthly',
        periodPreset: 'last-year',
        startDate: `${lastYear}-01-01`,
        endDate: `${lastYear}-12-31`,
      })
      .set(authHeader(tenant.token))

    expect(res.status).toBe(200)
    const body = res.body as StatsBody
    expect(body.success).toBe(true)

    // The correct (fixed) behaviour: always use the real-time path when a
    // yearly preset is present, returning source: 'hybrid-calculation'.
    // On unfixed code this will be 'dynamic' — that failure proves the bug.
    expect(body.source).toBe('hybrid-calculation')

    // summaryMetrics must be present and non-zero (real-time path populates it).
    expect(body.data.summaryMetrics).toBeDefined()
    expect(body.data.summaryMetrics!.totalRevenue).toBeGreaterThan(0)
  })

  // ── Task 1.2 ──────────────────────────────────────────────────────────────
  // this-year preset + explicit dates → must return source: 'hybrid-calculation'
  // FAILS on unfixed code (same guard bug applies to this-year preset).
  it('1.2 this-year preset + explicit dates returns source: hybrid-calculation', async () => {
    // Mobile-style request for the current year.
    const res = await request(app)
      .get('/api/dashboard/stats')
      .query({
        periodType: 'monthly',
        periodPreset: 'this-year',
        startDate: `${thisYear}-01-01`,
        endDate: `${thisYear}-12-31`,
      })
      .set(authHeader(tenant.token))

    expect(res.status).toBe(200)
    const body = res.body as StatsBody
    expect(body.success).toBe(true)

    // Fixed behaviour: yearly preset always wins → real-time path.
    // On unfixed code this returns 'dynamic' or 'pre-calculated' → test fails.
    expect(body.source).toBe('hybrid-calculation')

    expect(body.data.summaryMetrics).toBeDefined()
    expect(body.data.summaryMetrics!.totalRevenue).toBeGreaterThan(0)
  })

  // ── Task 1.3 ──────────────────────────────────────────────────────────────
  // Mobile-style and web-style requests for the same tenant must return
  // identical summaryMetrics.
  // FAILS on unfixed code because they hit different code paths.
  it('1.3 mobile-style and web-style last-year requests return identical summaryMetrics', async () => {
    // Web-style: preset only, no explicit dates (already works on unfixed code).
    const webRes = await request(app)
      .get('/api/dashboard/stats')
      .query({
        periodType: 'monthly',
        periodPreset: 'last-year',
      })
      .set(authHeader(tenant.token))

    expect(webRes.status).toBe(200)
    const webBody = webRes.body as StatsBody
    expect(webBody.success).toBe(true)
    expect(webBody.source).toBe('hybrid-calculation')
    expect(webBody.data.summaryMetrics).toBeDefined()

    // Mobile-style: same preset AND explicit date bounds for the same year.
    const mobileRes = await request(app)
      .get('/api/dashboard/stats')
      .query({
        periodType: 'monthly',
        periodPreset: 'last-year',
        startDate: `${lastYear}-01-01`,
        endDate: `${lastYear}-12-31`,
      })
      .set(authHeader(tenant.token))

    expect(mobileRes.status).toBe(200)
    const mobileBody = mobileRes.body as StatsBody
    expect(mobileBody.success).toBe(true)

    // On unfixed code the mobile response returns 'dynamic' and has no
    // summaryMetrics → both assertions below will fail, confirming the bug.
    expect(mobileBody.source).toBe('hybrid-calculation')
    expect(mobileBody.data.summaryMetrics).toBeDefined()

    // Both clients must receive byte-identical summary figures.
    expect(mobileBody.data.summaryMetrics).toEqual(webBody.data.summaryMetrics)
  })
})
