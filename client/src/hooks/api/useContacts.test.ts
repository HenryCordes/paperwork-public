import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useContacts,
  useContactsByType,
  useContact,
  useCreateOrUpdateContact,
  useDeleteContact,
} from './useContacts'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useContacts', () => {
  it('fetches /api/contacts with no params and returns the data array', async () => {
    const contacts = [{ _id: 'c1' }, { _id: 'c2' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: contacts } })

    const { result } = renderHook(() => useContacts(''), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/contacts')
    expect(result.current.data).toEqual(contacts)
  })

  it('appends a query string to the url', async () => {
    const contacts = [{ _id: 'c1' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: contacts } })

    const { result } = renderHook(() => useContacts('offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/contacts?offset=10')
    expect(result.current.data).toEqual(contacts)
  })

  it('strips a leading ? from the query string', async () => {
    const contacts = [{ _id: 'c1' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: contacts } })

    const { result } = renderHook(() => useContacts('?offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/contacts?offset=10')
  })
})

describe('useContactsByType', () => {
  it('fetches /api/contacts/type/<typeName> and returns the data', async () => {
    const contacts = [{ _id: 'c1', typeName: 'Klant' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: contacts } })

    const { result } = renderHook(() => useContactsByType('Klant'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/contacts/type/Klant')
    expect(result.current.data).toEqual(contacts)
  })
})

describe('useContact', () => {
  it('fetches /api/contact/<id> and returns the data', async () => {
    const contact = { _id: 'c1', companyName: 'Acme' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: contact } })

    const { result } = renderHook(() => useContact('c1'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/contact/c1')
    expect(result.current.data).toEqual(contact)
  })
})

describe('useCreateOrUpdateContact', () => {
  it('posts to /api/contact with the contact payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'c1', companyName: 'Acme' } },
    })

    const { result } = renderHook(() => useCreateOrUpdateContact(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ companyName: 'Acme' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/contact', {
      companyName: 'Acme',
    })
  })
})

describe('useDeleteContact', () => {
  it('deletes /api/contact/<id>', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'c1' } },
    })

    const { result } = renderHook(() => useDeleteContact(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate('c1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith('/api/contact/c1')
  })
})
