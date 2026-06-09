// __tests__/integration/expenses.test.ts
import request from 'supertest'

import app from '../../app'
import Expense from '../../models/Expense'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedExpense = (tenantId: string, over: Record<string, unknown> = {}) =>
  Expense.create({
    tenantId,
    price: 100,
    expenseDate: new Date('2026-01-10'),
    ...over,
  })

describe('expenses API', () => {
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

  it("GET /api/expenses returns only the caller tenant's expenses", async () => {
    await seedExpense(a.organizationId)
    await seedExpense(b.organizationId)
    const res = await request(app).get('/api/expenses').set(authHeader(a.token))
    expect(res.status).toBe(200)
    const docs = res.body.data.docs ?? res.body.data
    expect(docs).toHaveLength(1)
    // Identity, not just count: prove the returned row is tenant A's, so a
    // filter regression that returned B's single row would fail here too.
    expect(docs[0].tenantId).toBe(a.organizationId)
  })

  it("GET /api/expense/:id cannot read another tenant's expense (404)", async () => {
    const e = await seedExpense(b.organizationId)
    const res = await request(app)
      .get(`/api/expense/${e._id}`)
      .set(authHeader(a.token))
    expect(res.status).toBe(404)
  })

  it('POST /api/expense creates for the caller tenant', async () => {
    const res = await request(app)
      .post('/api/expense')
      .set(authHeader(a.token))
      .send({ price: 250, expenseDate: '2026-02-02' })
    expect(res.status).toBe(200)
    const inDb = await Expense.findById(res.body.data._id).lean()
    expect((inDb as Record<string, unknown> | null)?.tenantId).toBe(
      a.organizationId,
    )
  })

  it('POST /api/expense rejects missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/expense')
      .set(authHeader(a.token))
      .send({ price: 250 }) // no expenseDate
    expect(res.status).toBe(400)
  })

  it("DELETE /api/expense/:id deletes own (200) but not another tenant's (404)", async () => {
    const own = await seedExpense(a.organizationId)
    const foreign = await seedExpense(b.organizationId)
    expect(
      (
        await request(app)
          .delete(`/api/expense/${own._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(200)
    expect(
      (
        await request(app)
          .delete(`/api/expense/${foreign._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(404)
    expect(await Expense.findById(foreign._id)).not.toBeNull()
  })
})
