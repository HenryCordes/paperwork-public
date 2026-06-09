import { useEffect, useState, KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { confirmAlert } from 'react-confirm-alert'
// react-js-pagination ships no TypeScript types — needs shim (react-js-pagination)
import Pagination from 'react-js-pagination'
import 'react-confirm-alert/src/react-confirm-alert.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import NoNotesFound from '../../components/NoNotesFound/NoNotesFound'
import { useAppDispatch } from '../../redux/hooks'
import { setAlert } from '../../redux/_actions/alertAction'
import { useNotesList, useDeleteNote } from '../../hooks/api'

interface NoteRow {
  _id: string
  noteNumber?: number | string
  noteDate?: string | Date
  description?: string
  contactName?: string
  contactId?: string
}

interface NotesTableProps {
  props?: { contactName?: string }
  history?: unknown
}

const NotesTable = ({ props }: NotesTableProps) => {
  const dispatch = useAppDispatch()
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const pageSize = 10

  const offset = (currentPage - 1) * pageSize
  const queryString = `?offset=${offset}${
    searchQuery ? `&search=${searchQuery}` : ''
  }`

  const {
    data: noteData,
    isLoading,
    isError,
    error,
  } = useNotesList(queryString)

  const notes = noteData?.docs || []
  const pagination = {
    totalDocs: noteData?.totalDocs || 0,
    limit: noteData?.limit || pageSize,
    page: noteData?.page || 1,
    offset: offset,
  }

  const { mutate: deleteNote } = useDeleteNote()

  const removeNote = (noteId: string) => {
    confirmAlert({
      title: 'Notitie verwijderen',
      message: 'Weet je zeker dat je de notitie wilt verwijderen?',
      buttons: [
        {
          label: 'Ja',
          onClick: () => deleteNote(noteId),
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

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearchQuery((e.target as HTMLInputElement).value)
      setCurrentPage(1)
    }
  }

  useEffect(() => {
    if (isError) {
      dispatch(
        setAlert(
          `Fout bij het laden van notities: ${
            (error as Error)?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
    }
  }, [isError, error, dispatch])

  const renderNotes = () => {
    return notes.map((note: NoteRow) => (
      <tr key={note._id}>
        <td className="responsive-hidden">{note.noteNumber}</td>
        <td>
          {note.noteDate
            ? moment(new Date(note.noteDate)).format('yyyy-MM-DD')
            : ''}
        </td>
        <td className="responsive-hidden">{note.description}</td>
        <td>
          {note && note.contactName ? note.contactName : note.contactId || ''}
        </td>
        <td>
          <Link
            className="icon-compose"
            to={'/note/edit/' + note._id}
            title="Aanpassen"
          >
            {' '}
          </Link>
          <span
            className="icon-trash"
            onClick={() => removeNote(note._id)}
            title="Verwijderen"
          >
            {' '}
          </span>
        </td>
      </tr>
    ))
  }

  return isLoading ? (
    <div className="loading">Notities worden geladen...</div>
  ) : notes.length < 1 ? (
    <NoNotesFound
      contactName={props && props.contactName ? props.contactName : ''}
    />
  ) : (
    <div>
      <h2 className="icon-list short" title="Notities">
        {' '}
      </h2>
      <Link
        className="icon-add white pull-right top-margin-28"
        to="/note/create"
        title="Nieuwe notitie"
      >
        {' '}
        Nieuwe notitie
      </Link>
      <div className="row">
        <div className="col-12">
          <div className="box box box-primary">
            <div className="box-header">
              <h3 className="box-title">
                Notities{' '}
                {props && props.contactName ? 'voor ' + props.contactName : ''}
              </h3>

              <div className="box-tools">
                <div
                  className="input-group input-group-sm"
                  style={{ maxWidth: '350px' }}
                >
                  <input
                    type="text"
                    name="table_search"
                    className="form-control pull-right"
                    placeholder="Zoeken"
                    onKeyPress={handleSearch}
                  />

                  <div className="input-group-btn">
                    <button type="submit" className="btn btn-default search">
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
                    <th>Datum</th>
                    <th className="responsive-hidden">Omschrijving</th>
                    <th>Contact</th>
                    <th className="icon-header"></th>
                  </tr>
                  {renderNotes()}
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
export default NotesTable
