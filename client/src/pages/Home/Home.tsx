import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import Footer from '../../components/Footer/Footer'
import { USER_LOADED, AUTH_ERROR } from '../../redux/authTypes'
import axios from 'axios'
import setAuthToken from '../../utils/setAuthToken'
import {
  useSubscription,
  hasActiveSubscription,
} from '../../hooks/api/useSubscriptions'
import { useSelector } from 'react-redux'

// Original used react-router v5 `history` prop — converted to v6 (no navigation needed here,
// auth redirect is handled elsewhere; history prop dropped).
const Home = () => {
  const dispatch = useDispatch()
  const state = useSelector((state) => state.auth)
  const [lastName, setLastName] = useState('')

  // Get subscription data to check status
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    useSubscription()

  const loadUsers = async () => {
    setAuthToken(localStorage.token)
    try {
      const res = await axios.get('/api/auth/me')
      setLastName(res.data.data.lastName)
      console.log(lastName)
      dispatch({ type: USER_LOADED, payload: res.data })
    } catch (err) {
      console.log(err)
      dispatch({ type: AUTH_ERROR, payload: (err as Error).message })
    }
  }

  useEffect(() => {
    if (localStorage.token) {
      loadUsers()
    }
    // eslint-disable-next-line
  }, [])

  return (
    <div>
      <div className="body-content content-wrapper">
        <div className="jumbotron">
          <img
            className="logohome"
            src="assets/img/books_64.png"
            alt="paperwork logo"
          />
          <h1 className="brand">paperwork</h1>
          <p className="lead">
            De administratieve applicatie voor kleinere ondernemingen!
          </p>
          <p>
            ZZp'er, eenmanszaak of eigenaar van een kleinere onderneming? Steek
            de kostbare tijd die je hebt in datgene waar je goed in bent!
            <br />
            Deze boekhoud applicatie maakt het zo eenvoudig mogelijk om de
            administratieve taken, die noodzakelijk zijn om te slagen met jouw
            onderneming, uit te voeren.
          </p>
          <p>
            {!subscriptionLoading && (
              <Link
                to={
                  hasActiveSubscription(subscriptionData) ||
                  !state.isAuthenticated
                    ? '/dashboard'
                    : '/subscriptions'
                }
                className="btn btn-primary btn-large"
              >
                {hasActiveSubscription(subscriptionData)
                  ? 'Start mijn paperwork'
                  : !state.isAuthenticated
                    ? 'Login'
                    : 'Activeer mijn abonnement'}
              </Link>
            )}
            {subscriptionLoading && (
              <Link to="#" className="btn btn-primary btn-large disabled">
                Laden...
              </Link>
            )}
          </p>
        </div>

        <div className="content-centered">
          <div className="row">
            {/* <div className="col-md-6">
              <h2>Nog geen account?</h2>
              <p>
                Maak een account aan en registreer je klanten en contactmomenten
                        </p>
              <p><a className="btn btn-default" href="/register">Maak mijn account </a></p>
            </div> */}
            <div className="col-md-6 padding-bottom-35">
              <h2>Informatie</h2>
              <p>Wil je meer informatie?</p>
              <p>
                <a className="btn btn-default" href="/about">
                  Informatie
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="content-centered no-sidebar">
        <Footer />
      </div>
    </div>
  )
}

export default Home
