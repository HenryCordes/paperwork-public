import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { setAlert } from '../../redux/_actions/alertAction'
import { useExportExpenses } from '../../hooks/api'
import { EXPORT_FORMATS, PERIOD_PRESETS } from '../../common/constants'

jest.mock('../../hooks/api')
jest.mock('../../redux/_actions/alertAction', () => ({
  setAlert: jest.fn(() => () => undefined),
}))

import ExpenseExport from './ExpenseExport'

type ExportOptions = {
  format: string
  includeReceipts: boolean
  searchQuery?: string
  startDate?: string
  endDate?: string
}

type MutateCallbacks = {
  onSuccess?: (data: { downloadUrl?: string }) => void
  onError?: (error: Error) => void
}

type Mutation = {
  mutate: jest.Mock
  mutateAsync: jest.Mock
  isPending: boolean
}

const mockedUseExportExpenses = jest.mocked(useExportExpenses)
const mockedSetAlert = jest.mocked(setAlert)

/**
 * Build a mutation mock whose `mutate` invokes the supplied callbacks
 * synchronously, mirroring react-query's per-call onSuccess/onError.
 */
const makeMutation = (
  behavior: 'success' | 'error' = 'success',
  successData: { downloadUrl?: string } = {},
  error: Error = new Error('Onbekende fout'),
): Mutation => {
  const mutate = jest.fn(
    (_options: ExportOptions, callbacks: MutateCallbacks = {}) => {
      if (behavior === 'success') {
        callbacks.onSuccess?.(successData)
      } else {
        callbacks.onError?.(error)
      }
    },
  )
  return { mutate, mutateAsync: jest.fn(), isPending: false }
}

const renderOpen = (
  props: Partial<React.ComponentProps<typeof ExpenseExport>> = {},
) =>
  renderWithProviders(
    <ExpenseExport
      isOpen
      onClose={props.onClose ?? jest.fn()}
      searchQuery={props.searchQuery}
      // A custom period resolves to a concrete date range so the export
      // button becomes enabled.
      periodFilter={
        'periodFilter' in props
          ? props.periodFilter
          : {
              type: PERIOD_PRESETS.CUSTOM,
              startDate: '2024-01-01',
              endDate: '2024-03-31',
            }
      }
    />,
  )

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks wipes the factory implementation, so re-establish the
  // thunk-returning behaviour redux-thunk expects.
  mockedSetAlert.mockImplementation(() => () => undefined)
  mockedUseExportExpenses.mockReturnValue(
    makeMutation() as unknown as ReturnType<typeof useExportExpenses>,
  )
})

describe('ExpenseExport', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderWithProviders(
      <ExpenseExport isOpen={false} onClose={jest.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the format selector, receipts toggle and export button', () => {
    renderOpen()

    const formatSelect = screen.getByLabelText('Formaat') as HTMLSelectElement
    expect(formatSelect).toBeInTheDocument()
    expect(formatSelect.value).toBe(EXPORT_FORMATS.XLSX)
    expect(
      screen.getByRole('option', { name: 'Excel (.xlsx)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'CSV (.csv)' }),
    ).toBeInTheDocument()

    const receiptsToggle = screen.getByLabelText(
      'Bonnen meenemen in export (ZIP)',
    ) as HTMLInputElement
    expect(receiptsToggle).not.toBeChecked()

    expect(
      screen.getByRole('button', { name: /Exporteren/i }),
    ).toBeInTheDocument()
  })

  it('disables the export button when no period (date range) is set', () => {
    renderOpen({ periodFilter: undefined })

    const button = screen.getByRole('button', { name: /Exporteren/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Selecteer eerst een periode')
  })

  it('enables the export button once a period resolves to a date range', () => {
    renderOpen()

    const button = screen.getByRole('button', { name: /Exporteren/i })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('title', 'Exporteer kosten')
  })

  it('calls the mutation with the selected format, receipts flag and resolved dates', async () => {
    const user = userEvent.setup()
    const mutation = makeMutation()
    mockedUseExportExpenses.mockReturnValue(
      mutation as unknown as ReturnType<typeof useExportExpenses>,
    )

    renderOpen({ searchQuery: 'taxi' })

    await user.selectOptions(
      screen.getByLabelText('Formaat'),
      EXPORT_FORMATS.CSV,
    )
    await user.click(screen.getByLabelText('Bonnen meenemen in export (ZIP)'))
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    expect(mutation.mutate).toHaveBeenCalledTimes(1)
    const [options] = mutation.mutate.mock.calls[0] as [ExportOptions]
    expect(options).toEqual({
      format: EXPORT_FORMATS.CSV,
      includeReceipts: true,
      searchQuery: 'taxi',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })
  })

  it('shows a success alert and closes when an export without receipts succeeds with no download URL', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    mockedUseExportExpenses.mockReturnValue(
      makeMutation('success', {}) as unknown as ReturnType<
        typeof useExportExpenses
      >,
    )

    renderOpen({ onClose })

    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Je export wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
      'success',
    )
  })

  it('shows the receipts success message when receipts are included', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    mockedUseExportExpenses.mockReturnValue(
      makeMutation('success', {}) as unknown as ReturnType<
        typeof useExportExpenses
      >,
    )

    renderOpen({ onClose })

    await user.click(screen.getByLabelText('Bonnen meenemen in export (ZIP)'))
    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Je export met bonnen wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
      'success',
    )
  })

  it('dispatches a danger alert and does not close when the export fails', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    mockedUseExportExpenses.mockReturnValue(
      makeMutation(
        'error',
        {},
        new Error('Server boos'),
      ) as unknown as ReturnType<typeof useExportExpenses>,
    )

    renderOpen({ onClose })

    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    await waitFor(() =>
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Er is een fout opgetreden bij het exporteren: Server boos',
        'danger',
      ),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the in-progress spinner and disables the button while exporting', async () => {
    const user = userEvent.setup()
    // A mutation whose mutate never invokes its callbacks leaves the
    // component in its exportInProgress state.
    const mutate = jest.fn()
    mockedUseExportExpenses.mockReturnValue({
      mutate,
      mutateAsync: jest.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useExportExpenses>)

    renderOpen()

    await user.click(screen.getByRole('button', { name: /Exporteren/i }))

    const button = await screen.findByRole('button', {
      name: /Exporteren\.\.\./i,
    })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Exporteren is bezig...')
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('renders the applied search-query and period summary', () => {
    renderOpen({ searchQuery: 'taxi' })

    expect(screen.getByText('Zoekfilter:')).toBeInTheDocument()
    expect(screen.getByText(/"taxi" wordt toegepast/)).toBeInTheDocument()
    expect(screen.getByText('Periode:')).toBeInTheDocument()
    expect(screen.getByText(/01-01-2024 t\/m 31-03-2024/)).toBeInTheDocument()
  })
})
