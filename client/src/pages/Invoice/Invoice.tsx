import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { setAlert } from '../../redux/_actions/alertAction'
import { v4 as uuidv4 } from 'uuid'

// React Query imports
import { useInvoice, useCreateOrUpdateInvoice } from '../../hooks/api'
import { useContactsByType } from '../../hooks/api/useContacts'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import LineItems from '../../components/partials/LineItems'
import moment from 'moment'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { saveAs } from 'file-saver'
import { AppDispatch } from '../../redux/types'

// Matches the LineItemData interface in LineItems.tsx (not exported)
interface LineItemData {
  id?: string
  _id?: string
  name?: string
  description?: string
  numberOfItems?: string | number
  priceIncludingTax?: string | number
  taxRate?: string | number
}

interface InvoiceLine extends LineItemData {
  priceWOTaxes?: number
  priceIncludingTaxes?: number
  totalLinePrice?: number
}

interface InvoiceState {
  _id: string
  contactId: string
  invoiceNumber: string
  invoiceDate: string
  payDate: string
  tax: number
  taxLow: number
  taxLowest: number
  priceIncludingTaxes: number
  price: number
  state: string
  invoiceLines: InvoiceLine[]
}

interface Contact {
  _id: string
  typeName: string
  firstName?: string
  lastName?: string
  companyName?: string
}

const Invoice = () => {
  const { id, contactId } = useParams<{ id?: string; contactId?: string }>()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()
  const dispatch = useDispatch<AppDispatch>()
  const createOrUpdateMutation = useCreateOrUpdateInvoice()

  const { data: dbInvoice } = useInvoice(id as string, {
    enabled: !!id && !window.location.pathname.startsWith('/invoice/create'),
  })

  const { data: contacts = [] } = useContactsByType('Klant')

  const localState = {
    _id: '',
    contactId: '',
    invoiceNumber: '',
    invoiceDate: '',
    payDate: '',
    tax: 0.0,
    taxLow: 0.0,
    taxLowest: 0.0,
    priceIncludingTax: 0,
    priceWOTaxes: 0,
    price: 0,
    state: '',
    invoiceLines: [
      {
        id: uuidv4(), // react-beautiful-dnd unique key
        description: '',
        numberOfItems: 0,
        priceWOTaxes: 0.0,
        priceIncludingTax: 0.0,
        taxRate: 0,
        totalLinePrice: 0.0,
      },
    ],
  }

  const [localPriceIncludingTax, setPriceIncludingTax] = useState({
    priceIncludingTax: 0.0,
  })
  const [localTaxTotal, setTaxTotal] = useState({ tax: 0.0 })
  const [localTaxTotalLow, setTaxTotalLow] = useState({ taxLow: 0.0 })
  const [localTaxTotalLowest, setTaxTotalLowest] = useState({ taxLowest: 0.0 })
  const [localPriceWithOutTaxes, setTotalPriceWOTaxes] = useState({
    priceWOTaxes: 0.0,
  })

  const [invoice, setInvoice] = useState<InvoiceState>({
    _id: '',
    contactId: '',
    invoiceNumber: '',
    invoiceDate: '',
    payDate: '',
    tax: 0.0,
    taxLow: 0.0,
    taxLowest: 0.0,
    priceIncludingTaxes: 0,
    price: 0,
    state: '',
    invoiceLines: [
      {
        _id: '',
        description: '',
        numberOfItems: 0,
        priceIncludingTaxes: 0.0,
        totalLinePrice: 0.0,
        taxRate: 0,
      },
    ],
  })

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setInvoice({ ...invoice, [e.target.name]: e.target.value })

  const onSubmit = (data: Record<string, unknown>) => {
    if (data.invoiceDate === '' || data.tax === '') {
      dispatch(
        setAlert(
          'Factuurdatum en btw zijn verplicht, voer deze allemaal in.',
          'danger',
        ),
      )
    } else {
      if (localPriceIncludingTax.priceIncludingTax > 0) {
        data.priceIncludingTax = localPriceIncludingTax.priceIncludingTax
      }
      if (localTaxTotal.tax > 0) {
        data.tax = localTaxTotal.tax
      }
      if (localTaxTotalLow.taxLow > 0) {
        data.taxLow = localTaxTotalLow.taxLow
      }
      if (localTaxTotalLowest.taxLowest > 0) {
        data.taxLowest = localTaxTotalLowest.taxLowest
      }
      if (localPriceWithOutTaxes.priceWOTaxes > 0) {
        data.priceWithoutTaxes = localPriceWithOutTaxes.priceWOTaxes
      }
      if (data.contactId) {
        const contact = (contacts as Contact[]).find(
          (c) => c._id === data.contactId,
        )
        if (contact) {
          data.contactName =
            contact.typeName === 'Particulier'
              ? contact.lastName + ', ' + contact.firstName
              : contact.companyName
        }
      }
      if (invoice.invoiceLines) {
        data.invoiceLines = invoice.invoiceLines
      }

      if (window.location.pathname !== '/invoice/create' && dbInvoice?._id) {
        data._id = dbInvoice._id
      }

      createOrUpdateMutation.mutate(data, {
        onSuccess: () => {
          navigate('/invoices')
        },
      })
    }
  }

  const handleLineItemChange =
    (elementIndex: number) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const lineItems = invoice.invoiceLines.map((item, i) => {
        if (elementIndex !== i) return item
        return { ...item, [e.target.name]: e.target.value }
      })
      setInvoice({ ...invoice, invoiceLines: lineItems })
      updateTotals(lineItems)
    }

  const updateTotals = (lineItems: InvoiceLine[]) => {
    const lineItemTotal = lineItems.reduce(
      (prev, cur) =>
        prev +
        Number(cur.numberOfItems || 0) * Number(cur.priceIncludingTax || 0),
      0,
    )

    const taxTotal = lineItems.reduce(
      (prev, cur) =>
        prev +
        (cur.taxRate === '21' || cur.taxRate === 21
          ? Number(cur.numberOfItems || 0) *
            Number(cur.priceIncludingTax || 0) *
            (21 / 100)
          : 0),
      0,
    )

    const taxTotalLow = lineItems.reduce(
      (prev, cur) =>
        prev +
        (cur.taxRate === '9' || cur.taxRate === 9
          ? Number(cur.numberOfItems || 0) *
            Number(cur.priceIncludingTax || 0) *
            (9 / 100)
          : 0),
      0,
    )

    const taxTotalLowest = lineItems.reduce(
      (prev, cur) =>
        prev +
        (cur.taxRate === '6' || cur.taxRate === 6
          ? Number(cur.numberOfItems || 0) *
            Number(cur.priceIncludingTax || 0) *
            (6 / 100)
          : 0),
      0,
    )

    setPriceIncludingTax({
      ...localPriceIncludingTax,
      priceIncludingTax: parseFloat(String(lineItemTotal)),
    })
    setTaxTotal({ ...localTaxTotal, tax: parseFloat(String(taxTotal)) })
    setTaxTotalLow({
      ...localTaxTotalLow,
      taxLow: parseFloat(String(taxTotalLow)),
    })
    setTaxTotalLowest({
      ...localTaxTotalLowest,
      taxLowest: parseFloat(String(taxTotalLowest)),
    })
    setTotalPriceWOTaxes({
      ...localPriceWithOutTaxes,
      priceWOTaxes:
        parseFloat(String(lineItemTotal)) -
        parseFloat(String(taxTotal)) -
        parseFloat(String(taxTotalLow)) -
        parseFloat(String(taxTotalLowest)),
    })
  }

  const handleAddLineItem = () => {
    setInvoice({
      ...invoice,
      invoiceLines: invoice.invoiceLines.concat([
        {
          id: uuidv4(),
          description: '',
          numberOfItems: 0,
          priceWOTaxes: 0.0,
          taxRate: 0,
        },
      ]),
    })
  }

  const handleRemoveLineItem = (elementIndex: number) => () => {
    setInvoice({
      ...invoice,
      invoiceLines: invoice.invoiceLines.filter((_item, i) => {
        return elementIndex !== i
      }),
    })
  }

  const handleReorderLineItems = (newLineItems: LineItemData[]) => {
    setInvoice({
      ...invoice,
      invoiceLines: newLineItems as unknown as InvoiceLine[],
    })
  }

  const handleFocusSelect = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
  }

  const formatCurrency = (amount: number) => {
    if (!amount) {
      amount = 0
    }
    return new Intl.NumberFormat('NL-nl', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  useEffect(() => {
    if (window.location.pathname.startsWith('/invoice/create')) {
      setInvoice({ ...invoice, invoiceLines: localState.invoiceLines })
      if (contactId) {
        const dataTochange = { contactId: contactId }
        reset(dataTochange)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle invoice data when it's loaded
  useEffect(() => {
    if (dbInvoice && !window.location.pathname.startsWith('/invoice/create')) {
      const inv = { ...dbInvoice }
      inv.invoiceDate = moment(new Date(inv.invoiceDate)).format('yyyy-MM-DD')
      inv.payDate = moment(new Date(inv.payDate)).format('yyyy-MM-DD')
      reset(inv)
      setInvoice({ ...invoice, invoiceLines: inv.invoiceLines || [] })
      if (inv.invoiceLines && inv.invoiceLines.length > 0) {
        updateTotals(inv.invoiceLines)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbInvoice])

  const downloadPDF = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    let downloadId: string | undefined
    if (id) {
      downloadId = id
    } else if (dbInvoice && dbInvoice._id) {
      downloadId = dbInvoice._id
    } else {
      dispatch(setAlert('Geen factuur ID gevonden voor downloaden.', 'danger'))
      return
    }

    target.innerHTML = '<em>Downloading...</em>'
    target.classList.add('downloading')

    axios
      .get(`/api/invoice/download/${downloadId}`, { responseType: 'blob' })
      .then((res) => {
        const pdfBlob = new Blob([res.data], { type: 'application/pdf' })
        saveAs(pdfBlob, `factuur_${downloadId}.pdf`)
        target.innerHTML = 'Download factuur'
        target.classList.remove('downloading')
      })
      .catch(() => {
        target.innerHTML = 'Download factuur'
        target.classList.remove('downloading')
        dispatch(
          setAlert(
            'Er is iets misgegaan bij het downloaden van de factuur (.pdf), probeer het nogmaals.',
            'danger',
          ),
        )
      })
  }

  const mailInvoice = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const invoiceId = (e.target as HTMLButtonElement).getAttribute('data-id')
    navigate(`/invoice/send/${invoiceId}`)
  }

  const showDetails = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const invoiceId = (e.target as HTMLButtonElement).getAttribute('data-id')
    navigate(`/invoice/details/${invoiceId}`)
  }

  const getDateDaysLater = (days: number) => {
    const curr = new Date()
    curr.setDate(curr.getDate() + days)
    return curr.toISOString().substr(0, 10)
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* eslint-disable-next-line jsx-a11y/heading-has-content */}
          <h2 className="icon-calculator short" title="Facturen"></h2>
          <div className="row">
            <div className="col-md-12">
              <div className="box box-primary">
                <div className="box-header with-border">
                  <h3 className="box-title">Factuur</h3>
                </div>

                <div className="box-body">
                  {dbInvoice && dbInvoice.invoiceNumber && (
                    <div className="form-group required row">
                      <label className="col-form-label col-4 form-label">
                        Nummer
                      </label>
                      <div className="col-8 entity-number">
                        {dbInvoice ? dbInvoice.invoiceNumber : ''}
                      </div>
                    </div>
                  )}
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Contact
                    </label>
                    <div className="col-8">
                      <select
                        {...register('contactId', { required: true, onChange })}
                        defaultValue={dbInvoice ? dbInvoice.contactId : ''}
                        style={{
                          border: errors.contactId ? '2px solid #D0021B' : '',
                        }}
                      >
                        <option value="">Selecteer een contact...</option>
                        {contacts
                          ? (contacts as Contact[]).map((contact) => (
                              <option key={contact._id} value={contact._id}>
                                {contact.typeName === 'Particulier'
                                  ? contact.lastName + ', ' + contact.firstName
                                  : contact.companyName}
                              </option>
                            ))
                          : ''}
                      </select>
                      {errors.contactId && (
                        <span className="error">Kies een contact</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Factuurdatum
                    </label>
                    <div className="col-8">
                      <input
                        type="date"
                        {...register('invoiceDate', {
                          required: true,
                          onChange,
                        })}
                        className="form-control"
                        placeholder="Factuurdatum"
                        defaultValue={
                          dbInvoice
                            ? moment(new Date(dbInvoice.invoiceDate)).format(
                                'yyyy-MM-DD',
                              )
                            : new Date().toISOString().substr(0, 10)
                        }
                        style={{
                          border: errors.invoiceDate ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.invoiceDate && (
                        <span className="error">Voer een factuurdatum in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group row">
                    <label className="col-form-label col-4 form-label">
                      Betaaldatum
                    </label>
                    <div className="col-8">
                      <input
                        type="date"
                        {...register('payDate', { required: true, onChange })}
                        className="form-control"
                        placeholder="Betaaldatum"
                        defaultValue={
                          dbInvoice
                            ? moment(new Date(dbInvoice.payDate)).format(
                                'yyyy-MM-DD',
                              )
                            : getDateDaysLater(30)
                        }
                        style={{
                          border: errors.payDate ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.payDate && (
                        <span className="error">Voer een betaaldatum in</span>
                      )}
                    </div>
                  </div>
                  <div className="form-group required row">
                    <label className="col-form-label col-4 form-label">
                      Betaalstatus
                    </label>
                    <div className="col-8">
                      <select
                        {...register('state', { required: true, onChange })}
                        defaultValue={dbInvoice ? dbInvoice.state : ''}
                        style={{
                          border: errors.state ? '2px solid #D0021B' : '',
                        }}
                      >
                        <option value="Open">Open</option>
                        <option value="Te laat">Te laat</option>
                        <option value="Betaald">Betaald</option>
                      </select>
                      {errors.state && (
                        <span className="error">Voer een betaaldatum in</span>
                      )}
                    </div>
                  </div>

                  <LineItems
                    items={
                      invoice ? invoice.invoiceLines : localState.invoiceLines
                    }
                    currencyFormatter={formatCurrency}
                    addHandler={handleAddLineItem}
                    changeHandler={handleLineItemChange}
                    focusHandler={handleFocusSelect}
                    deleteHandler={handleRemoveLineItem}
                    reorderHandler={handleReorderLineItems}
                  />

                  <div className="invoice-total-container">
                    <div style={{ alignSelf: 'flex-end' }}>
                      <div className="invoice-value-table">
                        <div className="invoice-row">
                          <div className="invoice-label">Subtotaal</div>
                          <div className="invoice-value">
                            {formatCurrency(
                              localPriceWithOutTaxes.priceWOTaxes,
                            )}
                          </div>
                        </div>
                        {localTaxTotal.tax > 0 && (
                          <div className="invoice-row">
                            <div className="invoice-label">Btw (21%)</div>
                            <div className="invoice-value">
                              {formatCurrency(localTaxTotal.tax)}
                            </div>
                          </div>
                        )}
                        {localTaxTotalLow.taxLow > 0 && (
                          <div className="invoice-row">
                            <div className="invoice-label">Btw (9%)</div>
                            <div className="invoice-value">
                              {formatCurrency(localTaxTotalLow.taxLow)}
                            </div>
                          </div>
                        )}
                        {localTaxTotalLowest.taxLowest > 0 && (
                          <div className="invoice-row">
                            <div className="invoice-label">Btw (6%)</div>
                            <div className="invoice-value">
                              {formatCurrency(localTaxTotalLowest.taxLowest)}
                            </div>
                          </div>
                        )}
                        <div className="invoice-row">
                          <div className="invoice-label">Totaal</div>
                          <div className="invoice-value">
                            {formatCurrency(
                              localPriceIncludingTax.priceIncludingTax,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="box-footer">
                  <button type="submit" className="btn btn-primary">
                    Opslaan
                  </button>
                  <button
                    onClick={downloadPDF}
                    data-id={dbInvoice ? dbInvoice._id : ''}
                    className="btn btn-primary"
                  >
                    Download factuur
                  </button>
                  <button
                    onClick={showDetails}
                    data-id={dbInvoice ? dbInvoice._id : ''}
                    className="btn btn-primary"
                  >
                    Toon factuur
                  </button>
                  <button
                    onClick={mailInvoice}
                    data-id={dbInvoice ? dbInvoice._id : ''}
                    className="btn btn-primary"
                  >
                    Mail factuur
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        <Footer />
      </div>
    </div>
  )
}
export default Invoice
