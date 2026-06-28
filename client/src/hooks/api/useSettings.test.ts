import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useSettings,
  useCreateOrUpdateSettings,
  useUploadLogo,
} from './useSettings'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useSettings', () => {
  it('fetches /api/settings and returns the data', async () => {
    const settings = { companyName: 'Acme' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: settings } })

    const { result } = renderHook(() => useSettings(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/settings')
    expect(result.current.data).toEqual(settings)
  })
})

describe('useCreateOrUpdateSettings', () => {
  it('posts to /api/settings with the payload and returns the data', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 's1' } },
    })

    const { result } = renderHook(() => useCreateOrUpdateSettings(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ companyName: 'Acme' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/settings', {
      companyName: 'Acme',
    })
    expect(result.current.data).toEqual({ _id: 's1' })
  })
})

describe('useUploadLogo', () => {
  it('posts to /api/document and returns the constructed file URL on success', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { fileLocation: 'logo123.png' } },
    })

    const { result } = renderHook(() => useUploadLogo(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate(new File(['x'], 'logo.png', { type: 'image/png' }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith(
      '/api/document',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
    expect(result.current.data).toBe('/api/document/logo123.png')
  })

  it('enters error state when fileLocation is missing from the response', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: {} },
    })

    const { result } = renderHook(() => useUploadLogo(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate(new File(['x'], 'logo.png'))

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
