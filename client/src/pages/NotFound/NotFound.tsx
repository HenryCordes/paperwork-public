import { useNavigate } from 'react-router-dom'

const NotFound = () => {
  const navigate = useNavigate()

  const handleNavigation = () => {
    navigate('/contacts')
  }

  return (
    <section className="notfound">
      <section className="notfound-text">
        <h1 className="404">404</h1>
        <h2>Oeps, de pagina die je zoekt kan niet gevonden worden!</h2>
        <br />
        <br />
        <button className="btn btn-primary" onClick={handleNavigation}>
          Naar startpagina
        </button>
      </section>
    </section>
  )
}
export default NotFound
