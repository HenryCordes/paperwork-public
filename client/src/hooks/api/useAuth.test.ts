import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import { useRegister, useCreateSubscription } from './useAuth'

jest.mock('axios')
jest.mock('../../utils/setAuthToken', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useRegister', () => {
  it('posts payload and stores token when present', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { token: 'jwt-123', user: { _id: 'u1' } },
    })

    const { result } = renderHook(() => useRegister(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ email: 'jan@example.com', password: 'secret123' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith(
      '/api/auth/register',
      { email: 'jan@example.com', password: 'secret123' },
      expect.any(Object),
    )
    expect(setItemSpy).toHaveBeenCalledWith('token', 'jwt-123')
    expect(result.current.data).toEqual({
      token: 'jwt-123',
      user: { _id: 'u1' },
    })
  })

  it('does NOT store a token when the response has no token field', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { user: { _id: 'u1' } },
    })

    const { result } = renderHook(() => useRegister(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ email: 'a@b.c' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(setItemSpy).not.toHaveBeenCalledWith('token', expect.anything())
  })
})

describe('useCreateSubscription', () => {
  it('posts subscription payload and returns data.data', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'sub1' } },
    })

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
    expect(result.current.data).toEqual({ _id: 'sub1' })
  })
})
