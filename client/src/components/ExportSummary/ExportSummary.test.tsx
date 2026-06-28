import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { useFinancialSummary } from '../../hooks/api/useExport'
import { setAlert } from '../../redux/_actions/alertAction'

jest.mock('../../hooks/api/useExport')
jest.mock('../../redux/_actions/alertAction', () => ({
  setAlert: jest.fn(),
}))

import ExportSummary from './ExportSummary'

type RefetchResult = { data?: unknown }
type Refetch = jest.Mock<Promise<RefetchResult>, []>

const mockedUseFinancialSummary = jest.mocked(useFinancialSummary)
const mockedSetAlert = jest.mocked(setAlert)

// Minimal stub of the query object the component reads. It only destructures
// `refetch`, so the other react-query fields are unused here.
const buildQueryReturn = (refetch: Refetch) =>
  ({ refetch }) as unknown as ReturnType<typeof useFinancialSummary>

const currentYear = new Date().getFullYear()

describe('ExportSummary', () => {
  let refetch: Refetch
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    // The component logs export failures via console.error; the error-path
    // tests exercise that branch deliberately, so suppress the noise.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    refetch = jest.fn<Promise<RefetchResult>, []>()
    mockedUseFinancialSummary.mockImplementation(() =>
      buildQueryReturn(refetch),
    )
    // setAlert is a thunk action-creator; return a no-op thunk so dispatch works.
    mockedSetAlert.mockReturnValue(
      (() => undefined) as ReturnType<typeof setAlert>,
    )
    // jsdom does not implement these; the export download path uses them.
    window.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders the year selector, format selector and export button', () => {
    renderWithProviders(<ExportSummary onClose={jest.fn()} />)

    const yearSelect = screen.getByLabelText('Jaar') as HTMLSelectElement
    const formatSelect = screen.getByLabelText('Formaat') as HTMLSelectElement

    expect(yearSelect).toBeInTheDocument()
    expect(formatSelect).toBeInTheDocument()
    expect(yearSelect.value).toBe(String(currentYear))
    expect(formatSelect.value).toBe('xlsx')
    expect(
      screen.getByRole('button', { name: /Exporteren/i }),
    ).toBeInTheDocument()
  })

  it('offers six selectable years ending at the current year', () => {
    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    const options = screen
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => /^\d{4}$/.test(v))
    expect(options).toHaveLength(6)
    expect(options[0]).toBe(String(currentYear))
    expect(options[5]).toBe(String(currentYear - 5))
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    renderWithProviders(<ExportSummary onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes the current year and default format to the query hook', () => {
    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    expect(mockedUseFinancialSummary).toHaveBeenCalledWith(
      { year: String(currentYear), format: 'xlsx' },
      { enabled: false, refetchOnWindowFocus: false },
    )
  })

  it('re-renders the hook with the selected year and format after the user changes them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExportSummary onClose={jest.fn()} />)

    await user.selectOptions(
      screen.getByLabelText('Jaar'),
      String(currentYear - 2),
    )
    await user.selectOptions(screen.getByLabelText('Formaat'), 'csv')

    // The most recent render reflects the user's selections.
    const lastCall = mockedUseFinancialSummary.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual({
      year: String(currentYear - 2),
      format: 'csv',
    })
  })

  it('triggers the export query and reports success when data is returned', async () => {
    const user = userEvent.setup()
    refetch.mockResolvedValue({ data: 'binary-blob-content' })

    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    expect(refetch).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Export succesvol gedownload',
        'success',
      ),
    )
  })

  it('builds the download blob from the refetched data', async () => {
    const user = userEvent.setup()
    refetch.mockResolvedValue({ data: 'binary-blob-content' })

    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() =>
      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1),
    )
  })

  it('reports a danger alert when the query returns no data', async () => {
    const user = userEvent.setup()
    refetch.mockResolvedValue({ data: undefined })

    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() =>
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Fout bij exporteren: Geen export data ontvangen',
        'danger',
      ),
    )
    expect(mockedSetAlert).not.toHaveBeenCalledWith(
      'Export succesvol gedownload',
      'success',
    )
  })

  it('reports a danger alert with the error message when the query rejects', async () => {
    const user = userEvent.setup()
    refetch.mockRejectedValue(new Error('Network down'))

    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() =>
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Fout bij exporteren: Network down',
        'danger',
      ),
    )
  })

  it('shows a loading state on the button while the export is in flight', async () => {
    const user = userEvent.setup()
    let resolveRefetch: (value: RefetchResult) => void = () => undefined
    refetch.mockReturnValue(
      new Promise<RefetchResult>((resolve) => {
        resolveRefetch = resolve
      }),
    )

    renderWithProviders(<ExportSummary onClose={jest.fn()} />)
    const button = screen.getByRole('button', { name: /Exporteren/i })
    await user.click(button)

    // While the promise is pending the button is disabled and shows the spinner label.
    expect(await screen.findByText('Exporteren...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exporteren/i })).toBeDisabled()

    resolveRefetch({ data: 'done' })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Exporteren/i }),
      ).not.toBeDisabled(),
    )
  })
})
