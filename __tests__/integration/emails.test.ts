// __tests__/integration/emails.test.ts
import request from 'supertest'

import app from '../../app'
import Email from '../../models/Email'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const seedEmail = (tenantId: string, over: Record<string, unknown> = {}) =>
  Email.create({
    tenantId,
    owner: tenantId, // any ObjectId-like value; not asserted on
    emailDate: new Date('2024-01-01T00:00:00.000Z'),
    subject: 'Hello',
    body: '<p>Hi there</p>',
    send: false,
    invoiceNumber: '1501',
    contactId: '507f1f77bcf86cd799439011',
    contactName: 'Jan Jansen',
    contactEmail: 'jan@example.com',
    ...over,
  })

const validEmailPayload = (over: Record<string, unknown> = {}) => ({
  subject: 'Hello',
  body: '<p>Hi there</p>',
  send: false,
  emailDate: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  contactId: '507f1f77bcf86cd799439011',
  contactName: 'Jan Jansen',
  contactEmail: 'jan@example.com',
  invoiceNumber: '1501',
  ...over,
})

describe('emails API', () => {
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

  describe('GET /api/emails (list)', () => {
    it("returns only the caller tenant's emails, paginated", async () => {
      await seedEmail(a.organizationId, { subject: 'A subject' })
      await seedEmail(b.organizationId, { subject: 'B subject' })

      const res = await request(app).get('/api/emails').set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.docs).toHaveLength(1)
      expect(res.body.data.docs[0].subject).toBe('A subject')
      expect(res.body.data.totalDocs).toBe(1)
    })

    it('honors the offset query for pagination', async () => {
      // limit is hardcoded to 10; seed 12 so page 2 has the remainder.
      for (let i = 0; i < 12; i += 1) {
        await seedEmail(a.organizationId, {
          subject: `subject ${i}`,
          emailDate: new Date(2024, 0, i + 1),
        })
      }

      const page2 = await request(app)
        .get('/api/emails?offset=10')
        .set(authHeader(a.token))

      expect(page2.status).toBe(200)
      expect(page2.body.data.docs).toHaveLength(2)
      expect(page2.body.data.totalDocs).toBe(12)
    })
  })

  describe('GET /api/email/:id', () => {
    it('returns the email for its tenant', async () => {
      const e = await seedEmail(a.organizationId)
      const res = await request(app)
        .get(`/api/email/${e._id}`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data._id).toBe(e._id.toString())
    })

    it("cannot read another tenant's email (404)", async () => {
      const e = await seedEmail(b.organizationId)
      const res = await request(app)
        .get(`/api/email/${e._id}`)
        .set(authHeader(a.token))

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/email (create or update)', () => {
    it('creates an email for the caller tenant', async () => {
      const res = await request(app)
        .post('/api/email')
        .set(authHeader(a.token))
        .send(validEmailPayload({ subject: 'Created via API' }))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const inDb = (await Email.findById(res.body.data._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb).not.toBeNull()
      expect(inDb?.tenantId).toBe(a.organizationId)
      expect(inDb?.subject).toBe('Created via API')
    })

    it('updates an existing email when _id is supplied', async () => {
      const e = await seedEmail(a.organizationId, { subject: 'Old subject' })
      const res = await request(app)
        .post('/api/email')
        .set(authHeader(a.token))
        .send(
          validEmailPayload({
            _id: e._id.toString(),
            subject: 'New subject',
          }),
        )

      expect(res.status).toBe(200)
      expect(res.body.data.subject).toBe('New subject')
      const inDb = (await Email.findById(e._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb?.subject).toBe('New subject')
    })

    it('rejects a payload missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/email')
        .set(authHeader(a.token))
        .send({ subject: 'No body or contact' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it("cannot update another tenant's email; returns null data and leaves it intact", async () => {
      const foreign = await seedEmail(b.organizationId, {
        subject: 'Foreign original',
      })

      const res = await request(app)
        .post('/api/email')
        .set(authHeader(a.token))
        .send(
          validEmailPayload({
            _id: foreign._id.toString(),
            subject: 'Hijacked',
          }),
        )

      // tenant-scoped findOneAndUpdate matches nothing -> null result, 200.
      expect(res.status).toBe(200)
      expect(res.body.data).toBeNull()

      const inDb = (await Email.findById(foreign._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb?.subject).toBe('Foreign original')
    })
  })

  describe('DELETE /api/email/:id', () => {
    it('deletes own email (200) but not another tenant (404, left intact)', async () => {
      const own = await seedEmail(a.organizationId, { subject: 'mine' })
      const foreign = await seedEmail(b.organizationId, { subject: 'theirs' })

      const ok = await request(app)
        .delete(`/api/email/${own._id}`)
        .set(authHeader(a.token))
      expect(ok.status).toBe(200)
      expect(ok.body.success).toBe(true)
      expect(await Email.findById(own._id)).toBeNull()

      const denied = await request(app)
        .delete(`/api/email/${foreign._id}`)
        .set(authHeader(a.token))
      expect(denied.status).toBe(404)
      expect(await Email.findById(foreign._id)).not.toBeNull()
    })
  })

  describe('POST /api/email/send', () => {
    it('sends a new email via the no-invoice branch and persists send=true', async () => {
      const res = await request(app)
        .post('/api/email/send')
        .set(authHeader(a.token))
        .send(
          validEmailPayload({
            send: true,
            subject: 'Send me',
            // no invoiceId -> no-invoice branch
          }),
        )

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.subject).toBe('Send me')

      const inDb = (await Email.findById(res.body.data._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb).not.toBeNull()
      expect(inDb?.tenantId).toBe(a.organizationId)
      // controller forces send=true on the resaved record for this branch
      expect(inDb?.send).toBe(true)
    })

    it('rejects a send payload missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/email/send')
        .set(authHeader(a.token))
        // send must be truthy here; omit it
        .send(validEmailPayload({ send: undefined }))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 404 when the referenced invoice does not exist (invoice branch)', async () => {
      const res = await request(app)
        .post('/api/email/send')
        .set(authHeader(a.token))
        .send(
          validEmailPayload({
            send: true,
            invoiceId: '507f1f77bcf86cd799439099',
          }),
        )

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toBe('Invoice not found..')
    })
  })

  describe('POST /api/email/test-template', () => {
    it('requires a templateType (400)', async () => {
      const res = await request(app)
        .post('/api/email/test-template')
        .set(authHeader(a.token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('rejects an unknown templateType (400)', async () => {
      const res = await request(app)
        .post('/api/email/test-template')
        .set(authHeader(a.token))
        .send({ templateType: 'nope' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('sends a known template via the mocked mail provider (200)', async () => {
      const res = await request(app)
        .post('/api/email/test-template')
        .set(authHeader(a.token))
        .send({ templateType: 'welcome' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.templateType).toBe('welcome')
      // recipient is the authed user's email (tenantN@example.com)
      expect(typeof res.body.recipient).toBe('string')
      expect(res.body.recipient).toMatch(/@example\.com$/)
    })
  })
})
