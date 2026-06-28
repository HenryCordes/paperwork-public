import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import { usePlans } from './usePlans'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('usePlans', () => {
  it('fetches /api/plans and returns the data array on success', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { success: true, data: [{ id: 'essentials' }] },
    })

    const { result } = renderHook(() => usePlans(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/plans')
    expect(result.current.data).toEqual([{ id: 'essentials' }])
  })

  it('returns [] when success is false (silent fallback)', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { success: false },
    })

    const { result } = renderHook(() => usePlans(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([])
  })
})
