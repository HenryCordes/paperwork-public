import { faInfoCircle } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useSelector } from 'react-redux'

const Alerts = () => {
  const alertsList = useSelector((state) => state.alert)

  return (
    <>
      {alertsList.map((alert) => (
        <div key={alert.id} className={`alert alert-${alert.type}`}>
          <FontAwesomeIcon icon={faInfoCircle} />{' '}
          <span className="margin-left-10"> {alert.message}</span>
          <a
            href="/#"
            className="close"
            data-dismiss="alert"
            aria-label="close"
            title="close"
          >
            ×
          </a>
        </div>
      ))}
    </>
  )
}

export default Alerts
