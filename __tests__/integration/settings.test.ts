// __tests__/integration/settings.test.ts
import request from 'supertest'

import app from '../../app'
import Settings from '../../models/Settings'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

// A complete, valid settings payload. companyEmail is parameterised because the
// schema declares companyEmail as `unique`, so two tenants must not reuse it.
const validPayload = (over: Record<string, unknown> = {}) => ({
  companyName: 'Acme BV',
  street: 'Hoofdstraat',
  houseNumber: '1',
  postalCode: '1234AB',
  city: 'Amsterdam',
  country: 'Nederland',
  phoneNumber: '0612345678',
  companyEmail: 'acme@example.com',
  taxNumber: 'NL123456789B01',
  chamberOfCommerceNumber: '12345678',
  bankName: 'ING',
  bankIBAN: 'NL00INGB0000000000',
  ...over,
})

// Seed a settings document directly for a tenant, bypassing the controller.
const seedSettings = (tenantId: string, over: Record<string, unknown> = {}) =>
  Settings.create({
    tenantId,
    ...validPayload(over),
  })

describe('settings API', () => {
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

  describe('GET /api/settings', () => {
    it("returns the caller tenant's settings document", async () => {
      await seedSettings(a.organizationId, {
        companyName: 'A Corp',
        companyEmail: 'a@example.com',
      })

      const res = await request(app)
        .get('/api/settings')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.companyName).toBe('A Corp')
      expect(res.body.data.tenantId).toBe(a.organizationId)
    })

    it('returns null data when the tenant has no settings yet', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // getSettings does not auto-create defaults; it returns the missing doc.
      expect(res.body.data).toBeNull()
    })

    it("does not return another tenant's settings (tenant isolation)", async () => {
      await seedSettings(b.organizationId, {
        companyName: 'B Corp',
        companyEmail: 'b@example.com',
      })

      const res = await request(app)
        .get('/api/settings')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // a has no settings of its own and must not see b's document.
      expect(res.body.data).toBeNull()
    })

    it('requires authentication (401 without a token)', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/settings (create)', () => {
    it('creates a settings document scoped to the caller tenant', async () => {
      const res = await request(app)
        .post('/api/settings')
        .set(authHeader(a.token))
        .send(validPayload({ companyEmail: 'create@example.com' }))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.companyName).toBe('Acme BV')

      const inDb = (await Settings.findById(
        res.body.data._id,
      ).lean()) as Record<string, unknown> | null
      expect(inDb).not.toBeNull()
      expect(inDb?.tenantId).toBe(a.organizationId)
      expect(inDb?.companyEmail).toBe('create@example.com')
    })

    it('rejects a payload missing required fields (400, success:false)', async () => {
      const res = await request(app)
        .post('/api/settings')
        .set(authHeader(a.token))
        // Omit bankIBAN, one of the controller-enforced required fields.
        .send(validPayload({ companyEmail: 'x@example.com', bankIBAN: '' }))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)

      // Nothing should have been persisted for this tenant.
      const count = await Settings.countDocuments({
        tenantId: a.organizationId,
      })
      expect(count).toBe(0)
    })

    it('rejects an empty body (400, success:false)', async () => {
      const res = await request(app)
        .post('/api/settings')
        .set(authHeader(a.token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/settings (update via _id)', () => {
    it('updates the existing settings document for the caller tenant', async () => {
      const existing = await seedSettings(a.organizationId, {
        companyName: 'Old Name',
        companyEmail: 'update@example.com',
      })

      const res = await request(app)
        .post('/api/settings')
        .set(authHeader(a.token))
        .send(
          validPayload({
            _id: existing._id.toString(),
            companyName: 'New Name',
            companyEmail: 'update@example.com',
          }),
        )

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.companyName).toBe('New Name')
      // findOneAndUpdate with {new:true} returns the updated doc on the same id.
      expect(res.body.data._id).toBe(existing._id.toString())

      const inDb = (await Settings.findById(existing._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb?.companyName).toBe('New Name')
    })

    it("cannot update another tenant's settings document (tenant isolation)", async () => {
      const foreign = await seedSettings(b.organizationId, {
        companyName: 'B Original',
        companyEmail: 'foreign@example.com',
      })

      const res = await request(app)
        .post('/api/settings')
        .set(authHeader(a.token))
        .send(
          validPayload({
            _id: foreign._id.toString(),
            companyName: 'Hacked',
            companyEmail: 'attacker@example.com',
          }),
        )

      // byTenant scopes findOneAndUpdate by a's tenantId, so b's doc is not
      // matched. No document is updated; the controller returns null data.
      expect(res.status).toBe(200)
      expect(res.body.data).toBeNull()

      // b's document must be untouched in the database.
      const inDb = (await Settings.findById(foreign._id).lean()) as Record<
        string,
        unknown
      > | null
      expect(inDb?.companyName).toBe('B Original')
      expect(inDb?.tenantId).toBe(b.organizationId)

      // The update must not have leaked into a's tenant as a new document.
      const aCount = await Settings.countDocuments({
        tenantId: a.organizationId,
      })
      expect(aCount).toBe(0)
    })
  })
})
