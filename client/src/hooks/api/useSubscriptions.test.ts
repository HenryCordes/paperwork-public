import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useSubscriptionManagement,
  useSubscriptionByOrderId,
  useCreateSubscription,
  hasActiveSubscription,
} from './useSubscriptions'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useSubscriptionManagement', () => {
  it('fetches /api/subscriptions and returns the data', async () => {
    const payload = { subscriptions: [{ subscriptionStatus: 'active' }] }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: payload } })

    const { result } = renderHook(() => useSubscriptionManagement(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith(
      '/api/subscriptions',
      expect.any(Object),
    )
    expect(result.current.data).toEqual(payload)
  })

  it('returns silent fallback { subscriptions: [] } when axios.get rejects', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useSubscriptionManagement(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ subscriptions: [] })
  })
})

describe('useSubscriptionByOrderId', () => {
  it('does not call axios.get and stays idle when orderId is empty', () => {
    const { result } = renderHook(() => useSubscriptionByOrderId(''), {
      wrapper: createQueryWrapper(),
    })

    expect(axios.get).not.toHaveBeenCalled()
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches /api/payment/subscription/order/<orderId> and returns the data', async () => {
    const payload = { _id: 'sub1' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: payload } })

    const { result } = renderHook(() => useSubscriptionByOrderId('order-9'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith(
      '/api/payment/subscription/order/order-9',
      expect.any(Object),
    )
    expect(result.current.data).toEqual(payload)
  })
})

describe('useCreateSubscription', () => {
  it('posts to /api/payment/mollie/subscription and returns the data', async () => {
    const payload = { _id: 'sub1' }
    ;(axios.post as jest.Mock).mockResolvedValue({ data: { data: payload } })

    const { result } = renderHook(() => useCreateSubscription(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ plan: 'essentials' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith(
      '/api/payment/mollie/subscription',
      { plan: 'essentials' },
      expect.any(Object),
    )
    expect(result.current.data).toEqual(payload)
  })
})

describe('hasActiveSubscription', () => {
  it('returns true when hasActiveSubscription flag is truthy', () => {
    expect(hasActiveSubscription({ hasActiveSubscription: true })).toBe(true)
  })

  it('returns true when subscription.subscriptionStatus is active', () => {
    expect(
      hasActiveSubscription({
        subscription: { subscriptionStatus: 'active' },
      }),
    ).toBe(true)
  })

  it('returns true when activeSubscription.subscriptionStatus is active', () => {
    expect(
      hasActiveSubscription({
        activeSubscription: { subscriptionStatus: 'active' },
      }),
    ).toBe(true)
  })

  it('returns true when subscriptions array contains an active entry', () => {
    expect(
      hasActiveSubscription({
        subscriptions: [{ subscriptionStatus: 'active' }],
      }),
    ).toBe(true)
  })

  it('returns false for null', () => {
    expect(hasActiveSubscription(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(hasActiveSubscription(undefined)).toBe(false)
  })

  it('returns false for an empty object', () => {
    expect(hasActiveSubscription({})).toBe(false)
  })

  it('returns false when all subscriptions are non-active', () => {
    expect(
      hasActiveSubscription({
        subscriptions: [{ subscriptionStatus: 'cancelled' }],
      }),
    ).toBe(false)
  })
})
