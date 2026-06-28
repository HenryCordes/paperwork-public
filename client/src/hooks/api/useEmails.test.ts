import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useEmails,
  useEmail,
  useCreateOrUpdateEmail,
  useDeleteEmail,
  useSendEmail,
} from './useEmails'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useEmails', () => {
  it('fetches /api/emails with no params and returns the data', async () => {
    const emails = [{ _id: 'm1' }, { _id: 'm2' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: emails } })

    const { result } = renderHook(() => useEmails(''), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/emails')
    expect(result.current.data).toEqual(emails)
  })

  it('appends a query string to the url', async () => {
    const emails = [{ _id: 'm1' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: emails } })

    const { result } = renderHook(() => useEmails('?offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/emails?offset=10')
  })
})

describe('useEmail', () => {
  it('fetches /api/email/<id> and returns the data', async () => {
    const email = { _id: 'm1', subject: 'Hello' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: email } })

    const { result } = renderHook(() => useEmail('m1'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/email/m1')
    expect(result.current.data).toEqual(email)
  })
})

describe('useCreateOrUpdateEmail', () => {
  it('posts to /api/email with the email payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'm1', subject: 'Hello' } },
    })

    const { result } = renderHook(() => useCreateOrUpdateEmail(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ subject: 'Hello' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/email', { subject: 'Hello' })
  })
})

describe('useDeleteEmail', () => {
  it('deletes /api/email/<id>', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'm1' } },
    })

    const { result } = renderHook(() => useDeleteEmail(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate('m1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith('/api/email/m1')
  })
})

describe('useSendEmail', () => {
  it('posts to /api/email/send with the email payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'm1' } },
    })

    const { result } = renderHook(() => useSendEmail(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ to: 'a@b.com', subject: 'Hello' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/email/send', {
      to: 'a@b.com',
      subject: 'Hello',
    })
  })
})
