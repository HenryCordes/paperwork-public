import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import './VATReturnExport.css'

interface PeriodOption {
  value: string | number
  label: string
}

interface PeriodType {
  value: string
  label: string
}

interface Periods {
  periodTypes: PeriodType[]
  years: number[]
  periods: {
    monthly: PeriodOption[]
    quarterly: PeriodOption[]
    [key: string]: PeriodOption[]
  }
}

interface Deadline {
  deadline: string
  label: string
  daysUntilDeadline: number
}

interface VatTariff {
  btw: number
  [key: string]: unknown
}

interface PreviewData {
  omzet: {
    hoogTarief21: VatTariff
    laagTarief9: VatTariff
    laagsteTarief6: VatTariff
    overige: VatTariff
  }
  teBetalen: number
  period: {
    dateRange: {
      start: string
      end: string
    }
  }
  invoiceCount: number
  expenseCount: number
}

interface VATReturnExportProps {
  user?: unknown
}

const VATReturnExport = ({ user }: VATReturnExportProps) => {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [periods, setPeriods] = useState<Periods | null>(null)
  const [selectedPeriodType, setSelectedPeriodType] = useState('quarterly')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedFormat, setSelectedFormat] = useState('excel')
  const [includeDetails, setIncludeDetails] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [nextDeadline, setNextDeadline] = useState<Deadline | null>(null)

  useEffect(() => {
    fetchPeriods()
    // Show deadline alert if there's an upcoming deadline
    if (nextDeadline && nextDeadline.daysUntilDeadline <= 7) {
      dispatch(
        setAlert(
          `⏰ BTW Deadline: ${formatDate(nextDeadline.deadline)} - ${
            nextDeadline.label
          } (${nextDeadline.daysUntilDeadline} dagen resterend)`,
          'warning',
        ),
      )
    }
  }, [nextDeadline]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchNextDeadline()
  }, [])

  useEffect(() => {
    if (periods && selectedPeriodType) {
      // Auto-select current period
      const currentDate = new Date()
      const currentMonth = currentDate.getMonth() + 1
      const currentQuarter = Math.ceil(currentMonth / 3)

      if (selectedPeriodType === 'monthly') {
        setSelectedPeriod(currentMonth.toString())
      } else if (selectedPeriodType === 'quarterly') {
        setSelectedPeriod(`Q${currentQuarter}`)
      } else if (selectedPeriodType === 'yearly') {
        setSelectedPeriod(selectedYear.toString())
      }
    }
  }, [selectedPeriodType, periods, selectedYear])

  const fetchPeriods = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/btw-export/periods', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const result = await response.json()
        setPeriods(result.data)
      } else {
        throw new Error('Fout bij ophalen periodes')
      }
    } catch (error) {
      console.error('Fout bij ophalen periodes:', error)
      dispatch(setAlert('Kon periodes niet laden', 'danger'))
    }
  }

  const fetchNextDeadline = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        '/api/btw-export/deadline?periodType=quarterly',
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (response.ok) {
        const result = await response.json()
        setNextDeadline(result.data)
      }
    } catch (error) {
      console.error('Fout bij ophalen deadline:', error)
    }
  }

  const fetchPreview = async () => {
    if (!selectedPeriod || !selectedYear) {
      dispatch(setAlert('Selecteer een periode en jaar', 'danger'))
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        periodType: selectedPeriodType,
        period: selectedPeriod,
        year: selectedYear.toString(),
      })

      const response = await fetch(`/api/btw-export/summary?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const result = await response.json()
        setPreviewData(result.data)
      } else {
        const errorBody = await response.json()
        dispatch(
          setAlert(
            errorBody.message || 'Fout bij laden voorvertoning',
            'danger',
          ),
        )
        setPreviewData(null)
      }
    } catch (error) {
      console.error('Fout bij laden voorvertoning:', error)
      dispatch(setAlert('Kon voorvertoning niet laden', 'danger'))
      setPreviewData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!selectedPeriod || !selectedYear) {
      dispatch(setAlert('Selecteer een periode en jaar', 'danger'))
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        periodType: selectedPeriodType,
        period: selectedPeriod,
        year: selectedYear.toString(),
        format: selectedFormat,
        includeDetails: includeDetails.toString(),
      })

      const response = await fetch(`/api/btw-export/export?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const blob = await response.blob()
        const contentDisposition = response.headers.get('Content-Disposition')
        const filename = contentDisposition
          ? contentDisposition.split('filename=')[1].replace(/"/g, '')
          : `btw-export-${selectedPeriodType}-${selectedPeriod}-${selectedYear}.${
              selectedFormat === 'excel' ? 'xlsx' : 'csv'
            }`

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        dispatch(setAlert('BTW export succesvol gedownload', 'success'))
      } else {
        const errorBody = await response.json()
        dispatch(setAlert(errorBody.message || 'Fout bij exporteren', 'danger'))
      }
    } catch (error) {
      console.error('Fout bij exporteren:', error)
      dispatch(setAlert('Kon export niet genereren', 'danger'))
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount || 0)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL')
  }

  const getPeriodLabel = () => {
    if (!periods || !selectedPeriod) return ''

    if (selectedPeriodType === 'monthly') {
      const month = periods.periods.monthly.find(
        (m) => m.value.toString() === selectedPeriod,
      )
      return month ? month.label : selectedPeriod
    } else if (selectedPeriodType === 'quarterly') {
      const quarter = periods.periods.quarterly.find(
        (q) => q.value === selectedPeriod,
      )
      return quarter ? quarter.label : selectedPeriod
    } else {
      return `Jaar ${selectedYear}`
    }
  }

  if (!periods) {
    return <div className="loading">Laden...</div>
  }

  return (
    <div className="vat-return-export">
      {nextDeadline && (
        <div className="box box-default mb-4">
          <div className="box-header with-border">
            <strong>⏰ Volgende BTW Deadline:</strong>{' '}
            {formatDate(nextDeadline.deadline)} - {nextDeadline.label}
            <br />
            <small className="text-muted">
              {nextDeadline.daysUntilDeadline} dagen resterend
            </small>
          </div>
        </div>
      )}

      <div className="panel panel-default">
        <div className="panel-heading">
          <h3 className="panel-title">Export Instellingen</h3>
        </div>
        <div className="panel-body">
          <div className="row">
            <div className="col-md-6">
              <div className="form-group">
                <label htmlFor="periodType">Periode Type</label>
                <select
                  id="periodType"
                  className="form-control"
                  value={selectedPeriodType}
                  onChange={(e) => setSelectedPeriodType(e.target.value)}
                >
                  {periods.periodTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="col-md-6">
              <div className="form-group">
                <label htmlFor="year">Jaar</label>
                <select
                  id="year"
                  className="form-control"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                >
                  {periods.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              <div className="form-group">
                <label htmlFor="period">Periode</label>
                <select
                  id="period"
                  className="form-control"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                >
                  <option value="">Selecteer periode</option>
                  {selectedPeriodType !== 'yearly' &&
                    periods.periods[selectedPeriodType]?.map((period) => (
                      <option key={period.value} value={period.value}>
                        {period.label}
                      </option>
                    ))}
                  {selectedPeriodType === 'yearly' && (
                    <option value={selectedYear}>Jaar {selectedYear}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="col-md-6">
              <div className="form-group">
                <label htmlFor="format">Export Formaat</label>
                <select
                  id="format"
                  className="form-control"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                >
                  <option value="excel">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-12">
              <div className="checkbox">
                <label>
                  <input
                    type="checkbox"
                    name="includeDetails"
                    checked={includeDetails}
                    onChange={(e) => setIncludeDetails(e.target.checked)}
                  />
                  Inclusief gedetailleerde factuur- en uitgavenlijsten
                </label>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={fetchPreview}
              disabled={loading || !selectedPeriod}
              className="btn btn-default"
            >
              {loading ? 'Laden...' : 'Voorvertoning'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || !selectedPeriod}
              className="btn btn-primary"
            >
              {loading ? 'Exporteren...' : 'Exporteren'}
            </button>
          </div>
        </div>

        {previewData && (
          <div className="preview-section">
            <div className="panel panel-default">
              <div className="panel-heading">
                <h3 className="panel-title">
                  Voorvertoning - {getPeriodLabel()} {selectedYear}
                </h3>
              </div>
              <div className="panel-body">
                <div className="row">
                  <div className="col-md-8">
                    <h4>BTW Overzicht</h4>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="label">Hoog tarief (21%):</span>
                        <span className="value">
                          € {formatCurrency(previewData.omzet.hoogTarief21.btw)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Laag tarief (9%):</span>
                        <span className="value">
                          € {formatCurrency(previewData.omzet.laagTarief9.btw)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Laagste tarief (6%):</span>
                        <span className="value">
                          €{' '}
                          {formatCurrency(previewData.omzet.laagsteTarief6.btw)}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Overige/verlegd (0%):</span>
                        <span className="value">
                          € {formatCurrency(previewData.omzet.overige.btw)}
                        </span>
                      </div>
                      <div className="summary-item total">
                        <span className="label">Totaal te betalen BTW:</span>
                        <span className="value">
                          € {formatCurrency(previewData.teBetalen)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <h4>Periode Informatie</h4>
                    <div className="period-info">
                      <p>
                        <strong>Periode:</strong> {getPeriodLabel()}{' '}
                        {selectedYear}
                      </p>
                      <p>
                        <strong>Van:</strong>{' '}
                        {formatDate(previewData.period.dateRange.start)}
                      </p>
                      <p>
                        <strong>Tot:</strong>{' '}
                        {formatDate(previewData.period.dateRange.end)}
                      </p>
                      <p>
                        <strong>Facturen:</strong> {previewData.invoiceCount}
                      </p>
                      <p>
                        <strong>Uitgaven:</strong> {previewData.expenseCount}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VATReturnExport
