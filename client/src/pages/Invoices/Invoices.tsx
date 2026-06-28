import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import InvoicesTable from '../../components/InvoicesTable/InvoicesTable'

const Invoices = () => {
  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <InvoicesTable />
        <Footer />
      </div>
    </div>
  )
}
export default Invoices
