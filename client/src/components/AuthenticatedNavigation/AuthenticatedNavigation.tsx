import { Nav, NavDropdown } from 'react-bootstrap'
import { useAppDispatch } from '../../redux/hooks'
import { Link } from 'react-router-dom'
import { LOGOUT } from '../../redux/authTypes'
import { useSubscriptionStatus } from '../../utils/useSubscriptionStatus'

interface AuthenticatedNavigationProps {
  name: string
}

const AuthenticatedNavigation = ({ name }: AuthenticatedNavigationProps) => {
  const dispatch = useAppDispatch()
  const { loading, hasActiveSubscription } = useSubscriptionStatus()

  const logout = () => {
    dispatch({ type: LOGOUT })
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <Nav className="fullwidth">
      {hasActiveSubscription && !loading && (
        <>
          <Nav.Item>
            <Nav.Link eventKey="2.1" href="/dashboard">
              Dashboard
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.2" href="/contacts">
              Contacten
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.3" href="/invoices">
              Facturen
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.4" href="/expenses">
              Kosten
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.5" href="/emails">
              Emails
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.6" href="/notes">
              Notities
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.7" href="/taxes">
              Belasting
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="2.8" href="/settings">
              Instellingen
            </Nav.Link>
          </Nav.Item>
        </>
      )}

      {!hasActiveSubscription && !loading && (
        <Nav.Item>
          <Nav.Link
            eventKey="2.7"
            href="/subscriptions"
            className="subscription-required"
          >
            Abonnement
          </Nav.Link>
        </Nav.Item>
      )}
      <NavDropdown
        className="justify-content-end navbar-right"
        title={name.length < 23 ? name : name.substr(0, 22)}
        id="user-nav-dropdown"
      >
        {hasActiveSubscription && (
          <NavDropdown.Item eventKey="1.2" as={Link} to="/profile">
            Profiel
          </NavDropdown.Item>
        )}
        <NavDropdown.Item eventKey="1.3" as={Link} to="/subscriptions">
          Abonnement
        </NavDropdown.Item>
        <NavDropdown.Item eventKey="1.4" as={Link} to="/taxes">
          Belasting
        </NavDropdown.Item>
        <NavDropdown.Divider />
        <NavDropdown.Item eventKey="4.4" onClick={logout}>
          Uitloggen
        </NavDropdown.Item>
      </NavDropdown>
    </Nav>
  )
}

export default AuthenticatedNavigation
