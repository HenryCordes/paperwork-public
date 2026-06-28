import currentYear from 'current-year'

const copyrightYear = () => {
  const thisYear = currentYear()
  return thisYear
}

const Footer = () => (
  <div className="main-footer">
    <hr />
    <footer>
      <div className="footer-text">© {copyrightYear()} - paperwork</div>
    </footer>
  </div>
)

export default Footer
