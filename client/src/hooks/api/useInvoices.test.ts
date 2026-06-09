import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useInvoicesList,
  useInvoice,
  useCreateOrUpdateInvoice,
  useDeleteInvoice,
} from './useInvoices'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useInvoicesList', () => {
  it('fetches /api/invoices with no params and returns the data', async () => {
    const invoices = [{ _id: 'i1' }, { _id: 'i2' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: invoices } })

    const { result } = renderHook(() => useInvoicesList(''), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/invoices')
    expect(result.current.data).toEqual(invoices)
  })

  it('appends a query string to the url', async () => {
    const invoices = [{ _id: 'i1' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: invoices } })

    const { result } = renderHook(() => useInvoicesList('?offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/invoices?offset=10')
  })
})

describe('useInvoice', () => {
  it('fetches /api/invoice/<id> and returns the data', async () => {
    const invoice = { _id: 'i1', invoiceNumber: '2024-001' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: invoice } })

    const { result } = renderHook(() => useInvoice('i1'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/invoice/i1')
    expect(result.current.data).toEqual(invoice)
  })
})

describe('useCreateOrUpdateInvoice', () => {
  it('posts to /api/invoice with the invoice payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'i1', invoiceNumber: '2024-001' } },
    })

    const { result } = renderHook(() => useCreateOrUpdateInvoice(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ invoiceNumber: '2024-001' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/invoice', {
      invoiceNumber: '2024-001',
    })
  })
})

describe('useDeleteInvoice', () => {
  it('deletes /api/invoice/<id>', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'i1' } },
    })

    const { result } = renderHook(() => useDeleteInvoice(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate('i1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith('/api/invoice/i1')
  })
})
