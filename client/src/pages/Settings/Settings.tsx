/* eslint-disable no-underscore-dangle */
import { useEffect, useRef, CSSProperties } from 'react'
import { useState } from 'react'
import { setAlert } from '../../redux/_actions/alertAction'

import {
  useSettings,
  useCreateOrUpdateSettings,
  useUploadLogo,
} from '../../hooks/api/useSettings'
import {
  useVATNotificationPreferences,
  useUpdateVATNotificationPreferences,
} from '../../hooks/api/useVATNotificationPreferences'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { useForm, FieldValues } from 'react-hook-form'
import { useAppDispatch } from '../../redux/hooks'

const Settings = () => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  const {
    register: registerVat,
    handleSubmit: handleSubmitVat,
    reset: resetVat,
    watch: watchVat,
    formState: { errors: errorsVat },
  } = useForm()

  const dispatch = useAppDispatch()

  const {
    data: dbSettings,
    isError: isErrorSettings,
    error: settingsError,
  } = useSettings()

  const createOrUpdateMutation = useCreateOrUpdateSettings()
  const logoUploadMutation = useUploadLogo()

  const {
    data: vatNotificationPreferences,
    isLoading: isLoadingVATPreferences,
    isError: isErrorVATPreferences,
  } = useVATNotificationPreferences()

  const updateVATPreferencesMutation = useUpdateVATNotificationPreferences()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setLogoFile(e.dataTransfer.files[0])
    }
  }

  const uploadLogo = async () => {
    if (!logoFile) return null

    setIsUploading(true)

    try {
      const logoUrl = await logoUploadMutation.mutateAsync(logoFile)
      setIsUploading(false)
      return logoUrl
    } catch (error) {
      setIsUploading(false)
      return null
    }
  }

  const onSubmit = async (data: FieldValues) => {
    if (
      data.companyName === '' ||
      data.street === '' ||
      data.houseNumber === '' ||
      data.postalCode === '' ||
      data.city === '' ||
      data.country === '' ||
      data.phoneNumber === '' ||
      data.companyEmail === '' ||
      data.taxNumber === '' ||
      data.chamberOfCommerceNumber === '' ||
      data.bankName === '' ||
      data.bankIBAN === ''
    ) {
      dispatch(
        setAlert(
          'Bedrijfsnaam, straat, huisnummer, postcode, plaats, land, telefoonnummer, bedrijdsemail, btwnummer, kvk nummer, bank en IBAN zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
      return
    }

    try {
      if (logoFile) {
        const logoUrl = await uploadLogo()
        if (logoUrl) {
          data.companyLogo = logoUrl
        }
      }

      if (
        data &&
        (data._id === undefined || data._id === null) &&
        dbSettings?._id
      ) {
        data._id = dbSettings._id
      }

      createOrUpdateMutation.mutate(data)
    } catch (error) {
      dispatch(
        setAlert(
          `Instellingen opslaan mislukt: ${(error as Error).message}`,
          'danger',
        ),
      )
    }
  }

  useEffect(() => {
    if (dbSettings) {
      reset(dbSettings)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbSettings])

  useEffect(() => {
    if (vatNotificationPreferences) {
      let periodType = 'quarterly'
      if (vatNotificationPreferences.monthlyNotifications) {
        periodType = 'monthly'
      } else if (
        vatNotificationPreferences.yearlyNotifications &&
        !vatNotificationPreferences.quarterlyNotifications
      ) {
        periodType = 'yearly'
      }

      resetVat({
        emailNotifications:
          vatNotificationPreferences.emailNotifications ?? true,
        inAppNotifications:
          vatNotificationPreferences.inAppNotifications ?? true,
        pushNotifications:
          vatNotificationPreferences.pushNotifications ?? false,
        advanceWarningDays: vatNotificationPreferences.advanceWarningDays ?? 7,
        secondReminderEnabled:
          vatNotificationPreferences.secondReminderEnabled ?? false,
        secondReminderDays: vatNotificationPreferences.secondReminderDays ?? 3,
        periodType,
      })
    }
  }, [vatNotificationPreferences, resetVat])

  const saveVatPreferences = async (data: FieldValues) => {
    try {
      const { periodType, ...rest } = data
      const backendPreferences = {
        ...rest,
        monthlyNotifications: periodType === 'monthly',
        quarterlyNotifications: periodType === 'quarterly',
        yearlyNotifications: periodType === 'yearly',
      }

      await updateVATPreferencesMutation.mutateAsync(backendPreferences)
      dispatch(
        setAlert('Notificatie voorkeuren succesvol opgeslagen', 'success'),
      )
    } catch (error) {
      dispatch(
        setAlert(
          `Fout bij opslaan notificatie voorkeuren: ${(error as Error).message}`,
          'danger',
        ),
      )
    }
  }

  if (isErrorSettings) {
    dispatch(
      setAlert(
        `Fout bij het laden van instellingen: ${
          (settingsError as Error)?.message || 'Onbekende fout'
        }`,
        'danger',
      ),
    )
  }

  if (isErrorVATPreferences) {
    dispatch(
      setAlert('Fout bij het laden van notificatie voorkeuren', 'danger'),
    )
  }

  const dropZoneStyle: CSSProperties = {
    border: '2px dashed #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: isDragging ? '#f0f0f0' : 'transparent',
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <h2 className="icon-settings short" title="Instellingen">
          {' '}
        </h2>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="row">
            <div className="col-md-6">
              <div className="box box-primary">
                <div className="box-header with-border">
                  <h3 className="box-title">Bedrijfsgegevens</h3>
                </div>
                <div className="box-body">
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Bedrijfsnaam
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Bedrijfsnaam"
                        defaultValue={dbSettings ? dbSettings.companyName : ''}
                        {...register('companyName', { required: true })}
                        style={{
                          border: errors.companyName ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.companyName && (
                        <span className="error">Voer een bedrijfsnaam in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Straat
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Straat"
                        defaultValue={dbSettings ? dbSettings.street : ''}
                        {...register('street', { required: true })}
                        style={{
                          border: errors.street ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.street && (
                        <span className="error">Voer een straatnaam in</span>
                      )}
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
                        placeholder="Huisnummer"
                        defaultValue={dbSettings ? dbSettings.houseNumber : ''}
                        {...register('houseNumber', { required: true })}
                        style={{
                          border: errors.houseNumber ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.houseNumber && (
                        <span className="error">Voer een huisnummer in</span>
                      )}
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
                        defaultValue={dbSettings ? dbSettings.postalCode : ''}
                        {...register('postalCode', { required: true })}
                        style={{
                          border: errors.postalCode ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.postalCode && (
                        <span className="error">Voer een postcode in</span>
                      )}
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
                        placeholder="Plaats"
                        defaultValue={dbSettings ? dbSettings.city : ''}
                        {...register('city', { required: true })}
                        style={{
                          border: errors.city ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.city && (
                        <span className="error">Voer een plaatsnaam in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Land
                    </label>
                    <div className="col-8">
                      <select
                        {...register('country', { required: true })}
                        defaultValue={dbSettings ? dbSettings.country : ''}
                        style={{
                          border: errors.country ? '2px solid #D0021B' : '',
                        }}
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
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Telefoonnummer
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Telefoonnummer"
                        defaultValue={dbSettings ? dbSettings.phoneNumber : ''}
                        {...register('phoneNumber', { required: true })}
                        style={{
                          border: errors.phoneNumber ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.phoneNumber && (
                        <span className="error">
                          Voer een telefoonnummer in
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Bedrijfsemail
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Bedrijfsemail"
                        defaultValue={dbSettings ? dbSettings.companyEmail : ''}
                        {...register('companyEmail', {
                          required: true,
                          /*eslint no-useless-escape: */
                          pattern:
                            /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                        })}
                        style={{
                          border: errors.companyEmail
                            ? '2px solid #D0021B'
                            : '',
                        }}
                      />
                      {errors.companyEmail && (
                        <span className="error">
                          Voer een geldig bedrijfsemailadres in
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Website
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Website"
                        defaultValue={dbSettings ? dbSettings.website : ''}
                        {...register('website')}
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
                  <h3 className="box-title">Administratieve gegevens</h3>
                </div>
                <div className="box-body">
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      Valuta
                    </label>
                    <div className="col-8">
                      <select
                        {...register('currency')}
                        defaultValue={dbSettings ? dbSettings.currency : ''}
                      >
                        <option value="€">€</option>
                        <option value="$">$</option>
                        <option value="£">£</option>
                        <option value="¥">¥</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      BTW nummer
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="BTW nummer"
                        defaultValue={dbSettings ? dbSettings.taxNumber : ''}
                        {...register('taxNumber')}
                      />
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      KvK nummer
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="KvK nummer"
                        defaultValue={
                          dbSettings ? dbSettings.chamberOfCommerceNumber : ''
                        }
                        {...register('chamberOfCommerceNumber')}
                      />
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      Bank
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Bank"
                        defaultValue={dbSettings ? dbSettings.bankName : ''}
                        {...register('bankName')}
                      />
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      IBAN
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="IBAN"
                        defaultValue={dbSettings ? dbSettings.bankIBAN : ''}
                        {...register('bankIBAN')}
                      />
                    </div>
                  </div>

                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      Register nummer
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Register nummer"
                        defaultValue={
                          dbSettings ? dbSettings.registerNumber : ''
                        }
                        {...register('registerNumber')}
                      />
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      AGB Code
                    </label>
                    <div className="col-8">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="AGB Code"
                        defaultValue={dbSettings ? dbSettings.agbCode : ''}
                        {...register('agbCode')}
                      />
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      Bedrijfslogo
                    </label>
                    <div className="col-8">
                      <div className="mb-3">
                        {logoFile ? (
                          <div className="logo-preview mb-2">
                            <img
                              src={URL.createObjectURL(logoFile)}
                              alt="Logo preview"
                              style={{ maxWidth: '100%', maxHeight: '100px' }}
                            />
                          </div>
                        ) : dbSettings && dbSettings.companyLogo ? (
                          <div className="logo-display mb-2">
                            <img
                              src={dbSettings.companyLogo}
                              alt="Company logo"
                              style={{ maxWidth: '100%', maxHeight: '100px' }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.onerror = null
                                target.style.display = 'none'
                                const placeholder =
                                  document.getElementById('logo-placeholder')
                                if (placeholder) {
                                  placeholder.style.display = 'block'
                                }
                              }}
                            />
                            <div
                              id="logo-placeholder"
                              style={{ display: 'none' }}
                            >
                              <div className="logo-placeholder">
                                <p>Logo niet beschikbaar</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="logo-placeholder mb-2 text-center">
                            <div className="icon-image" />
                            <p>Geen logo ingesteld</p>
                          </div>
                        )}

                        <div
                          className={`logo-upload-area p-3 text-center ${
                            isDragging ? 'drag-active' : ''
                          }`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          style={dropZoneStyle}
                        >
                          <div className="icon-image" />
                          <p className="mb-0">
                            {isUploading
                              ? 'Uploading...'
                              : 'Sleep een bestand, of klik hier om een logo te uploaden'}
                          </p>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="image/*"
                            style={{ display: 'none' }}
                            disabled={isUploading}
                          />
                        </div>
                      </div>

                      <input
                        type="hidden"
                        defaultValue={dbSettings ? dbSettings.companyLogo : ''}
                        {...register('companyLogo')}
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

        {/* VAT Notification Preferences Section */}
        <div className="row" style={{ marginTop: '20px' }}>
          <div className="col-md-12">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">BTW Notificatie Voorkeuren</h3>
              </div>
              <div className="box-body">
                {isLoadingVATPreferences ? (
                  <div className="text-center">
                    <p>Notificatie voorkeuren laden...</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitVat(saveVatPreferences)}>
                    <div className="row">
                      {/* Notification Channels */}
                      <div className="col-md-6">
                        <h4>Notificatie Kanalen</h4>
                        <div className="form-group">
                          <div className="checkbox">
                            <label>
                              <input
                                type="checkbox"
                                {...registerVat('emailNotifications')}
                              />
                              Email notificaties
                            </label>
                          </div>
                        </div>
                        <div className="form-group">
                          <div className="checkbox">
                            <label>
                              <input
                                type="checkbox"
                                {...registerVat('inAppNotifications')}
                              />
                              In-app notificaties
                            </label>
                          </div>
                        </div>
                        <div className="form-group">
                          <div className="checkbox">
                            <label>
                              <input
                                type="checkbox"
                                {...registerVat('pushNotifications')}
                              />
                              Push notificaties (mobiele app)
                            </label>
                          </div>
                        </div>

                        <h4>Timing Instellingen</h4>
                        <div className="form-group row">
                          <label className="col-form-label col-6 form-label">
                            Voorwaarschuwing (dagen)
                          </label>
                          <div className="col-6">
                            <input
                              type="number"
                              className="form-control"
                              {...registerVat('advanceWarningDays', {
                                required: 'Voer een waarde in',
                                min: { value: 1, message: 'Minimaal 1 dag' },
                                max: {
                                  value: 30,
                                  message: 'Maximaal 30 dagen',
                                },
                                valueAsNumber: true,
                              })}
                              style={{
                                border: errorsVat.advanceWarningDays
                                  ? '2px solid #D0021B'
                                  : '',
                              }}
                            />
                            {errorsVat.advanceWarningDays && (
                              <span className="error">
                                {String(errorsVat.advanceWarningDays.message)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="form-group">
                          <div className="checkbox">
                            <label>
                              <input
                                type="checkbox"
                                {...registerVat('secondReminderEnabled')}
                              />
                              Tweede herinnering inschakelen
                            </label>
                          </div>
                        </div>
                        {watchVat('secondReminderEnabled') && (
                          <div className="form-group row">
                            <label className="col-form-label col-6 form-label">
                              Tweede herinnering (dagen)
                            </label>
                            <div className="col-6">
                              <input
                                type="number"
                                className="form-control"
                                {...registerVat('secondReminderDays', {
                                  required: 'Voer een waarde in',
                                  min: { value: 1, message: 'Minimaal 1 dag' },
                                  max: {
                                    value: 15,
                                    message: 'Maximaal 15 dagen',
                                  },
                                  valueAsNumber: true,
                                })}
                                style={{
                                  border: errorsVat.secondReminderDays
                                    ? '2px solid #D0021B'
                                    : '',
                                }}
                              />
                              {errorsVat.secondReminderDays && (
                                <span className="error">
                                  {String(errorsVat.secondReminderDays.message)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Period Type Selection */}
                      <div className="col-md-6">
                        <h4>BTW Aangifte Type</h4>
                        <div className="form-group row">
                          <label className="col-form-label col-4 form-label">
                            Aangifte periode
                          </label>
                          <div className="col-8">
                            <select
                              className="form-control"
                              {...registerVat('periodType')}
                            >
                              <option value="monthly">Maandelijks</option>
                              <option value="quarterly">Per kwartaal</option>
                              <option value="yearly">Jaarlijks</option>
                            </select>
                            <small className="form-text text-muted">
                              Kies uw BTW aangifte periode. Notificaties worden
                              alleen verstuurd voor de geselecteerde periode.
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="box-footer">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={updateVATPreferencesMutation.isPending}
                      >
                        {updateVATPreferencesMutation.isPending
                          ? 'Opslaan...'
                          : 'Notificatie Voorkeuren Opslaan'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  )
}
export default Settings
