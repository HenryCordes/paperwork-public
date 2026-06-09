import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import { useExportExpenses } from '../../hooks/api'
import moment from 'moment'
import { PERIOD_PRESETS, EXPORT_FORMATS } from '../../common/constants'
import './ExpenseExport.css'

interface CustomPeriodFilter {
  type: string
  startDate: string
  endDate: string
}

interface ExpenseExportProps {
  isOpen: boolean
  onClose: () => void
  searchQuery?: string
  periodFilter?: string | CustomPeriodFilter
}

interface DateRange {
  startDate: string | null
  endDate: string | null
}

const ExpenseExport = ({
  isOpen,
  onClose,
  searchQuery,
  periodFilter,
}: ExpenseExportProps) => {
  const dispatch = useDispatch()
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS.XLSX)
  const [includeReceipts, setIncludeReceipts] = useState(false)
  const [exportInProgress, setExportInProgress] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  })

  // Convert period filter to date range
  useEffect(() => {
    if (periodFilter) {
      // If this is a custom period with explicit dates, use those directly
      if (
        typeof periodFilter === 'object' &&
        periodFilter.type === PERIOD_PRESETS.CUSTOM
      ) {
        const startDate = moment(periodFilter.startDate).format('YYYY-MM-DD')
        const endDate = moment(periodFilter.endDate).format('YYYY-MM-DD')
        setDateRange({ startDate, endDate })
        return
      }

      // Otherwise, calculate dates based on preset
      let startDate: string | null = null
      let endDate: string | null = null

      switch (periodFilter) {
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

      setDateRange({ startDate, endDate })
    } else {
      setDateRange({ startDate: null, endDate: null })
    }
  }, [periodFilter])

  // Use our export mutation hook
  const exportExpensesMutation = useExportExpenses()

  const handleExportSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      setExportInProgress(true)

      // Use the same search query as the expense list and add date range
      const exportOptions = {
        format: exportFormat,
        includeReceipts,
        searchQuery,
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
      }

      // Call the mutation to start the export
      exportExpensesMutation.mutate(exportOptions, {
        onSuccess: (data: { downloadUrl?: string }) => {
          if (includeReceipts) {
            dispatch(
              setAlert(
                'Je export met bonnen wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
                'success',
              ),
            )
          } else {
            // For data-only exports that complete quickly, we might get the download URL directly
            if (data.downloadUrl) {
              window.location.href = data.downloadUrl
              dispatch(
                setAlert('Je export is klaar en wordt gedownload.', 'success'),
              )
            } else {
              dispatch(
                setAlert(
                  'Je export wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
                  'success',
                ),
              )
            }
          }
          setExportInProgress(false)
          onClose() // Close the modal after submission
        },
        onError: (error: Error) => {
          dispatch(
            setAlert(
              `Er is een fout opgetreden bij het exporteren: ${
                error.message || 'Onbekende fout'
              }`,
              'danger',
            ),
          )
          setExportInProgress(false)
        },
      })
    } catch (error) {
      dispatch(
        setAlert(
          `Er is een fout opgetreden bij het exporteren: ${
            (error as Error).message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
      setExportInProgress(false)
    }
  }

  // If not open, don't render anything
  if (!isOpen) return null

  return (
    <div className="box box-default mb-4">
      <div className="box-header with-border">
        <h3 className="box-title">Kosten Exporteren</h3>
        <div className="box-tools pull-right">
          <button
            type="button"
            className="icon-close btn btn-box-tool pull-right"
            onClick={onClose}
            aria-label="Close"
          >
            {' '}
          </button>
        </div>
      </div>
      <div className="box-body">
        <p>
          Exporteer een overzicht van uw kosten.
          {includeReceipts
            ? 'Met bonnen worden alle afbeeldingen meegeleverd in een ZIP bestand.'
            : 'Kies hieronder uw gewenste export opties.'}
        </p>

        <form onSubmit={handleExportSubmit}>
          <div className="row align-items-end mb-3">
            <div className="col-12 col-md-4 mb-3 mb-md-0">
              <label htmlFor="export-format" className="form-label">
                Formaat
              </label>
              <select
                id="export-format"
                className="form-select"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
              >
                <option value={EXPORT_FORMATS.XLSX}>Excel (.xlsx)</option>
                <option value={EXPORT_FORMATS.CSV}>CSV (.csv)</option>
              </select>
            </div>

            <div className="col-12 col-md-4 mb-3 mb-md-0">
              <div className="form-check">
                <input
                  type="checkbox"
                  id="include-receipts"
                  className="form-check-input"
                  checked={includeReceipts}
                  onChange={(e) => setIncludeReceipts(e.target.checked)}
                />
                <label
                  className="form-check-label checkbox"
                  htmlFor="include-receipts"
                >
                  Bonnen meenemen in export (ZIP)
                </label>
              </div>
            </div>

            <div className="col-12 col-md-4">
              <button
                type="submit"
                className="btn btn-primary w-100 export-button pull-right"
                disabled={
                  exportInProgress || !dateRange.startDate || !dateRange.endDate
                }
                title={
                  exportInProgress
                    ? 'Exporteren is bezig...'
                    : !dateRange.startDate || !dateRange.endDate
                      ? 'Selecteer eerst een periode'
                      : 'Exporteer kosten'
                }
              >
                {exportInProgress ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Exporteren...
                  </>
                ) : (
                  <>
                    <i className="fas fa-download me-2"></i>
                    Exporteren
                  </>
                )}
              </button>
            </div>
          </div>

          {(searchQuery || periodFilter) && (
            <div className="bg-light p-2 rounded small mb-3">
              {searchQuery && (
                <p className="mb-0">
                  <strong>Zoekfilter:</strong> "{searchQuery}" wordt toegepast
                  op deze export.
                </p>
              )}
              {periodFilter && dateRange.startDate && dateRange.endDate && (
                <p className="mb-0">
                  <strong>Periode:</strong>{' '}
                  {moment(dateRange.startDate).format('DD-MM-YYYY')} t/m{' '}
                  {moment(dateRange.endDate).format('DD-MM-YYYY')}
                </p>
              )}
            </div>
          )}

          <div className="bg-light p-2 rounded small">
            <p className="mb-1">
              <strong>Het export bevat:</strong>
            </p>
            <ul className="mb-0">
              <li>Kost nummers en datums</li>
              <li>Omschrijvingen en details</li>
              <li>Bedragen en BTW</li>
              {includeReceipts && (
                <li>Alle bon afbeeldingen in een ZIP bestand</li>
              )}
            </ul>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ExpenseExport
