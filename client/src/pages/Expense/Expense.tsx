import { useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { useForm } from 'react-hook-form'
import { useParams, useNavigate } from 'react-router-dom'
import moment from 'moment'
import axios from 'axios'
import { useDropzone } from 'react-dropzone'
import PdfViewer from '../../components/PdfViewer/PdfViewer'
import { AppDispatch } from '../../redux/types'

import {
  useExpense,
  useCreateOrUpdateExpense,
  useUploadExpenseReceipt,
  useContacts,
} from '../../hooks/api'

interface Contact {
  _id: string
  typeName: string
  firstName?: string
  lastName?: string
  companyName?: string
}

interface DbExpense {
  _id: string
  expenseNumber?: string
  expenseDate?: string
  info?: string
  tax?: number | string
  taxLow?: number | string
  price?: number | string
  state?: string
  expenseFile?: string
  contactId?: string
}

const Expense = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const maxSize = 1048576
  const isEdit =
    id !== undefined && window.location.pathname !== '/expense/create'

  const {
    data: dbExpense,
    isError: expenseError,
    error: expenseErrorDetails,
  } = useExpense(id as string, { enabled: isEdit }) as {
    data: DbExpense | undefined
    isError: boolean
    error: Error | null
  }

  const { data: contactsData, isLoading: contactsLoading } = useContacts()
  const contacts: Contact[] = contactsData?.docs || []

  const createOrUpdateMutation = useCreateOrUpdateExpense()
  const uploadReceiptMutation = useUploadExpenseReceipt()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm()

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const upload = async (file: File) => {
        if (!file) return

        let formData = new FormData()
        formData.append('file', file)

        try {
          // First upload the document to get a file location
          const config = { headers: { 'Content-Type': 'multipart/form-data' } }
          const res = await axios.post(`/api/document`, formData, config)
          if (res?.data?.data?.fileLocation) {
            const fileLocation: string = res.data.data.fileLocation

            // Update form field value
            const fileInput = document.getElementById(
              'expenseFile',
            ) as HTMLInputElement | null
            if (fileInput) {
              fileInput.value = fileLocation
            }

            // Update image preview
            const img = document.getElementById(
              'expenseFileDisplay',
            ) as HTMLImageElement | null
            if (img) {
              img.src = fileLocation
            }

            // If this is an existing expense, use the upload receipt mutation to add expenseFile path to document
            if (dbExpense?._id) {
              const updatedExpense = { ...dbExpense, expenseFile: fileLocation }

              // Use our React Query mutation
              uploadReceiptMutation.mutate(
                { expense: updatedExpense },
                {
                  onSuccess: () => {
                    dispatch(
                      setAlert(
                        'Bon upload is succesvol en gekoppeld aan de uitgave!',
                        'success',
                      ),
                    )
                  },
                  onError: (error: unknown) => {
                    console.error('Upload receipt error:', error)
                    dispatch(
                      setAlert(
                        `Er is iets misgegaan bij het koppelen van de bon aan de uitgave: ${(error as Error).message}`,
                        'danger',
                      ),
                    )
                  },
                },
              )
            } else {
              // For new expenses, we just keep the fileLocation for when the expense is saved
              setValue('expenseFile', fileLocation)
              dispatch(
                setAlert(
                  'Bon is klaar voor het koppelen aan de nieuwe uitgave',
                  'success',
                ),
              )
            }
          } else {
            console.log('[Expense] No file location received in response')
            dispatch(
              setAlert(
                'Geen bestandslocatie ontvangen van de server',
                'danger',
              ),
            )
          }
        } catch (err) {
          console.error('[Expense] Upload error:', err)
          dispatch(
            setAlert(
              'Er is iets misgegaan bij het uploaden van het document, probeer het nogmaals.',
              'danger',
            ),
          )
        }
      }

      upload(acceptedFiles[0])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbExpense, dispatch, uploadReceiptMutation],
  )

  const {
    isDragActive,
    getRootProps,
    getInputProps,
    isDragReject,
    fileRejections,
    open,
  } = useDropzone({
    onDrop,
    accept: 'image/*,application/pdf',
    minSize: 0,
    maxSize,
    maxFiles: 1,
  })

  const isFileTooLarge =
    fileRejections &&
    fileRejections.length > 0 &&
    fileRejections[0].file.size > maxSize

  // Show error alerts if any
  useEffect(() => {
    if (expenseError) {
      dispatch(
        setAlert(
          `Fout bij het laden van de uitgavegegevens: ${
            expenseErrorDetails?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
    }
  }, [expenseError, expenseErrorDetails, dispatch])

  useEffect(() => {
    if (dbExpense?._id) {
      setValue('expenseNumber', dbExpense.expenseNumber)
      if (dbExpense.expenseDate) {
        setValue(
          'expenseDate',
          moment(dbExpense.expenseDate).format('yyyy-MM-DD'),
        )
      }
      setValue('info', dbExpense.info)
      setValue('tax', dbExpense.tax)
      setValue('price', dbExpense.price)
      setValue('state', dbExpense.state)
      setValue('expenseFile', dbExpense.expenseFile)
      if (dbExpense.contactId) {
        setValue('contactId', dbExpense.contactId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbExpense])

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setValue(e.target.name, e.target.value)
  }

  const onSubmit = (data: Record<string, unknown>) => {
    if (data.expenseDate === '' || data.price === '') {
      dispatch(
        setAlert('Datum en Totaal zijn verplicht, voer deze in.', 'danger'),
      )
      return
    }

    // Add contact name if a contact ID is provided
    if (data.contactId) {
      const contact = contacts.find((c) => c._id === data.contactId)
      if (contact) {
        data.contactName =
          contact.typeName === 'Particulier'
            ? contact.lastName + ', ' + contact.firstName
            : contact.companyName
      }
    }

    // Add ID if we're editing an existing expense
    if (isEdit && dbExpense?._id) {
      data._id = dbExpense._id
    }

    // Submit the form using React Query mutation
    createOrUpdateMutation.mutate(data, {
      onSuccess: () => {
        dispatch(setAlert('Uitgave is opgeslagen!', 'success'))
        navigate('/expenses')
      },
    })
  }

  // Create mutation state handling with Redux alerts
  useEffect(() => {
    if (createOrUpdateMutation.isPending) {
      dispatch(setAlert('Uitgave opslaan...', 'info'))
    }

    if (createOrUpdateMutation.isError) {
      dispatch(
        setAlert(
          `Fout bij opslaan: ${
            (createOrUpdateMutation.error as Error)?.message || 'Onbekende fout'
          }`,
          'danger',
        ),
      )
    }
  }, [
    createOrUpdateMutation.isPending,
    createOrUpdateMutation.isError,
    createOrUpdateMutation.error,
    dispatch,
  ])

  const collapse = () => {
    const elem = document.getElementById('image-container')
    if (elem) {
      elem.classList.toggle('full-width')
      const button = document.getElementById('expand-pdf-button-expanded')
      if (button) {
        button.classList.toggle('expand-pdf-button-expanded')
      }
    }
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <form onSubmit={handleSubmit(onSubmit)}>
          <h2 className="icon-store short" title="Kosten">
            {' '}
          </h2>

          <div className="row">
            <div className="col-md-12">
              <div className="box box-primary">
                <div className="box-header with-border">
                  <h3 className="box-title">Kosten</h3>
                </div>

                <div className="row">
                  <div className="col-md-6">
                    <div className="box-body">
                      {dbExpense && dbExpense.expenseNumber ? (
                        <div className="form-group row">
                          <label className="col-form-label col-4 form-label">
                            Nummer
                          </label>
                          <div className="col-8 entity-number">
                            {dbExpense ? dbExpense.expenseNumber : ''}
                          </div>
                        </div>
                      ) : (
                        ''
                      )}

                      <div className="form-group row">
                        <label className="col-form-label col-4 form-label">
                          Contact
                        </label>
                        <div className="col-8">
                          <select
                            {...register('contactId', {
                              required: false,
                              onChange,
                            })}
                            defaultValue={dbExpense?.contactId || ''}
                            style={{
                              border: errors.contactId
                                ? '2px solid #D0021B'
                                : '',
                            }}
                            disabled={contactsLoading}
                          >
                            <option value="">Selecteer een contact...</option>
                            {contacts.map((contact) => (
                              <option key={contact._id} value={contact._id}>
                                {contact.typeName === 'Particulier'
                                  ? contact.lastName + ', ' + contact.firstName
                                  : contact.companyName}
                              </option>
                            ))}
                          </select>
                          {errors.contactId && (
                            <span className="error">Kies een contact</span>
                          )}
                        </div>
                      </div>
                      <div className="form-group required row">
                        <label className="col-form-label col-4 form-label">
                          Kostendatum
                        </label>
                        <div className="col-8">
                          <input
                            type="date"
                            {...register('expenseDate', {
                              required: true,
                              onChange,
                            })}
                            className="form-control"
                            placeholder="Kostendatum"
                            defaultValue={
                              dbExpense
                                ? moment(
                                    new Date(dbExpense.expenseDate as string),
                                  ).format('yyyy-MM-DD')
                                : new Date().toISOString().substr(0, 10)
                            }
                            style={{
                              border: errors.expenseDate
                                ? '2px solid #D0021B'
                                : '',
                            }}
                          />
                          {errors.expenseDate && (
                            <span className="error">
                              Voer een kostendatum in
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="form-group required row">
                        <label className="col-form-label col-4 form-label">
                          Omschrijving
                        </label>
                        <div className="col-8">
                          <input
                            type="text"
                            {...register('info', { required: false, onChange })}
                            className="form-control"
                            placeholder="Omschrijving"
                            defaultValue={dbExpense ? dbExpense.info : ''}
                          />
                        </div>
                      </div>

                      <div className="form-group required row">
                        <label className="col-form-label col-4 form-label">
                          BTW 21%
                        </label>
                        <div className="col-8">
                          <input
                            type="number"
                            step="0.01"
                            min="0.00"
                            max="9999999.99"
                            {...register('tax', { required: false, onChange })}
                            className="form-control"
                            placeholder="BTW hoog"
                            defaultValue={dbExpense ? dbExpense.tax : ''}
                          />
                        </div>
                      </div>

                      <div className="form-group required row">
                        <label className="col-form-label col-4 form-label">
                          BTW 9%
                        </label>
                        <div className="col-8">
                          <input
                            type="number"
                            step="0.01"
                            min="0.00"
                            max="9999999.99"
                            {...register('taxLow', {
                              required: false,
                              onChange,
                            })}
                            className="form-control"
                            placeholder="BTW laag"
                            defaultValue={
                              dbExpense
                                ? ((
                                    dbExpense as unknown as Record<
                                      string,
                                      unknown
                                    >
                                  ).taxLow as string)
                                : ''
                            }
                          />
                        </div>
                      </div>

                      <div className="form-group required row">
                        <label className="col-form-label col-4 form-label">
                          Totaal
                        </label>
                        <div className="col-8">
                          <input
                            type="number"
                            step="0.01"
                            min="0.00"
                            max="9999999.99"
                            {...register('price', {
                              required: false,
                              onChange,
                            })}
                            className="form-control"
                            placeholder="Totaal bedrag (inc. BTW)"
                            defaultValue={dbExpense ? dbExpense.price : ''}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div
                      id="image-container"
                      className={
                        dbExpense && dbExpense.expenseFile
                          ? 'expense-image-container'
                          : 'expense-image-drop'
                      }
                    >
                      <button
                        id="expand-pdf-button-expanded"
                        className="expand-pdf-button"
                        onClick={collapse}
                      ></button>
                      <div {...getRootProps({ className: 'dropzone' })}>
                        <input {...getInputProps()} />
                        {dbExpense && dbExpense.expenseFile ? (
                          dbExpense.expenseFile
                            .toLowerCase()
                            .endsWith('.pdf') ? (
                            <PdfViewer
                              pdf={`/api/document/${dbExpense.expenseFile}`}
                            />
                          ) : (
                            <>
                              <img
                                className="expense-image"
                                alt="Klik hier om de afbeelding aan te passen"
                                id="expenseFileDisplay"
                                src={`/api/document/${dbExpense.expenseFile}`}
                              />
                              <div
                                className="expense-image-edit-msg"
                                onClick={open}
                                title="Klik hier of op de afbeelding om deze aan te passen"
                              >
                                Aanpassen
                              </div>
                            </>
                          )
                        ) : (
                          <p>
                            {!isDragActive &&
                              'Sleep je bon hierheen, of klik om een bestand te selecteren'}
                            {isDragActive &&
                              !isDragReject &&
                              'Laat je bestand hier los!'}
                            {isDragReject &&
                              'Dit bestandstype wordt niet geaccepteerd, sorry'}
                            {isFileTooLarge && (
                              <div className="text-danger mt-2">
                                Bestand is te groot!
                              </div>
                            )}
                          </p>
                        )}
                      </div>

                      <input
                        id="expenseFile"
                        type="hidden"
                        defaultValue={dbExpense ? dbExpense.expenseFile : ''}
                        {...register('expenseFile', {
                          required: false,
                          onChange,
                        })}
                      />
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
export default Expense
