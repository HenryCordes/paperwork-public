import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { Editor } from '@tinymce/tinymce-react'
import { useForm } from 'react-hook-form'
import { useParams, useLocation } from 'react-router-dom'
import moment from 'moment'
import { AppDispatch } from '../../redux/types'

import {
  useEmail,
  useCreateOrUpdateEmail,
  useSendEmail,
  useContactsByType,
  useInvoicesList,
} from '../../hooks/api'

interface EmailState {
  _id: string
  owner: string
  emailDate: string
  subject: string
  body: string
  send: string
  invoiceId: string
  invoiceNumber: string
  invoiceInfo: string
  contactId: string
  contactName: string
  contactEmai: string
}

interface Contact {
  _id: string
  typeName: string
  firstName?: string
  lastName?: string
  companyName?: string
  emailAddress?: string
}

interface Invoice {
  _id: string
  invoiceNumber: string
}

const Email = () => {
  // Get URL params and location
  const { id, invoiceId } = useParams<{ id?: string; invoiceId?: string }>()
  const location = useLocation()
  const isCreateMode = location.pathname === '/email/create'
  const isSendInvoiceMode = location.pathname.startsWith('/invoice/send/')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  const dispatch = useDispatch<AppDispatch>()

  const {
    data: dbEmail,
    isLoading: emailLoading,
    isError: emailError,
    error: emailLoadError,
  } = useEmail(id as string, {
    enabled: !isCreateMode && !isSendInvoiceMode && Boolean(id),
  })

  const { data: contacts = [] } = useContactsByType('Klant')
  const { data: invoiceData } = useInvoicesList()
  const invoices: Invoice[] = invoiceData?.docs || []

  const createUpdateEmailMutation = useCreateOrUpdateEmail()
  const sendEmailMutation = useSendEmail()
  const [bodyIsValid, setBodyIsValid] = useState(true)
  const [email, setEmail] = useState<EmailState>({
    _id: '',
    owner: '',
    emailDate: '',
    subject: '',
    body: '',
    send: '',
    invoiceId: '',
    invoiceNumber: '',
    invoiceInfo: '',
    contactId: '',
    contactName: '',
    contactEmai: '',
  })

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setEmail({ ...email, [e.target.name]: e.target.value })

  const completeData = (data: Record<string, unknown>) => {
    if (!isCreateMode && dbEmail) {
      data._id = dbEmail._id
    }
    if (data.contactId) {
      const contact = (contacts as Contact[]).find(
        (c) => c._id === data.contactId,
      )
      if (contact) {
        data.contactName =
          contact.typeName === 'Particulier'
            ? contact.lastName + ', ' + contact.firstName
            : contact.companyName
        data.contactEmail = contact.emailAddress
      }
    }
    return data
  }

  const resetForm = (formValues: Record<string, unknown>) => {
    if (formValues) {
      formValues.emailDate = moment(
        new Date(formValues.emailDate as string),
      ).format('yyyy-MM-DD')
      reset(formValues)
      setEmail({ ...email, body: formValues.body as string })
    }
  }

  const sendInvoice = handleSubmit((data) => {
    data.body = email.body
    let isValid = email.body !== ''
    setBodyIsValid(isValid)
    if (
      data.emailDate === '' ||
      data.subject === '' ||
      data.body === '' ||
      data.send === ''
    ) {
      dispatch(
        setAlert(
          'Emaildatum, titel, bericht en verzonden zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    } else {
      try {
        const fields = completeData(data)
        sendEmailMutation.mutate(fields, {
          onSuccess: (inv: Record<string, unknown>) => {
            resetForm(inv)
          },
        })
      } catch (error) {
        console.error('Error sending email:', error)
      }
    }
  })

  const onSubmit = (data: Record<string, unknown>) => {
    data.body = email.body
    let isValid = email.body !== ''
    setBodyIsValid(isValid)
    if (
      data.emailDate === '' ||
      data.subject === '' ||
      data.body === '' ||
      data.send === ''
    ) {
      dispatch(
        setAlert(
          'Emaildatum, titel, bericht en verzonden zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    } else {
      try {
        const fields = completeData(data)
        createUpdateEmailMutation.mutate(fields)
      } catch (error) {
        console.error('Error saving email:', error)
      }
    }
  }

  const handleEditorChange = (content: string) => {
    if (content !== '') {
      setBodyIsValid(true)
    }
    setEmail({ ...email, body: content })
  }

  useEffect(() => {
    // React Query automatically fetches the data when the component mounts
    // based on the hooks we've used above

    // Reset form when email data is loaded
    if (dbEmail && !isCreateMode && !isSendInvoiceMode) {
      resetForm(dbEmail)
    }

    //TODO: Vanuit Factuur Details verstuurd
    if (invoiceId) {
      const dataToChange = { invoiceId: invoiceId }
      reset(dataToChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show loading and error states
  if (emailLoading && !isCreateMode && !isSendInvoiceMode) {
    return (
      <div>
        <SideBar />
        <div className="body-content content-wrapper">
          <div className="loading">Email laden...</div>
          <Footer />
        </div>
      </div>
    )
  }

  if (emailError && !isCreateMode && !isSendInvoiceMode) {
    return (
      <div>
        <SideBar />
        <div className="body-content content-wrapper">
          <div className="error-message">
            Fout bij het laden van de email:{' '}
            {(emailLoadError as Error)?.message || 'Onbekende fout'}
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  // Show loading overlays for mutations
  const showSavingOverlay = createUpdateEmailMutation.isPending
  const showSendingOverlay = sendEmailMutation.isPending

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        {/* Show success messages for mutations */}
        {createUpdateEmailMutation.isSuccess && (
          <div className="alert alert-success">
            De email is succesvol opgeslagen.
          </div>
        )}

        {sendEmailMutation.isSuccess && (
          <div className="alert alert-success">
            De email is succesvol verzonden.
          </div>
        )}

        {/* Show loading indicators during mutations */}
        {showSavingOverlay && (
          <div className="alert alert-info">Email opslaan...</div>
        )}

        {showSendingOverlay && (
          <div className="alert alert-info">Email versturen...</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <h2 className="icon-envelope short" title="Email">
            {' '}
          </h2>
          <div className="row">
            <div className="col-md-12">
              <div className="box box-primary">
                <div className="box-header with-border">
                  <h3 className="box-title">Email</h3>
                </div>

                <div className="box-body">
                  {dbEmail && dbEmail.emailNumber ? (
                    <div className="form-group required row">
                      <label className="col-form-label col-4 form-label">
                        Nummer
                      </label>
                      <div className="col-8 contact-number">
                        {dbEmail ? dbEmail.emailNumber : ''}
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
                        defaultValue={dbEmail ? dbEmail.contactId : ''}
                        style={{
                          border: errors.contactId ? '2px solid #D0021B' : '',
                        }}
                      >
                        <option value="">Selecteer een contact...</option>
                        {contacts
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
                      Datum
                    </label>
                    <div className="col-8">
                      <input
                        type="date"
                        className="form-control"
                        placeholder="Emaildatum"
                        defaultValue={
                          dbEmail
                            ? moment(new Date(dbEmail.emailDate)).format(
                                'yyyy-MM-DD',
                              )
                            : new Date().toISOString().substr(0, 10)
                        }
                        {...register('emailDate', { required: true, onChange })}
                        style={{
                          border: errors.emailDate ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.emailDate && (
                        <span className="error">Voer een emaildatum in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Titel
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Titel"
                        defaultValue={dbEmail ? dbEmail.subject : ''}
                        {...register('subject', { required: true, onChange })}
                        style={{
                          border: errors.subject ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.subject && (
                        <span className="error">Voer een titel in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Bericht
                    </label>
                    <div className="col-8">
                      <div
                        className="editor-container"
                        style={{
                          border: bodyIsValid ? '' : '2px solid #D0021B',
                        }}
                      >
                        <Editor
                          apiKey={process.env.REACT_APP_TINYMCE_API_KEY}
                          value={email ? email.body : ''}
                          init={{
                            height: 300,
                            width: 405,
                            content_style:
                              "body { font-family: 'Lato','Helvetica Neue',Helvetica,Arial,sans-serif; color: #484848;}",
                            menubar: false,
                            plugins: [
                              'advlist',
                              'autolink',
                              'lists',
                              'link',
                              'image',
                              'charmap',
                              // "print",
                              'preview',
                              'anchor',
                              'searchreplace',
                              'visualblocks',
                              'code',
                              'fullscreen',
                              'insertdatetime',
                              'media',
                              'table',
                              //"paste",
                              'code',
                              'help',
                              'wordcount',
                            ],
                            toolbar:
                              'undo redo | formatselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist | link image table | removeformat',
                          }}
                          onEditorChange={handleEditorChange}
                        />
                      </div>
                      <span className={bodyIsValid ? 'hide' : 'error'}>
                        Voer een bericht in
                      </span>
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Verzonden
                    </label>
                    <div className="col-8">
                      <select
                        {...register('send', { required: true, onChange })}
                        defaultValue={dbEmail ? dbEmail.send : ''}
                        style={{
                          border: errors.send ? '2px solid #D0021B' : '',
                        }}
                      >
                        <option value="false">Nee</option>
                        <option value="true">Ja</option>
                      </select>
                      {errors.send && (
                        <span className="error">Geef de verzendstatus aan</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Factuur
                    </label>
                    <div className="col-8">
                      <select
                        {...register('invoiceId', {
                          required: false,
                          onChange,
                        })}
                        defaultValue={dbEmail ? dbEmail.invoiceId : ''}
                      >
                        <option value="">Selecteer een factuur...</option>
                        {invoices
                          ? invoices?.map((invoice) => (
                              <option key={invoice._id} value={invoice._id}>
                                {invoice.invoiceNumber}
                              </option>
                            ))
                          : ''}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="box-footer">
                  <button id="save" type="submit" className="btn btn-primary">
                    Opslaan
                  </button>
                  <button
                    id="send"
                    onClick={sendInvoice}
                    className="btn btn-primary"
                  >
                    Opslaan & Versturen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
      <Footer />
    </div>
  )
}
export default Email
