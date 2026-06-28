import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders, screen, fireEvent } from '../../test-utils'
import {
  useExpense,
  useContacts,
  useCreateOrUpdateExpense,
  useUploadExpenseReceipt,
} from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useExpense: jest.fn(),
  useContacts: jest.fn(),
  useCreateOrUpdateExpense: jest.fn(),
  useUploadExpenseReceipt: jest.fn(),
}))

jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))

jest.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    isDragReject: false,
    fileRejections: [],
    open: jest.fn(),
  }),
}))

jest.mock('../../components/PdfViewer/PdfViewer', () => () => (
  <div data-testid="pdf-viewer" />
))

import Expense from './Expense'

describe('Expense create form', () => {
  let saveMutation: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/expense/create')
    saveMutation = jest.fn()
    ;(useExpense as jest.Mock).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    })
    ;(useContacts as jest.Mock).mockReturnValue({
      data: {
        docs: [{ _id: 'c1', typeName: 'Bedrijf', companyName: 'Acme BV' }],
      },
      isLoading: false,
      isError: false,
      error: null,
    })
    ;(useCreateOrUpdateExpense as jest.Mock).mockReturnValue({
      mutate: saveMutation,
      isPending: false,
      isError: false,
      error: null,
    })
    ;(useUploadExpenseReceipt as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
    })
  })

  it('renders the contact options and the save button', () => {
    renderWithProviders(<Expense />)
    expect(screen.getByRole('option', { name: 'Acme BV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeInTheDocument()
  })

  it('saves the expense when the form is valid', async () => {
    renderWithProviders(<Expense />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1')

    fireEvent.change(screen.getByPlaceholderText('Kostendatum'), {
      target: { value: '2026-03-01' },
    })

    fireEvent.change(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)'), {
      target: { value: '150.00' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).toHaveBeenCalledTimes(1)
    expect(saveMutation.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        price: '150.00',
        expenseDate: '2026-03-01',
      }),
    )
  })

  it('does not save when required fields are missing', async () => {
    renderWithProviders(<Expense />)

    // Clear the price field (expenseDate has a defaultValue of today so it won't be '',
    // but price defaults to '' — the guard fires when price === '')
    fireEvent.change(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)'), {
      target: { value: '' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).not.toHaveBeenCalled()
  })

  it('alerts that date and total are required when the guard fires', async () => {
    const { store } = renderWithProviders(<Expense />)

    fireEvent.change(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)'), {
      target: { value: '' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).not.toHaveBeenCalled()
    expect(store.getState().alert).toContainEqual(
      expect.objectContaining({
        message: 'Datum en Totaal zijn verplicht, voer deze in.',
        type: 'danger',
      }),
    )
  })

  it('includes the resolved contactName for the selected contact in the save payload', async () => {
    renderWithProviders(<Expense />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1')
    fireEvent.change(screen.getByPlaceholderText('Kostendatum'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.change(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)'), {
      target: { value: '150.00' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).toHaveBeenCalledTimes(1)
    expect(saveMutation.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        contactId: 'c1',
        // Bedrijf contact -> companyName is used as contactName
        contactName: 'Acme BV',
      }),
    )
  })

  it('does not attach a _id when creating a new expense', async () => {
    renderWithProviders(<Expense />)

    fireEvent.change(screen.getByPlaceholderText('Kostendatum'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.change(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)'), {
      target: { value: '99.00' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).toHaveBeenCalledTimes(1)
    expect(saveMutation.mock.calls[0][0]).not.toHaveProperty('_id')
  })

  it('disables the contact select while contacts are loading', () => {
    ;(useContacts as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithProviders(<Expense />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

describe('Expense edit form', () => {
  let saveMutation: jest.Mock

  // The component reads `useParams().id`, so it must be mounted under a route
  // that declares `:id`. The harness MemoryRouter does not add a <Routes>, so
  // we supply one here and align window.location.pathname (isEdit reads it too).
  const renderEdit = () =>
    renderWithProviders(
      <Routes>
        <Route path="/expense/:id" element={<Expense />} />
      </Routes>,
      { initialEntries: ['/expense/e1'] },
    )

  const dbExpense = {
    _id: 'e1',
    expenseNumber: 'U-2026-0001',
    expenseDate: '2026-02-15T00:00:00.000Z',
    info: 'Kantoorbenodigdheden',
    tax: 21,
    price: 121,
    state: 'open',
    expenseFile: 'receipt.jpg',
    contactId: 'c1',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/expense/e1')
    saveMutation = jest.fn()
    ;(useExpense as jest.Mock).mockReturnValue({
      data: dbExpense,
      isError: false,
      error: null,
    })
    ;(useContacts as jest.Mock).mockReturnValue({
      data: {
        docs: [
          {
            _id: 'c1',
            typeName: 'Particulier',
            firstName: 'Jan',
            lastName: 'Jansen',
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    })
    ;(useCreateOrUpdateExpense as jest.Mock).mockReturnValue({
      mutate: saveMutation,
      isPending: false,
      isError: false,
      error: null,
    })
    ;(useUploadExpenseReceipt as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
    })
  })

  it('queries the expense by the route id with editing enabled', () => {
    renderEdit()

    expect(useExpense).toHaveBeenCalledWith('e1', { enabled: true })
  })

  it('renders the expense number for an existing expense', () => {
    renderEdit()

    expect(screen.getByText('U-2026-0001')).toBeInTheDocument()
  })

  it('populates form fields from the loaded expense', () => {
    renderEdit()

    expect(screen.getByPlaceholderText('Omschrijving')).toHaveValue(
      'Kantoorbenodigdheden',
    )
    expect(screen.getByPlaceholderText('Totaal bedrag (inc. BTW)')).toHaveValue(
      121,
    )
    expect(screen.getByPlaceholderText('BTW hoog')).toHaveValue(21)
    // expenseDate is normalised to yyyy-MM-DD by the setValue effect
    expect(screen.getByPlaceholderText('Kostendatum')).toHaveValue('2026-02-15')
  })

  it('attaches the existing expense _id to the save payload', async () => {
    renderEdit()

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation).toHaveBeenCalledTimes(1)
    expect(saveMutation.mock.calls[0][0]).toEqual(
      expect.objectContaining({ _id: 'e1' }),
    )
  })

  it('resolves a Particulier contact name as "lastName, firstName"', async () => {
    renderEdit()

    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveMutation.mock.calls[0][0]).toEqual(
      expect.objectContaining({ contactName: 'Jansen, Jan' }),
    )
  })

  it('shows the receipt image preview when the expense file is not a pdf', () => {
    renderEdit()

    const img = screen.getByAltText(
      'Klik hier om de afbeelding aan te passen',
    ) as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/document/receipt.jpg')
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument()
  })

  it('renders the pdf viewer when the expense file is a pdf', () => {
    ;(useExpense as jest.Mock).mockReturnValue({
      data: { ...dbExpense, expenseFile: 'receipt.pdf' },
      isError: false,
      error: null,
    })

    renderEdit()

    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument()
  })

  it('alerts when loading the expense fails', () => {
    ;(useExpense as jest.Mock).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('boom'),
    })

    const { store } = renderEdit()

    expect(store.getState().alert).toContainEqual(
      expect.objectContaining({
        message: 'Fout bij het laden van de uitgavegegevens: boom',
        type: 'danger',
      }),
    )
  })

  it('alerts while the save mutation is pending', () => {
    ;(useCreateOrUpdateExpense as jest.Mock).mockReturnValue({
      mutate: saveMutation,
      isPending: true,
      isError: false,
      error: null,
    })

    const { store } = renderEdit()

    expect(store.getState().alert).toContainEqual(
      expect.objectContaining({ message: 'Uitgave opslaan...', type: 'info' }),
    )
  })

  it('alerts with the error message when the save mutation fails', () => {
    ;(useCreateOrUpdateExpense as jest.Mock).mockReturnValue({
      mutate: saveMutation,
      isPending: false,
      isError: true,
      error: new Error('server down'),
    })

    const { store } = renderEdit()

    expect(store.getState().alert).toContainEqual(
      expect.objectContaining({
        message: 'Fout bij opslaan: server down',
        type: 'danger',
      }),
    )
  })
})
