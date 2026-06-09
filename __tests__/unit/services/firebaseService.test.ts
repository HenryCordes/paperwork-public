import admin from 'firebase-admin'

import firebaseService from '../../../services/firebaseService'

// firebase-admin is globally mocked in __tests__/setup/externalMocks.ts, but the
// global mock returns a FRESH messaging() object (with fresh send spies) on every
// call, so we cannot inspect the message shape across calls. Pin messaging() to a
// stable object with persistent spies we control per test. We only override the
// boundary return value, never our own code.
const send = jest.fn()
const sendEachForMulticast = jest.fn()
const messaging = admin.messaging as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  send.mockResolvedValue('test-message-id')
  sendEachForMulticast.mockResolvedValue({
    successCount: 0,
    failureCount: 0,
    responses: [],
  })
  messaging.mockReturnValue({ send, sendEachForMulticast })
})

describe('sendPushNotification', () => {
  it('sends a single message with the token, notification, and platform config, returning the message id', async () => {
    const token = 'token-abcdefghij-rest'
    const result = await firebaseService.sendPushNotification(
      token,
      { title: 'Hello', body: 'World' },
      { invoiceId: 'inv-1' },
    )

    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0][0] as Record<string, unknown>
    expect(message.token).toBe(token)
    expect(message.notification).toEqual({ title: 'Hello', body: 'World' })

    const android = message.android as { notification: Record<string, string> }
    expect(android.notification).toEqual({
      icon: 'ic_notification',
      color: '#1976d2',
      sound: 'default',
      priority: 'high',
    })

    const apns = message.apns as {
      payload: {
        aps: { alert: { title: string; body: string }; sound: string }
      }
    }
    expect(apns.payload.aps.alert).toEqual({ title: 'Hello', body: 'World' })

    expect(result).toEqual({
      success: true,
      messageId: 'test-message-id',
      token: 'token-abcd...',
    })
  })

  it('stringifies non-string data values and stamps a timestamp string', async () => {
    await firebaseService.sendPushNotification(
      'token-1234567890',
      { title: 't', body: 'b' },
      { count: 5, flag: true, label: 'keep' },
    )

    const message = send.mock.calls[0][0] as { data: Record<string, string> }
    expect(message.data.count).toBe('5')
    expect(message.data.flag).toBe('true')
    expect(message.data.label).toBe('keep')
    expect(typeof message.data.timestamp).toBe('string')
    expect(Number.isNaN(Number(message.data.timestamp))).toBe(false)
  })

  it('flags shouldRemoveToken when the SDK reports an unregistered token', async () => {
    send.mockRejectedValueOnce({
      code: 'messaging/registration-token-not-registered',
      message: 'gone',
    })

    const result = await firebaseService.sendPushNotification(
      'token-deadbeef00',
      { title: 't', body: 'b' },
    )

    expect(result).toEqual({
      success: false,
      error: 'Invalid or expired token',
      shouldRemoveToken: true,
      token: 'token-dead...',
    })
  })

  it('returns the raw error without shouldRemoveToken for other failures', async () => {
    send.mockRejectedValueOnce({ code: 'messaging/internal', message: 'boom' })

    const result = await firebaseService.sendPushNotification(
      'token-deadbeef00',
      { title: 't', body: 'b' },
    )

    expect(result).toEqual({
      success: false,
      error: 'boom',
      token: 'token-dead...',
    })
    expect(result).not.toHaveProperty('shouldRemoveToken')
  })
})

describe('sendMulticastNotification', () => {
  it('returns an early failure without calling the SDK when no tokens are given', async () => {
    const result = await firebaseService.sendMulticastNotification([], {
      title: 't',
      body: 'b',
    })

    expect(result).toEqual({ success: false, error: 'No tokens provided' })
    expect(sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('sends one multicast message carrying every token and merged data with a timestamp', async () => {
    sendEachForMulticast.mockResolvedValueOnce({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    })

    const tokens = ['tok-a', 'tok-b']
    const result = await firebaseService.sendMulticastNotification(
      tokens,
      { title: 'Multi', body: 'Cast' },
      { topic: 'invoices' },
    )

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1)
    const message = sendEachForMulticast.mock.calls[0][0] as {
      tokens: string[]
      data: Record<string, string>
      apns: { payload: { aps: { badge: number } } }
    }
    expect(message.tokens).toEqual(tokens)
    expect(message.data.topic).toBe('invoices')
    expect(typeof message.data.timestamp).toBe('string')
    expect(message.apns.payload.aps.badge).toBe(1)

    expect(result).toEqual({
      success: true,
      successCount: 2,
      failureCount: 0,
      invalidTokens: [],
      responses: [{ success: true }, { success: true }],
    })
  })

  it('collects invalid tokens by index and reports success false when none delivered', async () => {
    sendEachForMulticast.mockResolvedValueOnce({
      successCount: 0,
      failureCount: 2,
      responses: [
        {
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
      ],
    })

    const result = await firebaseService.sendMulticastNotification(
      ['bad-1', 'bad-2'],
      { title: 't', body: 'b' },
    )

    expect(result.success).toBe(false)
    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(2)
    expect(result.invalidTokens).toEqual(['bad-1', 'bad-2'])
  })

  it('does not treat non-token errors as invalid tokens', async () => {
    sendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    })

    const result = await firebaseService.sendMulticastNotification(
      ['good-1', 'transient-2'],
      { title: 't', body: 'b' },
    )

    expect(result.success).toBe(true)
    expect(result.invalidTokens).toEqual([])
  })

  it('returns a failure object carrying the token count when the SDK throws', async () => {
    sendEachForMulticast.mockRejectedValueOnce({ message: 'multicast down' })

    const result = await firebaseService.sendMulticastNotification(
      ['t1', 't2', 't3'],
      { title: 't', body: 'b' },
    )

    expect(result).toEqual({
      success: false,
      error: 'multicast down',
      tokenCount: 3,
    })
  })
})

describe('validateToken', () => {
  it('sends a dry-run message and reports the token valid on success', async () => {
    const result = await firebaseService.validateToken('token-validate-1')

    expect(send).toHaveBeenCalledTimes(1)
    const [message, dryRun] = send.mock.calls[0]
    expect((message as { token: string }).token).toBe('token-validate-1')
    expect(dryRun).toBe(true)
    expect(result).toEqual({ valid: true })
  })

  it('reports the token invalid with error and code when the dry-run fails', async () => {
    send.mockRejectedValueOnce({
      message: 'invalid token',
      code: 'messaging/invalid-registration-token',
    })

    const result = await firebaseService.validateToken('token-bad-1')

    expect(result).toEqual({
      valid: false,
      error: 'invalid token',
      code: 'messaging/invalid-registration-token',
    })
  })
})
