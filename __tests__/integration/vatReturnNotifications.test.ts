// __tests__/integration/vatReturnNotifications.test.ts
import request from 'supertest'

import app from '../../app'
import VATReturnNotificationPreferences from '../../models/VATReturnNotificationPreferences'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const BASE = '/api/vat-return-notifications'

describe('vat-return-notifications API', () => {
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

  describe('GET /preferences', () => {
    it('creates and returns default preferences on first read', async () => {
      const res = await request(app)
        .get(`${BASE}/preferences`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.userId).toBe(a.userId)
      expect(res.body.data.tenantId).toBe(a.organizationId)
      // Schema defaults
      expect(res.body.data.emailNotifications).toBe(true)
      expect(res.body.data.inAppNotifications).toBe(true)
      expect(res.body.data.pushNotifications).toBe(false)
      expect(res.body.data.advanceWarningDays).toBe(7)
      expect(res.body.data.preferredLanguage).toBe('nl')

      // A document was persisted for this user/tenant.
      const inDb = await VATReturnNotificationPreferences.findOne({
        userId: a.userId,
        tenantId: a.organizationId,
      }).lean()
      expect(inDb).not.toBeNull()
    })

    it('returns the existing preferences document on subsequent reads', async () => {
      await VATReturnNotificationPreferences.create({
        userId: a.userId,
        tenantId: a.organizationId,
        advanceWarningDays: 14,
        preferredLanguage: 'en',
      })

      const res = await request(app)
        .get(`${BASE}/preferences`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.data.advanceWarningDays).toBe(14)
      expect(res.body.data.preferredLanguage).toBe('en')

      // No duplicate created.
      const count = await VATReturnNotificationPreferences.countDocuments({
        userId: a.userId,
        tenantId: a.organizationId,
      })
      expect(count).toBe(1)
    })

    it("does not expose another tenant's preferences", async () => {
      await VATReturnNotificationPreferences.create({
        userId: b.userId,
        tenantId: b.organizationId,
        advanceWarningDays: 21,
      })

      const res = await request(app)
        .get(`${BASE}/preferences`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      // a gets its own (freshly created) defaults, not b's customized doc.
      expect(res.body.data.tenantId).toBe(a.organizationId)
      expect(res.body.data.userId).toBe(a.userId)
      expect(res.body.data.advanceWarningDays).toBe(7)
    })

    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(app).get(`${BASE}/preferences`)
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /preferences', () => {
    it('updates preferences and persists the changes', async () => {
      const res = await request(app)
        .put(`${BASE}/preferences`)
        .set(authHeader(a.token))
        .send({
          emailNotifications: false,
          pushNotifications: true,
          advanceWarningDays: 10,
          secondReminderEnabled: true,
          secondReminderDays: 5,
          monthlyNotifications: false,
          preferredLanguage: 'en',
          timezone: 'Europe/Brussels',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe(
        'Notificatie voorkeuren succesvol bijgewerkt',
      )
      expect(res.body.data.emailNotifications).toBe(false)
      expect(res.body.data.pushNotifications).toBe(true)
      expect(res.body.data.advanceWarningDays).toBe(10)
      expect(res.body.data.preferredLanguage).toBe('en')

      const inDb = await VATReturnNotificationPreferences.findOne({
        userId: a.userId,
        tenantId: a.organizationId,
      }).lean()
      expect(inDb?.emailNotifications).toBe(false)
      expect(inDb?.pushNotifications).toBe(true)
      expect(inDb?.advanceWarningDays).toBe(10)
      expect(inDb?.secondReminderEnabled).toBe(true)
      expect(inDb?.secondReminderDays).toBe(5)
      expect(inDb?.monthlyNotifications).toBe(false)
      expect(inDb?.preferredLanguage).toBe('en')
      expect(inDb?.timezone).toBe('Europe/Brussels')
    })

    it('leaves unspecified fields untouched', async () => {
      await VATReturnNotificationPreferences.create({
        userId: a.userId,
        tenantId: a.organizationId,
        advanceWarningDays: 12,
        timezone: 'Europe/Brussels',
      })

      const res = await request(app)
        .put(`${BASE}/preferences`)
        .set(authHeader(a.token))
        .send({ emailNotifications: false })

      expect(res.status).toBe(200)

      const inDb = await VATReturnNotificationPreferences.findOne({
        userId: a.userId,
        tenantId: a.organizationId,
      }).lean()
      expect(inDb?.emailNotifications).toBe(false)
      // Untouched fields keep their previous values.
      expect(inDb?.advanceWarningDays).toBe(12)
      expect(inDb?.timezone).toBe('Europe/Brussels')
    })

    it('rejects advanceWarningDays out of range (400)', async () => {
      const res = await request(app)
        .put(`${BASE}/preferences`)
        .set(authHeader(a.token))
        .send({ advanceWarningDays: 31 })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)

      // Nothing persisted for a as a side effect of the rejected update.
      const inDb = await VATReturnNotificationPreferences.findOne({
        userId: a.userId,
        tenantId: a.organizationId,
      }).lean()
      expect(inDb).toBeNull()
    })

    it('rejects secondReminderDays out of range (400)', async () => {
      const res = await request(app)
        .put(`${BASE}/preferences`)
        .set(authHeader(a.token))
        .send({ secondReminderDays: 16 })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it("cannot mutate another tenant's preferences", async () => {
      const bPref = await VATReturnNotificationPreferences.create({
        userId: b.userId,
        tenantId: b.organizationId,
        advanceWarningDays: 21,
        emailNotifications: true,
      })

      const res = await request(app)
        .put(`${BASE}/preferences`)
        .set(authHeader(a.token))
        .send({ emailNotifications: false, advanceWarningDays: 3 })

      expect(res.status).toBe(200)

      // b's document is unchanged.
      const bInDb = await VATReturnNotificationPreferences.findById(
        bPref._id,
      ).lean()
      expect(bInDb?.advanceWarningDays).toBe(21)
      expect(bInDb?.emailNotifications).toBe(true)

      // a's own document reflects the update, scoped to a's tenant.
      const aInDb = await VATReturnNotificationPreferences.findOne({
        userId: a.userId,
        tenantId: a.organizationId,
      }).lean()
      expect(aInDb?.emailNotifications).toBe(false)
      expect(aInDb?.advanceWarningDays).toBe(3)
    })

    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(app)
        .put(`${BASE}/preferences`)
        .send({ emailNotifications: false })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /schedule', () => {
    it('returns a scheduling result for the caller', async () => {
      const res = await request(app)
        .post(`${BASE}/schedule`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // No BTW data is seeded, so no deadlines resolve and nothing is queued;
      // the scheduler reports zero scheduled notifications.
      expect(res.body.data).toBeDefined()
      expect(typeof res.body.message).toBe('string')
    })

    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(app).post(`${BASE}/schedule`)
      expect(res.status).toBe(401)
    })
  })

  describe('GET /queue-status', () => {
    it('returns 200 with zeroed queue stats (empty queues under the mock)', async () => {
      const res = await request(app)
        .get(`${BASE}/queue-status`)
        .set(authHeader(a.token))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual(
        expect.objectContaining({
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          total: 0,
        }),
      )
    })

    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(app).get(`${BASE}/queue-status`)
      expect(res.status).toBe(401)
    })
  })
})
