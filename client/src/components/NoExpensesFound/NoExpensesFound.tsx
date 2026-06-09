import { Link } from 'react-router-dom'

const NoExpensesFound = ({ contactName }: { contactName?: string }) => (
  <div>
    <h2 className="icon-store short" title="Kosten">
      {' '}
    </h2>
    <Link
      className="icon-add white pull-right top-margin-28"
      to="/expense/create"
      title="Nieuwe kosten"
    >
      {' '}
      Nieuwe kosten
    </Link>
    <div className="row">
      <div className="col-12">
        <div className="box box box-primary">
          <div className="box-header">
            <h3 className="box-title">
              Kosten {contactName ? 'voor ' + contactName : ''}
            </h3>
          </div>

          <div className="box-body table-responsive no-padding">
            <div>Geen kosten gevonden...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
)

export default NoExpensesFound
