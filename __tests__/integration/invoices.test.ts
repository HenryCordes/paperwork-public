// __tests__/integration/invoices.test.ts
import request from 'supertest'

import app from '../../app'
import Invoice from '../../models/Invoice'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedInvoice = (tenantId: string, over: Record<string, unknown> = {}) =>
  Invoice.create({
    tenantId,
    contactId: '5fdf225643b1e000155094ff',
    invoiceDate: new Date('2026-01-15'),
    payDate: new Date('2026-02-15'),
    ...over,
  })

describe('invoices API', () => {
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

  it("GET /api/invoices returns only the caller tenant's invoices", async () => {
    await seedInvoice(a.organizationId)
    await seedInvoice(b.organizationId)
    const res = await request(app).get('/api/invoices').set(authHeader(a.token))
    expect(res.status).toBe(200)
    const docs = res.body.data.docs ?? res.body.data
    expect(docs).toHaveLength(1)
    // Identity, not just count: prove the returned row is tenant A's, so a
    // filter regression that returned B's single row would fail here too.
    expect(docs[0].tenantId).toBe(a.organizationId)
  })

  it("GET /api/invoice/:id cannot read another tenant's invoice (404)", async () => {
    const inv = await seedInvoice(b.organizationId)
    const res = await request(app)
      .get(`/api/invoice/${inv._id}`)
      .set(authHeader(a.token))
    expect(res.status).toBe(404)
  })

  it('POST /api/invoice creates for the caller tenant', async () => {
    const res = await request(app)
      .post('/api/invoice')
      .set(authHeader(a.token))
      .send({
        contactId: '5fdf225643b1e000155094ff',
        invoiceDate: '2026-03-01',
        payDate: '2026-03-31',
      })
    expect(res.status).toBe(200)
    const inDb = (await Invoice.findById(res.body.data._id).lean()) as Record<
      string,
      unknown
    > | null
    expect(inDb?.tenantId).toBe(a.organizationId)
  })

  it('POST /api/invoice rejects missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/invoice')
      .set(authHeader(a.token))
      .send({ contactId: '5fdf225643b1e000155094ff' }) // no dates
    expect(res.status).toBe(400)
  })

  it("DELETE /api/invoice/:id deletes own (200) but not another tenant's (404)", async () => {
    const own = await seedInvoice(a.organizationId)
    const foreign = await seedInvoice(b.organizationId)
    expect(
      (
        await request(app)
          .delete(`/api/invoice/${own._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(200)
    expect(
      (
        await request(app)
          .delete(`/api/invoice/${foreign._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(404)
    expect(await Invoice.findById(foreign._id)).not.toBeNull()
  })
})
