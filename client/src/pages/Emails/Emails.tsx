import EmailsTable from '../../components/EmailsTable/EmailsTable'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'

const Emails = () => {
  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <EmailsTable />
        <Footer />
      </div>
    </div>
  )
}
export default Emails
