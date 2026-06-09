import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { useSubscriptionStatus } from '../../utils/useSubscriptionStatus'

interface SideBarProps {
  companyName?: string
}

const SideBar = ({ companyName }: SideBarProps) => {
  const { loading, hasActiveSubscription } = useSubscriptionStatus()
  return (
    <aside className="main-sidebar">
      <section className="sidebar">
        <form action="#" method="get" className="sidebar-form">
          <div className="input-group">
            <input
              type="text"
              name="q"
              className="form-control"
              placeholder="Search..."
            />
            <span className="input-group-btn">
              <button
                type="submit"
                name="search"
                id="search-btn"
                className="btn btn-flat"
              >
                <FontAwesomeIcon icon={faSearch} />
              </button>
            </span>
          </div>
        </form>
        <ul className="sidebar-menu tree" data-widget="tree">
          <li className="header uppercase">{companyName}</li>

          {/* Routes that require an active subscription */}
          {hasActiveSubscription && !loading && (
            <>
              <li>
                <Link to="/dashboard">
                  <i className="icon-newspaper"></i> <span>Dashboard</span>
                </Link>
              </li>
              <li>
                <Link to="/contacts">
                  <i className="icon-users"></i> <span>Contacten</span>
                </Link>
              </li>
              <li>
                <Link to="/invoices">
                  <i className="icon-calculator"></i> <span>Facturen</span>
                </Link>
              </li>
              <li>
                <Link to="/expenses">
                  <i className="icon-store"></i> <span>Kosten</span>
                </Link>
              </li>
              <li>
                <Link to="/emails">
                  <i className="icon-envelope"></i> <span>Emails</span>
                </Link>
              </li>
              <li>
                <Link to="/notes">
                  <i className="icon-list"></i> <span>Notities</span>
                </Link>
              </li>
              <li className="header uppercase">Overige</li>
              <li>
                <Link to="/taxes">
                  <i className="icon-portfolio"></i> <span>Belasting</span>
                </Link>
              </li>
              <li>
                <Link to="/settings">
                  <i className="icon-settings"></i> <span>Instellingen</span>
                </Link>
              </li>
            </>
          )}

          {/* Always show these regardless of subscription status */}
          {!hasActiveSubscription && !loading && (
            <>
              <li className="subscription-required">
                <Link to="/subscriptions">
                  <i className="icon-credit-card"></i> <span>Abonnement</span>
                </Link>
              </li>
              <li>
                <Link to="/profile">
                  <i className="icon-user"></i> <span>Profiel</span>
                </Link>
              </li>
            </>
          )}
        </ul>
      </section>
    </aside>
  )
}
export default SideBar
