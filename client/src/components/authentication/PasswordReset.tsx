import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons'
import Footer from '../Footer/Footer'
import { setAlert } from '../../redux/_actions/alertAction'
import { CLEAR_ERRORS } from '../../redux/alertTypes'

interface Step1FormData {
  email: string
  resetToken: string
}

interface Step2FormData {
  password: string
  confirmPassword: string
}

type PasswordResetFormData = Step1FormData & Step2FormData

const PasswordReset = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PasswordResetFormData>()
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1) // 1: enter email + token, 2: enter new password
  const [validatedEmail, setValidatedEmail] = useState('')
  const [validatedToken, setValidatedToken] = useState('') // Store the token for step 2

  const state = useSelector((state) => state.auth)
  const { error } = state

  // Watch password fields for confirmation validation
  const watchPassword = watch('password')

  useEffect(() => {
    if (error) {
      dispatch(setAlert(error as string, 'danger'))
      dispatch({ type: CLEAR_ERRORS })
    }
  }, [error, dispatch])

  const onSubmitStep1 = async (data: PasswordResetFormData) => {
    if (!data.email || !data.resetToken) {
      dispatch(setAlert('Email en reset code zijn verplicht', 'danger'))
      return
    }

    setIsLoading(true)

    try {
      // Validate the reset token
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          resetToken: data.resetToken.toUpperCase(),
          password: 'temp_validation_only', // We'll validate the token first, then ask for new password
        }),
      })

      const result = await response.json()

      if (response.status === 400 && result.message.includes('wachtwoord')) {
        // Token is valid, but we provided a dummy password - move to step 2
        setValidatedEmail(data.email)
        setValidatedToken(data.resetToken.toUpperCase()) // Store the token for later use
        setStep(2)
        dispatch(
          setAlert(
            'Reset code gevalideerd. Voer je nieuwe wachtwoord in.',
            'success',
          ),
        )
      } else if (result.success) {
        // Shouldn't happen with our dummy password, but handle just in case
        dispatch(setAlert('Wachtwoord succesvol gewijzigd', 'success'))
        setTimeout(() => navigate('/login'), 2000)
      } else {
        dispatch(
          setAlert(result.message || 'Ongeldige reset code of email', 'danger'),
        )
      }
    } catch (error) {
      console.error('Token validation error:', error)
      dispatch(
        setAlert(
          'Er is een fout opgetreden bij het valideren van de reset code',
          'danger',
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitStep2 = async (data: PasswordResetFormData) => {
    if (!data.password || !data.confirmPassword) {
      dispatch(setAlert('Beide wachtwoord velden zijn verplicht', 'danger'))
      return
    }

    if (data.password !== data.confirmPassword) {
      dispatch(setAlert('Wachtwoorden komen niet overeen', 'danger'))
      return
    }

    if (data.password.length < 6) {
      dispatch(
        setAlert('Wachtwoord moet minimaal 6 karakters lang zijn', 'danger'),
      )
      return
    }

    setIsLoading(true)

    try {
      // Use the stored token from state instead of DOM element
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: validatedEmail,
          resetToken: validatedToken, // Use the token we stored in state
          newPassword: data.password,
        }),
      })

      const result = await response.json()

      if (result.success) {
        dispatch(
          setAlert(
            'Wachtwoord succesvol gewijzigd! Je wordt doorgestuurd naar het aanmelden.',
            'success',
          ),
        )
        setTimeout(() => navigate('/login'), 3000)
      } else {
        dispatch(
          setAlert(result.message || 'Er is een fout opgetreden', 'danger'),
        )
        // If token expired, go back to step 1
        if (result.message?.includes('verlopen')) {
          setStep(1)
          setValidatedEmail('')
        }
      }
    } catch (error) {
      console.error('Password reset error:', error)
      dispatch(
        setAlert(
          'Er is een fout opgetreden bij het wijzigen van het wachtwoord',
          'danger',
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(step === 1 ? onSubmitStep1 : onSubmitStep2)}>
      <div className="body-content content-wrapper">
        <div className="row">
          <div className="login-row">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">
                  <FontAwesomeIcon icon={faLock} /> Wachtwoord Reset
                </h3>
              </div>

              <div className="box-body">
                <div className="logo-wrapper">
                  <img src="assets/img/books_64.png" alt="logo" />
                  <h2>paperwork</h2>
                </div>

                {step === 1 ? (
                  <>
                    <p
                      className="text-center"
                      style={{ marginBottom: '20px', color: '#666' }}
                    >
                      Voer je email adres en de 6-cijferige reset code uit je
                      email in.
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
                    <div className="form-group">
                      <label htmlFor="resetToken">Reset Code:</label>
                      <input
                        type="text"
                        id="step1-token"
                        className="form-control"
                        placeholder="Voer de 6-cijferige code in"
                        maxLength={6}
                        style={{
                          border: errors?.resetToken ? '2px solid #D0021B' : '',
                          textTransform: 'uppercase',
                          letterSpacing: '2px',
                          fontSize: '18px',
                          textAlign: 'center',
                        }}
                        {...register('resetToken', {
                          required: 'Reset code is verplicht',
                          minLength: {
                            value: 6,
                            message: 'Reset code moet 6 karakters zijn',
                          },
                          maxLength: {
                            value: 6,
                            message: 'Reset code moet 6 karakters zijn',
                          },
                        })}
                        disabled={isLoading}
                      />
                      {errors?.resetToken && (
                        <span className="error">
                          {errors.resetToken.message}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className="text-center"
                      style={{ marginBottom: '20px', color: '#666' }}
                    >
                      Reset code gevalideerd voor{' '}
                      <strong>{validatedEmail}</strong>.<br />
                      Voer je nieuwe wachtwoord in.
                    </p>
                    <div className="form-group">
                      <label htmlFor="password">Nieuw Wachtwoord:</label>
                      <input
                        type="password"
                        id="password"
                        className="form-control"
                        autoComplete="new-password"
                        placeholder="Nieuw wachtwoord (minimaal 6 karakters)"
                        {...register('password', {
                          required: 'Wachtwoord is verplicht',
                          minLength: {
                            value: 6,
                            message:
                              'Wachtwoord moet minimaal 6 karakters lang zijn',
                          },
                        })}
                        style={{
                          border: errors?.password ? '2px solid #D0021B' : '',
                        }}
                        disabled={isLoading}
                      />
                      {errors?.password && (
                        <span className="error">{errors.password.message}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="confirmPassword">
                        Bevestig Wachtwoord:
                      </label>
                      <input
                        type="password"
                        id="confirmPassword"
                        className="form-control"
                        autoComplete="new-password"
                        placeholder="Bevestig je nieuwe wachtwoord"
                        {...register('confirmPassword', {
                          required: 'Wachtwoord bevestiging is verplicht',
                          validate: (value) =>
                            value === watchPassword ||
                            'Wachtwoorden komen niet overeen',
                        })}
                        style={{
                          border: errors?.confirmPassword
                            ? '2px solid #D0021B'
                            : '',
                        }}
                        disabled={isLoading}
                      />
                      {errors?.confirmPassword && (
                        <span className="error">
                          {errors.confirmPassword.message}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="box-footer-nomargin centered">
                <button
                  type="submit"
                  className="btn btn-primary block"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Bezig...'
                    : step === 1
                      ? 'Valideer Reset Code'
                      : 'Wijzig Wachtwoord'}
                </button>
                {step === 2 && (
                  <button
                    type="button"
                    className="btn btn-secondary block"
                    onClick={() => {
                      setStep(1)
                      setValidatedEmail('')
                      setValidatedToken('')
                    }}
                    disabled={isLoading}
                  >
                    Terug naar Reset Code
                  </button>
                )}
              </div>

              <div className="centered-column">
                <p>
                  Weet je je wachtwoord weer? <Link to="/login">Aanmelden</Link>
                </p>
                <p>
                  Geen reset code ontvangen?{' '}
                  <Link to="/reset">Nieuwe code aanvragen</Link>
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

export default PasswordReset
