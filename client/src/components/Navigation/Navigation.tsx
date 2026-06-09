import { Navbar } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import PublicNavigation from '../PublicNavigation/PublicNavigation'
import AuthenticatedNavigation from '../AuthenticatedNavigation/AuthenticatedNavigation'

interface NavigationProps {
  name?: string
}

const Navigation = (props: NavigationProps) => {
  const auth = useSelector((state) => state.auth)

  return (
    <Navbar collapseOnSelect expand="lg" variant="dark">
      <Navbar.Brand>
        <Link to="/">paperwork</Link>
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="responsive-navbar-nav" />
      <Navbar.Collapse id="responsive-navbar-nav">
        {!auth.isAuthenticated ? (
          <PublicNavigation />
        ) : (
          <AuthenticatedNavigation name={props.name ?? ''} />
        )}
      </Navbar.Collapse>
    </Navbar>
  )
}

export default Navigation
