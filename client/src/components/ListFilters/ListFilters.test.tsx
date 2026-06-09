import userEvent from '@testing-library/user-event'
import moment from 'moment'
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
} from '../../test-utils'
import { PERIOD_PRESETS } from '../../common/constants'
import ListFilters from './ListFilters'

const baseProps = () => ({
  onSearch: jest.fn(),
  onExportButtonClicked: jest.fn(),
  onPeriodChanged: jest.fn(),
})

describe('ListFilters', () => {
  it('renders the search input with the initial query', () => {
    renderWithProviders(
      <ListFilters {...baseProps()} initialSearchQuery="invoice-42" />,
    )
    expect(screen.getByPlaceholderText('Zoeken')).toHaveValue('invoice-42')
  })

  it('calls onExportButtonClicked when the export button is clicked', async () => {
    const props = baseProps()
    renderWithProviders(<ListFilters {...props} />)
    await userEvent.click(screen.getByTitle('Exporteren'))
    expect(props.onExportButtonClicked).toHaveBeenCalledTimes(1)
  })

  it('calls onSearch with the typed query on Enter', async () => {
    const props = baseProps()
    renderWithProviders(<ListFilters {...props} />)
    const input = screen.getByPlaceholderText('Zoeken')
    await userEvent.type(input, 'report')
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 })
    expect(props.onSearch).toHaveBeenCalledWith('report')
  })

  it('calls onPeriodChanged when a period preset is selected', async () => {
    const props = baseProps()
    renderWithProviders(<ListFilters {...props} hasPeriodFilter />)
    await userEvent.click(screen.getByTitle('Filter op periode'))
    await userEvent.click(screen.getByText('Afgelopen maand'))
    expect(props.onPeriodChanged).toHaveBeenCalled()
    // Selecting a preset closes the popup (also flushes the state update).
    await waitFor(() =>
      expect(screen.queryByText('Afgelopen maand')).not.toBeInTheDocument(),
    )
  })

  describe('search button', () => {
    it('calls onSearch with the typed query when the search button is clicked', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.type(screen.getByPlaceholderText('Zoeken'), 'invoices')
      // The search button is the only button rendered inside .input-group-btn;
      // it carries no accessible name, so locate it via its title-less role set.
      const searchButton = screen
        .getByPlaceholderText('Zoeken')
        .closest('.input-group')!
        .querySelector('button.search') as HTMLButtonElement
      await user.click(searchButton)

      expect(props.onSearch).toHaveBeenLastCalledWith('invoices')
    })

    it('does not fire the Enter/click branch on other keys', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      const input = screen.getByPlaceholderText('Zoeken')
      await user.type(input, 'ab')
      // 'ab' is below the 3-char debounce threshold and no Enter/click happened,
      // so the explicit-search path never calls onSearch.
      expect(props.onSearch).not.toHaveBeenCalled()
    })
  })

  describe('clearing the search input', () => {
    it('calls onSearch with an empty string when the input is cleared', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(
        <ListFilters {...props} initialSearchQuery="report" />,
      )

      const input = screen.getByPlaceholderText('Zoeken')
      await user.clear(input)

      expect(props.onSearch).toHaveBeenCalledWith('')
      expect(input).toHaveValue('')
    })
  })

  describe('clear-period badge', () => {
    it('renders the active class and a clear badge when hasPeriodFilter is true', () => {
      renderWithProviders(<ListFilters {...baseProps()} hasPeriodFilter />)
      const periodButton = screen.getByTitle('Filter op periode')
      expect(periodButton).toHaveClass('active')
      expect(periodButton.querySelector('.filter-badge')).toBeInTheDocument()
    })

    it('does not render the clear badge when hasPeriodFilter is false', () => {
      renderWithProviders(<ListFilters {...baseProps()} />)
      const periodButton = screen.getByTitle('Filter op periode')
      expect(periodButton).not.toHaveClass('active')
      expect(
        periodButton.querySelector('.filter-badge'),
      ).not.toBeInTheDocument()
    })

    it('clears the period filter when the badge X is clicked', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      const { container } = renderWithProviders(
        <ListFilters {...props} hasPeriodFilter />,
      )

      const badge = container.querySelector('.filter-badge svg')
      expect(badge).toBeInTheDocument()
      await user.click(badge as Element)

      expect(props.onPeriodChanged).toHaveBeenCalledWith(null, {
        startDate: null,
        endDate: null,
      })
    })
  })

  describe('period presets', () => {
    it('passes the preset key and a computed date range to onPeriodChanged', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.click(screen.getByTitle('Filter op periode'))
      await user.click(screen.getByText('Dit jaar'))

      expect(props.onPeriodChanged).toHaveBeenCalledWith(
        PERIOD_PRESETS.THIS_YEAR,
        {
          startDate: moment().startOf('year').format('YYYY-MM-DD'),
          endDate: moment().format('YYYY-MM-DD'),
        },
      )
    })
  })

  describe('custom date-range picker', () => {
    it('opens the custom picker without firing onPeriodChanged on selection', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.click(screen.getByTitle('Filter op periode'))
      await user.click(screen.getByText('Aangepaste periode'))

      expect(screen.getByText('Selecteer datumperiode')).toBeInTheDocument()
      expect(screen.getByText('Startdatum')).toBeInTheDocument()
      expect(screen.getByText('Einddatum')).toBeInTheDocument()
      // Opening the picker is not a period change; nothing fires until "Toepassen".
      expect(props.onPeriodChanged).not.toHaveBeenCalled()
    })

    it('fires onPeriodChanged with a CUSTOM period and formatted range on apply', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.click(screen.getByTitle('Filter op periode'))
      await user.click(screen.getByText('Aangepaste periode'))
      await user.click(screen.getByText('Toepassen'))

      expect(props.onPeriodChanged).toHaveBeenCalledTimes(1)
      const [period, dateRange] = props.onPeriodChanged.mock.calls[0]
      // The picker defaults both ends to today, so the range collapses to today.
      const today = moment().format('YYYY-MM-DD')
      expect(period).toMatchObject({ type: PERIOD_PRESETS.CUSTOM })
      expect(period.startDate).toBeInstanceOf(Date)
      expect(period.endDate).toBeInstanceOf(Date)
      expect(dateRange).toEqual({ startDate: today, endDate: today })
    })

    it('closes the picker on apply', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.click(screen.getByTitle('Filter op periode'))
      await user.click(screen.getByText('Aangepaste periode'))
      await user.click(screen.getByText('Toepassen'))

      await waitFor(() =>
        expect(
          screen.queryByText('Selecteer datumperiode'),
        ).not.toBeInTheDocument(),
      )
    })

    it('cancels without firing onPeriodChanged and closes the picker', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      renderWithProviders(<ListFilters {...props} />)

      await user.click(screen.getByTitle('Filter op periode'))
      await user.click(screen.getByText('Aangepaste periode'))
      await user.click(screen.getByText('Annuleren'))

      expect(props.onPeriodChanged).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(
          screen.queryByText('Selecteer datumperiode'),
        ).not.toBeInTheDocument(),
      )
    })
  })
})
