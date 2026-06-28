// __tests__/integration/dashboardStatsAggregation.test.ts
//
// Regression tests for two bugs found while investigating bar-chart figures
// that didn't match the dashboard summary totals (2026-06-28):
//
// Bug 1: dailyAggregation() builds its [startOfDay, endOfDay] match window with
// Date#setHours(), which operates in the server process's LOCAL timezone, while
// its periodKey is derived from date.toISOString() (UTC). On a non-UTC server
// (this suite runs in Europe/Amsterdam), an invoice/expense near a UTC day
// boundary falls outside the window dailyAggregation actually queries, so it is
// silently never counted in any daily/monthly/quarterly/yearly stats doc.
//
// Bug 2: createOrUpdateInvoice/createOrUpdateExpense only call
// refreshMonthFromRawData() for the post-edit date. If a user edits an
// invoice/expense's date, the OLD month's DashboardStats docs are never
// refreshed, so the same record stays counted in both the old and new month
// forever (the dominant cause of bar-chart totals exceeding the real total).
//
// Both regressions were confirmed by a fresh recompute from raw data (so they
// are not stale-cache artifacts) before this test was written.

import request from 'supertest'

import app from '../../app'
import DashboardStats from '../../models/DashboardStats'
import Expense from '../../models/Expense'
import Invoice from '../../models/Invoice'
import {
  dailyAggregation,
  refreshMonthFromRawData,
} from '../../services/dashboardAggregation'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedInvoice = (
  tenantId: string,
  invoiceDate: Date,
  price = 1000,
  priceIncludingTax = 1210,
) =>
  Invoice.create({
    tenantId,
    owner: tenantId,
    contactId: '5fdf225643b1e000155094ff',
    invoiceNumber: Math.floor(Math.random() * 1_000_000),
    invoiceDate,
    payDate: invoiceDate,
    price,
    priceIncludingTax,
    tax: priceIncludingTax - price,
    taxLow: 0,
    taxLowest: 0,
    state: 'Betaald',
  })

describe('Dashboard stats aggregation - bug condition exploration', () => {
  let tenant: AuthedTenant

  beforeAll(async () => {
    await dbHandler.connect()
  })

  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  beforeEach(async () => {
    await dbHandler.clearDatabase()
    tenant = await createAuthedTenant()
  })

  // ── Bug 1 ────────────────────────────────────────────────────────────────
  // dailyAggregation's local-time setHours() window vs. its UTC periodKey.
  it('dailyAggregation counts an invoice whose UTC day differs from the local-timezone day', async () => {
    // 2025-06-15T23:30:00.000Z is 2025-06-16 01:30 in Europe/Amsterdam (CEST):
    // same UTC calendar day as the periodKey, but a different LOCAL day.
    const boundaryDate = new Date('2025-06-15T23:30:00.000Z')
    await seedInvoice(tenant.organizationId, boundaryDate, 500, 605)

    // refreshMonthFromRawData derives the day argument from a date-only
    // string (new Date('2025-06-15')), which parses as UTC midnight - not
    // the invoice's exact timestamp. Reproduce that exact call shape.
    await dailyAggregation(tenant.organizationId, new Date('2025-06-15'))

    const dailyDoc = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'daily',
      periodKey: '2025-06-15',
    }).lean()

    expect(dailyDoc).not.toBeNull()
    expect(dailyDoc!.stats.invoiceCount).toBe(1)
  })

  // ── Bug 1 (cascaded) ─────────────────────────────────────────────────────
  // refreshMonthFromRawData must select raw docs by the same UTC convention
  // it uses to bucket them into daily periodKeys, or a boundary record gets
  // selected into one month's refresh but bucketed under another month's key.
  it('refreshMonthFromRawData attributes a UTC-boundary invoice to its UTC month, not the local month', async () => {
    // 2025-02-28T23:30:00.000Z is 2025-03-01 00:30 in Europe/Amsterdam (CET):
    // local calendar puts this in March, UTC calendar puts it in February.
    const boundaryDate = new Date('2025-02-28T23:30:00.000Z')
    await seedInvoice(tenant.organizationId, boundaryDate, 500, 605)

    await refreshMonthFromRawData(tenant.organizationId, 2025, 2) // February (UTC)
    await refreshMonthFromRawData(tenant.organizationId, 2025, 3) // March (UTC)

    const february = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-02',
    }).lean()
    const march = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-03',
    }).lean()

    expect(february?.stats.invoiceCount).toBe(1)
    expect(march?.stats.invoiceCount ?? 0).toBe(0)
  })

  // ── Bug 2 ────────────────────────────────────────────────────────────────
  // Editing an invoice's date must refresh BOTH the old and new month, or the
  // invoice stays double-counted in both months forever.
  it('editing an invoice date clears the stats for its old month (not just the new one)', async () => {
    const invoice = await seedInvoice(
      tenant.organizationId,
      new Date('2025-01-15T12:00:00.000Z'),
      500,
      605,
    )
    await refreshMonthFromRawData(tenant.organizationId, 2025, 1)

    const beforeJanuary = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-01',
    }).lean()
    expect(beforeJanuary?.stats.invoiceCount).toBe(1) // sanity check on seed

    const res = await request(app)
      .post('/api/invoice')
      .set(authHeader(tenant.token))
      .send({
        _id: invoice._id.toString(),
        contactId: '5fdf225643b1e000155094ff',
        invoiceDate: '2025-03-15',
        payDate: '2025-03-15',
        price: 500,
        priceIncludingTax: 605,
      })
    expect(res.status).toBe(200)

    const afterJanuary = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-01',
    }).lean()
    const afterMarch = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-03',
    }).lean()

    // The invoice moved to March - January must no longer count it.
    expect(afterJanuary?.stats.invoiceCount ?? 0).toBe(0)
    expect(afterMarch?.stats.invoiceCount).toBe(1)
  })

  // ── Bug 2 (expenses) ─────────────────────────────────────────────────────
  // Same bug, same fix shape, in the parallel expense controller.
  it('editing an expense date clears the stats for its old month (not just the new one)', async () => {
    const expense = await Expense.create({
      tenantId: tenant.organizationId,
      owner: tenant.organizationId,
      expenseNumber: Math.floor(Math.random() * 1_000_000),
      expenseDate: new Date('2025-01-15T12:00:00.000Z'),
      price: 400,
      tax: 84,
      taxLow: 0,
    })
    await refreshMonthFromRawData(tenant.organizationId, 2025, 1)

    const beforeJanuary = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-01',
    }).lean()
    expect(beforeJanuary?.stats.expenseCount).toBe(1) // sanity check on seed

    const res = await request(app)
      .post('/api/expense')
      .set(authHeader(tenant.token))
      .send({
        _id: expense._id.toString(),
        expenseDate: '2025-03-15',
        price: 400,
        tax: 84,
        taxLow: 0,
      })
    expect(res.status).toBe(200)

    const afterJanuary = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-01',
    }).lean()
    const afterMarch = await DashboardStats.findOne({
      tenantId: tenant.organizationId,
      periodType: 'monthly',
      periodKey: '2025-03',
    }).lean()

    expect(afterJanuary?.stats.expenseCount ?? 0).toBe(0)
    expect(afterMarch?.stats.expenseCount).toBe(1)
  })
})
