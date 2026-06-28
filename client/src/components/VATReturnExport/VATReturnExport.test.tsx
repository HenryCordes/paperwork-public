import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import VATReturnExport from './VATReturnExport'

// The component talks to the API via global `fetch` (no react-query / axios),
// and reports failures via the `setAlert` redux thunk, which pushes onto the
// real `alert` slice. We mock `fetch` and assert against the real store, so
// the tests exercise the genuine dispatch path rather than a mocked thunk.

interface PeriodsResponse {
  periodTypes: { value: string; label: string }[]
  years: number[]
  periods: {
    monthly: { value: number; label: string }[]
    quarterly: { value: string; label: string }[]
    [key: string]: { value: string | number; label: string }[]
  }
}

const periodsPayload: PeriodsResponse = {
  periodTypes: [
    { value: 'quarterly', label: 'Per kwartaal' },
    { value: 'monthly', label: 'Per maand' },
    { value: 'yearly', label: 'Per jaar' },
  ],
  years: [2026, 2025, 2024],
  periods: {
    monthly: [
      { value: 1, label: 'Januari' },
      { value: 2, label: 'Februari' },
    ],
    quarterly: [
      { value: 'Q1', label: 'Kwartaal 1' },
      { value: 'Q2', label: 'Kwartaal 2' },
      { value: 'Q3', label: 'Kwartaal 3' },
      { value: 'Q4', label: 'Kwartaal 4' },
    ],
  },
}

const previewPayload = {
  omzet: {
    hoogTarief21: { btw: 100 },
    laagTarief9: { btw: 50 },
    laagsteTarief6: { btw: 25 },
    overige: { btw: 0 },
  },
  teBetalen: 175,
  period: { dateRange: { start: '2026-01-01', end: '2026-03-31' } },
  invoiceCount: 12,
  expenseCount: 4,
}

type FetchArgs = Parameters<typeof fetch>
const fetchMock = jest.fn<Promise<Response>, FetchArgs>()

const jsonResponse = (data: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve({ data }),
    headers: { get: () => null },
  }) as unknown as Response

const errorJsonResponse = (message: string): Response =>
  ({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ message }),
    headers: { get: () => null },
  }) as unknown as Response

const blobResponse = (filename?: string): Response =>
  ({
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob(['data'])),
    headers: {
      get: (h: string) =>
        h === 'Content-Disposition' && filename
          ? `attachment; filename="${filename}"`
          : null,
    },
  }) as unknown as Response

// Default fetch router keyed off the request URL. Tests can override per-call.
const defaultRoute = (url: string): Response => {
  if (url.startsWith('/api/btw-export/periods'))
    return jsonResponse(periodsPayload)
  if (url.startsWith('/api/btw-export/deadline')) return jsonResponse(null)
  if (url.startsWith('/api/btw-export/summary'))
    return jsonResponse(previewPayload)
  if (url.startsWith('/api/btw-export/export')) return blobResponse()
  throw new Error(`unexpected fetch: ${url}`)
}

const lastAlert = (store: {
  getState: () => { alert: { message?: string }[] }
}) => {
  const alerts = store.getState().alert
  return alerts[alerts.length - 1]
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((input) =>
    Promise.resolve(defaultRoute(String(input))),
  )
  global.fetch = fetchMock as unknown as typeof fetch
  // jsdom does not implement these blob-download primitives.
  global.URL.createObjectURL = jest.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = jest.fn()
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  localStorage.clear()
})

describe('VATReturnExport', () => {
  it('shows a loading placeholder until periods have loaded', async () => {
    renderWithProviders(<VATReturnExport />)
    expect(screen.getByText('Laden...')).toBeInTheDocument()
    // Once /periods resolves, the settings panel replaces the loader.
    expect(await screen.findByText('Export Instellingen')).toBeInTheDocument()
    expect(screen.queryByText('Laden...')).not.toBeInTheDocument()
  })

  it('requests periods and the quarterly deadline on mount with the bearer token', async () => {
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(calledUrls).toContain('/api/btw-export/periods')
    expect(calledUrls).toContain(
      '/api/btw-export/deadline?periodType=quarterly',
    )

    const periodsCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith('/api/btw-export/periods'),
    )
    const init = periodsCall?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    )
  })

  it('populates the period-type, year and quarterly period selects from the loaded data', async () => {
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    const typeSelect = screen.getByLabelText(
      'Periode Type',
    ) as HTMLSelectElement
    expect(optionLabels(typeSelect)).toEqual([
      'Per kwartaal',
      'Per maand',
      'Per jaar',
    ])

    const yearSelect = screen.getByLabelText('Jaar') as HTMLSelectElement
    expect(optionLabels(yearSelect)).toEqual(['2026', '2025', '2024'])

    // Default period type is quarterly -> quarterly options populate the period select.
    const periodSelect = screen.getByLabelText('Periode') as HTMLSelectElement
    expect(optionLabels(periodSelect)).toEqual([
      'Selecteer periode',
      'Kwartaal 1',
      'Kwartaal 2',
      'Kwartaal 3',
      'Kwartaal 4',
    ])
  })

  it('repopulates the period select with monthly options when the type switches to monthly', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    await user.selectOptions(screen.getByLabelText('Periode Type'), 'monthly')

    const periodSelect = screen.getByLabelText('Periode') as HTMLSelectElement
    await waitFor(() =>
      expect(optionLabels(periodSelect)).toEqual([
        'Selecteer periode',
        'Januari',
        'Februari',
      ]),
    )
  })

  it('disables both action buttons until a period is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    // Force the period back to the empty placeholder.
    await user.selectOptions(screen.getByLabelText('Periode'), '')

    expect(screen.getByRole('button', { name: 'Exporteren' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Voorvertoning' })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Periode'), 'Q2')
    expect(
      screen.getByRole('button', { name: 'Exporteren' }),
    ).not.toBeDisabled()
  })

  it('exports with the selected period type, period, year, format and details flag', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    await user.selectOptions(screen.getByLabelText('Periode Type'), 'quarterly')
    await user.selectOptions(screen.getByLabelText('Jaar'), '2025')
    await user.selectOptions(screen.getByLabelText('Periode'), 'Q3')
    await user.selectOptions(screen.getByLabelText('Export Formaat'), 'csv')
    await user.click(screen.getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: 'Exporteren' }))

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(([input]) =>
        String(input).startsWith('/api/btw-export/export'),
      )
      expect(exportCall).toBeDefined()
    })

    const exportUrl = String(
      fetchMock.mock.calls.find(([input]) =>
        String(input).startsWith('/api/btw-export/export'),
      )?.[0],
    )
    const params = new URLSearchParams(exportUrl.split('?')[1])
    expect(params.get('periodType')).toBe('quarterly')
    expect(params.get('period')).toBe('Q3')
    expect(params.get('year')).toBe('2025')
    expect(params.get('format')).toBe('csv')
    expect(params.get('includeDetails')).toBe('true')
  })

  it('dispatches a success alert after a successful export download', async () => {
    const user = userEvent.setup()
    const { store } = renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    await user.selectOptions(screen.getByLabelText('Periode'), 'Q1')
    await user.click(screen.getByRole('button', { name: 'Exporteren' }))

    await waitFor(() => {
      expect(lastAlert(store)).toEqual(
        expect.objectContaining({
          message: 'BTW export succesvol gedownload',
          type: 'success',
        }),
      )
    })
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })

  it('dispatches the server message as a danger alert when export responds not-ok', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input) => {
      const url = String(input)
      if (url.startsWith('/api/btw-export/export')) {
        return Promise.resolve(errorJsonResponse('Geen data voor deze periode'))
      }
      return Promise.resolve(defaultRoute(url))
    })

    const { store } = renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    await user.selectOptions(screen.getByLabelText('Periode'), 'Q1')
    await user.click(screen.getByRole('button', { name: 'Exporteren' }))

    await waitFor(() => {
      expect(lastAlert(store)).toEqual(
        expect.objectContaining({
          message: 'Geen data voor deze periode',
          type: 'danger',
        }),
      )
    })
  })

  it('loads a preview summary and renders the BTW totals and period info', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VATReturnExport />)
    await screen.findByText('Export Instellingen')

    await user.selectOptions(screen.getByLabelText('Periode'), 'Q1')
    await user.click(screen.getByRole('button', { name: 'Voorvertoning' }))

    expect(await screen.findByText('BTW Overzicht')).toBeInTheDocument()
    // Invoice/expense counts from the preview payload.
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()

    const summaryCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith('/api/btw-export/summary'),
    )
    const params = new URLSearchParams(String(summaryCall?.[0]).split('?')[1])
    expect(params.get('period')).toBe('Q1')
    expect(params.get('periodType')).toBe('quarterly')
  })

  it('dispatches a danger alert when the periods request fails on mount', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)
      if (url.startsWith('/api/btw-export/periods')) {
        return Promise.resolve(jsonResponse(null, false))
      }
      return Promise.resolve(defaultRoute(url))
    })

    const { store } = renderWithProviders(<VATReturnExport />)

    await waitFor(() => {
      expect(lastAlert(store)).toEqual(
        expect.objectContaining({
          message: 'Kon periodes niet laden',
          type: 'danger',
        }),
      )
    })
    // Without periods the component stays on the loader.
    expect(screen.getByText('Laden...')).toBeInTheDocument()
  })
})

// Small helper: read the visible option labels of a <select>.
function optionLabels(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((o) => o.textContent ?? '')
}
