import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
// react-js-pagination ships no TypeScript types — needs shim (react-js-pagination)
import Pagination from 'react-js-pagination'
import NoExpensesFound from '../NoExpensesFound/NoExpensesFound'
import { confirmAlert } from 'react-confirm-alert'
import 'react-confirm-alert/src/react-confirm-alert.css'
import moment from 'moment'
import { useAppDispatch } from '../../redux/hooks'
import { setAlert } from '../../redux/_actions/alertAction'
import ExpenseExport from '../ExpenseExport/ExpenseExport'
import ListFilters from '../ListFilters/ListFilters'
import { useExpensesList, useDeleteExpense } from '../../hooks/api'

interface DateRange {
  startDate: string | null
  endDate: string | null
}

// Matches the shape expected by ExpenseExport; startDate/endDate may be Date or string
// when coming from ListFilters' custom period picker.
interface CustomPeriodFilter {
  type: string
  startDate: Date | string
  endDate: Date | string
}

type PeriodFilter = string | CustomPeriodFilter

interface ExpenseRow {
  _id: string
  expenseNumber?: number | string
  expenseDate?: string | Date
  info?: string
}

interface ExpensesTableProps {
  props?: { contactName?: string }
}

const ExpensesTable = ({ props }: ExpensesTableProps) => {
  const dispatch = useAppDispatch()
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter | null>(null)

  const offset = (currentPage - 1) * 10

  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  })

  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')

  let queryParams = [`offset=${offset}`]

  if (dateRange.startDate && dateRange.endDate) {
    queryParams.push(`startDate=${dateRange.startDate}`)
    queryParams.push(`endDate=${dateRange.endDate}`)
  }

  const baseQueryString = `?${queryParams.join('&')}`

  const queryString = appliedSearchQuery
    ? `${baseQueryString}&search=${appliedSearchQuery}`
    : baseQueryString

  const { data, isError, error } = useExpensesList(queryString)

  const expenses = data?.docs || []
  const pagination = data || { totalDocs: 0 }

  const deleteExpenseMutation = useDeleteExpense()

  const removeExpense = (expenseId: string) => {
    confirmAlert({
      title: 'Kosten verwijderen',
      message: 'Weet je zeker dat je deze kosten wilt verwijderen?',
      buttons: [
        {
          label: 'Ja',
          onClick: () => deleteExpenseMutation.mutate(expenseId),
        },
        {
          label: 'Nee',
          onClick: () => {},
        },
      ],
    })
  }

  const handlePageChange = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber)
  }, [])

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)

      if (query.length >= 3) {
        setAppliedSearchQuery(query)

        if (currentPage !== 1) {
          setCurrentPage(1)
        }
      } else if (query === '') {
        setAppliedSearchQuery('')

        if (currentPage !== 1) {
          setCurrentPage(1)
        }
      }
    },
    [currentPage],
  )

  const handlePeriodChange = useCallback(
    (period: PeriodFilter | null, range: DateRange) => {
      setPeriodFilter(period)
      setDateRange(range || { startDate: null, endDate: null })
      setCurrentPage(1)
    },
    [],
  )

  const handleExportButtonClick = useCallback(() => {
    setExportModalOpen((prev) => !prev)
  }, [])

  const renderExpenses = () => {
    return expenses.map((expense: ExpenseRow) => (
      <tr key={expense._id}>
        <td className="">{expense.expenseNumber}</td>
        <td>
          {expense.expenseDate
            ? moment(new Date(expense.expenseDate)).format('yyyy-MM-DD')
            : ''}
        </td>
        <td className="responsive-hidden">{expense.info}</td>
        <td className="nowrap">
          <Link
            className="icon-compose"
            to={'/expense/edit/' + expense._id}
            title="Aanpassen"
          >
            {' '}
          </Link>
          <span
            className="icon-trash"
            onClick={() => removeExpense(expense._id)}
            title="Verwijderen"
          >
            {' '}
          </span>
        </td>
      </tr>
    ))
  }

  useEffect(() => {
    if (isError) {
      dispatch(
        setAlert(
          `Er is een fout opgetreden: ${(error as Error)?.message || 'Onbekende fout'}`,
          'danger',
        ),
      )
    }
  }, [isError, error, dispatch])

  return (
    <div>
      <h2 className="icon-store short" title="Kosten">
        {' '}
      </h2>
      <Link
        className="icon-add white pull-right top-margin-28"
        to="/expense/create"
        title="Nieuwe kosten"
      >
        Nieuwe kosten
      </Link>

      <ListFilters
        onSearch={handleSearch}
        onExportButtonClicked={handleExportButtonClick}
        onPeriodChanged={handlePeriodChange}
        hasPeriodFilter={!!periodFilter}
        initialSearchQuery={searchQuery}
      />

      <ExpenseExport
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        searchQuery={searchQuery}
        periodFilter={periodFilter as string | undefined}
      />

      {expenses.length < 1 ? (
        <NoExpensesFound
          contactName={props && props.contactName ? props.contactName : ''}
        />
      ) : (
        <div className="row">
          <div className="col-12">
            <div className="box box box-primary">
              <div className="box-header">
                <h3 className="box-title">Kosten</h3>
              </div>
              <div className="box-body table-responsive no-padding">
                <table className="table onelinertable table-hover">
                  <tbody>
                    <tr>
                      <th className="">Nummer</th>
                      <th>Datum</th>
                      <th className="responsive-hidden">Omschrijving</th>
                      <th className="icon-header"></th>
                    </tr>
                    {renderExpenses()}
                  </tbody>
                </table>
                <div className="text-center">
                  <Pagination
                    activePage={currentPage}
                    itemsCountPerPage={10}
                    totalItemsCount={pagination.totalDocs || 0}
                    pageRangeDisplayed={5}
                    onChange={handlePageChange}
                    itemClass="page-item"
                    linkClass="page-link"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ExpensesTable
