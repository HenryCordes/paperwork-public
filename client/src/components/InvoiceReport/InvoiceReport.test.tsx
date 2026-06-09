import { ReactElement } from 'react'
import { Routes, Route } from 'react-router-dom'
import axios from 'axios'
import { saveAs } from 'file-saver'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { setAlert } from '../../redux/_actions/alertAction'
import InvoiceReport from './InvoiceReport'

jest.mock('axios')
jest.mock('file-saver')
jest.mock('../../redux/_actions/alertAction', () => ({
  setAlert: jest.fn(),
}))

// useNavigate is spied on so we can assert mail navigation without a real route.
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

const mockedAxios = jest.mocked(axios)
const mockedSaveAs = jest.mocked(saveAs)
const mockedSetAlert = jest.mocked(setAlert)

const invoice = {
  _id: 'inv-1',
  invoiceNumber: '2024-001',
  invoiceDate: '2024-03-10T00:00:00.000Z',
  payDate: '2024-04-09T00:00:00.000Z',
  contactName: 'Acme BV',
  invoiceLines: [
    {
      description: 'Consultancy',
      numberOfItems: 2,
      priceIncludingTax: 121,
      priceWOTaxes: 100,
      taxRate: 21,
    },
  ],
  priceWithoutTaxes: 200,
  priceIncludingTax: 242,
  tax: 42,
}

const settings = {
  companyLogo: 'http://example.com/logo.png',
  companyName: 'My Company',
  street: 'Hoofdstraat',
  houseNumber: '12',
  postalCode: '1234 AB',
  city: 'Amsterdam',
  chamberOfCommerceNumber: '12345678',
  taxNumber: 'NL00112233B01',
  bankName: 'ING',
  bankIBAN: 'NL00INGB0001234567',
}

const contact = {
  street: 'Kerkstraat',
  houseNumber: '5',
  postalCode: '5678 CD',
  city: 'Utrecht',
}

// Mount under a route so useParams() resolves :id = inv-1.
const renderAtId = (ui: ReactElement, id = 'inv-1') =>
  renderWithProviders(
    <Routes>
      <Route path="/invoice/report/:id" element={ui} />
    </Routes>,
    { initialEntries: [`/invoice/report/${id}`] },
  )

beforeEach(() => {
  jest.clearAllMocks()
  // setAlert is a thunk action-creator: it MUST return a thunk function,
  // otherwise dispatch(undefined) throws under the real thunk middleware.
  mockedSetAlert.mockReturnValue(
    (() => undefined) as ReturnType<typeof setAlert>,
  )
})

describe('InvoiceReport rendering', () => {
  it('renders the invoice header fields from the invoice prop', () => {
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    expect(screen.getByText('Acme BV')).toBeInTheDocument()
    expect(screen.getByText('2024-001')).toBeInTheDocument()
    expect(screen.getByText('2024-03-10')).toBeInTheDocument()
    expect(screen.getByText('2024-04-09')).toBeInTheDocument()
  })

  it('renders company settings and contact address', () => {
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    expect(screen.getByText('My Company')).toBeInTheDocument()
    expect(screen.getByText(/Kvk:/)).toHaveTextContent('Kvk: 12345678')
    expect(screen.getByText(/BTW:/)).toHaveTextContent('BTW: NL00112233B01')
    expect(screen.getByAltText('company logo')).toHaveAttribute(
      'src',
      'http://example.com/logo.png',
    )
    // contact address fragments are rendered (split across text nodes)
    expect(screen.getByText(/Kerkstraat/)).toBeInTheDocument()
    expect(screen.getByText(/Utrecht/)).toBeInTheDocument()
  })

  it('renders each invoice line with its description and quantity', () => {
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    expect(screen.getByText('Consultancy')).toBeInTheDocument()
    // quantity cell
    expect(screen.getByText('2')).toBeInTheDocument()
    // tax-rate cell renders "21%"
    expect(screen.getByText('21%')).toBeInTheDocument()
  })

  it('renders the BTW 21% row when invoice.tax > 0 and totals as EUR currency', () => {
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    expect(screen.getByText('BTW 21%:')).toBeInTheDocument()
    // Intl.NumberFormat EUR for the Netherlands renders the euro sign and a
    // comma decimal separator. Match on the numeric content to stay locale-robust.
    const subtotal = screen.getByText('Subtotaal:').closest('tr')
    expect(subtotal).not.toBeNull()
    expect(subtotal).toHaveTextContent(/200[.,]00/)

    const totalRows = screen.getAllByText('Totaal:')
    const grandTotalRow = totalRows[totalRows.length - 1].closest('tr')
    expect(grandTotalRow).toHaveTextContent(/242[.,]00/)
  })

  it('omits the BTW 21% row when invoice.tax is 0', () => {
    const noTax = { ...invoice, tax: 0 }
    renderAtId(
      <InvoiceReport invoice={noTax} settings={settings} contact={contact} />,
    )

    expect(screen.queryByText('BTW 21%:')).not.toBeInTheDocument()
  })

  it('renders the three action buttons', () => {
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    expect(
      screen.getByRole('button', { name: 'Download factuur' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mail factuur' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Print factuur' }),
    ).toBeInTheDocument()
  })

  it('renders empty-ish output without throwing when no props are supplied', () => {
    renderAtId(<InvoiceReport />)

    // Buttons still present; data-bearing cells are empty.
    expect(
      screen.getByRole('button', { name: 'Download factuur' }),
    ).toBeInTheDocument()
    // No invoice => no BTW rows.
    expect(screen.queryByText('BTW 21%:')).not.toBeInTheDocument()
  })
})

describe('InvoiceReport download PDF', () => {
  it('fetches the invoice PDF by route id as a blob and saves it', async () => {
    const user = userEvent.setup()
    ;(mockedAxios.get as jest.Mock).mockResolvedValue({
      data: new Blob(['pdf-bytes']),
    })

    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    await user.click(screen.getByRole('button', { name: 'Download factuur' }))

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/invoice/download/inv-1',
        {
          responseType: 'blob',
        },
      ),
    )
    await waitFor(() => expect(mockedSaveAs).toHaveBeenCalledTimes(1))
    const [blobArg, filenameArg] = mockedSaveAs.mock.calls[0]
    expect(filenameArg).toBe('factuur_inv-1.pdf')
    expect(blobArg).toBeInstanceOf(Blob)
    expect((blobArg as Blob).type).toBe('application/pdf')
    // No error alert on the happy path.
    expect(mockedSetAlert).not.toHaveBeenCalled()
  })

  it('dispatches a danger setAlert when the PDF download fails', async () => {
    const user = userEvent.setup()
    ;(mockedAxios.get as jest.Mock).mockRejectedValue(new Error('network down'))

    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    await user.click(screen.getByRole('button', { name: 'Download factuur' }))

    await waitFor(() => expect(mockedSetAlert).toHaveBeenCalledTimes(1))
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Er is iets misgegaan bij het downloaden van de factuur (.pdf), probeer het nogmaals aub.',
      'danger',
    )
    expect(mockedSaveAs).not.toHaveBeenCalled()
  })
})

describe('InvoiceReport mail + print', () => {
  it('navigates to the send route using the button data-id (invoice._id)', async () => {
    const user = userEvent.setup()
    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    await user.click(screen.getByRole('button', { name: 'Mail factuur' }))

    expect(mockNavigate).toHaveBeenCalledWith('/invoice/send/inv-1')
  })

  it('calls window.print when Print factuur is clicked', async () => {
    const user = userEvent.setup()
    const printSpy = jest
      .spyOn(window, 'print')
      .mockImplementation(() => undefined)

    renderAtId(
      <InvoiceReport invoice={invoice} settings={settings} contact={contact} />,
    )

    await user.click(screen.getByRole('button', { name: 'Print factuur' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })
})
