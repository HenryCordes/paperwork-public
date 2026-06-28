import userEvent from '@testing-library/user-event'
import { confirmAlert } from 'react-confirm-alert'
import { renderWithProviders, screen } from '../../test-utils'
import { useExpensesList, useDeleteExpense } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useExpensesList: jest.fn(),
  useDeleteExpense: jest.fn(),
}))
jest.mock('react-confirm-alert', () => ({ confirmAlert: jest.fn() }))
jest.mock('../ListFilters/ListFilters', () => () => (
  <div data-testid="list-filters" />
))
jest.mock('../ExpenseExport/ExpenseExport', () => () => null)

import ExpensesTable from './ExpensesTable'

const mockList = (over = {}) =>
  (useExpensesList as jest.Mock).mockReturnValue({
    data: { docs: [], totalDocs: 0 },
    isError: false,
    error: null,
    ...over,
  })

describe('ExpensesTable', () => {
  let mutate: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    mutate = jest.fn()
    ;(useDeleteExpense as jest.Mock).mockReturnValue({ mutate })
  })

  it('shows the empty state when there are no expenses', () => {
    mockList({ data: { docs: [], totalDocs: 0 } })
    renderWithProviders(<ExpensesTable />)
    expect(screen.getByText('Geen kosten gevonden...')).toBeInTheDocument()
  })

  it('renders a row for each expense', () => {
    mockList({
      data: {
        docs: [
          {
            _id: 'x1',
            expenseNumber: 1,
            info: 'Office supplies',
            expenseDate: '2026-01-10',
          },
          {
            _id: 'x2',
            expenseNumber: 2,
            info: 'AWS hosting',
            expenseDate: '2026-02-10',
          },
        ],
        totalDocs: 2,
      },
    })
    renderWithProviders(<ExpensesTable />)
    expect(screen.getByText('Office supplies')).toBeInTheDocument()
    expect(screen.getByText('AWS hosting')).toBeInTheDocument()
  })

  it('deletes an expense after confirmation', async () => {
    mockList({
      data: {
        docs: [{ _id: 'x1', expenseNumber: 1, info: 'Office supplies' }],
        totalDocs: 1,
      },
    })
    renderWithProviders(<ExpensesTable />)
    await userEvent.click(screen.getAllByTitle('Verwijderen')[0])
    expect(confirmAlert).toHaveBeenCalledTimes(1)
    const { buttons } = (confirmAlert as jest.Mock).mock.calls[0][0]
    buttons.find((b: { label: string }) => b.label === 'Ja').onClick()
    expect(mutate).toHaveBeenCalledWith('x1')
  })
})
