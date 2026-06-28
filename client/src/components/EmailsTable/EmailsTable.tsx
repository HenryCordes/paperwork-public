import { useState, useEffect, ChangeEvent, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { confirmAlert } from 'react-confirm-alert'
// react-js-pagination ships no TypeScript types — needs shim (react-js-pagination)
import Pagination from 'react-js-pagination'
import 'react-confirm-alert/src/react-confirm-alert.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import NoEmailsFound from '../../components/NoEmailsFound/NoEmailsFound'
import { useEmails, useDeleteEmail } from '../../hooks/api'

interface EmailRow {
  _id: string
  emailNumber?: number | string
  emailDate?: string | Date
  subject?: string
  contactName?: string
  contactId?: string
}

interface EmailsTableProps {
  props?: { contactName?: string }
  history?: unknown
}

const EmailsTable = ({ props }: EmailsTableProps) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [queryString, setQueryString] = useState(`?offset=0`)

  const { data, isLoading, isError, error } = useEmails(queryString)

  const emails = data?.docs || []
  const pagination = data
    ? {
        totalDocs: data.totalDocs,
        limit: data.limit,
        offset: data.offset,
      }
    : { totalDocs: 0, limit: 10, offset: 0 }

  const deleteEmailMutation = useDeleteEmail()

  const removeEmail = (emailId: string) => {
    confirmAlert({
      title: 'Email verwijderen',
      message: 'Weet je zeker dat je de email wilt verwijderen?',
      buttons: [
        {
          label: 'Ja',
          onClick: () => deleteEmailMutation.mutate(emailId),
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
    const offset = pageNumber * 10 - 10
    const newQueryString = `?offset=${offset}${searchQuery ? `&search=${searchQuery}` : ''}`
    setQueryString(newQueryString)
  }

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const newQueryString = `?offset=0&search=${searchQuery}`
    setQueryString(newQueryString)
    setCurrentPage(1)
  }

  useEffect(() => {
    // Initial fetch happens automatically with React Query
  }, [])

  const renderEmails = () => {
    if (isLoading)
      return (
        <tr>
          <td colSpan={5}>Emails laden...</td>
        </tr>
      )
    if (isError)
      return (
        <tr>
          <td colSpan={5}>
            Fout bij het laden van emails:{' '}
            {(error as Error)?.message || 'Onbekende fout'}
          </td>
        </tr>
      )

    return emails.map((email: EmailRow) => (
      <tr key={email._id}>
        <td className="responsive-hidden">{email.emailNumber}</td>
        <td>
          {email.emailDate
            ? moment(new Date(email.emailDate)).format('yyyy-MM-DD')
            : ''}
        </td>
        <td className="responsive-hidden">{email.subject}</td>
        <td>
          {email && email.contactName
            ? email.contactName
            : email.contactId || ''}
        </td>
        <td>
          <Link
            className="icon-compose"
            to={'/email/edit/' + email._id}
            title="Aanpassen"
          >
            {' '}
          </Link>
          <span
            className="icon-trash"
            onClick={() => removeEmail(email._id)}
            title="Verwijderen"
          >
            {' '}
          </span>
        </td>
      </tr>
    ))
  }

  return !isLoading && (!emails || emails.length === 0) ? (
    <NoEmailsFound
      contactName={props && props.contactName ? props.contactName : ''}
    />
  ) : (
    <div>
      <h2 className="icon-envelope short" title="Emails">
        {' '}
      </h2>
      <Link
        className="icon-add white pull-right top-margin-28"
        to="/email/create"
        title="Nieuwe email"
      >
        {' '}
        Nieuwe email
      </Link>
      <div className="row">
        <div className="col-12">
          <div className="box box box-primary">
            <div className="box-header">
              <h3 className="box-title">
                Emails{' '}
                {props && props.contactName ? 'voor ' + props.contactName : ''}
              </h3>

              <div className="box-tools">
                <form onSubmit={handleSearch}>
                  <div
                    className="input-group input-group-sm"
                    style={{ maxWidth: '350px' }}
                  >
                    <input
                      type="text"
                      name="table_search"
                      className="form-control pull-right"
                      placeholder="Zoeken"
                      value={searchQuery}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setSearchQuery(e.target.value)
                      }
                    />

                    <div className="input-group-btn">
                      <button type="submit" className="btn btn-default search">
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            <div className="box-body table-responsive no-padding">
              <table className="table onelinertable table-hover">
                <tbody>
                  <tr>
                    <th>Nummer</th>
                    <th>Datum</th>
                    <th className="responsive-hidden">Omschrijving</th>
                    <th>Contact</th>
                    <th className="icon-header"></th>
                  </tr>
                  {renderEmails()}
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
    </div>
  )
}
export default EmailsTable
