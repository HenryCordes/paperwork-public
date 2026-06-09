// __tests__/integration/btwExport.test.ts
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

// All BTW endpoints scope by tenantId on Invoice/Expense and filter by date
// range. Q2 2023 covers Apr 1 - Jun 30, so a mid-June date lands in the period.
const Q2_DATE = new Date('2023-06-15T12:00:00.000Z')

const seedInvoice = (
  tenantId: string,
  owner: string,
  over: Record<string, unknown> = {},
) =>
  Invoice.create({
    tenantId,
    owner,
    invoiceNumber: Math.floor(Math.random() * 1_000_000),
    invoiceDate: Q2_DATE,
    // priceWithoutTaxes is only used for the 0% bucket; the 21/9/6 buckets
    // reverse-calculate the excl amount from the tax field.
    priceWithoutTaxes: 1000,
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
    expenseDate: Q2_DATE,
    priceWOTaxes: 400,
    price: 484,
    tax: 84,
    taxLow: 0,
    ...over,
  })

interface OmzetBucket {
  excl: number
  btw: number
  incl: number
}

interface BTWSummaryData {
  period: {
    type: string
    period: string | number
    year: number
    label: string
    dateRange: { start: string; end: string }
    deadline: string
  }
  omzet: {
    hoogTarief21: OmzetBucket
    laagTarief9: OmzetBucket
    laagsteTarief6: OmzetBucket
    overige: OmzetBucket
  }
  subtotaalOmzet: number
  verschuldigdeBTW: number
  voorbelasting: number
  teBetalen: number
  invoiceCount: number
  expenseCount: number
  calculatedAt: string
}

interface SummaryResponse {
  success: boolean
  data: BTWSummaryData
  message?: string
}

const Q2_QUERY = { periodType: 'quarterly', period: 'Q2', year: '2023' }

describe('btwExport API', () => {
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

  describe('GET /api/btw-export/summary', () => {
    it('computes BTW figures from the caller tenant seeded invoices and expenses', async () => {
      // One 21% invoice (210 tax -> 1000 excl) and one expense (84 voorbelasting).
      await seedInvoice(a.organizationId, a.userId)
      await seedExpense(a.organizationId, a.userId)

      const res = await request(app)
        .get('/api/btw-export/summary')
        .query(Q2_QUERY)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as SummaryResponse
      expect(body.success).toBe(true)

      const { data } = body
      expect(data.period.type).toBe('quarterly')
      expect(data.period.period).toBe('Q2')
      expect(data.period.year).toBe(2023)
      expect(data.period.label).toBe('Q2 2023')
      // The range is built with `new Date(year, month, day)` in local time and
      // then serialized via toISOString(), so the persisted boundaries shift by
      // the runner's UTC offset. Assert the period is present and well-formed
      // rather than pinning exact calendar days that depend on the timezone.
      expect(data.period.dateRange.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(data.period.dateRange.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // 210 tax reverse-calculated: excl = 210 / 0.21 = 1000.
      expect(data.omzet.hoogTarief21.excl).toBeCloseTo(1000, 5)
      expect(data.omzet.hoogTarief21.btw).toBeCloseTo(210, 5)
      expect(data.omzet.hoogTarief21.incl).toBeCloseTo(1210, 5)
      expect(data.subtotaalOmzet).toBeCloseTo(1000, 5)
      expect(data.verschuldigdeBTW).toBeCloseTo(210, 5)

      // voorbelasting = expense tax + taxLow = 84.
      expect(data.voorbelasting).toBeCloseTo(84, 5)
      // teBetalen = verschuldigdeBTW - voorbelasting = 210 - 84 = 126.
      expect(data.teBetalen).toBeCloseTo(126, 5)

      expect(data.invoiceCount).toBe(1)
      expect(data.expenseCount).toBe(1)
    })

    it('returns zeroed figures when the caller tenant has no data in the period', async () => {
      const res = await request(app)
        .get('/api/btw-export/summary')
        .query(Q2_QUERY)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as SummaryResponse
      expect(body.success).toBe(true)
      expect(body.data.subtotaalOmzet).toBe(0)
      expect(body.data.verschuldigdeBTW).toBe(0)
      expect(body.data.voorbelasting).toBe(0)
      expect(body.data.teBetalen).toBe(0)
      expect(body.data.invoiceCount).toBe(0)
      expect(body.data.expenseCount).toBe(0)
    })

    it("never includes another tenant's invoices or expenses (tenant isolation)", async () => {
      // Tenant b has large figures; tenant a has none in the period.
      await seedInvoice(b.organizationId, b.userId, { tax: 9999 })
      await seedExpense(b.organizationId, b.userId, { tax: 8888 })

      const res = await request(app)
        .get('/api/btw-export/summary')
        .query(Q2_QUERY)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as SummaryResponse
      expect(body.success).toBe(true)
      expect(body.data.verschuldigdeBTW).toBe(0)
      expect(body.data.voorbelasting).toBe(0)
      expect(body.data.invoiceCount).toBe(0)
      expect(body.data.expenseCount).toBe(0)
    })

    it('excludes data outside the requested period date range', async () => {
      // Invoice dated in Q1 should not appear in a Q2 summary.
      await seedInvoice(a.organizationId, a.userId, {
        invoiceDate: new Date('2023-02-10T12:00:00.000Z'),
      })

      const res = await request(app)
        .get('/api/btw-export/summary')
        .query(Q2_QUERY)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const body = res.body as SummaryResponse
      expect(body.data.invoiceCount).toBe(0)
      expect(body.data.verschuldigdeBTW).toBe(0)
    })

    it('returns 400 when required parameters are missing', async () => {
      const res = await request(app)
        .get('/api/btw-export/summary')
        .query({ periodType: 'quarterly' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for an invalid period type', async () => {
      const res = await request(app)
        .get('/api/btw-export/summary')
        .query({ periodType: 'weekly', period: 'Q2', year: '2023' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for a non-numeric year', async () => {
      const res = await request(app)
        .get('/api/btw-export/summary')
        .query({ periodType: 'quarterly', period: 'Q2', year: 'abc' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app)
        .get('/api/btw-export/summary')
        .query(Q2_QUERY)

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/btw-export/export', () => {
    it('returns a downloadable excel file reflecting seeded tenant data', async () => {
      await seedInvoice(a.organizationId, a.userId)
      await seedExpense(a.organizationId, a.userId)

      const res = await request(app)
        .get('/api/btw-export/export')
        .query(Q2_QUERY)
        .set(authHeader(a.token))
        .buffer()
        .parse((response, callback) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('end', () => callback(null, Buffer.concat(chunks)))
        })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet')
      expect(res.headers['content-disposition']).toContain(
        'BTW_Aangifte_Q2_2023.xlsx',
      )
      expect(Buffer.isBuffer(res.body)).toBe(true)
      // xlsx files are zip archives; the PK magic bytes confirm a real workbook.
      expect((res.body as Buffer).length).toBeGreaterThan(0)
      expect((res.body as Buffer).subarray(0, 2).toString('latin1')).toBe('PK')
    })

    it('returns a CSV file when format=csv, with figures from the caller tenant', async () => {
      await seedInvoice(a.organizationId, a.userId)

      const res = await request(app)
        .get('/api/btw-export/export')
        .query({ ...Q2_QUERY, format: 'csv' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.headers['content-disposition']).toContain(
        'BTW_Aangifte_Q2_2023.csv',
      )
      // Body is the raw CSV text; supertest leaves it as text for text/csv.
      const csv = typeof res.text === 'string' ? res.text : String(res.body)
      expect(csv).toContain('BTW Aangifte Overzicht')
      expect(csv).toContain('Q2 2023')
    })

    it('does not leak another tenant figures into the export', async () => {
      // b has a 21% invoice (tax 4200 -> 20000 excl); a has none. a's export
      // must therefore show zero turnover, never b's distinctive figures.
      await seedInvoice(b.organizationId, b.userId, { tax: 4200 })

      const res = await request(app)
        .get('/api/btw-export/export')
        .query({ ...Q2_QUERY, format: 'csv' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      const csv = typeof res.text === 'string' ? res.text : String(res.body)
      // b's turnover (20.000) and tax (4.200) must not appear in a's export.
      expect(csv).not.toContain('20.000')
      expect(csv).not.toContain('4.200')
      // a's "Subtotaal omzet" line is zero. Intl formats EUR with a
      // non-breaking space between the symbol and the amount, so match loosely.
      expect(csv).toMatch(/"Subtotaal omzet";"";"€\s0,00"/)
      // b's data is still present in the DB after a's export.
      expect(
        await Invoice.find({ tenantId: b.organizationId }).countDocuments(),
      ).toBe(1)
    })

    it('returns 400 for an invalid format', async () => {
      const res = await request(app)
        .get('/api/btw-export/export')
        .query({ ...Q2_QUERY, format: 'pdf' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when required parameters are missing', async () => {
      const res = await request(app)
        .get('/api/btw-export/export')
        .query({ periodType: 'quarterly', year: '2023' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for an out-of-range year', async () => {
      const res = await request(app)
        .get('/api/btw-export/export')
        .query({ periodType: 'quarterly', period: 'Q2', year: '1999' })
        .set(authHeader(a.token))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app)
        .get('/api/btw-export/export')
        .query(Q2_QUERY)

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/btw-export/deadline', () => {
    it('returns the next quarterly deadline by default', async () => {
      const res = await request(app)
        .get('/api/btw-export/deadline')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.periodType).toBe('quarterly')
      // deadline is an ISO date (YYYY-MM-DD); daysUntilDeadline is a number.
      expect(typeof res.body.data.deadline).toBe('string')
      expect(res.body.data.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof res.body.data.daysUntilDeadline).toBe('number')
      expect(typeof res.body.data.isOverdue).toBe('boolean')
    })

    it('honours an explicit period type', async () => {
      const res = await request(app)
        .get('/api/btw-export/deadline')
        .query({ periodType: 'yearly' })
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.periodType).toBe('yearly')
    })

    it('returns 500 for an unsupported period type', async () => {
      // getNextBTWDeadline throws on an unknown period type; the controller
      // surfaces that as a 500 (no validation guard on this endpoint).
      const res = await request(app)
        .get('/api/btw-export/deadline')
        .query({ periodType: 'weekly' })
        .set(authHeader(a.token))

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app).get('/api/btw-export/deadline')
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/btw-export/periods', () => {
    it('returns the static period catalogue', async () => {
      const res = await request(app)
        .get('/api/btw-export/periods')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.years).toHaveLength(6)
      expect(res.body.data.periods.quarterly).toHaveLength(4)
      expect(res.body.data.periods.monthly).toHaveLength(12)
      expect(
        res.body.data.periodTypes.map((p: { value: string }) => p.value),
      ).toEqual(['monthly', 'quarterly', 'yearly'])
    })

    it('returns 401 without an auth token', async () => {
      const res = await request(app).get('/api/btw-export/periods')
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })
})
