import { Component } from 'react'
import Footer from '../../components/Footer/Footer'

export default class ContactPage extends Component {
  render() {
    return (
      <div className="body-content content-wrapper">
        <div className="content-centered padding-top-15">
          <h2>Contact</h2>
          <br />
          <p>Contact opnemen kan via email via onderstaande adres</p>

          <address>
            <strong>Support:</strong>{' '}
            <a href="mailto:paperworkdevelopment@gmail.com">
              paperworkdevelopment@gmail.com
            </a>
          </address>
        </div>
        <div className="no-sidebar">
          <Footer />
        </div>
      </div>
    )
  }
}
