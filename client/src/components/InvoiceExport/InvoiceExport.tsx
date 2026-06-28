import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import { useExportInvoices } from '../../hooks/api'
import moment from 'moment'
import { PERIOD_PRESETS, EXPORT_FORMATS } from '../../common/constants'
import './InvoiceExport.css'

interface CustomPeriodFilter {
  type: string
  startDate: string
  endDate: string
}

interface InvoiceExportProps {
  isOpen: boolean
  onClose: () => void
  searchQuery?: string
  periodFilter?: string | CustomPeriodFilter
}

interface DateRange {
  startDate: string | null
  endDate: string | null
}

const InvoiceExport = ({
  isOpen,
  onClose,
  searchQuery,
  periodFilter,
}: InvoiceExportProps) => {
  const dispatch = useDispatch()
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS.XLSX)
  const [includePdfs, setIncludePdfs] = useState(false)
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
  const exportInvoicesMutation = useExportInvoices()

  const handleExportSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      setExportInProgress(true)

      // Use the same search query as the invoice list and add date range
      const exportOptions = {
        format: exportFormat,
        includePdfs,
        searchQuery,
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
      }

      // Call the mutation to start the export
      exportInvoicesMutation.mutate(exportOptions, {
        onSuccess: () => {
          if (includePdfs) {
            dispatch(
              setAlert(
                'Je export met factuur PDFs wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
                'success',
              ),
            )
          } else {
            dispatch(
              setAlert(
                'Je export wordt voorbereid. Je krijgt een e-mail zodra deze klaar is om te downloaden.',
                'success',
              ),
            )
          }

          // Close export dialog
          onClose()

          // Reset export progress state
          setTimeout(() => {
            setExportInProgress(false)
          }, 500)
        },
        onError: (error: Error) => {
          console.error('Export error:', error)
          dispatch(
            setAlert(
              `Fout bij exporteren: ${error?.message || 'Onbekende fout'}`,
              'danger',
            ),
          )
          setExportInProgress(false)
        },
      })
    } catch (error) {
      console.error('Export submission error:', error)
      dispatch(
        setAlert(
          `Er is een fout opgetreden bij het exporteren: ${
            (error as Error)?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
      setExportInProgress(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="box box-default mb-4">
      <div className="box-header with-border">
        <h3 className="box-title">Facturen Exporteren</h3>
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
          Exporteer een overzicht van uw facturen.
          {includePdfs
            ? ' Met PDF bestanden worden alle factuur PDFs meegeleverd in een ZIP bestand.'
            : ' Kies hieronder uw gewenste export opties.'}
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
                  id="include-pdfs"
                  className="form-check-input"
                  checked={includePdfs}
                  onChange={(e) => setIncludePdfs(e.target.checked)}
                />
                <label
                  className="form-check-label checkbox"
                  htmlFor="include-pdfs"
                >
                  Factuur PDFs meenemen in export (ZIP)
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
                      : 'Exporteer facturen'
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
              <li>Factuur nummers en datums</li>
              <li>Klant gegevens en beschrijving</li>
              <li>Bedragen en BTW</li>
              {includePdfs && (
                <li>Alle factuur PDF bestanden in een ZIP bestand</li>
              )}
            </ul>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InvoiceExport
