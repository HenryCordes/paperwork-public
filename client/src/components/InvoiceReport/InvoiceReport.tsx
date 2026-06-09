import { useEffect, useState, MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { saveAs } from 'file-saver'
import moment from 'moment'
import { useAppDispatch } from '../../redux/hooks'
import { setAlert } from '../../redux/_actions/alertAction'

interface InvoiceLine {
  description: string
  numberOfItems: number
  priceIncludingTax?: number
  priceWOTaxes?: number
  taxRate?: number | string
}

interface Invoice {
  _id: string
  invoiceNumber?: string
  invoiceDate?: string
  payDate?: string
  contactName?: string
  contactId?: string
  invoiceLines?: InvoiceLine[]
  priceWithoutTaxes?: number
  priceIncludingTax?: number
  taxLowest?: number
  taxLow?: number
  tax?: number
  state?: string
}

interface Settings {
  companyLogo?: string
  companyName?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
  chamberOfCommerceNumber?: string
  taxNumber?: string
  bankName?: string
  bankIBAN?: string
}

interface Contact {
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
}

interface InvoiceReportProps {
  invoice?: Invoice
  settings?: Settings
  contact?: Contact
}

const InvoiceReport = ({ invoice, settings, contact }: InvoiceReportProps) => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const [localPriceWOTaxes, setPriceWOTaxes] = useState({ priceWOTaxes: 0.0 })
  const [localTaxTotal, setTaxTotal] = useState({ tax: 0.0 })
  const [localTotalPrice, setTotalPrice] = useState({ price: 0.0 })
  const [taxRate] = useState(0)

  const updateTotals = (lineItems: InvoiceLine[]) => {
    const lineItemTotal = lineItems.reduce(
      (prev, cur) => prev + cur.numberOfItems * (cur.priceWOTaxes ?? 0),
      0,
    )
    if (localPriceWOTaxes.priceWOTaxes !== lineItemTotal) {
      let taxTotal
      if (taxRate > 0) {
        taxTotal = lineItemTotal * (taxRate / 100)
      } else {
        taxTotal = 0
      }

      const grandTotal = lineItemTotal + taxTotal
      setPriceWOTaxes({
        ...localPriceWOTaxes,
        priceWOTaxes: parseFloat(String(lineItemTotal)),
      })
      setTaxTotal({ ...localTaxTotal, tax: parseFloat(String(taxTotal)) })
      setTotalPrice({
        ...localTotalPrice,
        price: parseFloat(String(grandTotal)),
      })
    }
  }

  const formatCurrency = (amount: number | string) => {
    return new Intl.NumberFormat('NL-nl', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount))
  }

  useEffect(() => {
    if (invoice && invoice.invoiceLines) {
      updateTotals(invoice.invoiceLines)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice])

  const downloadPDF = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const target = e.currentTarget

    target.innerHTML = '<em>Downloading...</em>'
    target.classList.add('downloading')

    axios
      .get(`/api/invoice/download/${id}`, { responseType: 'blob' })
      .then((res) => {
        const pdfBlob = new Blob([res.data], { type: 'application/pdf' })
        saveAs(pdfBlob, `factuur_${id}.pdf`)
        target.innerHTML = 'Download factuur'
        target.classList.remove('downloading')
      })
      .catch(() => {
        target.innerHTML = 'Download factuur'
        target.classList.remove('downloading')
        dispatch(
          setAlert(
            'Er is iets misgegaan bij het downloaden van de factuur (.pdf), probeer het nogmaals aub.',
            'danger',
          ),
        )
      })
  }

  const printInvoice = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    window.print()
  }

  const mailInvoice = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const invoiceId = (event.target as HTMLButtonElement).getAttribute(
      'data-id',
    )
    navigate(`/invoice/send/${invoiceId}`)
  }

  return (
    <div>
      <div id="invoice-report" className="box-body invoice-report">
        <table className="table-header" style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ width: '33%', verticalAlign: 'top' }}>
                <br />
                <br />
                <br />
                <br />
                <span className="bold">
                  {invoice ? invoice.contactName : ''}
                </span>
                <br />
                {contact ? contact.street : ''}{' '}
                {contact ? contact.houseNumber : ''} <br />
                {contact ? contact.postalCode : ''}{' '}
                {contact ? contact.city : ''}
                <br />
              </td>
              <td
                style={{
                  width: '34%',
                  verticalAlign: 'top',
                  textAlign: 'center',
                }}
              >
                <img
                  src={settings ? settings.companyLogo : ''}
                  alt="company logo"
                />
              </td>
              <td
                style={{
                  width: '33%',
                  verticalAlign: 'top',
                  textAlign: 'right',
                }}
              >
                <div className="bold">
                  {settings ? settings.companyName : ''}
                </div>
                {settings ? settings.street : ''}{' '}
                {settings ? settings.houseNumber : ''}
                <br />
                {settings ? settings.postalCode : ''}{' '}
                {settings ? settings.city : ''}
                <br />
                Kvk: {settings ? settings.chamberOfCommerceNumber : ''}
                <br />
                BTW: {settings ? settings.taxNumber : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="table report onelinertable nopaddingtable">
          <tbody>
            <tr>
              <td width="150px" className="padleft-0">
                Factuurnummer:
              </td>
              <td>
                {invoice && invoice.invoiceNumber ? invoice.invoiceNumber : ''}
              </td>
            </tr>
            <tr>
              <td className="padleft-0">Factuurdatum:</td>
              <td>
                {invoice && invoice.invoiceDate
                  ? moment(new Date(invoice.invoiceDate)).format('yyyy-MM-DD')
                  : ''}
              </td>
            </tr>
            <tr>
              <td className="padleft-0">Vervaldatum:</td>
              <td>
                {invoice && invoice.payDate
                  ? moment(new Date(invoice.payDate)).format('yyyy-MM-DD')
                  : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <div>
          <br />
          <br />
          <br />
          <br />
        </div>

        <table className="table report onelinertable">
          <tbody>
            <tr>
              <th style={{ width: '45%' }}>Omschrijving</th>
              <th style={{ width: '65px' }}>Aantal</th>
              <th className="price">Bedrag</th>
              <th className="price">Totaal</th>
              <th className="price last">BTW</th>
            </tr>
            {invoice &&
              invoice.invoiceLines &&
              invoice.invoiceLines.map((invoiceLine) => (
                <tr key={invoiceLine.description}>
                  <td>{invoiceLine.description}</td>
                  <td className="price">{invoiceLine.numberOfItems}</td>
                  <td className="price">
                    {formatCurrency(invoiceLine.priceIncludingTax || '0')}
                  </td>
                  <td className="price">
                    {formatCurrency(
                      invoiceLine.priceIncludingTax
                        ? invoiceLine.priceIncludingTax *
                            invoiceLine.numberOfItems || 1
                        : '0',
                    )}
                  </td>
                  <td className="price last">{`${
                    invoiceLine.taxRate || '21'
                  }%`}</td>
                </tr>
              ))}
            <tr className="top-line">
              <td colSpan={3} className="bold align-right">
                Subtotaal:
              </td>
              <td className="bold align-right">
                {invoice && formatCurrency(invoice.priceWithoutTaxes || 0)}
              </td>
              <td></td>
            </tr>
            {invoice?.taxLowest != null && invoice.taxLowest > 0 && (
              <tr>
                <td colSpan={3} className="align-right">
                  BTW 6%:
                </td>
                <td className="align-right">
                  {formatCurrency(invoice?.taxLowest || 0)}
                </td>
                <td></td>
              </tr>
            )}
            {invoice?.taxLow != null && invoice.taxLow > 0 && (
              <tr>
                <td colSpan={3} className="align-right">
                  BTW 9%:
                </td>
                <td className="align-right">
                  {invoice && formatCurrency(invoice.taxLow || 0)}
                </td>
                <td></td>
              </tr>
            )}
            {invoice?.tax != null && invoice.tax > 0 && (
              <tr>
                <td colSpan={3} className="align-right">
                  BTW 21%:
                </td>
                <td className="align-right">
                  {invoice && formatCurrency(invoice.tax || 0)}
                </td>
                <td></td>
              </tr>
            )}
            <tr className="top-line">
              <td colSpan={3} className="bold align-right">
                Totaal:
              </td>
              <td className="bold align-right">
                {formatCurrency(invoice?.priceIncludingTax || 0)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div id="pageFooter" className="pad-45">
          <table className="table report onelinertable footer-table">
            <tbody>
              <tr>
                <td>
                  Bank
                  <div className="bold">
                    {settings ? settings.bankName : ''}
                  </div>
                </td>
                <td>
                  IBAN-nummer
                  <div className="bold">
                    {settings ? settings.bankIBAN : ''}
                  </div>
                </td>
                <td>
                  KvK Nummer
                  <div className="bold">
                    {settings ? settings.chamberOfCommerceNumber : ''}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="footer-text">
            Het openstaande bedrag dient binnen 30 dagen overgemaakt te zijn op
            rekeningnummer: <br />
            {settings ? settings.bankIBAN : ''} onder vermelding van
            factuurnummer: {invoice ? invoice.invoiceNumber : ''}
          </div>
        </div>
      </div>
      <div className="box-footer">
        <button
          onClick={downloadPDF}
          data-id={invoice ? invoice._id : ''}
          className="btn btn-primary"
        >
          Download factuur
        </button>
        <button
          onClick={mailInvoice}
          data-id={invoice ? invoice._id : ''}
          className="btn btn-primary"
        >
          Mail factuur
        </button>
        <button onClick={printInvoice} className="btn btn-primary">
          Print factuur
        </button>
      </div>
    </div>
  )
}
export default InvoiceReport
