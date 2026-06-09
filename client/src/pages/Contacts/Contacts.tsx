import { useState } from 'react'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import NoContactFound from '../../components/NoContactFound/NoContactFound'
import { Link } from 'react-router-dom'
import { confirmAlert } from 'react-confirm-alert'
import Pagination from 'react-js-pagination'
import 'react-confirm-alert/src/react-confirm-alert.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { useContacts, useDeleteContact } from '../../hooks/api'

interface ContactRow {
  _id: string
  contactNumber?: number | string
  typeName?: string
  lastName?: string
  firstName?: string
  companyName?: string
  emailAddress?: string
  city?: string
}

const Contacts = () => {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')

  const offset = (currentPage - 1) * 10
  const queryString = searchQuery
    ? `offset=${offset}&search=${searchQuery}`
    : `offset=${offset}`

  const { data, isLoading, isError, error } = useContacts(queryString)

  const contacts = data?.docs || []
  const pagination = data || { totalDocs: 0 }

  const deleteContactMutation = useDeleteContact()

  const removeContact = (contactId: string) => {
    confirmAlert({
      title: 'Contact verwijderen',
      message: 'Weet je zeker dat je dit contact wilt verwijderen?',
      buttons: [
        {
          label: 'Ja',
          onClick: () => deleteContactMutation.mutate(contactId),
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

  const handleSearch = (
    e:
      | React.KeyboardEvent<HTMLInputElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    if ((e as React.KeyboardEvent).key === 'Enter' || e.type === 'click') {
      const input = document.querySelector<HTMLInputElement>(
        'input[name="table_search"]',
      )
      setSearchQuery(input?.value ?? '')
      setCurrentPage(1)
    }
  }

  const renderContacts = () => {
    return contacts.map((contact: ContactRow) => (
      <tr key={contact._id}>
        <td>{contact.contactNumber}</td>
        <td className="responsive-hidden">
          {contact.typeName === 'Particulier'
            ? contact.lastName + ', ' + contact.firstName
            : contact.companyName}
        </td>
        <td>{contact.emailAddress}</td>
        <td className="responsive-hidden">{contact.city}</td>
        <td className="responsive-hidden">{contact.typeName}</td>
        <td>
          <Link
            className="icon-compose"
            to={'/contact/edit/' + contact._id}
            title="Aanpassen"
          >
            {' '}
          </Link>
          <Link
            className="icon-calculator"
            to={'/invoice/create/' + contact._id}
            title="Nieuwe factuur"
          >
            {' '}
          </Link>
          <span
            className="icon-trash"
            onClick={() => removeContact(contact._id)}
            title="Verwijderen"
          >
            {' '}
          </span>
        </td>
      </tr>
    ))
  }

  if (isLoading) {
    return (
      <div>
        <SideBar />
        <div className="body-content content-wrapper">
          <div className="loading-indicator">Laden...</div>
          <Footer />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <SideBar />
        <div className="body-content content-wrapper">
          <div className="error-message">
            Er is een fout opgetreden:{' '}
            {(error as Error)?.message || 'Onbekende fout'}
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  return contacts.length < 1 ? (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <NoContactFound />
        <Footer />
      </div>
    </div>
  ) : (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <h2 className="icon-users short" title="Contacten/klanten">
          {' '}
        </h2>
        <Link
          className="icon-add white pull-right top-margin-28"
          to="/contact/create"
          title="Nieuwe klant"
        >
          {' '}
          Nieuw contact
        </Link>
        <div className="row">
          <div className="col-12">
            <div className="box box box-primary">
              <div className="box-header">
                <h3 className="box-title">Contacten</h3>

                <div className="box-tools">
                  <div
                    className="input-group input-group-sm"
                    style={{ maxWidth: '350px' }}
                  >
                    <input
                      type="search"
                      name="table_search"
                      className="form-control pull-right"
                      placeholder="Zoeken"
                      onKeyPress={
                        handleSearch as React.KeyboardEventHandler<HTMLInputElement>
                      }
                    />

                    <div className="input-group-btn">
                      <button
                        type="button"
                        className="btn btn-default search"
                        onClick={
                          handleSearch as React.MouseEventHandler<HTMLButtonElement>
                        }
                      >
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="box-body table-responsive no-padding">
                <table className="table onelinertable table-hover">
                  <tbody>
                    <tr>
                      <th>Nummer</th>
                      <th className="responsive-hidden">Naam</th>
                      <th>Email</th>
                      <th className="responsive-hidden">Plaats</th>
                      <th className="responsive-hidden">Type</th>
                      <th className="icon-header"></th>
                    </tr>
                    {renderContacts()}
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
                  {deleteContactMutation.isPending && (
                    <div className="mt-3 text-center">Verwijderen...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}
export default Contacts
