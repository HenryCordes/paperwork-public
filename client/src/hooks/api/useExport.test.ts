import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useFinancialSummary,
  useExpensesExport,
  useInvoicesExport,
  useExportExpenses,
} from './useExport'

jest.mock('axios')

const mockedAxios = axios as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useFinancialSummary', () => {
  it('is disabled and does not call axios when no year is given', () => {
    const { result } = renderHook(() => useFinancialSummary({}), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedAxios).not.toHaveBeenCalled()
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches with correct params and responseType blob when year is given', async () => {
    mockedAxios.mockResolvedValue({ data: 'blobdata' })

    const { result } = renderHook(() => useFinancialSummary({ year: '2026' }), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/export/summary',
        method: 'GET',
        params: expect.objectContaining({ year: '2026' }),
        responseType: 'blob',
      }),
    )
    expect(result.current.data).toBe('blobdata')
  })
})

describe('useExpensesExport', () => {
  it('is disabled and does not call axios without a date range', () => {
    const { result } = renderHook(() => useExpensesExport({}), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedAxios).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches /api/export/expenses with the date range when both dates are given', async () => {
    mockedAxios.mockResolvedValue({ data: 'csvdata' })

    const { result } = renderHook(
      () =>
        useExpensesExport({ startDate: '2026-01-01', endDate: '2026-03-31' }),
      { wrapper: createQueryWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/export/expenses', method: 'GET' }),
    )
    expect(result.current.data).toBe('csvdata')
  })
})

describe('useInvoicesExport', () => {
  it('is disabled and does not call axios without a date range', () => {
    const { result } = renderHook(() => useInvoicesExport({}), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedAxios).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches /api/export/invoices with the date range when both dates are given', async () => {
    mockedAxios.mockResolvedValue({ data: 'csvdata' })

    const { result } = renderHook(
      () =>
        useInvoicesExport({ startDate: '2026-01-01', endDate: '2026-03-31' }),
      { wrapper: createQueryWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/export/invoices', method: 'GET' }),
    )
    expect(result.current.data).toBe('csvdata')
  })
})

describe('useExportExpenses', () => {
  it('posts with defaulted format and includeReceipts when not provided', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true } })

    const { result } = renderHook(() => useExportExpenses(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ startDate: '2026-01-01', endDate: '2026-03-31' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/export/expenses',
        method: 'POST',
        data: expect.objectContaining({
          format: 'csv',
          includeReceipts: false,
        }),
      }),
    )
    expect(result.current.data).toEqual({ ok: true })
  })
})
