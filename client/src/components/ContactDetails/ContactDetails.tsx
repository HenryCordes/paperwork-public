import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useParams, useLocation } from 'react-router-dom'
import { useAppDispatch } from '../../redux/hooks'
import { useContact, useCreateOrUpdateContact } from '../../hooks/api'
import { setAlert } from '../../redux/_actions/alertAction'

interface ContactFormData {
  _id?: string
  firstName: string
  lastName: string
  companyName: string
  emailAddress: string
  typeOfContact: string
  contactNumber: string
  initials: string
  gender: string
  phoneNumber: string
  mobilePhoneNumber: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  bankIBAN: string
  bankPersonName: string
  visitingStreet: string
  visitingHouseNumber: string
  visitingPostalCode: string
  visitingCity: string
  visitingCountry: string
  typeName: string
  channel: string
  history: string
}

interface ContactDetailsProps {
  props?: unknown
}

const ContactDetails = ({ props: _props }: ContactDetailsProps) => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const isCreateMode = location.pathname === '/contact/create'
  const dispatch = useAppDispatch()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    getValues,
  } = useForm<ContactFormData>()

  // useContact only accepts one argument; it has its own enabled: Boolean(id) guard.
  // In create mode id is undefined so the query won't fire.
  const { data: dbContact, isLoading, isError, error } = useContact(id ?? '')

  const createUpdateMutation = useCreateOrUpdateContact()

  const [contact, setContact] = useState<ContactFormData>({
    _id: '',
    firstName: '',
    lastName: '',
    companyName: '',
    emailAddress: '',
    typeOfContact: '',
    contactNumber: '',
    initials: '',
    gender: '',
    phoneNumber: '',
    mobilePhoneNumber: '',
    street: '',
    houseNumber: '',
    postalCode: '',
    city: '',
    country: '',
    bankIBAN: '',
    bankPersonName: '',
    visitingStreet: '',
    visitingHouseNumber: '',
    visitingPostalCode: '',
    visitingCity: '',
    visitingCountry: '',
    typeName: '',
    channel: '',
    history: '',
  })

  const onSubmit = async (data: ContactFormData) => {
    if (
      (data.lastName === '' && data.typeOfContact === 'Particulier') ||
      (data.firstName === '' && data.typeOfContact === 'Particulier') ||
      (data.companyName === '' && data.typeOfContact === 'Bedrijf') ||
      data.emailAddress === '' ||
      data.typeOfContact === '' ||
      data.country === ''
    ) {
      dispatch(
        setAlert(
          'Achternaam en voornaam (in geval van "Particulier"), Bedrijfsnaam (in geval van "Bedrijf") en email, type en land zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    } else {
      try {
        if (!isCreateMode && dbContact) {
          data._id = dbContact._id
        }

        const result = await createUpdateMutation.mutateAsync(data)

        if (result) {
          dispatch(setAlert('Het contact is succesvol opgeslagen.', 'success'))
        }
      } catch {
        dispatch(
          setAlert(
            'Er is iets misgegaan bij het opslaan van het contact.',
            'danger',
          ),
        )
      }
    }
  }

  const isLastNameValid = async (typeOfContact: string, value: string) => {
    if (typeOfContact === 'Bedrijf') {
      return true
    } else if (typeOfContact === 'Particulier') {
      return Boolean(value)
    }
  }

  const isCompanyNameValid = async (typeOfContact: string, value: string) => {
    if (typeOfContact === 'Particulier') {
      return true
    } else if (typeOfContact === 'Bedrijf') {
      return Boolean(value)
    }
  }

  useEffect(() => {
    if (dbContact && !isCreateMode) {
      reset(dbContact)
      setContact((prev) => ({ ...prev, typeName: dbContact.typeName }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbContact, isCreateMode, reset])

  if (isLoading) {
    return <div>Laden...</div>
  }

  if (isError && !isCreateMode) {
    return (
      <div>
        Fout bij het laden van het contact:{' '}
        {(error as Error)?.message || 'Onbekende fout'}
      </div>
    )
  }

  const showLoadingOverlay = createUpdateMutation.isPending

  return (
    <div>
      {showLoadingOverlay && (
        <div className="position-relative mb-3">
          <div className="alert alert-info">Contact opslaan...</div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="row">
          <div className="col-md-6">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Contactgegevens</h3>
              </div>

              <div className="box-body">
                {dbContact && dbContact.contactNumber ? (
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Nummer
                    </label>
                    <div className="col-8 contact-number">
                      {dbContact ? dbContact.contactNumber : ''}
                    </div>
                  </div>
                ) : (
                  ''
                )}

                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Klant/Leverancier
                  </label>
                  <div className="col-8">
                    <select
                      defaultValue={dbContact ? dbContact.typeOfContact : ''}
                      style={{
                        border: errors.typeOfContact ? '2px solid #D0021B' : '',
                      }}
                      {...register('typeOfContact', { required: true })}
                    >
                      <option value="Klant">Klant</option>
                      <option value="Leverancier">Leverancier</option>
                    </select>
                    {errors.typeOfContact && (
                      <span className="error">
                        Kies voor klant of leverancier
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Particulier/Bedrijf
                  </label>
                  <div className="col-8">
                    <select
                      defaultValue={dbContact ? dbContact.typeName : ''}
                      style={{
                        border: errors.typeName ? '2px solid #D0021B' : '',
                      }}
                      {...register('typeName', { required: true })}
                    >
                      <option value="Particulier">Particulier</option>
                      <option value="Bedrijf">Bedrijf</option>
                    </select>
                    {errors.typeName && (
                      <span className="error">
                        Kies voor particulier of bedrijf
                      </span>
                    )}
                  </div>
                </div>

                {contact && contact.typeName !== 'Particulier' ? (
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Bedrijfsnaam
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Bedrijfsnaam"
                        defaultValue={dbContact ? dbContact.companyName : ''}
                        style={{
                          border:
                            errors.companyName &&
                            errors.companyName.type === 'validate'
                              ? '2px solid #D0021B'
                              : '',
                        }}
                        {...register('companyName', {
                          validate: (val) =>
                            isCompanyNameValid(getValues('typeName'), val),
                        })}
                      />
                      {errors.companyName &&
                        errors.companyName.type === 'validate' && (
                          <span className="error">
                            Voer een bedrijfsnaam in
                          </span>
                        )}
                    </div>
                  </div>
                ) : (
                  ''
                )}

                {contact && contact.typeName === 'Bedrijf' ? (
                  <div className="form-group row box-header-container">
                    <label className="col-form-label box-header-label">
                      <strong>Contactpersoon</strong>
                    </label>
                  </div>
                ) : (
                  ''
                )}
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Achternaam
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Achternaam"
                      defaultValue={dbContact ? dbContact.lastName : ''}
                      style={{
                        border:
                          errors.lastName && errors.lastName.type === 'validate'
                            ? '2px solid #D0021B'
                            : '',
                      }}
                      {...register('lastName', {
                        validate: (val) =>
                          isLastNameValid(getValues('typeName'), val),
                      })}
                    />
                    {errors.lastName && errors.lastName.type === 'validate' && (
                      <span className="error">Voer een achternaam in</span>
                    )}
                  </div>
                </div>

                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Voornaam
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Voornaam"
                      defaultValue={dbContact ? dbContact.firstName : ''}
                      style={{
                        border:
                          errors.firstName &&
                          errors.firstName.type === 'validate'
                            ? '2px solid #D0021B'
                            : '',
                      }}
                      {...register('firstName', {
                        validate: (val) =>
                          isLastNameValid(getValues('typeName'), val),
                      })}
                    />
                    {errors.firstName &&
                      errors.firstName.type === 'validate' && (
                        <span className="error">Voer een voornaam in</span>
                      )}
                  </div>
                </div>

                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Initialen
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Voorletters"
                      defaultValue={dbContact ? dbContact.initials : ''}
                      {...register('initials')}
                    />
                  </div>
                </div>

                {contact && contact.typeName === 'Bedrijf' ? (
                  <div className="row box-header-end"></div>
                ) : (
                  ''
                )}

                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Emailadres
                  </label>
                  <div className="col-8">
                    <input
                      type="email"
                      className="form-control"
                      placeholder="Emailadres"
                      defaultValue={dbContact ? dbContact.emailAddress : ''}
                      style={{
                        border: errors.emailAddress ? '2px solid #D0021B' : '',
                      }}
                      {...register('emailAddress', {
                        required: true,
                        /*eslint no-useless-escape: */
                        pattern:
                          /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                      })}
                    />
                    {errors.emailAddress && (
                      <span className="error">
                        Voer een geldig emailadres in
                      </span>
                    )}
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Telefoonnummer
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Telefoonnummer"
                      defaultValue={dbContact ? dbContact.phoneNumber : ''}
                      {...register('phoneNumber')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Mobiele nummer
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Mobiele nummer"
                      defaultValue={
                        dbContact ? dbContact.mobilePhoneNumber : ''
                      }
                      {...register('mobilePhoneNumber')}
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

          <div className="col-md-6">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Adresgegevens</h3>
              </div>

              <div className="box-body">
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Straat
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Straat"
                      defaultValue={dbContact ? dbContact.street : ''}
                      {...register('street')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Huisnummer
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Huisnummer (en toevoeging)"
                      defaultValue={dbContact ? dbContact.houseNumber : ''}
                      {...register('houseNumber')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Postcode
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Postcode"
                      defaultValue={dbContact ? dbContact.postalCode : ''}
                      {...register('postalCode')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Plaats
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Woonplaats"
                      defaultValue={dbContact ? dbContact.city : ''}
                      {...register('city')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Selecteer land
                  </label>
                  <div className="col-8">
                    <select
                      defaultValue={dbContact ? dbContact.country : ''}
                      style={{
                        border: errors.country ? '2px solid #D0021B' : '',
                      }}
                      {...register('country', { required: true })}
                    >
                      <option value="Nederland">Nederland</option>
                      <option value="België">België</option>
                      <option value="Duitsland">Duitsland</option>
                      <option value="Spanje">Spanje</option>
                      <option value="Engeland">Engeland</option>
                    </select>
                    {errors.country && (
                      <span className="error">Kies een land</span>
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

        <div className="row">
          <div className="col-md-6">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Bankgegevens</h3>
              </div>

              <div className="box-body">
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    IBAN
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="IBAN"
                      defaultValue={dbContact ? dbContact.bankIBAN : ''}
                      {...register('bankIBAN')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Ten name van
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ten name van"
                      defaultValue={dbContact ? dbContact.bankPersonName : ''}
                      {...register('bankPersonName')}
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

          <div className="col-md-6">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Bezoekadres</h3>
              </div>

              <div className="box-body">
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Straat
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Straat"
                      defaultValue={dbContact ? dbContact.visitingStreet : ''}
                      {...register('visitingStreet')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Huisnummer
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Huisnummer (en toevoeging)"
                      defaultValue={
                        dbContact ? dbContact.visitingHouseNumber : ''
                      }
                      {...register('visitingHouseNumber')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Postcode
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Postcode"
                      defaultValue={
                        dbContact ? dbContact.visitingPostalCode : ''
                      }
                      {...register('visitingPostalCode')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Woonplaats
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Woonplaats"
                      defaultValue={dbContact ? dbContact.visitingCity : ''}
                      {...register('visitingCity')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Selecteer land
                  </label>
                  <div className="col-8">
                    <select
                      defaultValue={dbContact ? dbContact.visitingCountry : ''}
                      {...register('visitingCountry')}
                    >
                      <option value="Nederland">Nederland</option>
                      <option value="België">België</option>
                      <option value="Duitsland">Duitsland</option>
                      <option value="Spanje">Spanje</option>
                      <option value="Engeland">Engeland</option>
                    </select>
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

          <div id="extra-info-div" className="col-md-6">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Extra info</h3>
              </div>

              <div className="box-body">
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Kanaal
                  </label>
                  <div className="col-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Kanaal"
                      defaultValue={dbContact ? dbContact.channel : ''}
                      {...register('channel')}
                    />
                  </div>
                </div>
                <div className="form-group required row">
                  <label className="col-form-label col-4 form-label">
                    Geschiedenis
                  </label>
                  <div className="col-8">
                    <textarea
                      className="form-control"
                      placeholder="Geschiedenis"
                      defaultValue={dbContact ? dbContact.history : ''}
                      {...register('history')}
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
    </div>
  )
}
export default ContactDetails
