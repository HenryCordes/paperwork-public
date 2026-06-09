import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch } from '../../redux/hooks'
import { register } from '../../redux/_actions/authAction'
import { setAlert } from '../../redux/_actions/alertAction'
import { CLEAR_ERRORS } from '../../redux/alertTypes'
import Footer from '../Footer/Footer'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'

// Original used react-router v5 `history` prop — converted to v6 useNavigate.
const Register = () => {
  const auth = useSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem('token') && auth.isAuthenticated)
      navigate('/login')

    if (auth.error === 'Gebruiker is al bekend') {
      dispatch(setAlert(auth.error, 'danger'))
      dispatch({ type: CLEAR_ERRORS })
    }
    // eslint-disable-next-line
  }, [auth.isAuthenticated, auth.error])

  const [newUser, setNewUser] = useState({
    name: '',
    companyName: '',
    email: '',
    password: '',
  })

  const { name, companyName, email, password } = newUser

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setNewUser({ ...newUser, [e.target.name]: e.target.value })

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (name === '' || email === '' || password === '')
      dispatch(
        setAlert(
          'Naam, email en wachtwoord zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    else
      dispatch(register(newUser)).then((user) => {
        if (user) {
          navigate('/settings')
        }
      })
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="body-content content-wrapper">
        <div className="row">
          <div className="login-row">
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">
                  <FontAwesomeIcon icon={faUser} /> Registreren
                </h3>
              </div>

              <div className="box-body">
                <div className="form-group">
                  <label htmlFor="name">Naam:</label>
                  <input
                    placeholder="Naam"
                    id="name"
                    name="name"
                    className="form-control"
                    value={name}
                    onChange={onChange}
                    autoComplete="name"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="name">Bedrijfsnaam:</label>
                  <input
                    placeholder="Bedrijfsnaam"
                    id="companyName"
                    name="companyName"
                    className="form-control"
                    value={companyName}
                    onChange={onChange}
                    autoComplete="companyname"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email:</label>
                  <input
                    placeholder="Email"
                    type="email"
                    id="email"
                    name="email"
                    className="form-control"
                    value={email}
                    onChange={onChange}
                    autoComplete="username"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password:</label>
                  <input
                    placeholder="Password"
                    type="password"
                    id="password"
                    name="password"
                    minLength={6}
                    className="form-control"
                    value={password}
                    onChange={onChange}
                    autoComplete="current-password"
                  />
                </div>

                <div className="box-footer-nomargin centered">
                  <button type="submit" className="btn btn-primary">
                    Registreren
                  </button>
                </div>
                <div className="centered bottompadding">
                  <p>
                    Heb je al een account? <a href="/login">Log in</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </form>
  )
}

export default Register
