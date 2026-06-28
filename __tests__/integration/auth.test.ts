// __tests__/integration/auth.test.ts
import request from 'supertest'

import app from '../../app'
import Organization from '../../models/Organization'
import User from '../../models/User'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

interface RegisterBody {
  name?: string
  companyName?: string
  email?: string
  password?: string
  role?: string
}

const registerPayload = (over: RegisterBody = {}): RegisterBody => ({
  name: 'Nieuwe Gebruiker',
  companyName: 'Nieuwe BV',
  email: 'nieuw@example.com',
  password: 'password123',
  ...over,
})

describe('auth API', () => {
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
  // The harness emails are tenant{N}@example.com with a module-global counter,
  // so the exact address differs per test. Resolve a's real email each time.
  let aEmail: string

  beforeEach(async () => {
    a = await createAuthedTenant()
    b = await createAuthedTenant()
    const aUser = await User.findById(a.userId).lean().exec()
    aEmail = String(aUser?.email)
  })

  describe('POST /api/auth/register', () => {
    it('creates an organization + user and returns a signed JWT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(registerPayload())

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.length).toBeGreaterThan(0)
      expect(res.body.userId).toBeDefined()
      expect(res.body.organizationId).toBeDefined()

      const user = await User.findById(res.body.userId).lean().exec()
      expect(user).not.toBeNull()
      expect(user?.email).toBe('nieuw@example.com')
      // organization on the user matches the returned organizationId
      expect(String(user?.organization)).toBe(String(res.body.organizationId))

      const org = await Organization.findById(res.body.organizationId)
        .lean()
        .exec()
      expect(org).not.toBeNull()
      // companyName drives the organization name in the controller
      expect(org?.name).toBe('Nieuwe BV')
    })

    it('falls back to name for the organization name when companyName is absent', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(registerPayload({ companyName: undefined, name: 'Solo Persoon' }))

      expect(res.status).toBe(200)
      const org = await Organization.findById(res.body.organizationId)
        .lean()
        .exec()
      expect(org?.name).toBe('Solo Persoon')
    })

    it('rejects a duplicate email with 409', async () => {
      await request(app).post('/api/auth/register').send(registerPayload())

      const res = await request(app)
        .post('/api/auth/register')
        .send(registerPayload({ companyName: 'Andere BV' }))

      // Existing user has an active subscription seeded? No -- this user has
      // none, so the controller reports INCOMPLETE_REGISTRATION (409).
      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INCOMPLETE_REGISTRATION')
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(registerPayload({ password: undefined }))

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials and returns a token', async () => {
      await request(app).post('/api/auth/register').send(registerPayload())

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nieuw@example.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.token).toBe('string')
    })

    it('returns 404 on a wrong password', async () => {
      await request(app).post('/api/auth/register').send(registerPayload())

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nieuw@example.com', password: 'wrongpassword' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 404 for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'doesnotexist@example.com', password: 'password123' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nieuw@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /api/auth/me & /api/auth/profile', () => {
    it('returns the authenticated user for /me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(String(res.body.data._id)).toBe(a.userId)
      // password is select:false and must not leak
      expect(res.body.data.password).toBeUndefined()
    })

    it('returns the authenticated user for /profile', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(String(res.body.data._id)).toBe(a.userId)
    })

    it('rejects an unauthenticated /me request', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/profile (updateProfile)', () => {
    it('updates the caller profile name and email', async () => {
      const res = await request(app)
        .post('/api/auth/profile')
        .set(authHeader(a.token))
        .send({
          _id: a.userId,
          name: 'Hernoemd',
          email: 'tenant-updated@example.com',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const user = await User.findById(a.userId).lean().exec()
      expect(user?.name).toBe('Hernoemd')
      expect(user?.email).toBe('tenant-updated@example.com')
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/profile')
        .set(authHeader(a.token))
        .send({ _id: a.userId, name: 'Geen Email' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('changes the password when the current password is correct', async () => {
      const res = await request(app)
        .post('/api/auth/profile')
        .set(authHeader(a.token))
        .send({
          _id: a.userId,
          name: 'Test User',
          email: 'tenant-pw@example.com',
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        })

      expect(res.status).toBe(200)

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tenant-pw@example.com', password: 'newpassword456' })
      expect(login.status).toBe(200)
      expect(login.body.success).toBe(true)
    })

    it('rejects a password change when the current password is wrong (404)', async () => {
      const res = await request(app)
        .post('/api/auth/profile')
        .set(authHeader(a.token))
        .send({
          _id: a.userId,
          name: 'Test User',
          email: 'tenant1@example.com',
          currentPassword: 'wrongcurrent',
          newPassword: 'newpassword456',
        })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    // updateProfile must scope the update to the authenticated user (req.user.id)
    // and ignore any _id in the body, so one user cannot mutate another's
    // profile (IDOR). tenant a sends tenant b's _id; b must be untouched and a's
    // own profile is what changes.
    it("ignores a body _id and updates only the caller's own profile (no IDOR)", async () => {
      const res = await request(app)
        .post('/api/auth/profile')
        .set(authHeader(a.token))
        .send({
          _id: b.userId,
          name: 'Hijacked',
          email: 'hijacked@example.com',
        })

      expect(res.status).toBe(200)
      // tenant b's profile is untouched -- the body _id was ignored
      const victim = await User.findById(b.userId).lean().exec()
      expect(victim?.name).not.toBe('Hijacked')
      // the caller's own (tenant a) profile is what got updated
      const caller = await User.findById(a.userId).lean().exec()
      expect(caller?.name).toBe('Hijacked')
      expect(caller?.email).toBe('hijacked@example.com')
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    it('generates a reset token and returns email data for a known user', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: aEmail })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.emailData.to.email).toBe(aEmail)
      expect(typeof res.body.emailData.resetToken).toBe('string')

      // reset token persisted on the user (select:false, fetch explicitly)
      const user = await User.findById(a.userId)
        .select('+resetToken +resetTokenExpiry')
        .lean()
        .exec()
      const persisted = user as unknown as {
        resetToken?: string
        resetTokenExpiry?: number
      }
      expect(persisted.resetToken).toBe(res.body.emailData.resetToken)
      expect(persisted.resetTokenExpiry).toBeDefined()
    })

    it('returns 404 for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when email is missing', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('resets the password with a valid token', async () => {
      const forgot = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: aEmail })
      const resetToken = forgot.body.emailData.resetToken as string

      const res = await request(app).post('/api/auth/reset-password').send({
        email: aEmail,
        resetToken,
        newPassword: 'brandnew123',
      })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: aEmail, password: 'brandnew123' })
      expect(login.status).toBe(200)

      // token cleared after a successful reset
      const user = await User.findById(a.userId)
        .select('+resetToken +resetTokenExpiry')
        .lean()
        .exec()
      const persisted = user as unknown as { resetToken?: string }
      expect(persisted.resetToken).toBeUndefined()
    })

    it('rejects an invalid reset token (400)', async () => {
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: aEmail })

      const res = await request(app).post('/api/auth/reset-password').send({
        email: aEmail,
        resetToken: 'WRONG1',
        newPassword: 'brandnew123',
      })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 404 for an unknown email', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({
        email: 'nobody@example.com',
        resetToken: 'ABC123',
        newPassword: 'brandnew123',
      })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when the new password is too short', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({
        email: 'tenant1@example.com',
        resetToken: 'ABC123',
        newPassword: 'short',
      })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'tenant1@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /api/auth/send-reset-email', () => {
    it('sends an email (node-mailjet is globally mocked) and reports success', async () => {
      const res = await request(app)
        .post('/api/auth/send-reset-email')
        .send({
          to: { email: 'someone@example.com', name: 'Someone' },
          from: { email: 'noreply@paperwork.app', name: 'Paperwork' },
          subject: 'Reset',
          html: '<p>reset</p>',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // FIXME(send-reset-email-data): sendEmail() returns only { success },
      // so the controller's `data: (request as {body?}).body` is always
      // undefined and the `data` key is omitted from the JSON. The design
      // flagged this `data` field as a pending product decision; this asserts
      // the CURRENT behavior rather than changing the controller.
      expect(res.body.data).toBeUndefined()
    })

    it('returns 400 when required email fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/send-reset-email')
        .send({ to: { email: 'someone@example.com' }, subject: 'Reset' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })
})
