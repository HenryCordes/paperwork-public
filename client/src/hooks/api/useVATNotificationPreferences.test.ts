import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useVATNotificationPreferences,
  useUpdateVATNotificationPreferences,
  useUpdatePushNotificationToken,
  useDisablePushNotifications,
} from './useVATNotificationPreferences'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useVATNotificationPreferences', () => {
  it('fetches preferences and returns response.data.data', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { data: { emailEnabled: true } },
    })

    const { result } = renderHook(() => useVATNotificationPreferences(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith(
      '/api/vat-return-notifications/preferences',
    )
    expect(result.current.data).toEqual({ emailEnabled: true })
  })
})

describe('useUpdateVATNotificationPreferences', () => {
  it('puts preferences and returns response.data.data', async () => {
    ;(axios.put as jest.Mock).mockResolvedValue({
      data: { data: { emailEnabled: false } },
    })

    const { result } = renderHook(() => useUpdateVATNotificationPreferences(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ emailEnabled: false })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.put).toHaveBeenCalledWith(
      '/api/vat-return-notifications/preferences',
      { emailEnabled: false },
    )
    expect(result.current.data).toEqual({ emailEnabled: false })
  })
})

describe('useUpdatePushNotificationToken', () => {
  it('posts token and platform and returns response.data.data', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { ok: true } },
    })

    const { result } = renderHook(() => useUpdatePushNotificationToken(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ token: 'fcm-abc', platform: 'android' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith(
      '/api/vat-return-notifications/push-token',
      { token: 'fcm-abc', platform: 'android' },
    )
    expect(result.current.data).toEqual({ ok: true })
  })
})

describe('useDisablePushNotifications', () => {
  it('deletes push-token and returns response.data', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { success: true },
    })

    const { result } = renderHook(() => useDisablePushNotifications(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith(
      '/api/vat-return-notifications/push-token',
    )
    expect(result.current.data).toEqual({ success: true })
  })
})
