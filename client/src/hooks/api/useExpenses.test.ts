import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useExpensesList,
  useExpense,
  useCreateOrUpdateExpense,
  useDeleteExpense,
} from './useExpenses'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useExpensesList', () => {
  it('fetches /api/expenses with no params and returns the data', async () => {
    const expenses = [{ _id: 'e1' }, { _id: 'e2' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: expenses } })

    const { result } = renderHook(() => useExpensesList(''), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/expenses')
    expect(result.current.data).toEqual(expenses)
  })

  it('appends a query string to the url', async () => {
    const expenses = [{ _id: 'e1' }]
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: expenses } })

    const { result } = renderHook(() => useExpensesList('?offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/expenses?offset=10')
  })
})

describe('useExpense', () => {
  it('fetches /api/expense/<id> and returns the data', async () => {
    const expense = { _id: 'e1', amount: 100 }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: expense } })

    const { result } = renderHook(() => useExpense('e1'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/expense/e1')
    expect(result.current.data).toEqual(expense)
  })
})

describe('useCreateOrUpdateExpense', () => {
  it('posts to /api/expense with the expense payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'e1', amount: 100 } },
    })

    const { result } = renderHook(() => useCreateOrUpdateExpense(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ amount: 100 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/expense', { amount: 100 })
  })
})

describe('useDeleteExpense', () => {
  it('deletes /api/expense/<id>', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'e1' } },
    })

    const { result } = renderHook(() => useDeleteExpense(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate('e1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith('/api/expense/e1')
  })
})
