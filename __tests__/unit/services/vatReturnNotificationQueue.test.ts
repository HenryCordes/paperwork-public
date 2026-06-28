import Bull from 'bull'
import mongoose from 'mongoose'

import FCMToken from '../../../models/FCMToken'
import {
  scheduleVATReturnNotification,
  cancelVATReturnNotification,
  scheduleAllVATReturnNotifications,
  getQueueStats,
} from '../../../services/queues/vatReturnNotificationQueue'
import * as dbHandler from '../../setup/helper-db'

// The module constructs its queue with `new Bull(...)` at import time. The Bull
// mock factory (in __tests__/setup/externalMocks.ts) returns a fresh object per
// construction, so the first construction result is this module's queue instance.
type QueueInstanceMock = {
  add: jest.Mock
  getJob: jest.Mock
  getWaiting: jest.Mock
  getActive: jest.Mock
  getCompleted: jest.Mock
  getFailed: jest.Mock
  getDelayed: jest.Mock
}

const queueInstance = (Bull as unknown as jest.Mock).mock.results[0]
  .value as QueueInstanceMock

const tenantId = '507f1f77bcf86cd799439011'
const userId = '507f1f77bcf86cd799439012'

const baseUserPreferences = {
  advanceWarningDays: 7,
  secondReminderDays: 3,
  secondReminderEnabled: false,
  emailNotifications: true,
  pushNotifications: false,
  inAppNotifications: false,
}

const baseNotificationData = {
  deadline: '2030-01-31',
  periodType: 'quarter',
  period: 'Q4',
  year: 2029,
  daysUntilDeadline: 7,
  userPreferences: baseUserPreferences,
  userEmail: 'user@example.com',
  userName: 'Test User',
  companyName: 'Test BV',
}

const futureDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

describe('vatReturnNotificationQueue', () => {
  beforeEach(() => {
    // Reset call history; restore the default add resolution.
    queueInstance.add.mockClear()
    queueInstance.add.mockResolvedValue({ id: 'test-job' })
    queueInstance.getJob.mockReset()
    queueInstance.getJob.mockResolvedValue(null)
  })

  describe('scheduleVATReturnNotification', () => {
    it('adds a delayed job and returns its scheduling descriptor for a future date', async () => {
      const scheduledDate = futureDate()

      const result = await scheduleVATReturnNotification(
        tenantId,
        userId,
        baseNotificationData,
        scheduledDate,
        'email-reminder',
      )

      expect(result).not.toBeNull()
      expect(result?.jobId).toBe('test-job')
      expect(result?.notificationType).toBe('email-reminder')
      expect(result?.scheduledDate).toBe(scheduledDate)
      // delay is the gap between scheduledDate and now; allow scheduler jitter.
      expect(result?.delay).toBeGreaterThan(0)
      expect(result?.delay).toBeLessThanOrEqual(
        scheduledDate.getTime() - Date.now() + 1000,
      )

      expect(queueInstance.add).toHaveBeenCalledTimes(1)
      const [jobName, jobData, jobOpts] = queueInstance.add.mock.calls[0]
      expect(jobName).toBe('email-reminder')
      expect(jobData.tenantId).toBe(tenantId)
      expect(jobData.userId).toBe(userId)
      expect(jobData.data.notificationType).toBe('email-reminder')
      expect(jobData.data.deadline).toBe('2030-01-31')
      // Deterministic, dedup-safe jobId with the first-reminder suffix.
      expect(jobOpts.jobId).toBe(
        `vat-email-reminder-${tenantId}-${userId}-2030-01-31-reminder1`,
      )
      expect(jobOpts.removeOnComplete).toBe(false)
      expect(jobOpts.removeOnFail).toBe(false)
      expect(jobOpts.delay).toBe(result?.delay)
    })

    it('uses the -reminder2 jobId suffix when isSecondReminder is set', async () => {
      await scheduleVATReturnNotification(
        tenantId,
        userId,
        { ...baseNotificationData, isSecondReminder: true },
        futureDate(),
        'push-notification',
      )

      const [, , jobOpts] = queueInstance.add.mock.calls[0]
      expect(jobOpts.jobId).toBe(
        `vat-push-notification-${tenantId}-${userId}-2030-01-31-reminder2`,
      )
    })

    it('sets elevated priority (10) when the deadline is within 3 days', async () => {
      await scheduleVATReturnNotification(
        tenantId,
        userId,
        { ...baseNotificationData, daysUntilDeadline: 2 },
        futureDate(),
      )

      const [, jobData] = queueInstance.add.mock.calls[0]
      expect(jobData.priority).toBe(10)
      expect(jobData.options.priority).toBe(10)
    })

    it('sets normal priority (5) when the deadline is more than 3 days out', async () => {
      await scheduleVATReturnNotification(
        tenantId,
        userId,
        { ...baseNotificationData, daysUntilDeadline: 10 },
        futureDate(),
      )

      const [, jobData] = queueInstance.add.mock.calls[0]
      expect(jobData.priority).toBe(5)
    })

    it('returns null and never enqueues when the scheduled date is in the past', async () => {
      const result = await scheduleVATReturnNotification(
        tenantId,
        userId,
        baseNotificationData,
        new Date(Date.now() - 60_000),
      )

      expect(result).toBeNull()
      expect(queueInstance.add).not.toHaveBeenCalled()
    })

    it('defaults the notification type to email-reminder', async () => {
      const result = await scheduleVATReturnNotification(
        tenantId,
        userId,
        baseNotificationData,
        futureDate(),
      )

      expect(result?.notificationType).toBe('email-reminder')
      expect(queueInstance.add.mock.calls[0][0]).toBe('email-reminder')
    })

    it('propagates errors thrown by queue.add', async () => {
      queueInstance.add.mockRejectedValueOnce(new Error('redis down'))

      await expect(
        scheduleVATReturnNotification(
          tenantId,
          userId,
          baseNotificationData,
          futureDate(),
        ),
      ).rejects.toThrow('redis down')
    })
  })

  describe('cancelVATReturnNotification', () => {
    it('removes the job and returns true when the job exists', async () => {
      const remove = jest.fn().mockResolvedValue(undefined)
      queueInstance.getJob.mockResolvedValueOnce({ remove })

      const result = await cancelVATReturnNotification('some-job-id')

      expect(result).toBe(true)
      expect(queueInstance.getJob).toHaveBeenCalledWith('some-job-id')
      expect(remove).toHaveBeenCalledTimes(1)
    })

    it('returns false when the job is not found', async () => {
      queueInstance.getJob.mockResolvedValueOnce(null)

      const result = await cancelVATReturnNotification('missing-job-id')

      expect(result).toBe(false)
    })

    it('propagates errors thrown by getJob', async () => {
      queueInstance.getJob.mockRejectedValueOnce(new Error('lookup failed'))

      await expect(cancelVATReturnNotification('boom')).rejects.toThrow(
        'lookup failed',
      )
    })
  })

  describe('getQueueStats', () => {
    it('returns zeroed counts and total when all queues are empty', async () => {
      const stats = await getQueueStats()

      expect(stats).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      })
    })

    it('aggregates counts across queue states into the total', async () => {
      queueInstance.getWaiting.mockResolvedValueOnce([{}, {}])
      queueInstance.getActive.mockResolvedValueOnce([{}])
      queueInstance.getCompleted.mockResolvedValueOnce([{}, {}, {}])
      queueInstance.getFailed.mockResolvedValueOnce([{}])
      queueInstance.getDelayed.mockResolvedValueOnce([{}, {}, {}, {}])

      const stats = await getQueueStats()

      expect(stats).toEqual({
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 1,
        delayed: 4,
        total: 11,
      })
    })
  })

  describe('scheduleAllVATReturnNotifications (DB-coupled)', () => {
    beforeAll(async () => {
      await dbHandler.connect()
    })
    afterEach(async () => {
      await dbHandler.clearDatabase()
    })
    afterAll(async () => {
      await dbHandler.closeDatabase()
    })

    const deadlineInfo = {
      deadline: '2030-01-31',
      periodType: 'quarter',
      period: 'Q4',
      year: 2029,
    }

    const userInfo = {
      email: 'user@example.com',
      name: 'Test User',
      companyName: 'Test BV',
    }

    const seedFcmToken = (over: Record<string, unknown> = {}) =>
      FCMToken.create({
        userId: new mongoose.Types.ObjectId(userId),
        tenantId,
        token: 'fcm-token-abc',
        platform: 'ios',
        isActive: true,
        ...over,
      })

    it('schedules only the email job when only email notifications are enabled', async () => {
      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        baseUserPreferences,
        userInfo,
      )

      expect(jobs).toHaveLength(1)
      expect(jobs[0].notificationType).toBe('email-reminder')
      expect(queueInstance.add).toHaveBeenCalledTimes(1)
      expect(queueInstance.add.mock.calls[0][0]).toBe('email-reminder')
    })

    it('does not schedule a push job when push is enabled but no active FCM token exists', async () => {
      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        { ...baseUserPreferences, pushNotifications: true },
        userInfo,
      )

      // No FCM token seeded -> push is skipped, only the email job is scheduled.
      expect(jobs).toHaveLength(1)
      expect(jobs.map((j) => j.notificationType)).toEqual(['email-reminder'])
    })

    it('schedules a push job and forwards the FCM token/platform when an active token exists', async () => {
      await seedFcmToken()

      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        {
          ...baseUserPreferences,
          emailNotifications: false,
          pushNotifications: true,
        },
        userInfo,
      )

      expect(jobs).toHaveLength(1)
      expect(jobs[0].notificationType).toBe('push-notification')
      const [jobName, jobData] = queueInstance.add.mock.calls[0]
      expect(jobName).toBe('push-notification')
      expect(jobData.data.pushToken).toBe('fcm-token-abc')
      expect(jobData.data.pushPlatform).toBe('ios')
    })

    it('ignores inactive FCM tokens when deciding whether to schedule push', async () => {
      await seedFcmToken({ isActive: false })

      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        {
          ...baseUserPreferences,
          emailNotifications: false,
          pushNotifications: true,
        },
        userInfo,
      )

      expect(jobs).toHaveLength(0)
      expect(queueInstance.add).not.toHaveBeenCalled()
    })

    it('schedules email, push, and in-app for the first reminder when all channels are on', async () => {
      await seedFcmToken()

      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        {
          ...baseUserPreferences,
          emailNotifications: true,
          pushNotifications: true,
          inAppNotifications: true,
        },
        userInfo,
      )

      expect(jobs).toHaveLength(3)
      expect(jobs.map((j) => j.notificationType)).toEqual([
        'email-reminder',
        'push-notification',
        'in-app-notification',
      ])
    })

    it('schedules first and second reminders across all channels when secondReminderEnabled', async () => {
      await seedFcmToken()

      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        {
          ...baseUserPreferences,
          emailNotifications: true,
          pushNotifications: true,
          inAppNotifications: true,
          secondReminderEnabled: true,
        },
        userInfo,
      )

      // 3 channels x (first reminder + second reminder) = 6 jobs.
      expect(jobs).toHaveLength(6)
      const reminder1Ids = queueInstance.add.mock.calls
        .map((c) => c[2].jobId as string)
        .filter((id) => id.endsWith('-reminder1'))
      const reminder2Ids = queueInstance.add.mock.calls
        .map((c) => c[2].jobId as string)
        .filter((id) => id.endsWith('-reminder2'))
      expect(reminder1Ids).toHaveLength(3)
      expect(reminder2Ids).toHaveLength(3)
      // The second reminder carries the secondReminderDays as daysUntilDeadline.
      const reminder2Calls = queueInstance.add.mock.calls.filter((c) =>
        (c[2].jobId as string).endsWith('-reminder2'),
      )
      for (const call of reminder2Calls) {
        expect(call[1].data.daysUntilDeadline).toBe(3)
      }
    })

    it("does not leak another tenant's FCM token into the scheduled push data", async () => {
      // Seed a token for a DIFFERENT tenant; the query is tenant-scoped by the
      // explicit tenantId in the service, so this token must not be picked up.
      await seedFcmToken({
        tenantId: '507f1f77bcf86cd799439099',
        token: 'other-tenant-token',
      })

      const jobs = await scheduleAllVATReturnNotifications(
        tenantId,
        userId,
        deadlineInfo,
        {
          ...baseUserPreferences,
          emailNotifications: false,
          pushNotifications: true,
        },
        userInfo,
      )

      expect(jobs).toHaveLength(0)
      expect(queueInstance.add).not.toHaveBeenCalled()
    })
  })
})
