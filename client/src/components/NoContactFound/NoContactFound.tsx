import { Link } from 'react-router-dom'

const NoContactFound = () => (
  <div>
    <h2 className="icon-users short" title="Contacten/klanten">
      {' '}
    </h2>
    <Link
      className="icon-add white pull-right top-margin-28"
      to="/contact/create"
      title="Nieuwe klant"
    >
      {' '}
      Nieuw contact
    </Link>
    <div className="row">
      <div className="col-12">
        <div className="box box box-primary">
          <div className="box-header">
            <h3 className="box-title">Contacten</h3>
          </div>

          <div className="box-body table-responsive no-padding">
            <div>Geen contacten gevonden...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
)

export default NoContactFound
