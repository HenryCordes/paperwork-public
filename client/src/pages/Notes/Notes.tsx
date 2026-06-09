import NotesTable from '../../components/NotesTable/NotesTable'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'

const Notes = () => {
  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <NotesTable />
        <Footer />
      </div>
    </div>
  )
}
export default Notes
