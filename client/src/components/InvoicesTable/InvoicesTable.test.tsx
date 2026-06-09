import userEvent from '@testing-library/user-event'
import { confirmAlert } from 'react-confirm-alert'
import { renderWithProviders, screen } from '../../test-utils'
import { useInvoicesList, useDeleteInvoice } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useInvoicesList: jest.fn(),
  useDeleteInvoice: jest.fn(),
}))
jest.mock('react-confirm-alert', () => ({ confirmAlert: jest.fn() }))
jest.mock('../ListFilters/ListFilters', () => () => (
  <div data-testid="list-filters" />
))
jest.mock('../InvoiceExport/InvoiceExport', () => () => null)

import InvoicesTable from './InvoicesTable'

const mockList = (over = {}) =>
  (useInvoicesList as jest.Mock).mockReturnValue({
    data: { docs: [], totalDocs: 0 },
    isError: false,
    error: null,
    ...over,
  })

describe('InvoicesTable', () => {
  let mutate: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    mutate = jest.fn()
    ;(useDeleteInvoice as jest.Mock).mockReturnValue({ mutate })
  })

  it('shows the empty state when there are no invoices', () => {
    mockList({ data: { docs: [], totalDocs: 0 } })
    renderWithProviders(<InvoicesTable />)
    expect(screen.getByText('Geen facturen gevonden...')).toBeInTheDocument()
  })

  it('renders a row for each invoice', () => {
    mockList({
      data: {
        docs: [
          {
            _id: 'i1',
            invoiceNumber: 100,
            invoiceDate: '2026-01-15',
            state: 'Concept',
            contactName: 'Acme BV',
          },
          {
            _id: 'i2',
            invoiceNumber: 101,
            invoiceDate: '2026-02-20',
            state: 'Verzonden',
            contactName: 'Globex',
          },
        ],
        totalDocs: 2,
      },
    })
    renderWithProviders(<InvoicesTable />)
    expect(screen.getByText('Acme BV')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('deletes an invoice after confirmation', async () => {
    mockList({
      data: {
        docs: [
          {
            _id: 'i1',
            invoiceNumber: 100,
            invoiceDate: '2026-01-15',
            state: 'Concept',
          },
        ],
        totalDocs: 1,
      },
    })
    renderWithProviders(<InvoicesTable />)
    await userEvent.click(screen.getAllByTitle('Verwijderen')[0])
    expect(confirmAlert).toHaveBeenCalledTimes(1)
    const { buttons } = (confirmAlert as jest.Mock).mock.calls[0][0]
    buttons.find((b: { label: string }) => b.label === 'Ja').onClick()
    expect(mutate).toHaveBeenCalledWith('i1')
  })
})
