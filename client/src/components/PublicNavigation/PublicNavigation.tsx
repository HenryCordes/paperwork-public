import { Nav } from 'react-bootstrap'

const PublicNavigation = () => (
  <div className="fullwidth">
    <Nav className="fullwidth">
      <Nav.Item>
        <Nav.Link eventKey="1" href="/about">
          Over paperwork
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="2" href="/contactus">
          Contact
        </Nav.Link>
      </Nav.Item>
    </Nav>

    <Nav className="navbar-right top-adjusted">
      {/* <Nav.Item>
    <Nav.Link eventKey="3" href="/register">
      Registreren
    </Nav.Link>
  </Nav.Item> */}
      <Nav.Item>
        <Nav.Link eventKey="4" href="/login">
          Log In
        </Nav.Link>
      </Nav.Item>
    </Nav>
  </div>
)

export default PublicNavigation
