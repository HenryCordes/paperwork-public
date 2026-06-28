import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import InvoiceReport from '../../components/InvoiceReport/InvoiceReport'
import { useParams } from 'react-router'
import { useInvoice, useSettings } from '../../hooks/api'
import { useContact } from '../../hooks/api/useContacts'
import { AppDispatch } from '../../redux/types'

const InvoiceDetails = () => {
  const { id } = useParams<{ id?: string }>()
  const dispatch = useDispatch<AppDispatch>()

  const {
    data: invoice,
    isError: isErrorInvoice,
    error: invoiceError,
  } = useInvoice(id as string)

  const {
    data: settings,
    isError: isErrorSettings,
    error: settingsError,
  } = useSettings()

  const {
    data: contact,
    isError: isErrorContact,
    error: contactError,
  } = useContact(invoice?.contactId, {
    enabled: !!invoice?.contactId,
  })

  if (isErrorInvoice) {
    dispatch(
      setAlert(
        `Fout bij het laden van de factuur: ${
          (invoiceError as Error)?.message || 'Onbekende fout'
        }`,
        'danger',
      ),
    )
  }

  if (isErrorSettings) {
    dispatch(
      setAlert(
        `Fout bij het laden van de instellingen: ${
          (settingsError as Error)?.message || 'Onbekende fout'
        }`,
        'danger',
      ),
    )
  }

  if (isErrorContact) {
    dispatch(
      setAlert(
        `Fout bij het laden van de contactgegevens: ${
          (contactError as Error)?.message || 'Onbekende fout'
        }`,
        'danger',
      ),
    )
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper invoice">
        <h2 className="icon-calculator short" title="Facturen">
          {' '}
        </h2>
        <div className="row">
          <div className="col-md-12 pdf">
            <div className="box box-primary ">
              <div id="pageHeader" className="title">
                <div className="box-header with-border">
                  <h3 className="box-title">Factuur</h3>
                </div>
              </div>

              <InvoiceReport
                invoice={invoice}
                settings={settings}
                contact={contact}
              />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}
export default InvoiceDetails
