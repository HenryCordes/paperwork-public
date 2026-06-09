import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, within, waitFor } from '../../test-utils'
import { useInvoice, useCreateOrUpdateInvoice } from '../../hooks/api'
import { useContactsByType } from '../../hooks/api/useContacts'

jest.mock('../../hooks/api', () => ({
  useInvoice: jest.fn(),
  useCreateOrUpdateInvoice: jest.fn(),
}))
jest.mock('../../hooks/api/useContacts', () => ({
  useContactsByType: jest.fn(),
}))
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))
// LineItems pulls in react-beautiful-dnd, which is awkward in jsdom. We stub it
// with a controllable harness that surfaces the props Invoice passes down so
// tests can drive Invoice's own add/remove/change/totals logic without dnd.
interface HarnessItem {
  id?: string
  _id?: string
  description?: string
  numberOfItems?: string | number
  priceIncludingTax?: string | number
  taxRate?: string | number
}
interface HarnessProps {
  items: HarnessItem[]
  addHandler: () => void
  deleteHandler: (index: number) => () => void
  changeHandler: (
    index: number,
  ) => (e: { target: { name: string; value: string } }) => void
}
jest.mock(
  '../../components/partials/LineItems',
  () =>
    ({ items, addHandler, deleteHandler, changeHandler }: HarnessProps) => (
      <div data-testid="line-items">
        <button type="button" onClick={addHandler}>
          add-line
        </button>
        <div data-testid="line-count">{items.length}</div>
        {items.map((item, i) => (
          <div key={item.id ?? item._id ?? i} data-testid={`line-${i}`}>
            <input
              data-testid={`numberOfItems-${i}`}
              onChange={(e) =>
                changeHandler(i)({
                  target: { name: 'numberOfItems', value: e.target.value },
                })
              }
            />
            <input
              data-testid={`priceIncludingTax-${i}`}
              onChange={(e) =>
                changeHandler(i)({
                  target: { name: 'priceIncludingTax', value: e.target.value },
                })
              }
            />
            <select
              data-testid={`taxRate-${i}`}
              onChange={(e) =>
                changeHandler(i)({
                  target: { name: 'taxRate', value: e.target.value },
                })
              }
            >
              <option value="0">0</option>
              <option value="6">6</option>
              <option value="9">9</option>
              <option value="21">21</option>
            </select>
            <button type="button" onClick={deleteHandler(i)}>
              remove-line-{i}
            </button>
          </div>
        ))}
      </div>
    ),
)

import Invoice from './Invoice'

describe('Invoice form', () => {
  let saveInvoice: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Invoice reads window.location.pathname directly for create-mode.
    window.history.pushState({}, '', '/invoice/create')
    saveInvoice = jest.fn()
    ;(useInvoice as jest.Mock).mockReturnValue({ data: undefined })
    ;(useContactsByType as jest.Mock).mockReturnValue({
      data: [{ _id: 'c1', typeName: 'Bedrijf', companyName: 'Acme BV' }],
    })
    ;(useCreateOrUpdateInvoice as jest.Mock).mockReturnValue({
      mutate: saveInvoice,
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('renders the contact select and the save button', () => {
    renderWithProviders(<Invoice />)
    expect(screen.getByRole('option', { name: 'Acme BV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeInTheDocument()
  })

  it('saves the invoice when the required fields are valid', async () => {
    renderWithProviders(<Invoice />)

    // contactId is the required field with no default; invoiceDate/payDate/state
    // all carry non-empty defaultValues. The contact <select> is the one that
    // owns the 'Acme BV' option.
    const contactSelect = screen
      .getByRole('option', {
        name: 'Acme BV',
      })
      .closest('select') as HTMLSelectElement
    await userEvent.selectOptions(contactSelect, 'c1')

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveInvoice).toHaveBeenCalledTimes(1)
    expect(saveInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        contactId: 'c1',
        contactName: 'Acme BV',
      }),
    )
  })

  it('does not save when the required contact is missing', async () => {
    renderWithProviders(<Invoice />)

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveInvoice).not.toHaveBeenCalled()
  })
})

const selectContact = async (user: ReturnType<typeof userEvent.setup>) => {
  const contactSelect = screen
    .getByRole('option', { name: 'Acme BV' })
    .closest('select') as HTMLSelectElement
  await user.selectOptions(contactSelect, 'c1')
}

describe('Invoice line items and totals (create mode)', () => {
  let saveInvoice: jest.Mock
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/invoice/create')
    user = userEvent.setup()
    saveInvoice = jest.fn()
    ;(useInvoice as jest.Mock).mockReturnValue({ data: undefined })
    ;(useContactsByType as jest.Mock).mockReturnValue({
      data: [{ _id: 'c1', typeName: 'Bedrijf', companyName: 'Acme BV' }],
    })
    ;(useCreateOrUpdateInvoice as jest.Mock).mockReturnValue({
      mutate: saveInvoice,
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('seeds a single empty line item on mount', () => {
    renderWithProviders(<Invoice />)
    expect(screen.getByTestId('line-count')).toHaveTextContent('1')
  })

  it('appends a line item when the add handler fires', async () => {
    renderWithProviders(<Invoice />)

    await user.click(screen.getByRole('button', { name: 'add-line' }))

    expect(screen.getByTestId('line-count')).toHaveTextContent('2')
  })

  it('removes a line item when its delete handler fires', async () => {
    renderWithProviders(<Invoice />)
    await user.click(screen.getByRole('button', { name: 'add-line' }))
    expect(screen.getByTestId('line-count')).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: 'remove-line-1' }))

    expect(screen.getByTestId('line-count')).toHaveTextContent('1')
  })

  it('recomputes the total from qty * price when a line changes', async () => {
    renderWithProviders(<Invoice />)

    await user.type(screen.getByTestId('numberOfItems-0'), '3')
    await user.type(screen.getByTestId('priceIncludingTax-0'), '10')

    // 3 * 10 = 30 -> "Totaal" row. NL currency format: "30,00".
    const totaalRow = screen
      .getByText('Totaal')
      .closest('.invoice-row') as HTMLElement
    expect(within(totaalRow).getByText(/30,00/)).toBeInTheDocument()
  })

  it('breaks out 21% btw and a tax-exclusive subtotal', async () => {
    renderWithProviders(<Invoice />)

    await user.type(screen.getByTestId('numberOfItems-0'), '2')
    await user.type(screen.getByTestId('priceIncludingTax-0'), '100')
    await user.selectOptions(screen.getByTestId('taxRate-0'), '21')

    // gross = 200, btw(21%) = 42, subtotal = 200 - 42 = 158.
    const btwRow = screen
      .getByText('Btw (21%)')
      .closest('.invoice-row') as HTMLElement
    expect(within(btwRow).getByText(/42,00/)).toBeInTheDocument()

    const subtotalRow = screen
      .getByText('Subtotaal')
      .closest('.invoice-row') as HTMLElement
    expect(within(subtotalRow).getByText(/158,00/)).toBeInTheDocument()

    const totaalRow = screen
      .getByText('Totaal')
      .closest('.invoice-row') as HTMLElement
    expect(within(totaalRow).getByText(/200,00/)).toBeInTheDocument()
  })

  it('does not render the 21% btw row before any line carries 21% tax', () => {
    renderWithProviders(<Invoice />)
    expect(screen.queryByText('Btw (21%)')).not.toBeInTheDocument()
  })

  it('sends the assembled line items and computed totals on save', async () => {
    renderWithProviders(<Invoice />)
    await selectContact(user)

    await user.type(screen.getByTestId('numberOfItems-0'), '2')
    await user.type(screen.getByTestId('priceIncludingTax-0'), '100')
    await user.selectOptions(screen.getByTestId('taxRate-0'), '21')

    await user.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveInvoice).toHaveBeenCalledTimes(1)
    const payload = saveInvoice.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toEqual(
      expect.objectContaining({
        contactId: 'c1',
        contactName: 'Acme BV',
        priceIncludingTax: 200,
        tax: 42,
        priceWithoutTaxes: 158,
      }),
    )
    const lines = payload.invoiceLines as Array<Record<string, unknown>>
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual(
      expect.objectContaining({
        numberOfItems: '2',
        priceIncludingTax: '100',
        taxRate: '21',
      }),
    )
  })
})

describe('Invoice edit mode (loaded invoice)', () => {
  let saveInvoice: jest.Mock
  let user: ReturnType<typeof userEvent.setup>

  const dbInvoice = {
    _id: 'inv-1',
    contactId: 'c1',
    invoiceNumber: '2024-001',
    invoiceDate: '2024-01-15',
    payDate: '2024-02-14',
    state: 'Open',
    invoiceLines: [
      {
        _id: 'l1',
        description: 'Werk',
        numberOfItems: 2,
        priceIncludingTax: 100,
        taxRate: 21,
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/invoice/inv-1')
    user = userEvent.setup()
    saveInvoice = jest.fn()
    ;(useInvoice as jest.Mock).mockReturnValue({ data: dbInvoice })
    ;(useContactsByType as jest.Mock).mockReturnValue({
      data: [{ _id: 'c1', typeName: 'Bedrijf', companyName: 'Acme BV' }],
    })
    ;(useCreateOrUpdateInvoice as jest.Mock).mockReturnValue({
      mutate: saveInvoice,
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('renders the existing invoice number', () => {
    renderWithProviders(<Invoice />)
    expect(screen.getByText('2024-001')).toBeInTheDocument()
  })

  it('computes totals from the loaded line items on mount', () => {
    renderWithProviders(<Invoice />)

    // gross 200, btw(21%) 42, subtotal 158.
    const totaalRow = screen
      .getByText('Totaal')
      .closest('.invoice-row') as HTMLElement
    expect(within(totaalRow).getByText(/200,00/)).toBeInTheDocument()
    const btwRow = screen
      .getByText('Btw (21%)')
      .closest('.invoice-row') as HTMLElement
    expect(within(btwRow).getByText(/42,00/)).toBeInTheDocument()
  })

  it('includes the loaded _id and line items when saving', async () => {
    renderWithProviders(<Invoice />)

    await user.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveInvoice).toHaveBeenCalledTimes(1)
    const payload = saveInvoice.mock.calls[0][0] as Record<string, unknown>
    expect(payload._id).toBe('inv-1')
    const lines = payload.invoiceLines as Array<Record<string, unknown>>
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual(expect.objectContaining({ _id: 'l1' }))
  })
})

describe('Invoice empty / no-data branch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/invoice/create')
    ;(useInvoice as jest.Mock).mockReturnValue({ data: undefined })
    ;(useContactsByType as jest.Mock).mockReturnValue({ data: [] })
    ;(useCreateOrUpdateInvoice as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('renders only the placeholder option when there are no contacts', () => {
    renderWithProviders(<Invoice />)
    const placeholder = screen.getByRole('option', {
      name: 'Selecteer een contact...',
    })
    const contactSelect = placeholder.closest('select') as HTMLSelectElement
    expect(within(contactSelect).getAllByRole('option')).toHaveLength(1)
  })

  it('does not render an invoice-number row when no invoice is loaded', () => {
    renderWithProviders(<Invoice />)
    expect(screen.queryByText('Nummer')).not.toBeInTheDocument()
  })
})

describe('Invoice PDF download error branch', () => {
  let store: ReturnType<typeof renderWithProviders>['store']
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    jest.clearAllMocks()
    // No id in the path and no loaded invoice -> downloadPDF has no id to use.
    window.history.pushState({}, '', '/invoice/create')
    user = userEvent.setup()
    ;(useInvoice as jest.Mock).mockReturnValue({ data: undefined })
    ;(useContactsByType as jest.Mock).mockReturnValue({ data: [] })
    ;(useCreateOrUpdateInvoice as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    })
  })

  it('dispatches a danger alert when download is attempted without an invoice id', async () => {
    ;({ store } = renderWithProviders(<Invoice />))

    await user.click(screen.getByRole('button', { name: 'Download factuur' }))

    await waitFor(() => {
      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          message: 'Geen factuur ID gevonden voor downloaden.',
        }),
      )
    })
  })
})
