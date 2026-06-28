import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Row, Col } from 'react-bootstrap'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { faFileExport } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { setAlert } from '../../redux/_actions/alertAction'
import { useDashboard } from '../../hooks/api/useDashboard'
import ExportSummary from '../../components/ExportSummary/ExportSummary'
import { PERIOD_PRESETS, PERIOD_TYPES } from '../../common/constants'
import { AppDispatch } from '../../redux/types'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
)

const Dashboard = () => {
  const dispatch = useDispatch<AppDispatch>()
  const [periodType, setPeriodType] = useState(PERIOD_TYPES.MONTHLY)
  const [periodPreset, setPeriodPreset] = useState(PERIOD_PRESETS.THIS_YEAR)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [showExportYearReport, setShowExportYearReport] = useState(false)

  // Use the React Query hook for dashboard data
  const {
    data: dashboardData,
    isLoading,
    error,
  } = useDashboard({
    periodType,
    periodPreset,
    startDate,
    endDate,
  })

  // Display error if there's an issue loading dashboard data
  useEffect(() => {
    if (error) {
      dispatch(
        setAlert(
          `Fout bij laden van dashboard data: ${(error as Error).message}`,
          'danger',
        ),
      )
    }
  }, [error, dispatch])

  // Handle filter changes
  const handlePeriodTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPeriodType(e.target.value)
  }

  const handlePeriodPresetChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setPeriodPreset(e.target.value)
    // Clear custom dates when using a preset
    setStartDate(null)
    setEndDate(null)
  }

  // Show error if API request failed
  if (error) {
    dispatch(
      setAlert(
        `Error loading dashboard data: ${(error as Error).message || 'Unknown error'}`,
        'danger',
      ),
    )
  }

  // Use real-time summary metrics if available (for yearly view), otherwise calculate from rawData
  // This ensures consistency with export summary data
  const totalRevenue =
    dashboardData?.summaryMetrics?.totalRevenue !== undefined
      ? dashboardData.summaryMetrics.totalRevenue
      : dashboardData?.rawData?.reduce(
          (sum: number, period: { totalRevenue?: number }) =>
            sum + (period.totalRevenue || 0),
          0,
        ) || 0

  const totalExpenses =
    dashboardData?.summaryMetrics?.totalExpenses !== undefined
      ? dashboardData.summaryMetrics.totalExpenses
      : dashboardData?.rawData?.reduce(
          (sum: number, period: { totalExpenses?: number }) =>
            sum + (period.totalExpenses || 0),
          0,
        ) || 0

  // Use pre-calculated netProfit if available, otherwise calculate
  const profit =
    dashboardData?.summaryMetrics?.netProfit !== undefined
      ? dashboardData.summaryMetrics.netProfit
      : totalRevenue - totalExpenses

  // Profit/Loss pie chart data
  const profitLossData = {
    labels: ['Omzet', 'Uitgaven'],
    datasets: [
      {
        data: [totalRevenue, totalExpenses],
        backgroundColor: ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)'],
        borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)'],
        borderWidth: 1,
      },
    ],
  }

  // Chart configuration for revenue and expenses
  const revenueExpenseChartData = {
    labels: dashboardData?.labels || [],
    datasets: [
      {
        label: 'Omzet',
        data: dashboardData?.turnover || [],
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        tension: 0.4,
      },
      {
        label: 'Uitgaven',
        data: dashboardData?.expenses || [],
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
        tension: 0.4,
      },
    ],
  }

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Financieel Overzicht',
      },
      tooltip: {
        callbacks: {
          label: function (context: {
            dataset: { label?: string }
            parsed: { y: number | null }
          }) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('nl-NL', {
                style: 'currency',
                currency: 'EUR',
              }).format(context.parsed.y)
            }
            return label
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: number | string) {
            return new Intl.NumberFormat('nl-NL', {
              style: 'currency',
              currency: 'EUR',
              maximumSignificantDigits: 3,
            }).format(Number(value))
          },
        },
      },
    },
  }

  // Get period label for display
  const getPeriodLabel = () => {
    // If using a preset period, return that label
    if (periodPreset && periodPreset !== PERIOD_PRESETS.CUSTOM) {
      switch (periodPreset) {
        case PERIOD_PRESETS.LAST_MONTH:
          return 'Overzicht Afgelopen Maand'
        case PERIOD_PRESETS.LAST_THREE_MONTHS:
          return 'Overzicht Afgelopen 3 Maanden'
        case PERIOD_PRESETS.LAST_TWELVE_MONTHS:
          return 'Overzicht Afgelopen 12 Maanden'
        case PERIOD_PRESETS.THIS_YEAR:
          return 'Overzicht Dit Jaar'
        case PERIOD_PRESETS.LAST_YEAR:
          return 'Overzicht Vorig Jaar'
        default:
          return 'Financieel Overzicht'
      }
    }

    // Otherwise, use the period type
    switch (periodType) {
      case PERIOD_TYPES.DAILY:
        return 'Dagelijks Overzicht'
      case PERIOD_TYPES.MONTHLY:
        return 'Maandelijks Overzicht'
      case PERIOD_TYPES.QUARTERLY:
        return 'Kwartaal Overzicht'
      case PERIOD_TYPES.YEARLY:
        return 'Jaarlijks Overzicht'
      default:
        return 'Financieel Overzicht'
    }
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper dashboard">
        <h2 className="icon-newspaper short" title="Dashboard">
          {' '}
        </h2>
        <div className="pull-right top-padding-12 no-margin">
          <button
            className="btn filter-button"
            onClick={() => {
              setShowExportYearReport(!showExportYearReport)
            }}
            title="Exporteren"
          >
            <FontAwesomeIcon icon={faFileExport} />
          </button>
        </div>

        <div className="dashboard-container">
          {showExportYearReport && (
            <Row>
              <Col md={12}>
                <ExportSummary onClose={() => setShowExportYearReport(false)} />
              </Col>
            </Row>
          )}

          {/* Period Filter Section */}
          <Row className="mb-4">
            <Col md={12}>
              <div className="filter-card shadow-sm p-3 bg-white">
                <div className="mb-3">
                  <label htmlFor="periodType" className="form-label">
                    Per
                  </label>
                  <select
                    id="periodType"
                    className="form-control"
                    value={periodType}
                    onChange={handlePeriodTypeChange}
                  >
                    <option value={PERIOD_TYPES.DAILY}>Dag</option>
                    <option value={PERIOD_TYPES.MONTHLY}>Maand</option>
                    <option value={PERIOD_TYPES.QUARTERLY}>Kwartaal</option>
                    <option value={PERIOD_TYPES.YEARLY}>Jaar</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label htmlFor="periodPreset" className="form-label">
                    Periode
                  </label>
                  <select
                    id="periodPreset"
                    className="form-control"
                    value={periodPreset}
                    onChange={handlePeriodPresetChange}
                  >
                    <option value={PERIOD_PRESETS.LAST_MONTH}>
                      Afgelopen Maand
                    </option>
                    <option value={PERIOD_PRESETS.LAST_THREE_MONTHS}>
                      Afgelopen 3 Maanden
                    </option>
                    <option value={PERIOD_PRESETS.LAST_TWELVE_MONTHS}>
                      Afgelopen 12 Maanden
                    </option>
                    <option value={PERIOD_PRESETS.THIS_YEAR}>Dit Jaar</option>
                    <option value={PERIOD_PRESETS.LAST_YEAR}>Vorig Jaar</option>
                    <option value={PERIOD_PRESETS.CUSTOM}>
                      Aangepaste Periode
                    </option>
                  </select>
                </div>

                {periodPreset === PERIOD_PRESETS.CUSTOM && (
                  <Row className="mt-3">
                    <Col md={6}>
                      <div className="mb-3">
                        <label htmlFor="startDate" className="form-label">
                          Startdatum
                        </label>
                        <input
                          type="date"
                          id="startDate"
                          className="form-control"
                          value={startDate || ''}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="mb-3">
                        <label htmlFor="endDate" className="form-label">
                          Einddatum
                        </label>
                        <input
                          type="date"
                          id="endDate"
                          className="form-control"
                          value={endDate || ''}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </Col>
                  </Row>
                )}
              </div>
            </Col>
          </Row>

          {/* Financial Summary Cards */}
          <Row className="mb-4">
            <Col md={4}>
              <div className="summary-card h-100 shadow-sm p-3 bg-white text-center">
                <h5 className="text-primary">Omzet</h5>
                <h2 className="mb-0">
                  {new Intl.NumberFormat('nl-NL', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(totalRevenue)}
                </h2>
              </div>
            </Col>
            <Col md={4}>
              <div className="summary-card h-100 shadow-sm p-3 bg-white text-center">
                <h5 className="text-danger">Uitgaven</h5>
                <h2 className="mb-0">
                  {new Intl.NumberFormat('nl-NL', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(totalExpenses)}
                </h2>
              </div>
            </Col>
            <Col md={4}>
              <div className="summary-card h-100 shadow-sm p-3 bg-white text-center">
                <h5 className={profit >= 0 ? 'text-success' : 'text-danger'}>
                  {profit >= 0 ? 'Winst' : 'Verlies'}
                </h5>
                <h2 className="mb-0">
                  {new Intl.NumberFormat('nl-NL', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(profit)}
                </h2>
              </div>
            </Col>
          </Row>

          {/* Charts */}
          <Row>
            <Col md={8}>
              <div className="chart-card shadow-sm p-3 bg-white">
                <h5>{getPeriodLabel()}</h5>
                <div style={{ height: '350px' }}>
                  {isLoading ? (
                    <div className="text-center p-5">Loading chart data...</div>
                  ) : (
                    <Bar
                      data={revenueExpenseChartData}
                      options={chartOptions}
                    />
                  )}
                </div>
              </div>
            </Col>
            <Col md={4}>
              <div className="chart-card shadow-sm h-100 p-3 bg-white">
                <h5>Omzet vs Uitgaven</h5>
                <div style={{ height: '350px' }}>
                  {isLoading ? (
                    <div className="text-center p-5">Loading chart data...</div>
                  ) : (
                    <Pie
                      data={profitLossData}
                      options={{
                        maintainAspectRatio: false,
                        plugins: {
                          tooltip: {
                            callbacks: {
                              label: function (context: {
                                label?: string
                                parsed: number | null
                              }) {
                                let label = context.label || ''
                                if (label) {
                                  label += ': '
                                }
                                if (context.parsed !== null) {
                                  label += new Intl.NumberFormat('nl-NL', {
                                    style: 'currency',
                                    currency: 'EUR',
                                  }).format(context.parsed)
                                }
                                return label
                              },
                            },
                          },
                        },
                      }}
                    />
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </div>

        <Footer />
      </div>
    </div>
  )
}

export default Dashboard
