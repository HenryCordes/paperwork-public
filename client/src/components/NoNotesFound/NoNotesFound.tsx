import { Link } from 'react-router-dom'

const NoNotesFound = ({ contactName }: { contactName?: string }) => (
  <div>
    <h2 className="icon-list short" title="Notities">
      {' '}
    </h2>
    <Link
      className="icon-add white pull-right top-margin-28"
      to="/note/create"
      title="Nieuwe notitie"
    >
      {' '}
      Nieuwe notitie
    </Link>
    <div className="row">
      <div className="col-12">
        <div className="box box box-primary">
          <div className="box-header">
            <h3 className="box-title">
              Notities {contactName ? 'voor ' + contactName : ''}
            </h3>
          </div>

          <div className="box-body table-responsive no-padding">
            <div>Geen notities gevonden...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
)

export default NoNotesFound
