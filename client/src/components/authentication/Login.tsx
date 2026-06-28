import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useAppDispatch } from '../../redux/hooks'
import { login, getProfile } from '../../redux/_actions/authAction'
import { setAlert } from '../../redux/_actions/alertAction'
import { CLEAR_ERRORS } from '../../redux/alertTypes'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignInAlt } from '@fortawesome/free-solid-svg-icons'
import { useForm } from 'react-hook-form'
import Footer from '../Footer/Footer'

interface LoginFormData {
  email: string
  password: string
}

const Login = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>()
  const state = useSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  })

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setLoginData({ ...loginData, [e.target.name]: e.target.value })

  useEffect(() => {
    if (state.isAuthenticated) {
      navigate('/dashboard')
    }
    if (state.error === 'Combinatie van naam en wachtwoord is niet gevonden') {
      dispatch(setAlert(state.error, 'danger'))
      dispatch({ type: CLEAR_ERRORS })
    }
    // eslint-disable-next-line
  }, [state.isAuthenticated, state.user, state.error])

  const onSubmit = async (data: LoginFormData) => {
    if (data.email === '' || data.password === '') {
      dispatch(setAlert('Email en wachtwoord zijn verplicht', 'danger'))
    } else {
      // Login and get the token
      const loginResult = await dispatch(login(data.email, data.password))

      // If login succeeded, explicitly load the user profile before navigation
      if (loginResult && loginResult.success) {
        await dispatch(getProfile())
      }
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
                  <FontAwesomeIcon icon={faSignInAlt} /> Aanmelden
                </h3>
              </div>

              <div className="box-body">
                <div className="logo-wrapper">
                  <img src="assets/img/books_64.png" alt="logo" />
                  <h2>paperwork</h2>
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email:</label>
                  <input
                    type="email"
                    id="email"
                    className="form-control"
                    autoComplete="username"
                    placeholder="Email"
                    defaultValue={loginData.email}
                    {...register('email', {
                      required: true,
                      onChange,
                    })}
                    style={{ border: errors?.email ? '2px solid #D0021B' : '' }}
                  />
                  {errors?.email && (
                    <span className="error">Voer je email adres in</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="password">Wachtwoord:</label>
                  <input
                    type="password"
                    id="password"
                    className="form-control"
                    autoComplete="password"
                    placeholder="Wachtwoord"
                    defaultValue={loginData.password}
                    {...register('password', {
                      required: true,
                      onChange,
                    })}
                    style={{
                      border: errors?.password ? '2px solid #D0021B' : '',
                    }}
                  />
                  {errors.password && (
                    <span className="error">Voer een wachtwoord in</span>
                  )}
                </div>
              </div>

              <div className="box-footer-nomargin centered">
                <button type="submit" className="btn btn-primary block">
                  Aanmelden
                </button>
              </div>
              <div className="centered-column">
                <p>
                  Wachtwoord vergeten?{' '}
                  <Link to="/reset">Wachtwoord wijzigen</Link>
                </p>
                <p>
                  Account aanmaken? <Link to="/subscribe">Registreren</Link>
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
export default Login
