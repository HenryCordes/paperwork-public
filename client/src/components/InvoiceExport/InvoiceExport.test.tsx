import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { EXPORT_FORMATS, PERIOD_PRESETS } from '../../common/constants'
import { useExportInvoices } from '../../hooks/api'
import InvoiceExport from './InvoiceExport'

jest.mock('../../hooks/api')

const mockedUseExportInvoices = useExportInvoices as jest.MockedFunction<
  typeof useExportInvoices
>

type ExportOptions = {
  format: string
  includePdfs: boolean
  searchQuery?: string
  startDate?: string
  endDate?: string
}
type MutateConfig = {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

// A custom periodFilter with explicit dates is the simplest way to populate
// the component's internal dateRange, which gates the export button.
const customPeriod = {
  type: PERIOD_PRESETS.CUSTOM,
  startDate: '2024-01-01',
  endDate: '2024-03-31',
}

/**
 * Builds a mock useExportInvoices return value. `mutate` captures the options
 * and config so tests can assert call args and drive onSuccess/onError.
 */
const setupMutation = () => {
  const mutate = jest.fn<void, [ExportOptions, MutateConfig?]>()
  mockedUseExportInvoices.mockReturnValue({
    mutate,
  } as unknown as ReturnType<typeof useExportInvoices>)
  return mutate
}

beforeEach(() => {
  jest.clearAllMocks()
})

const noop = () => undefined

describe('InvoiceExport', () => {
  it('renders nothing when isOpen is false', () => {
    setupMutation()
    const { container } = renderWithProviders(
      <InvoiceExport isOpen={false} onClose={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the key controls when open', () => {
    setupMutation()
    renderWithProviders(<InvoiceExport isOpen onClose={noop} />)

    expect(
      screen.getByRole('heading', { name: 'Facturen Exporteren' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Formaat')).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Excel (.xlsx)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'CSV (.csv)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Factuur PDFs meenemen in export (ZIP)'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Exporteren/ }),
    ).toBeInTheDocument()
  })

  it('disables the export button when no period (date range) is selected', () => {
    setupMutation()
    renderWithProviders(<InvoiceExport isOpen onClose={noop} />)

    const button = screen.getByRole('button', { name: /Exporteren/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Selecteer eerst een periode')
  })

  it('enables the export button once a period resolves to a date range', () => {
    setupMutation()
    renderWithProviders(
      <InvoiceExport isOpen onClose={noop} periodFilter={customPeriod} />,
    )

    const button = screen.getByRole('button', { name: /Exporteren/ })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('title', 'Exporteer facturen')
  })

  it('shows the resolved period and search filter summary', () => {
    setupMutation()
    renderWithProviders(
      <InvoiceExport
        isOpen
        onClose={noop}
        searchQuery="acme"
        periodFilter={customPeriod}
      />,
    )

    expect(screen.getByText('Zoekfilter:')).toBeInTheDocument()
    expect(screen.getByText(/"acme"/)).toBeInTheDocument()
    expect(screen.getByText('01-01-2024 t/m 31-03-2024')).toBeInTheDocument()
  })

  it('calls the export mutation with the selected format, includePdfs=false, and the date range', async () => {
    const user = userEvent.setup()
    const mutate = setupMutation()
    renderWithProviders(
      <InvoiceExport
        isOpen
        onClose={noop}
        searchQuery="acme"
        periodFilter={customPeriod}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [options] = mutate.mock.calls[0]
    expect(options).toEqual({
      format: EXPORT_FORMATS.XLSX,
      includePdfs: false,
      searchQuery: 'acme',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })
  })

  it('passes the chosen CSV format and includePdfs=true after toggling', async () => {
    const user = userEvent.setup()
    const mutate = setupMutation()
    renderWithProviders(
      <InvoiceExport isOpen onClose={noop} periodFilter={customPeriod} />,
    )

    await user.selectOptions(
      screen.getByLabelText('Formaat'),
      EXPORT_FORMATS.CSV,
    )
    await user.click(
      screen.getByLabelText('Factuur PDFs meenemen in export (ZIP)'),
    )
    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [options] = mutate.mock.calls[0]
    expect(options.format).toBe(EXPORT_FORMATS.CSV)
    expect(options.includePdfs).toBe(true)
    // No searchQuery prop -> the component passes undefined.
    expect(options.searchQuery).toBeUndefined()
  })

  it('dispatches a success alert and closes the dialog on successful export', async () => {
    const user = userEvent.setup()
    const mutate = setupMutation()
    const onClose = jest.fn()
    const { store } = renderWithProviders(
      <InvoiceExport isOpen onClose={onClose} periodFilter={customPeriod} />,
    )

    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    const [, config] = mutate.mock.calls[0]
    config?.onSuccess?.()

    expect(onClose).toHaveBeenCalledTimes(1)
    const alerts = store.getState().alert
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: 'success',
      message:
        'Je export wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
    })
  })

  it('dispatches the PDF-specific success message when includePdfs is on', async () => {
    const user = userEvent.setup()
    const mutate = setupMutation()
    const { store } = renderWithProviders(
      <InvoiceExport isOpen onClose={noop} periodFilter={customPeriod} />,
    )

    await user.click(
      screen.getByLabelText('Factuur PDFs meenemen in export (ZIP)'),
    )
    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    const [, config] = mutate.mock.calls[0]
    config?.onSuccess?.()

    const alerts = store.getState().alert
    expect(alerts[0]).toMatchObject({
      type: 'success',
      message:
        'Je export met factuur PDFs wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
    })
  })

  it('dispatches a danger alert with the error message on export failure', async () => {
    const user = userEvent.setup()
    const mutate = setupMutation()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { store } = renderWithProviders(
      <InvoiceExport isOpen onClose={noop} periodFilter={customPeriod} />,
    )

    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    const [, config] = mutate.mock.calls[0]
    config?.onError?.(new Error('boom'))

    const alerts = store.getState().alert
    expect(alerts[0]).toMatchObject({
      type: 'danger',
      message: 'Fout bij exporteren: boom',
    })
  })

  it('shows the in-progress state (spinner text + disabled) while exporting', async () => {
    const user = userEvent.setup()
    setupMutation()
    renderWithProviders(
      <InvoiceExport isOpen onClose={noop} periodFilter={customPeriod} />,
    )

    await user.click(screen.getByRole('button', { name: /Exporteren/ }))

    // handleExportSubmit sets exportInProgress synchronously before mutate
    // resolves; the button shows the "Exporteren..." label and is disabled.
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Exporteren\.\.\./ })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Exporteren is bezig...')
    })
  })
})
