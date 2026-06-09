// __tests__/integration/export.test.ts
import request from 'supertest'

import app from '../../app'
import Expense from '../../models/Expense'
import Invoice from '../../models/Invoice'
import {
  expenseExportQueue,
  invoiceExportQueue,
} from '../../services/queues/exportQueue'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

// Bull is globally mocked in externalMocks.ts: every queue instance gets a
// fresh jest.fn() add() resolving { id: 'test-job' } and getJob() resolving
// null. We import the real (mocked) queue instances the service constructed so
// we can inspect what the controller enqueued.
type AddMock = jest.Mock
const expenseAdd = expenseExportQueue.add as unknown as AddMock
const invoiceAdd = invoiceExportQueue.add as unknown as AddMock

interface EnqueuedJobData {
  tenantId: unknown
  userId: unknown
  requestId: unknown
  data: { filters: Record<string, unknown> }
}

const lastJobData = (mock: AddMock): EnqueuedJobData => {
  const calls = mock.mock.calls
  const [, jobData] = calls[calls.length - 1] as [string, EnqueuedJobData]
  return jobData
}

const seedInvoice = (
  tenantId: string,
  owner: string,
  over: Record<string, unknown> = {},
) =>
  Invoice.create({
    tenantId,
    owner,
    invoiceDate: new Date('2024-02-15'),
    price: 1000,
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
    expenseDate: new Date('2024-02-15'),
    tax: 21,
    taxLow: 9,
    price: 200,
    ...over,
  })

describe('export API', () => {
  let a: AuthedTenant
  let b: AuthedTenant

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    expenseAdd.mockClear()
    invoiceAdd.mockClear()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    b = await createAuthedTenant()
  })

  // ---- POST /api/export/expenses (queue) ----

  it('POST /api/export/expenses enqueues a job scoped to the caller tenant/user', async () => {
    const res = await request(app)
      .post('/api/export/expenses')
      .set(authHeader(a.token))
      .send({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        includeReceipts: true,
      })

    expect(res.status).toBe(202)
    expect(res.body.success).toBe(true)
    expect(res.body.jobId).toBe('test-job')
    expect(typeof res.body.requestId).toBe('string')

    expect(expenseAdd).toHaveBeenCalledTimes(1)
    const jobData = lastJobData(expenseAdd)
    expect(jobData.tenantId).toBe(a.organizationId)
    // userId is forwarded as the raw ObjectId from req.user._id, not a string.
    expect(String(jobData.userId)).toBe(a.userId)
    expect(jobData.data.filters).toMatchObject({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      includeReceipts: true,
    })
  })

  it('POST /api/export/expenses rejects a missing date (400) and enqueues nothing', async () => {
    const res = await request(app)
      .post('/api/export/expenses')
      .set(authHeader(a.token))
      .send({ startDate: '2024-01-01' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(expenseAdd).not.toHaveBeenCalled()
  })

  it('POST /api/export/expenses rejects an invalid date format (400)', async () => {
    const res = await request(app)
      .post('/api/export/expenses')
      .set(authHeader(a.token))
      .send({ startDate: 'not-a-date', endDate: 'also-bad' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(expenseAdd).not.toHaveBeenCalled()
  })

  it('POST /api/export/expenses requires authentication (401)', async () => {
    const res = await request(app)
      .post('/api/export/expenses')
      .send({ startDate: '2024-01-01', endDate: '2024-12-31' })

    expect(res.status).toBe(401)
    expect(expenseAdd).not.toHaveBeenCalled()
  })

  // ---- POST /api/export/invoices (queue) ----

  it('POST /api/export/invoices enqueues a job scoped to the caller tenant/user', async () => {
    const res = await request(app)
      .post('/api/export/invoices')
      .set(authHeader(a.token))
      .send({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        includePdfs: true,
      })

    expect(res.status).toBe(202)
    expect(res.body.success).toBe(true)
    expect(res.body.jobId).toBe('test-job')

    expect(invoiceAdd).toHaveBeenCalledTimes(1)
    const jobData = lastJobData(invoiceAdd)
    expect(jobData.tenantId).toBe(a.organizationId)
    expect(String(jobData.userId)).toBe(a.userId)
    expect(jobData.data.filters).toMatchObject({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      includePdfs: true,
    })
  })

  it('two tenants enqueue jobs scoped to their own tenant id', async () => {
    await request(app)
      .post('/api/export/invoices')
      .set(authHeader(a.token))
      .send({ startDate: '2024-01-01', endDate: '2024-12-31' })
    await request(app)
      .post('/api/export/invoices')
      .set(authHeader(b.token))
      .send({ startDate: '2024-01-01', endDate: '2024-12-31' })

    expect(invoiceAdd).toHaveBeenCalledTimes(2)
    const [, firstJob] = invoiceAdd.mock.calls[0] as [string, EnqueuedJobData]
    const [, secondJob] = invoiceAdd.mock.calls[1] as [string, EnqueuedJobData]
    expect(firstJob.tenantId).toBe(a.organizationId)
    expect(secondJob.tenantId).toBe(b.organizationId)
    expect(firstJob.tenantId).not.toBe(secondJob.tenantId)
  })

  it('POST /api/export/invoices rejects a missing date (400) and enqueues nothing', async () => {
    const res = await request(app)
      .post('/api/export/invoices')
      .set(authHeader(a.token))
      .send({ endDate: '2024-12-31' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(invoiceAdd).not.toHaveBeenCalled()
  })

  // ---- GET /api/export/status/:jobId ----

  it('GET /api/export/status/:jobId returns 404 when the job is not found', async () => {
    // The Bull mock's getJob() resolves null, so any lookup is "not found".
    const res = await request(app)
      .get('/api/export/status/some-job-id')
      .set(authHeader(a.token))

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/export/status/:jobId requires authentication (401)', async () => {
    const res = await request(app).get('/api/export/status/some-job-id')
    expect(res.status).toBe(401)
  })

  // ---- GET /api/export/summary (synchronous CSV / XLSX) ----

  it('GET /api/export/summary returns a CSV of the caller tenant data', async () => {
    await seedInvoice(a.organizationId, a.userId, { price: 1000 })
    await seedExpense(a.organizationId, a.userId, { price: 200 })

    const res = await request(app)
      .get('/api/export/summary?year=2024&format=csv')
      .set(authHeader(a.token))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain(
      'Inkomsten_en_onkosten_2024.csv',
    )
    // Body is the rendered CSV; assert the category rows are present.
    expect(res.text).toContain('Netto Inkomsten')
    expect(res.text).toContain('Marge')
    // Q1 revenue (Feb invoice) should carry the seeded 1000 (nl-NL: 1.000,00).
    expect(res.text).toContain('1.000,00')
  })

  it('GET /api/export/summary scopes data to the caller tenant only', async () => {
    // Tenant b has a large invoice; tenant a has none in 2024.
    await seedInvoice(b.organizationId, b.userId, { price: 99999 })

    const res = await request(app)
      .get('/api/export/summary?year=2024&format=csv')
      .set(authHeader(a.token))

    expect(res.status).toBe(200)
    // b's revenue must not leak into a's summary.
    expect(res.text).not.toContain('99.999,00')
  })

  it('GET /api/export/summary returns 400 when year is missing', async () => {
    const res = await request(app)
      .get('/api/export/summary')
      .set(authHeader(a.token))

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/export/summary returns 400 for an out-of-range year', async () => {
    const res = await request(app)
      .get('/api/export/summary?year=1800')
      .set(authHeader(a.token))

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/export/summary returns 400 for a non-numeric year', async () => {
    const res = await request(app)
      .get('/api/export/summary?year=abcd')
      .set(authHeader(a.token))

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/export/summary requires authentication (401)', async () => {
    const res = await request(app).get('/api/export/summary?year=2024')
    expect(res.status).toBe(401)
  })
})
