import { useState } from 'react'
import ContactDetails from '../../components/ContactDetails/ContactDetails'
import InvoicesTable from '../../components/InvoicesTable/InvoicesTable'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { useParams } from 'react-router'

const Contact = () => {
  const { id } = useParams<{ id: string }>()

  const [state, setState] = useState({
    activeTab: 'contact',
  })

  const setActiveClassOnTab = (tab: string) => {
    return state.activeTab === tab ? 'active' : ''
  }

  const handleChangeTabs = (event: React.MouseEvent<HTMLLIElement>) => {
    const tab = (event.currentTarget as HTMLElement).getAttribute('data-tab')
    if (tab) {
      setState({ activeTab: tab })
    }
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <div className="row">
          <h2 className="icon-user pull-left margin-l-20" title="Contact/klant">
            {' '}
          </h2>
          <ul className="tabs">
            <li
              onClick={handleChangeTabs}
              className={`tab ${setActiveClassOnTab('contact')}`}
              data-tab="contact"
            >
              Contact
            </li>
            <li
              onClick={handleChangeTabs}
              className={`tab ${setActiveClassOnTab('facturen')}`}
              data-tab="facturen"
            >
              Facturen
            </li>
          </ul>
        </div>
        <div className="tabs-data">
          <div
            id="contact"
            className={`tabs-data-container ${setActiveClassOnTab('contact')}`}
          >
            <ContactDetails />
          </div>
          <div
            id="facturen"
            className={`tabs-data-container ${setActiveClassOnTab('facturen')}`}
          >
            <InvoicesTable contactId={id} />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}
export default Contact
