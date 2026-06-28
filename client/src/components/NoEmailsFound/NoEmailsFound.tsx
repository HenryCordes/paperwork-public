import { Link } from 'react-router-dom'

const NoEmailsFound = ({ contactName }: { contactName?: string }) => (
  <div>
    <h2 className="icon-envelope short" title="Emails">
      {' '}
    </h2>
    <Link
      className="icon-add white pull-right top-margin-28"
      to="/email/create"
      title="Nieuwe email"
    >
      {' '}
      Nieuwe email
    </Link>
    <div className="row">
      <div className="col-12">
        <div className="box box box-primary">
          <div className="box-header">
            <h3 className="box-title">
              Emails {contactName ? 'voor ' + contactName : ''}
            </h3>
          </div>

          <div className="box-body table-responsive no-padding">
            <div>Geen emails gevonden...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
)

export default NoEmailsFound
