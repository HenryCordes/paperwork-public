import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { useForm } from 'react-hook-form'
import { useParams, useNavigate } from 'react-router-dom'
import moment from 'moment'
import { AppDispatch } from '../../redux/types'

// React Query imports
import {
  useNote,
  useCreateOrUpdateNote,
  useContactsByType,
} from '../../hooks/api'

interface NoteState {
  _id: string
  owner: string
  noteDate: string
  description: string
  contactId: string
  contactName: string
}

interface Contact {
  _id: string
  typeName: string
  firstName?: string
  lastName?: string
  companyName?: string
}

const Note = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  // Use React Query for data fetching
  const isCreateMode = window.location.pathname === '/note/create'
  const noteId = isCreateMode ? null : id

  const {
    data: dbNote,
    isError: isNoteError,
    error: noteError,
  } = useNote(noteId as string, {
    enabled: !isCreateMode,
    onSuccess: (data: Record<string, unknown>) => {
      if (data) {
        const formattedNote = {
          ...data,
          noteDate: moment(new Date(data.noteDate as string)).format(
            'yyyy-MM-DD',
          ),
        }
        reset(formattedNote)
      }
    },
  })

  const {
    data: contacts,
    isError: isContactsError,
    error: contactsError,
  } = useContactsByType('Klant')

  const [note, setNote] = useState<NoteState>({
    _id: '',
    owner: '',
    noteDate: '',
    description: '',
    contactId: '',
    contactName: '',
  })

  // React Query mutation hook
  const { mutate: saveNote } = useCreateOrUpdateNote()

  const onChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => setNote({ ...note, [e.target.name]: e.target.value })

  const onSubmit = (data: Record<string, unknown>) => {
    if (data.noteDate === '' || data.description === '') {
      dispatch(
        setAlert(
          'Notitiedatum en omschrijving zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    } else {
      if (!isCreateMode) {
        data._id = dbNote._id
      }
      if (data.contactId) {
        const contact = (contacts as Contact[])?.find(
          (c) => c._id === data.contactId,
        )
        if (contact) {
          data.contactName =
            contact.typeName === 'Particulier'
              ? contact.lastName + ', ' + contact.firstName
              : contact.companyName
        }
      }
      // Use React Query mutation instead of Redux action
      saveNote(data, {
        onSuccess: () => {
          navigate('/notes')
        },
      })
    }
  }

  // Handle React Query errors with Redux alerts
  useEffect(() => {
    if (isNoteError) {
      dispatch(
        setAlert(
          `Fout bij het laden van de notitie: ${
            (noteError as Error)?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
    }
    if (isContactsError) {
      dispatch(
        setAlert(
          `Fout bij het laden van contacten: ${
            (contactsError as Error)?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
    }
  }, [isNoteError, noteError, isContactsError, contactsError, dispatch])

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <form onSubmit={handleSubmit(onSubmit)}>
          <h2 className="icon-list short" title="Notities">
            {' '}
          </h2>
          <div className="row">
            <div className="col-md-12">
              <div className="box box-primary">
                <div className="box-header with-border">
                  <h3 className="box-title">Notitie</h3>
                </div>

                <div className="box-body">
                  {dbNote && dbNote.noteNumber ? (
                    <div className="form-group required row">
                      <label className="col-form-label col-4 form-label">
                        Nummer
                      </label>
                      <div className="col-8 contact-number">
                        {dbNote ? dbNote.noteNumber : ''}
                      </div>
                    </div>
                  ) : (
                    ''
                  )}

                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Contact
                    </label>
                    <div className="col-8">
                      <select
                        {...register('contactId', { required: true, onChange })}
                        defaultValue={dbNote ? dbNote.contactId : ''}
                        style={{
                          border: errors.contactId ? '2px solid #D0021B' : '',
                        }}
                      >
                        <option value="">Selecteer een contact...</option>
                        {contacts && (contacts as Contact[]).length > 0
                          ? (contacts as Contact[]).map((contact) => (
                              <option key={contact._id} value={contact._id}>
                                {contact.typeName === 'Particulier'
                                  ? contact.lastName + ', ' + contact.firstName
                                  : contact.companyName}
                              </option>
                            ))
                          : ''}
                      </select>
                      {errors.contactId && (
                        <span className="error">Kies een contact</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Notitiedatum
                    </label>
                    <div className="col-8">
                      <input
                        type="date"
                        className="form-control"
                        placeholder="Notitiedatum"
                        defaultValue={
                          dbNote
                            ? moment(new Date(dbNote.noteDate)).format(
                                'yyyy-MM-DD',
                              )
                            : new Date().toISOString().substr(0, 10)
                        }
                        {...register('noteDate', { required: true, onChange })}
                        style={{
                          border: errors.noteDate ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.noteDate && (
                        <span className="error">Voer een notitiedatum in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Omschrijving
                    </label>
                    <div className="col-8">
                      <textarea
                        className="form-control"
                        placeholder="Omschrijving"
                        defaultValue={dbNote ? dbNote.description : ''}
                        {...register('description', {
                          required: true,
                          onChange,
                        })}
                        style={{
                          border: errors.description ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.description && (
                        <span className="error">Voer een omschrijving in</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="box-footer">
                  <button type="submit" className="btn btn-primary">
                    Opslaan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        <Footer />
      </div>
    </div>
  )
}
export default Note
