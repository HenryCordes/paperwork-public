// __tests__/integration/notes.test.ts
import request from 'supertest'

import app from '../../app'
import Note from '../../models/Note'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedNote = (tenantId: string, over: Record<string, unknown> = {}) =>
  Note.create({
    tenantId,
    description: 'A note',
    noteDate: new Date('2026-01-05'),
    ...over,
  })

describe('notes API', () => {
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

  it("GET /api/notes returns only the caller tenant's notes", async () => {
    await seedNote(a.organizationId)
    await seedNote(b.organizationId)
    const res = await request(app).get('/api/notes').set(authHeader(a.token))
    expect(res.status).toBe(200)
    const docs = res.body.data.docs ?? res.body.data
    expect(docs).toHaveLength(1)
    // Identity, not just count: prove the returned row is tenant A's, so a
    // filter regression that returned B's single row would fail here too.
    expect(docs[0].tenantId).toBe(a.organizationId)
  })

  it("GET /api/note/:id cannot read another tenant's note (404)", async () => {
    const n = await seedNote(b.organizationId)
    const res = await request(app)
      .get(`/api/note/${n._id}`)
      .set(authHeader(a.token))
    expect(res.status).toBe(404)
  })

  it('POST /api/note creates for the caller tenant', async () => {
    const res = await request(app)
      .post('/api/note')
      .set(authHeader(a.token))
      .send({ description: 'Call client', noteDate: '2026-02-09' })
    expect(res.status).toBe(200)
    const inDb = await Note.findById(res.body.data._id).lean()
    expect((inDb as Record<string, unknown> | null)?.tenantId).toBe(
      a.organizationId,
    )
  })

  it('POST /api/note rejects missing required fields (400)', async () => {
    const res = await request(app)
      .post('/api/note')
      .set(authHeader(a.token))
      .send({ description: 'no date' })
    expect(res.status).toBe(400)
  })

  it("DELETE /api/note/:id deletes own (200) but not another tenant's (404)", async () => {
    const own = await seedNote(a.organizationId)
    const foreign = await seedNote(b.organizationId)
    expect(
      (
        await request(app)
          .delete(`/api/note/${own._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(200)
    expect(
      (
        await request(app)
          .delete(`/api/note/${foreign._id}`)
          .set(authHeader(a.token))
      ).status,
    ).toBe(404)
    expect(await Note.findById(foreign._id)).not.toBeNull()
  })
})
