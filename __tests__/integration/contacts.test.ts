// __tests__/integration/contacts.test.ts
import request from 'supertest'

import app from '../../app'
import Contact from '../../models/Contact'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedContact = (tenantId: string, over: Record<string, unknown> = {}) =>
  Contact.create({
    tenantId,
    typeOfContact: 'Particulier',
    typeName: 'Klant',
    firstName: 'Jan',
    lastName: 'Jansen',
    emailAddress: 'jan@example.com',
    ...over,
  })

describe('contacts API', () => {
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

  it("GET /api/contacts returns only the caller tenant's contacts", async () => {
    await seedContact(a.organizationId, { emailAddress: 'a@example.com' })
    await seedContact(b.organizationId, { emailAddress: 'b@example.com' })

    const res = await request(app).get('/api/contacts').set(authHeader(a.token))

    expect(res.status).toBe(200)
    const docs = res.body.data.docs ?? res.body.data
    expect(docs).toHaveLength(1)
    expect(docs[0].emailAddress).toBe('a@example.com')
  })

  it('GET /api/contact/:id returns the contact for its tenant', async () => {
    const c = await seedContact(a.organizationId)
    const res = await request(app)
      .get(`/api/contact/${c._id}`)
      .set(authHeader(a.token))
    expect(res.status).toBe(200)
    expect(res.body.data._id).toBe(c._id.toString())
  })

  it("GET /api/contact/:id cannot read another tenant's contact (404)", async () => {
    const c = await seedContact(b.organizationId)
    const res = await request(app)
      .get(`/api/contact/${c._id}`)
      .set(authHeader(a.token))
    expect(res.status).toBe(404)
  })

  it('POST /api/contact creates a contact for the caller tenant', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set(authHeader(a.token))
      .send({
        typeOfContact: 'Particulier',
        typeName: 'Klant',
        firstName: 'Piet',
        lastName: 'Pietersen',
        emailAddress: 'piet@example.com',
      })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const inDb = (await Contact.findById(res.body.data._id).lean()) as Record<
      string,
      unknown
    > | null
    expect(inDb?.tenantId).toBe(a.organizationId)
  })

  it('POST /api/contact rejects a missing required field (400)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set(authHeader(a.token))
      .send({ typeOfContact: 'Particulier', firstName: 'NoEmail' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it("DELETE /api/contact/:id deletes own contact (200) but not another tenant's (404)", async () => {
    const own = await seedContact(a.organizationId, {
      emailAddress: 'own@example.com',
    })
    const foreign = await seedContact(b.organizationId, {
      emailAddress: 'foreign@example.com',
    })

    const ok = await request(app)
      .delete(`/api/contact/${own._id}`)
      .set(authHeader(a.token))
    expect(ok.status).toBe(200)

    const denied = await request(app)
      .delete(`/api/contact/${foreign._id}`)
      .set(authHeader(a.token))
    expect(denied.status).toBe(404)
    expect(await Contact.findById(foreign._id)).not.toBeNull()
  })
})
