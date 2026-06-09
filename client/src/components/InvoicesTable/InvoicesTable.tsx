import { useState } from 'react'
import { Link } from 'react-router-dom'
// react-js-pagination ships no TypeScript types — needs shim (react-js-pagination)
import Pagination from 'react-js-pagination'
import NoInvoicesFound from '../NoInvoicesFound/NoInvoicesFound'
import { confirmAlert } from 'react-confirm-alert'
import 'react-confirm-alert/src/react-confirm-alert.css'
import ListFilters from '../ListFilters/ListFilters'
import InvoiceExport from '../InvoiceExport/InvoiceExport'
import { useAppDispatch } from '../../redux/hooks'
import { setAlert } from '../../redux/_actions/alertAction'
import { useInvoicesList, useDeleteInvoice } from '../../hooks/api'

interface DateRange {
  startDate: string | null
  endDate: string | null
}

// Matches the shape expected by InvoiceExport; startDate/endDate may be Date or string
// when coming from ListFilters' custom period picker.
interface CustomPeriodFilter {
  type: string
  startDate: Date | string
  endDate: Date | string
}

type PeriodFilter = string | CustomPeriodFilter

interface InvoiceRow {
  _id: string
  invoiceNumber?: number | string
  invoiceDate: string | Date
  contactName?: string
  contactId?: string
  state?: string
}

interface InvoicesTableProps {
  props?: { contactName?: string }
  contactId?: string
}

function buildQueryString(
  page: number,
  contactId: string | undefined,
  search: string,
  dateRange: DateRange,
): string {
  const offset = page ? `?offset=${page * 10 - 10}` : '?offset=0'
  let query = offset

  if (contactId) {
    query += `&contactId=${contactId}`
  }

  if (search) {
    query += `&search=${encodeURIComponent(search)}`
  }

  if (dateRange && dateRange.startDate) {
    query += `&startDate=${dateRange.startDate}`
  }

  if (dateRange && dateRange.endDate) {
    query += `&endDate=${dateRange.endDate}`
  }

  return query
}

const InvoicesTable = ({ props, contactId }: InvoicesTableProps) => {
  const dispatch = useAppDispatch()
  let createNewUrl = '/invoice/create'
  if (contactId) {
    createNewUrl = `/invoice/create/${contactId}`
  }

  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
  })
  const [showExport, setShowExport] = useState(false)

  const queryString = buildQueryString(
    currentPage,
    contactId,
    searchTerm,
    dateRange,
  )

  const { data: invoiceData, isError, error } = useInvoicesList(queryString)

  const invoices = invoiceData?.docs || []
  const pagination = {
    totalDocs: invoiceData?.totalDocs || 0,
    limit: invoiceData?.limit || 10,
    offset: invoiceData?.offset || 0,
  }

  const deleteMutation = useDeleteInvoice()

  const removeInvoice = (invoiceId: string) => {
    confirmAlert({
      title: 'Factuur verwijderen',
      message: 'Weet je zeker dat je de factuur wilt verwijderen?',
      buttons: [
        {
          label: 'Ja',
          onClick: () => deleteMutation.mutate(invoiceId),
        },
        {
          label: 'Nee',
          onClick: () => {},
        },
      ],
    })
  }

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber)
  }

  const handleSearch = (query: string) => {
    setSearchTerm(query)
    setCurrentPage(1)
  }

  const handlePeriodChange = (
    periodPreset: PeriodFilter | null,
    newDateRange: DateRange,
  ) => {
    setPeriodFilter(periodPreset)
    setDateRange(newDateRange)
    setCurrentPage(1)
  }

  const toggleExport = () => {
    setShowExport(!showExport)
  }

  if (isError) {
    dispatch(
      setAlert(
        `Fout bij het laden van de facturen: ${
          (error as Error)?.message || 'Onbekende fout'
        }`,
        'danger',
      ),
    )
  }

  const renderInvoices = () => {
    return invoices.map((invoice: InvoiceRow) => (
      <tr key={invoice._id}>
        <td className="responsive-hidden">{invoice.invoiceNumber}</td>
        <td>{new Date(invoice.invoiceDate).toISOString().substr(0, 10)}</td>
        <td>
          {invoice && invoice.contactName
            ? invoice.contactName
            : invoice.contactId || ''}
        </td>
        <td>{invoice.state}</td>
        <td>
          <Link
            className="icon-compose"
            to={'/invoice/edit/' + invoice._id}
            title="Aanpassen"
          >
            {' '}
          </Link>
          <Link
            className="icon-calculator"
            to={'/invoice/details/' + invoice._id}
            title="Details"
          >
            {' '}
          </Link>
          <span
            className="icon-trash"
            onClick={() => removeInvoice(invoice._id)}
            title="Verwijderen"
          >
            {' '}
          </span>
        </td>
      </tr>
    ))
  }

  return (
    <>
      <div>
        <h2 className="icon-calculator short" title="Facturen">
          {' '}
        </h2>
        <Link
          className="icon-add white pull-right top-margin-28"
          to={createNewUrl}
          title="Nieuwe factuur"
        >
          Nieuwe factuur
        </Link>
        <ListFilters
          onSearch={handleSearch}
          onExportButtonClicked={toggleExport}
          onPeriodChanged={handlePeriodChange}
          hasPeriodFilter={!!periodFilter}
          initialSearchQuery={searchTerm}
        />

        <InvoiceExport
          isOpen={showExport}
          onClose={() => setShowExport(false)}
          searchQuery={searchTerm}
          periodFilter={periodFilter as string | undefined}
        />
        {invoices == null || invoices.length < 1 ? (
          <NoInvoicesFound />
        ) : (
          <div className="row">
            <div className="col-12">
              <div className="box box box-primary">
                <div className="box-header">
                  <h3 className="box-title">
                    Facturen{' '}
                    {props && props.contactName
                      ? 'voor ' + props.contactName
                      : ''}
                  </h3>

                  <div className="box-tools"></div>
                </div>
                <div className="box-body table-responsive no-padding">
                  <table className="table onelinertable table-hover">
                    <tbody>
                      <tr>
                        <th className="responsive-hidden">Nummer</th>
                        <th>Datum</th>
                        <th>Contact</th>
                        <th>Status</th>
                        <th className="icon-header"></th>
                      </tr>
                      {renderInvoices()}
                    </tbody>
                  </table>
                  <div className="text-center">
                    <Pagination
                      activePage={currentPage}
                      itemsCountPerPage={10}
                      totalItemsCount={pagination.totalDocs}
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
    </>
  )
}
export default InvoicesTable
