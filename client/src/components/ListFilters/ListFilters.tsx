import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
} from 'react'
import { debounce } from 'lodash'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSearch,
  faFileExport,
  faCalendarAlt,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { PERIOD_PRESETS } from '../../common/constants'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import moment from 'moment'
import './ListFilters.css'

interface CustomPeriod {
  type: string
  startDate: Date
  endDate: Date
}

interface DateRange {
  startDate: string | null
  endDate: string | null
}

interface CustomDateRange {
  startDate: Date
  endDate: Date
}

interface ListFiltersProps {
  onSearch: (query: string) => void
  onExportButtonClicked: () => void
  onPeriodChanged: (
    period: string | CustomPeriod | null,
    dateRange: DateRange,
  ) => void
  hasPeriodFilter?: boolean
  initialSearchQuery?: string
}

const ListFilters = ({
  onSearch,
  onExportButtonClicked,
  onPeriodChanged,
  hasPeriodFilter = false,
  initialSearchQuery = '',
}: ListFiltersProps) => {
  const [showPeriodPopup, setShowPeriodPopup] = useState(false)
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({
    startDate: new Date(),
    endDate: new Date(),
  })
  const periodPopupRef = useRef<HTMLDivElement>(null)
  const customDatePickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as Element
      if (periodPopupRef.current && !periodPopupRef.current.contains(target)) {
        setShowPeriodPopup(false)
      }

      if (
        customDatePickerRef.current &&
        !customDatePickerRef.current.contains(target) &&
        !target.classList.contains('react-datepicker__day') &&
        !target.classList.contains('react-datepicker__month') &&
        !target.classList.contains('react-datepicker__year')
      ) {
        setShowCustomDatePicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const debouncedSearch = useCallback(
    (query: string) => {
      if (query.length >= 3 || query === '') {
        onSearch(query)
      }
    },
    [onSearch],
  )

  const debouncedSearchWithDelay = useMemo(
    () => debounce(debouncedSearch, 300),
    [debouncedSearch],
  )

  const handleSearch = useCallback(
    (e: KeyboardEvent<HTMLInputElement> | MouseEvent<HTMLButtonElement>) => {
      if ('preventDefault' in e && e.preventDefault) {
        e.preventDefault()
      }
      const key = 'key' in e ? e.key : null
      const type = 'type' in e ? (e as MouseEvent).type : null
      if (key === 'Enter' || type === 'click') {
        onSearch(searchQuery)
      }
    },
    [onSearch, searchQuery],
  )

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    const query = e.target.value
    setSearchQuery(query)

    if (query === '') {
      onSearch('')
      return
    }

    if (query.length >= 3) {
      e.stopPropagation()

      let parentForm: Element | null = e.target
      while (parentForm && parentForm.tagName !== 'FORM') {
        parentForm = parentForm.parentElement
      }

      debouncedSearchWithDelay(query)
    }
  }

  const calculateDateRange = (
    periodPreset: string | CustomPeriod | null,
  ): DateRange => {
    if (!periodPreset) {
      return { startDate: null, endDate: null }
    }

    if (
      typeof periodPreset === 'object' &&
      periodPreset.type === PERIOD_PRESETS.CUSTOM
    ) {
      const startDate = moment(periodPreset.startDate).format('YYYY-MM-DD')
      const endDate = moment(periodPreset.endDate).format('YYYY-MM-DD')
      return { startDate, endDate }
    }

    let startDate: string | null = null
    let endDate: string | null = null

    switch (periodPreset) {
      case PERIOD_PRESETS.LAST_MONTH:
        startDate = moment().subtract(1, 'month').format('YYYY-MM-DD')
        endDate = moment().format('YYYY-MM-DD')
        break
      case PERIOD_PRESETS.LAST_THREE_MONTHS:
        startDate = moment().subtract(3, 'months').format('YYYY-MM-DD')
        endDate = moment().format('YYYY-MM-DD')
        break
      case PERIOD_PRESETS.LAST_TWELVE_MONTHS:
        startDate = moment().subtract(12, 'months').format('YYYY-MM-DD')
        endDate = moment().format('YYYY-MM-DD')
        break
      case PERIOD_PRESETS.THIS_YEAR:
        startDate = moment().startOf('year').format('YYYY-MM-DD')
        endDate = moment().format('YYYY-MM-DD')
        break
      case PERIOD_PRESETS.LAST_YEAR:
        startDate = moment()
          .subtract(1, 'year')
          .startOf('year')
          .format('YYYY-MM-DD')
        endDate = moment()
          .subtract(1, 'year')
          .endOf('year')
          .format('YYYY-MM-DD')
        break
      default:
        startDate = null
        endDate = null
    }

    return { startDate, endDate }
  }

  const handlePeriodSelect = (period: string) => {
    if (period === PERIOD_PRESETS.CUSTOM) {
      setShowCustomDatePicker(true)
    } else {
      const dateRange = calculateDateRange(period)
      onPeriodChanged(period, dateRange)
      setShowPeriodPopup(false)
    }
  }

  const handleCustomDateSubmit = () => {
    if (customDateRange.startDate && customDateRange.endDate) {
      const periodObject: CustomPeriod = {
        type: PERIOD_PRESETS.CUSTOM,
        startDate: customDateRange.startDate,
        endDate: customDateRange.endDate,
      }

      const dateRange = calculateDateRange(periodObject)
      onPeriodChanged(periodObject, dateRange)
      setShowCustomDatePicker(false)
      setShowPeriodPopup(false)
    }
  }

  const clearPeriodFilter = () => {
    const nullDateRange: DateRange = { startDate: null, endDate: null }
    onPeriodChanged(null, nullDateRange)
  }

  return (
    <div className="list-filters">
      <div className="filter-container">
        <div className="filter-item period-filter" ref={periodPopupRef}>
          <button
            className={`btn filter-button ${hasPeriodFilter ? 'active' : ''}`}
            onClick={() => setShowPeriodPopup(!showPeriodPopup)}
            title="Filter op periode"
          >
            <FontAwesomeIcon icon={faCalendarAlt} />
            {hasPeriodFilter && (
              <span className="filter-badge">
                <FontAwesomeIcon icon={faTimes} onClick={clearPeriodFilter} />
              </span>
            )}
          </button>

          {showPeriodPopup && (
            <div className="period-popup shadow">
              <h6 className="mb-2">Selecteer periode</h6>
              <ul className="period-options">
                <li
                  onClick={() => handlePeriodSelect(PERIOD_PRESETS.LAST_MONTH)}
                >
                  Afgelopen maand
                </li>
                <li
                  onClick={() =>
                    handlePeriodSelect(PERIOD_PRESETS.LAST_THREE_MONTHS)
                  }
                >
                  Afgelopen 3 maanden
                </li>
                <li
                  onClick={() =>
                    handlePeriodSelect(PERIOD_PRESETS.LAST_TWELVE_MONTHS)
                  }
                >
                  Afgelopen 12 maanden
                </li>
                <li
                  onClick={() => handlePeriodSelect(PERIOD_PRESETS.THIS_YEAR)}
                >
                  Dit jaar
                </li>
                <li
                  onClick={() => handlePeriodSelect(PERIOD_PRESETS.LAST_YEAR)}
                >
                  Vorig jaar
                </li>
                <li onClick={() => handlePeriodSelect(PERIOD_PRESETS.CUSTOM)}>
                  Aangepaste periode
                </li>
              </ul>
            </div>
          )}

          {showCustomDatePicker && (
            <div
              className="custom-date-picker-popup shadow"
              ref={customDatePickerRef}
            >
              <h6 className="mb-2">Selecteer datumperiode</h6>
              <div className="date-range-container">
                <div className="date-picker-group mb-2">
                  <label>Startdatum</label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date: Date | null) =>
                      setCustomDateRange({
                        ...customDateRange,
                        startDate: date ?? new Date(),
                      })
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    dateFormat="dd-MM-yyyy"
                    className="form-control"
                  />
                </div>
                <div className="date-picker-group mb-3">
                  <label>Einddatum</label>
                  <DatePicker
                    selected={customDateRange.endDate}
                    onChange={(date: Date | null) =>
                      setCustomDateRange({
                        ...customDateRange,
                        endDate: date ?? new Date(),
                      })
                    }
                    selectsEnd
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    minDate={customDateRange.startDate}
                    dateFormat="dd-MM-yyyy"
                    className="form-control"
                  />
                </div>
                <div className="d-flex justify-content-end">
                  <button
                    className="btn btn-sm btn-default mr-2"
                    onClick={() => setShowCustomDatePicker(false)}
                  >
                    Annuleren
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleCustomDateSubmit}
                  >
                    Toepassen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="filter-item search-filter">
          <div className="input-group search">
            <div
              onSubmit={(e) => {
                e.preventDefault()
                return false
              }}
            >
              <input
                type="text"
                className="form-control"
                placeholder="Zoeken"
                value={searchQuery}
                onChange={handleSearchInputChange}
                onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSearch(e)
                  }
                }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                  }
                }}
                ref={searchInputRef}
                autoComplete="off"
              />
            </div>
            <div className="input-group-btn">
              <button
                className="btn btn-default search"
                type="button"
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault()
                  handleSearch(e)
                }}
                onMouseDown={(e: MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault()
                }}
              >
                <FontAwesomeIcon icon={faSearch} />
              </button>
            </div>
          </div>
        </div>

        <div className="filter-item export-filter">
          <button
            className="btn filter-button"
            onClick={onExportButtonClicked}
            title="Exporteren"
          >
            <FontAwesomeIcon icon={faFileExport} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ListFilters
