import { useState } from 'react'
import { Button, Row, Col } from 'react-bootstrap'
import { useAppDispatch } from '../../redux/hooks'
import { setAlert } from '../../redux/_actions/alertAction'
import { useFinancialSummary } from '../../hooks/api/useExport'

interface ExportSummaryProps {
  onClose: () => void
}

const ExportSummary = ({ onClose }: ExportSummaryProps) => {
  const dispatch = useAppDispatch()
  const [year, setYear] = useState(new Date().getFullYear())
  const [format, setFormat] = useState('xlsx')
  const [isExporting, setIsExporting] = useState(false)

  const currentYear = new Date().getFullYear()
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - i)

  const { refetch } = useFinancialSummary(
    { year: String(year), format },
    { enabled: false, refetchOnWindowFocus: false },
  )

  const handleExport = async () => {
    try {
      setIsExporting(true)

      const { data } = await refetch()

      if (!data) {
        throw new Error('Geen export data ontvangen')
      }

      const url = window.URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Inkomsten_en_onkosten_${year}.${format}`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      dispatch(setAlert('Export succesvol gedownload', 'success'))
    } catch (error) {
      console.error('Export error:', error)
      dispatch(
        setAlert(
          `Fout bij exporteren: ${(error as Error).message || 'Onbekende fout'}`,
          'danger',
        ),
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="box box-default mb-4">
      <div className="box-header with-border">
        <h3 className="box-title">Financieel Jaaroverzicht Exporteren</h3>
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
          Exporteer een jaaroverzicht van inkomsten en uitgaven per kwartaal.
          Handig voor belastingaangifte en financiële rapportage.
        </p>

        <div>
          <Row className="align-items-end mb-3">
            <Col xs={12} md={4}>
              <div className="mb-3 mb-md-0 column">
                <label htmlFor="year-select" className="form-label">
                  Jaar
                </label>
                <select
                  id="year-select"
                  className="form-select"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </Col>

            <Col xs={12} md={4}>
              <div className="mb-3 mb-md-0 column">
                <label htmlFor="format-select" className="form-label">
                  Formaat
                </label>
                <select
                  id="format-select"
                  className="form-select"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </select>
              </div>
            </Col>

            <Col xs={12} md={4}>
              <Button
                variant="primary"
                onClick={handleExport}
                disabled={isExporting}
                className="w-100"
              >
                {isExporting ? (
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
              </Button>
            </Col>
          </Row>
        </div>

        <div className="bg-light p-2 rounded small">
          <p className="mb-1">
            <strong>Het overzicht bevat:</strong>
          </p>
          <ul className="mb-0">
            <li>Netto inkomsten per kwartaal en totaal</li>
            <li>Betaalde en onbetaalde facturen</li>
            <li>Netto uitgaven per kwartaal en totaal</li>
            <li>Marge berekening (inkomsten minus uitgaven)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ExportSummary
