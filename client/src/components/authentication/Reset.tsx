import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faKey } from '@fortawesome/free-solid-svg-icons'
import Footer from '../Footer/Footer'
import { setAlert } from '../../redux/_actions/alertAction'
import { CLEAR_ERRORS } from '../../redux/alertTypes'

interface ResetFormData {
  email: string
}

interface EmailData {
  [key: string]: unknown
}

interface SendResetResult {
  success: boolean
  data?: unknown
  error?: string
}

const Reset = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resetData, setResetData] = useState<EmailData | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>()

  useEffect(() => {
    dispatch({ type: CLEAR_ERRORS })
  }, [dispatch])

  const sendResetEmail = async (
    emailData: EmailData,
  ): Promise<SendResetResult> => {
    try {
      const response = await fetch('/api/auth/send-reset-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      })

      const data = await response.json()

      if (response.ok) {
        dispatch(setAlert('Email succesvol verstuurd!', 'success'))
        return { success: true, data }
      } else {
        dispatch(setAlert(data.message || 'Fout bij versturen email', 'error'))
        return { success: false, error: data.message }
      }
    } catch (error) {
      dispatch(setAlert('Netwerkfout', 'error'))
      return { success: false, error: (error as Error).message }
    }
  }

  const onSubmit = async (formData: ResetFormData) => {
    setIsLoading(true)

    try {
      // First, call the forgot-password endpoint to generate the token
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResetData(data.emailData)

        // Then send the email using our new endpoint
        const emailResult = await sendResetEmail(data.emailData)

        if (emailResult.success) {
          setEmailSent(true)
          dispatch(setAlert(data.message, 'success'))
          navigate('/password-reset')
        }
      } else {
        dispatch(setAlert(data.message || 'Er is een fout opgetreden', 'error'))
      }
    } catch (error) {
      dispatch(setAlert('Netwerkfout', 'error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resetData) {
      setIsLoading(true)
      const result = await sendResetEmail(resetData)
      if (result.success) {
        dispatch(setAlert('Email opnieuw verstuurd!', 'success'))
      }
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="body-content content-wrapper">
        <div className="row">
          <div className="login-row">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">
                  <FontAwesomeIcon icon={faKey} /> Wachtwoord Reset
                </h3>
              </div>

              <div className="box-body">
                <div className="logo-wrapper">
                  <img src="assets/img/books_64.png" alt="logo" />
                  <h2>paperwork</h2>
                </div>

                {!emailSent ? (
                  <>
                    <p
                      className="text-center"
                      style={{ marginBottom: '20px', color: '#666' }}
                    >
                      Voer je email adres in om een wachtwoord reset link te
                      ontvangen.
                    </p>
                    <div className="form-group">
                      <label htmlFor="email">Email:</label>
                      <input
                        type="email"
                        id="email"
                        className="form-control"
                        autoComplete="username"
                        placeholder="Voer je email adres in"
                        {...register('email', {
                          required: 'Email adres is verplicht',
                          pattern: {
                            value: /^\S+@\S+$/i,
                            message: 'Voer een geldig email adres in',
                          },
                        })}
                        style={{
                          border: errors?.email ? '2px solid #D0021B' : '',
                        }}
                        disabled={isLoading}
                      />
                      {errors?.email && (
                        <span className="error">{errors.email.message}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center" style={{ padding: '20px' }}>
                    <div
                      style={{
                        fontSize: '48px',
                        color: '#28a745',
                        marginBottom: '20px',
                      }}
                    >
                      ✅
                    </div>
                    <h4 style={{ color: '#28a745', marginBottom: '15px' }}>
                      Email Verzonden!
                    </h4>
                    <p style={{ color: '#666', marginBottom: '20px' }}>
                      Controleer je inbox voor reset instructies. De reset code
                      is 10 minuten geldig.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleResend}
                    >
                      Opnieuw versturen
                    </button>
                  </div>
                )}
              </div>

              {!emailSent && (
                <div className="box-footer-nomargin centered">
                  <button
                    type="submit"
                    className="btn btn-primary block"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? 'Bezig met verzenden...'
                      : 'Wachtwoord wijzigen'}
                  </button>
                </div>
              )}

              <div className="centered-column">
                <p>
                  Weet je je wachtwoord weer? <Link to="/login">Aanmelden</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </form>
  )
}

export default Reset
