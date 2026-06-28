import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import ExpensesTable from '../../components/ExpensesTable/ExpensesTable'

const Expenses = () => {
  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <ExpensesTable />
        <Footer />
      </div>
    </div>
  )
}
export default Expenses
