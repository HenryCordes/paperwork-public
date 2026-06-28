import mongoose from 'mongoose'

import User from '../../../models/User'
import VATReturnNotificationPreferences from '../../../models/VATReturnNotificationPreferences'
import { vatReturnNotificationQueue } from '../../../services/queues/vatReturnNotificationQueue'
import {
  scheduleNotificationsForUser,
  scheduleNotificationsForAllUsers,
  cancelNotificationsForUser,
  getSchedulingStats,
} from '../../../services/vatReturnNotificationScheduler'
import * as dbHandler from '../../setup/helper-db'

// The Bull queue is globally mocked (see __tests__/setup/externalMocks.ts), so
// `vatReturnNotificationQueue.add` is a jest.fn() that resolves { id: 'test-job' }.
// Each scheduled notification channel that fires results in exactly one add() call.
const addMock = vatReturnNotificationQueue.add as jest.Mock

const seedUser = (over: Record<string, unknown> = {}) =>
  User.create({
    name: 'Test User',
    companyName: 'Test BV',
    email: `user-${new mongoose.Types.ObjectId().toString()}@example.com`,
    role: 'user',
    password: 'secret-password',
    ...over,
  })

// Seed a preferences doc with an explicit tenantId. Defaults from the schema:
// email=true, inApp=true, push=false, monthly/quarterly/yearly=true,
// secondReminderEnabled=false.
const seedPrefs = (
  userId: mongoose.Types.ObjectId,
  tenantId: string,
  over: Record<string, unknown> = {},
) =>
  VATReturnNotificationPreferences.create({
    userId,
    tenantId,
    ...over,
  })

describe('vatReturnNotificationScheduler', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    addMock.mockClear()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  describe('scheduleNotificationsForUser', () => {
    it('enqueues one job per enabled channel across all enabled period types', async () => {
      const user = await seedUser()
      const tenantId = user._id.toString()
      // Default prefs: email + in-app enabled (push off, no second reminder),
      // and all three period types enabled.
      await seedPrefs(user._id, tenantId)

      const result = await scheduleNotificationsForUser(
        user._id.toString(),
        tenantId,
      )

      // 3 period types (monthly/quarterly/yearly) x 2 channels (email, in-app) = 6.
      expect(result.success).toBe(true)
      expect(result.scheduledJobs).toHaveLength(6)
      expect(addMock).toHaveBeenCalledTimes(6)
      expect(result.message).toBe('6 notificaties gepland')

      // Every add() targets one of the registered notification types and carries
      // the tenant/user context in its job data.
      const enqueuedTypes = addMock.mock.calls.map((call) => call[0])
      expect(enqueuedTypes.filter((t) => t === 'email-reminder')).toHaveLength(
        3,
      )
      expect(
        enqueuedTypes.filter((t) => t === 'in-app-notification'),
      ).toHaveLength(3)
      expect(enqueuedTypes).not.toContain('push-notification')
      for (const call of addMock.mock.calls) {
        expect(call[1].tenantId).toBe(tenantId)
        expect(call[1].userId).toBe(user._id.toString())
      }
    })

    it('returns early without enqueuing when every channel is disabled', async () => {
      const user = await seedUser()
      const tenantId = user._id.toString()
      await seedPrefs(user._id, tenantId, {
        emailNotifications: false,
        inAppNotifications: false,
        pushNotifications: false,
      })

      const result = await scheduleNotificationsForUser(
        user._id.toString(),
        tenantId,
      )

      expect(result.success).toBe(true)
      expect(result.message).toBe('Geen notificaties ingeschakeld')
      expect(result.scheduledJobs).toHaveLength(0)
      expect(addMock).not.toHaveBeenCalled()
    })

    it('enqueues only the enabled channel for only the enabled period type', async () => {
      const user = await seedUser()
      const tenantId = user._id.toString()
      await seedPrefs(user._id, tenantId, {
        emailNotifications: true,
        inAppNotifications: false,
        pushNotifications: false,
        monthlyNotifications: false,
        quarterlyNotifications: true,
        yearlyNotifications: false,
      })

      const result = await scheduleNotificationsForUser(
        user._id.toString(),
        tenantId,
      )

      // 1 period type (quarterly) x 1 channel (email) = 1.
      expect(result.scheduledJobs).toHaveLength(1)
      expect(addMock).toHaveBeenCalledTimes(1)
      expect(addMock.mock.calls[0][0]).toBe('email-reminder')
      expect(addMock.mock.calls[0][1].data.periodType).toBe('quarterly')
    })

    it('adds the second reminder jobs when secondReminderEnabled is on', async () => {
      const user = await seedUser()
      const tenantId = user._id.toString()
      await seedPrefs(user._id, tenantId, {
        emailNotifications: true,
        inAppNotifications: false,
        pushNotifications: false,
        monthlyNotifications: false,
        quarterlyNotifications: true,
        yearlyNotifications: false,
        secondReminderEnabled: true,
      })

      const result = await scheduleNotificationsForUser(
        user._id.toString(),
        tenantId,
      )

      // quarterly email: one first-reminder + one second-reminder.
      expect(result.scheduledJobs).toHaveLength(2)
      expect(addMock).toHaveBeenCalledTimes(2)
      const jobIds = addMock.mock.calls.map((call) => call[2].jobId as string)
      expect(jobIds.some((id) => id.endsWith('-reminder1'))).toBe(true)
      expect(jobIds.some((id) => id.endsWith('-reminder2'))).toBe(true)
    })

    it('creates a default preferences doc when none exists, then schedules', async () => {
      const user = await seedUser()
      const tenantId = user._id.toString()

      const before = await VATReturnNotificationPreferences.findOne({
        userId: user._id,
        tenantId,
      })
      expect(before).toBeNull()

      const result = await scheduleNotificationsForUser(
        user._id.toString(),
        tenantId,
      )

      // getOrCreatePreferences should have persisted a defaults doc.
      const after = await VATReturnNotificationPreferences.findOne({
        userId: user._id,
        tenantId,
      })
      expect(after).not.toBeNull()
      expect(after?.emailNotifications).toBe(true)
      expect(after?.inAppNotifications).toBe(true)
      expect(after?.pushNotifications).toBe(false)

      // Defaults => email + in-app over 3 period types => 6 jobs.
      expect(result.scheduledJobs).toHaveLength(6)
    })

    it('throws when the user does not exist', async () => {
      const missingId = new mongoose.Types.ObjectId().toString()

      await expect(
        scheduleNotificationsForUser(missingId, missingId),
      ).rejects.toThrow(`Gebruiker niet gevonden: ${missingId}`)
      expect(addMock).not.toHaveBeenCalled()
    })
  })

  describe('scheduleNotificationsForAllUsers', () => {
    it('processes only role=user accounts and aggregates scheduled job totals', async () => {
      const userA = await seedUser({ email: 'a@example.com' })
      const userB = await seedUser({ email: 'b@example.com' })
      // Admins are excluded by the find({ role: 'user' }) filter.
      await seedUser({ email: 'admin@example.com', role: 'admin' })

      // scheduleNotificationsForAllUsers uses user._id as the tenantId.
      await seedPrefs(userA._id, userA._id.toString(), {
        emailNotifications: true,
        inAppNotifications: false,
        pushNotifications: false,
        monthlyNotifications: true,
        quarterlyNotifications: false,
        yearlyNotifications: false,
      })
      await seedPrefs(userB._id, userB._id.toString(), {
        emailNotifications: true,
        inAppNotifications: false,
        pushNotifications: false,
        monthlyNotifications: false,
        quarterlyNotifications: true,
        yearlyNotifications: false,
      })

      const result = await scheduleNotificationsForAllUsers()

      expect(result.success).toBe(true)
      expect(result.processedUsers).toBe(2)
      // Each user: 1 enabled channel x 1 enabled period type = 1 job; 2 users => 2.
      expect(result.totalScheduledJobs).toBe(2)
      expect(addMock).toHaveBeenCalledTimes(2)

      // The full (non-empty) result shape carries totalUsers + errors.
      if (!('totalUsers' in result)) {
        throw new Error('expected the populated result shape')
      }
      expect(result.totalUsers).toBe(2)
      expect(result.errors).toBeUndefined()
    })

    it('reports zero processing when no role=user accounts exist', async () => {
      await seedUser({ email: 'admin@example.com', role: 'admin' })

      const result = await scheduleNotificationsForAllUsers()

      expect(result.success).toBe(true)
      expect(result.message).toBe('Geen gebruikers gevonden')
      expect(result.processedUsers).toBe(0)
      expect(result.totalScheduledJobs).toBe(0)
      expect(addMock).not.toHaveBeenCalled()
    })
  })

  describe('cancelNotificationsForUser', () => {
    it('returns a success stub (cancellation not yet implemented)', async () => {
      const userId = new mongoose.Types.ObjectId().toString()

      const result = await cancelNotificationsForUser(userId, userId)

      // FIXME(cancel-not-implemented): the service has a TODO and currently
      // never cancels any jobs -- it only returns a placeholder. This test
      // characterizes CURRENT behavior so the eventual implementation breaks it.
      expect(result.success).toBe(true)
      expect(result.message).toBe(
        'Notificaties geannuleerd (implementatie volgt)',
      )
      expect(addMock).not.toHaveBeenCalled()
    })
  })

  describe('getSchedulingStats', () => {
    it('counts preferences docs per channel across all tenants', async () => {
      const u1 = new mongoose.Types.ObjectId()
      const u2 = new mongoose.Types.ObjectId()
      const u3 = new mongoose.Types.ObjectId()

      // email on, in-app on, no push token.
      await seedPrefs(u1, 'tenant-1', {
        emailNotifications: true,
        inAppNotifications: true,
        pushNotifications: false,
      })
      // email off, in-app on, push on -- and we ATTEMPT to set a push token.
      await seedPrefs(u2, 'tenant-2', {
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: true,
        pushNotificationToken: 'fcm-token-abc',
      } as Record<string, unknown>)
      // email on, in-app off, push on, no token.
      await seedPrefs(u3, 'tenant-3', {
        emailNotifications: true,
        inAppNotifications: false,
        pushNotifications: true,
      })

      const stats = await getSchedulingStats()

      expect(stats.totalUsersWithPreferences).toBe(3)
      expect(stats.emailNotificationUsers).toBe(2)
      expect(stats.inAppNotificationUsers).toBe(2)
      // FIXME(push-token-field-missing): getSchedulingStats counts push users
      // with `{ pushNotifications: true, pushNotificationToken: { $ne: null } }`,
      // but the VATReturnNotificationPreferences schema has NO
      // `pushNotificationToken` field. Mongoose strips the unknown key on save,
      // so the field is always absent and `$ne: null` never matches -- the push
      // count is permanently 0 regardless of how many users enabled push.
      // (FCM tokens actually live in the separate FCMToken model.) Asserting
      // CURRENT behavior; correct expectation would be 1 (only u2 set a token).
      expect(stats.pushNotificationUsers).toBe(0)
      expect(stats.lastUpdated).toBeInstanceOf(Date)
    })

    it('returns all-zero counts when no preferences exist', async () => {
      const stats = await getSchedulingStats()

      expect(stats.totalUsersWithPreferences).toBe(0)
      expect(stats.emailNotificationUsers).toBe(0)
      expect(stats.inAppNotificationUsers).toBe(0)
      expect(stats.pushNotificationUsers).toBe(0)
    })
  })
})
