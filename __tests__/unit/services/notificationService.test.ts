import { Types } from 'mongoose'

import FCMToken from '../../../models/FCMToken'
import Notification from '../../../models/Notification'
import firebaseService from '../../../services/firebaseService'
import notificationService from '../../../services/notificationService'
import * as dbHandler from '../../setup/helper-db'

// The service calls firebaseService.sendPushNotification at its external
// boundary. Spying on it lets us assert the boundary was hit and lets us
// control results (e.g. shouldRemoveToken) without depending on the
// firebase-admin mock's internal shape.
type SendResult = Awaited<
  ReturnType<typeof firebaseService.sendPushNotification>
>
const sendSpy = jest.spyOn(firebaseService, 'sendPushNotification')

const seedToken = (
  userId: Types.ObjectId,
  tenantId: string,
  over: Partial<{
    token: string
    platform: 'ios' | 'android' | 'web'
    isActive: boolean
  }> = {},
) =>
  FCMToken.create({
    userId,
    tenantId,
    token: `tok-${Math.random().toString(36).slice(2)}`,
    platform: 'ios',
    isActive: true,
    ...over,
  })

const okResult = (over: Partial<SendResult> = {}): SendResult =>
  ({
    success: true,
    messageId: 'msg-1',
    token: 'tok...',
    ...over,
  }) as SendResult

describe('NotificationService.sendNotification', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    sendSpy.mockReset()
  })
  afterAll(async () => {
    sendSpy.mockRestore()
    await dbHandler.closeDatabase()
  })

  it('persists a tenant/user-scoped Notification with the provided fields', async () => {
    sendSpy.mockResolvedValue(okResult())
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId)

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Invoice paid',
      body: 'Customer paid invoice #42',
      type: 'invoice',
      targetId: '42',
      action: 'view',
      data: { invoiceId: '42' },
    })

    const stored = await Notification.findById(result.notificationId).lean()
    expect(stored).not.toBeNull()
    expect(String(stored?.userId)).toBe(userId.toString())
    expect(stored?.tenantId).toBe(tenantId)
    expect(stored?.title).toBe('Invoice paid')
    expect(stored?.body).toBe('Customer paid invoice #42')
    expect(stored?.type).toBe('invoice')
    expect(stored?.targetId).toBe('42')
    expect(stored?.action).toBe('view')
    expect(stored?.read).toBe(false)
    expect(stored?.received).toBe(false)
    expect(stored?.data).toEqual({ invoiceId: '42' })
  })

  it('applies defaults (type=general, action=view, targetId=null) when omitted', async () => {
    sendSpy.mockResolvedValue(okResult())
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId)

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Hello',
      body: 'World',
    })

    const stored = await Notification.findById(result.notificationId).lean()
    expect(stored?.type).toBe('general')
    expect(stored?.action).toBe('view')
    // The service defaults targetId to null and passes it through to create();
    // the schema (String, not required) stores that null verbatim.
    expect(stored?.targetId).toBeNull()
  })

  it('returns sent=false with reason when the user has no active tokens, but still persists the notification', async () => {
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    // No tokens seeded at all.

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'No device',
      body: 'no token',
    })

    expect(result.success).toBe(true)
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('No active tokens')
    expect(sendSpy).not.toHaveBeenCalled()

    const count = await Notification.countDocuments({ userId, tenantId })
    expect(count).toBe(1)
  })

  it('ignores inactive tokens and tokens belonging to other users/tenants', async () => {
    sendSpy.mockResolvedValue(okResult())
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    const otherUser = new Types.ObjectId()
    const otherTenant = new Types.ObjectId().toString()

    await seedToken(userId, tenantId, { token: 'active', isActive: true })
    await seedToken(userId, tenantId, { token: 'inactive', isActive: false })
    await seedToken(otherUser, tenantId, { token: 'other-user' })
    await seedToken(userId, otherTenant, { token: 'other-tenant' })

    await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Targeted',
      body: 'only active same-user same-tenant token',
    })

    // Exactly one matching token => exactly one push send for the active token.
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('active')
  })

  it('sends a push per active token with the notification payload and returns per-token results', async () => {
    sendSpy.mockResolvedValue(okResult())
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId, { token: 'tok-ios', platform: 'ios' })
    await seedToken(userId, tenantId, {
      token: 'tok-android',
      platform: 'android',
    })

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Two devices',
      body: 'both get it',
      type: 'expense',
      targetId: 'e7',
      action: 'edit',
      data: { foo: 'bar' },
    })

    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(result.results?.map((r) => r.platform).sort()).toEqual([
      'android',
      'ios',
    ])
    expect(result.results?.every((r) => r.success)).toBe(true)

    // Push payload carries notification id, type, targetId, action + custom data.
    const [, notification, pushData] = sendSpy.mock.calls[0]
    expect(notification).toEqual({ title: 'Two devices', body: 'both get it' })
    expect(pushData).toMatchObject({
      notificationId: result.notificationId,
      type: 'expense',
      targetId: 'e7',
      action: 'edit',
      foo: 'bar',
    })
  })

  it('coerces a null targetId to an empty string in the push payload', async () => {
    sendSpy.mockResolvedValue(okResult())
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId)

    await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'No target',
      body: 'null target',
      targetId: null,
    })

    const [, , pushData] = sendSpy.mock.calls[0]
    expect((pushData as Record<string, unknown>).targetId).toBe('')
  })

  it('deletes a token Firebase reports as invalid (shouldRemoveToken) and keeps valid ones', async () => {
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId, { token: 'good' })
    await seedToken(userId, tenantId, { token: 'stale' })

    sendSpy.mockImplementation(async (token: string) =>
      token === 'stale'
        ? okResult({
            success: false,
            error: 'Invalid or expired token',
            shouldRemoveToken: true,
          })
        : okResult(),
    )

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Prune',
      body: 'one token is stale',
    })

    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(result.results?.filter((r) => r.success)).toHaveLength(1)

    const remaining = await FCMToken.find({ userId, tenantId }).lean()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].token).toBe('good')
  })

  it('reports partial success without deleting tokens for a non-removal failure', async () => {
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId, { token: 'ok-token' })
    await seedToken(userId, tenantId, { token: 'transient-fail' })

    sendSpy.mockImplementation(async (token: string) =>
      token === 'transient-fail'
        ? okResult({ success: false, error: 'network blip' })
        : okResult(),
    )

    const result = await notificationService.sendNotification({
      userId,
      tenantId,
      title: 'Partial',
      body: 'one transient failure',
    })

    expect(result.sent).toBe(true)
    expect(result.results?.filter((r) => r.success)).toHaveLength(1)
    const failed = result.results?.find((r) => !r.success)
    expect(failed?.error).toBe('network blip')

    // Non-removal failures must NOT delete tokens.
    const remaining = await FCMToken.find({ userId, tenantId }).lean()
    expect(remaining).toHaveLength(2)
  })

  it('propagates an error and does not swallow it when the push send throws', async () => {
    const userId = new Types.ObjectId()
    const tenantId = new Types.ObjectId().toString()
    await seedToken(userId, tenantId)

    sendSpy.mockRejectedValue(new Error('firebase exploded'))

    await expect(
      notificationService.sendNotification({
        userId,
        tenantId,
        title: 'Boom',
        body: 'send throws',
      }),
    ).rejects.toThrow('firebase exploded')

    // The notification record is still persisted (created before the send loop).
    const count = await Notification.countDocuments({ userId, tenantId })
    expect(count).toBe(1)
  })
})
