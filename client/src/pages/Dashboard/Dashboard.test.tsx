import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { useDashboard } from '../../hooks/api/useDashboard'
import { setAlert } from '../../redux/_actions/alertAction'
import { PERIOD_TYPES, PERIOD_PRESETS } from '../../common/constants'

// jsdom cannot render <canvas>; replace chart components with inert stubs.
jest.mock('react-chartjs-2', () => ({
  Bar: () => null,
  Pie: () => null,
  Line: () => null,
  Doughnut: () => null,
}))

// Children that pull their own data / are irrelevant to Dashboard behavior.
jest.mock('../../components/Sidebar/SideBar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}))
jest.mock('../../components/Footer/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer" />,
}))
jest.mock('../../components/ExportSummary/ExportSummary', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="export-summary">
      <button onClick={onClose}>close-export</button>
    </div>
  ),
}))

jest.mock('../../hooks/api/useDashboard', () => ({
  useDashboard: jest.fn(),
}))

// setAlert is a thunk action-creator; mock it so we can assert dispatch args.
// The creator must return a thunk function, not undefined.
jest.mock('../../redux/_actions/alertAction', () => ({
  setAlert: jest.fn(),
}))

import Dashboard from './Dashboard'

type UseDashboardReturn = ReturnType<typeof useDashboard>

const mockedUseDashboard = jest.mocked(useDashboard)
const mockedSetAlert = jest.mocked(setAlert)

const queryResult = (
  overrides: Partial<UseDashboardReturn>,
): UseDashboardReturn =>
  ({
    data: undefined,
    isLoading: false,
    error: null,
    ...overrides,
  }) as UseDashboardReturn

// Intl currency formatting inserts a NBSP (U+00A0) between symbol and digits.
// RTL's default text matcher normalizes that to a regular space, so we compare
// against the same-normalized form to find the rendered summary value.
const normalizeNbsp = (text: string) => text.replace(/ /g, ' ')

const eur = (value: number) =>
  normalizeNbsp(
    new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(value),
  )

beforeEach(() => {
  jest.clearAllMocks()
  // Thunk that does nothing observable; dispatch tolerates it.
  mockedSetAlert.mockReturnValue(
    (() => undefined) as ReturnType<typeof setAlert>,
  )
  mockedUseDashboard.mockReturnValue(queryResult({}))
})

describe('Dashboard', () => {
  it('renders the period-type and period-preset selectors with their options', () => {
    renderWithProviders(<Dashboard />)

    const periodType = screen.getByLabelText('Per') as HTMLSelectElement
    const periodPreset = screen.getByLabelText('Periode') as HTMLSelectElement

    expect(periodType).toBeInTheDocument()
    expect(periodPreset).toBeInTheDocument()
    // Defaults come from component initial state.
    expect(periodType.value).toBe(PERIOD_TYPES.MONTHLY)
    expect(periodPreset.value).toBe(PERIOD_PRESETS.THIS_YEAR)

    expect(screen.getByRole('option', { name: 'Dag' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Aangepaste Periode' }),
    ).toBeInTheDocument()
  })

  it('calls useDashboard with the initial filter params on first render', () => {
    renderWithProviders(<Dashboard />)

    expect(mockedUseDashboard).toHaveBeenCalledWith({
      periodType: PERIOD_TYPES.MONTHLY,
      periodPreset: PERIOD_PRESETS.THIS_YEAR,
      startDate: null,
      endDate: null,
    })
  })

  it('drives useDashboard with the new periodType when the type selector changes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Dashboard />)

    await user.selectOptions(screen.getByLabelText('Per'), PERIOD_TYPES.YEARLY)

    await waitFor(() =>
      expect(mockedUseDashboard).toHaveBeenLastCalledWith({
        periodType: PERIOD_TYPES.YEARLY,
        periodPreset: PERIOD_PRESETS.THIS_YEAR,
        startDate: null,
        endDate: null,
      }),
    )
    expect((screen.getByLabelText('Per') as HTMLSelectElement).value).toBe(
      PERIOD_TYPES.YEARLY,
    )
  })

  it('drives useDashboard with the new preset and clears custom dates on preset change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Dashboard />)

    await user.selectOptions(
      screen.getByLabelText('Periode'),
      PERIOD_PRESETS.LAST_MONTH,
    )

    await waitFor(() =>
      expect(mockedUseDashboard).toHaveBeenLastCalledWith({
        periodType: PERIOD_TYPES.MONTHLY,
        periodPreset: PERIOD_PRESETS.LAST_MONTH,
        startDate: null,
        endDate: null,
      }),
    )
  })

  it('reveals the custom date inputs only when the CUSTOM preset is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Dashboard />)

    expect(screen.queryByLabelText('Startdatum')).not.toBeInTheDocument()

    await user.selectOptions(
      screen.getByLabelText('Periode'),
      PERIOD_PRESETS.CUSTOM,
    )

    expect(screen.getByLabelText('Startdatum')).toBeInTheDocument()
    expect(screen.getByLabelText('Einddatum')).toBeInTheDocument()
  })

  it('renders the summary totals from summaryMetrics when present', () => {
    mockedUseDashboard.mockReturnValue(
      queryResult({
        data: {
          summaryMetrics: {
            totalRevenue: 1000,
            totalExpenses: 400,
            netProfit: 600,
          },
          labels: ['jan'],
          turnover: [1000],
          expenses: [400],
        },
      }),
    )

    renderWithProviders(<Dashboard />)

    expect(screen.getByText(eur(1000))).toBeInTheDocument()
    expect(screen.getByText(eur(400))).toBeInTheDocument()
    expect(screen.getByText(eur(600))).toBeInTheDocument()
    // Positive profit renders the "Winst" label, not "Verlies".
    expect(screen.getByText('Winst')).toBeInTheDocument()
    expect(screen.queryByText('Verlies')).not.toBeInTheDocument()
  })

  it('falls back to summing rawData when summaryMetrics is absent', () => {
    mockedUseDashboard.mockReturnValue(
      queryResult({
        data: {
          rawData: [
            { totalRevenue: 100, totalExpenses: 30 },
            { totalRevenue: 50, totalExpenses: 20 },
          ],
          labels: [],
          turnover: [],
          expenses: [],
        },
      }),
    )

    renderWithProviders(<Dashboard />)

    expect(screen.getByText(eur(150))).toBeInTheDocument() // revenue
    expect(screen.getByText(eur(50))).toBeInTheDocument() // expenses
    expect(screen.getByText(eur(100))).toBeInTheDocument() // profit 150-50
  })

  it('shows the "Verlies" label when profit is negative', () => {
    mockedUseDashboard.mockReturnValue(
      queryResult({
        data: {
          summaryMetrics: {
            totalRevenue: 100,
            totalExpenses: 250,
            netProfit: -150,
          },
        },
      }),
    )

    renderWithProviders(<Dashboard />)

    expect(screen.getByText('Verlies')).toBeInTheDocument()
    expect(screen.queryByText('Winst')).not.toBeInTheDocument()
    expect(screen.getByText(eur(-150))).toBeInTheDocument()
  })

  it('renders zeroed totals when there is no data (empty branch)', () => {
    mockedUseDashboard.mockReturnValue(queryResult({ data: undefined }))

    renderWithProviders(<Dashboard />)

    // Three summary cards all show the zero-euro formatting.
    expect(screen.getAllByText(eur(0)).length).toBeGreaterThanOrEqual(3)
  })

  it('shows the loading placeholder for both charts while isLoading is true', () => {
    mockedUseDashboard.mockReturnValue(
      queryResult({ isLoading: true, data: undefined }),
    )

    renderWithProviders(<Dashboard />)

    expect(screen.getAllByText('Loading chart data...')).toHaveLength(2)
  })

  it('dispatches setAlert with a danger message when the query errors', async () => {
    mockedUseDashboard.mockReturnValue(
      queryResult({ error: new Error('boom') }),
    )

    renderWithProviders(<Dashboard />)

    await waitFor(() => expect(mockedSetAlert).toHaveBeenCalled())
    // The useEffect path produces the Dutch error string.
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Fout bij laden van dashboard data: boom',
      'danger',
    )
    // FIXME(dashboard-render-dispatch): the component ALSO dispatches setAlert
    // directly during render (Dashboard.tsx lines 87-94), producing a second,
    // English-prefixed alert ('Error loading dashboard data: boom'). Dispatching
    // during render is a side effect outside useEffect and should move into the
    // existing effect. This test documents that both calls currently fire.
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Error loading dashboard data: boom',
      'danger',
    )
  })

  it('toggles the ExportSummary panel via the export button', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Dashboard />)

    expect(screen.queryByTestId('export-summary')).not.toBeInTheDocument()

    await user.click(screen.getByTitle('Exporteren'))
    expect(screen.getByTestId('export-summary')).toBeInTheDocument()

    await user.click(screen.getByTitle('Exporteren'))
    expect(screen.queryByTestId('export-summary')).not.toBeInTheDocument()
  })

  it('shows the period label that matches the selected preset', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Dashboard />)

    // Default preset THIS_YEAR.
    expect(screen.getByText('Overzicht Dit Jaar')).toBeInTheDocument()

    await user.selectOptions(
      screen.getByLabelText('Periode'),
      PERIOD_PRESETS.LAST_YEAR,
    )
    expect(screen.getByText('Overzicht Vorig Jaar')).toBeInTheDocument()
  })
})
