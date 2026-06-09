import moment from 'moment'

interface ReportInvoiceLine {
  description?: string
  numberOfItems: number
  priceIncludingTax: number
  taxRate?: number
}

interface ReportInvoice {
  invoiceNumber?: number
  invoiceDate: string | Date
  payDate?: string | Date
  contactName?: string
  invoiceLines?: ReportInvoiceLine[]
  tax?: number
  taxLow?: number
  taxLowest?: number
  priceWithoutTaxes?: number
  priceIncludingTax?: number
}

interface ReportSettings {
  companyName?: string
  companyLogo?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
  taxNumber?: string
  chamberOfCommerceNumber?: string
  bankName?: string
  bankIBAN?: string
}

interface ReportContact {
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
}

const invoiceReport = ({
  invoice,
  settings,
  contact,
}: {
  invoice: ReportInvoice
  settings: ReportSettings
  contact: ReportContact
}): string => {
  const invoiceDate = moment(new Date(invoice.invoiceDate)).format('yyyy-MM-DD')
  const payDate = moment(new Date(invoice.payDate as string | Date)).format(
    'yyyy-MM-DD',
  )

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('NL-nl', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return `
<!doctype html>
   <html>
      <head>
         <meta charset="utf-8">
         <title>Factuur</title>
         <style>

         body {
             font-family: "Lato","Helvetica Neue",Helvetica,Arial,sans-serif;
             font-size: 13px;
             line-height: 1.42857143;
             color: #484848;
      
          }
           .box-body.invoice-report {
             max-width: 800px;
            }

            .body-content {
                padding-left: 15px;
                padding-right: 15px;
                padding-top: 0px;
            }
            .bold {
                font-weight: 700;
            }

              .pdf {
                display: block;
                border: 0px;
              }
              .box-body{
                padding: 0;
              }
              .col-sm-3 {
                  width: 25%;
                  float: left;

                  font-size:10px;
              }
              .col-sm-8 {
                  width: 66.66666667%;
                  float: left;
              }
              .table-header {
                width: 100%;
                max-width: 100%;
                margin-bottom: 20px;
              }
              .table {
                  width: 100%;
                  max-width: 100%;
                  margin-bottom: 20px;
              }
              .onelinertable {
                  width: 100%;
                  table-layout: fixed;
                  border-collapse: collapse;
                  border-spacing: 0;
                  border: 0;
              }
              .onelinertable td {
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
              }
              .onelinertable > tbody > tr:last-child {
                  border-bottom: 1px solid #dee2e6;
              }
              .table.nopaddingtable > tbody > tr > td {
                  padding: 0px;
              }
              .table.report > tbody > tr > td {
                  border-top: 0;
              }
              .table > tbody > tr > td {
                  padding-bottom: 6px;
                  padding-right: 10px;
              }
              .table.report > tbody > tr > td {
                  border-top: 0;
              }
              .table.report > tbody > tr > th {
                 text-align: left;
                  border-top: 0;
                  border-bottom: 1px solid #ddd;
              }
              .table.report > tbody > tr.top-line > td {
                  border-top: 1px solid #ddd;
              }
              .pad-15 { padding: 15px; }
              .table.footer-table, .table.footer-table td {
                  border-collapse: separate;
                  font-size:11px;
              }
              .table.footer-table {
                  border-spacing: 3px;
                  margin-top: 50px;
              }
              .table.footer-table > tbody > tr > td {
                  padding-left: 7px;
                  border: solid 1px #ddd;
                  font-size:11px;
              }
              .footer-text {
                  margin-left: auto;
                  margin-right: auto;
                  text-align: center;
              }
              .align-right {
                text-align: right;
              }
              .box-footer { display: none; }
              hr { display: none; }

              .box.box-primary,
              body.light .box.box-primary,
              body.dark .box.box-primary {
                border-top-color:transparent !important;
              }
              #pageHeader,
              #pageHeader.title,
              .title
              {display: none; }
              h2.icon-calculator.short { display: none; }
             .main-footer { display: none; }

         </style>
       </head>
      <body class="pdf">
        <div id="invoice-report" class="box-body invoice-report">
          <table class="table-header" style="width: 100%;">
            <tbody>
              <tr>
                <td style="width: 33%; vertical-align: top;">
                  <br><br><br><br>
                  <span class="bold">${`${invoice.contactName}`}</span>
                  <br>${`${contact.street} ${contact.houseNumber}`}<br>
                  ${`${contact.postalCode} ${contact.city}`}<br>
                </td>
                <td style="width: 34%; vertical-align: top; text-align: center;">
                  <img src="${
                    settings.companyLogo
                      ? `${process.env.API_URL}${settings.companyLogo}`
                      : `${process.env.API_URL}/assets/img/books_64.png`
                  }" alt="company logo">
                </td>
                <td style="width: 33%; vertical-align: top; text-align: right;">
                  <div class="bold">${`${settings.companyName}`}</div>
                  ${`${settings.street} ${settings.houseNumber}`}<br>
                  ${`${settings.postalCode} ${settings.city}`}<br>
                  Kvk: ${`${settings.chamberOfCommerceNumber}`}<br>
                  BTW: ${`${settings.taxNumber}`}
                </td>
              </tr>
            </tbody>
          </table>
          <table class="table report onelinertable nopaddingtable">
            <tbody>
              <tr>
                <td width="150px" class="padleft-0">Factuurnummer:</td>
                <td>${`${invoice.invoiceNumber}`}</td>
              </tr>
              <tr>
                <td class="padleft-0">Factuurdatum:</td>
                <td>${`${invoiceDate}`}</td>
              </tr>
              <tr>
                <td class="padleft-0">Vervaldatum:</td>
                <td>${`${payDate}`}</td>
              </tr>
            </tbody>
          </table>
          <table class="table report onelinertable">
            <tbody>
              <tr>
                <th style="width: 45%;">Omschrijving</th>
                <th style="width: 65px;">Aantal</th>
                <th class="price">Bedrag</th>
                <th class="price">Totaal</th>
                <th class="price last">BTW</th>
              </tr>
              ${(invoice.invoiceLines || [])
                .map(
                  (invoiceLine) => `
                <tr>
                  <td>${invoiceLine.description}</td>
                  <td className="price">${invoiceLine.numberOfItems}</td>
                  <td className="price">${formatCurrency(
                    invoiceLine.priceIncludingTax,
                  )}</td>
                  <td className="price">${formatCurrency(
                    invoiceLine.priceIncludingTax * invoiceLine.numberOfItems,
                  )}</td>
                  <td className="price last">${`${invoiceLine.taxRate}%`}</td>
                </tr>
                `,
                )
                .join('')}
              <tr class="top-line">
                <td colspan="3" class="bold align-right">Totaal excl. BTW:</td>
                <td colspan="2"class="price last bold">${`${formatCurrency(
                  invoice?.priceWithoutTaxes || 0,
                )}`}</td>
              </tr>
              ${
                (invoice.taxLowest ?? 0) > 0 &&
                `
                  <tr>
                    <td colspan="3" class="align-right">BTW (6%):</td>
                    <td colspan="2"class="price last">
                      ${`${formatCurrency(invoice.taxLowest ?? 0)}`}
                    </td>
                  </tr>
                `
              }
              ${
                (invoice.taxLow ?? 0) > 0 &&
                `
                  <tr>
                    <td colspan="3" class="align-right">BTW (9%):</td>
                    <td colspan="2"class="price last">
                      ${`${formatCurrency(invoice.taxLow ?? 0)}`}
                    </td>
                  </tr>
                `
              }
              ${
                (invoice.tax ?? 0) > 0 &&
                `
                  <tr>
                    <td colspan="3" class="align-right">BTW (21%):</td>
                    <td colspan="2"class="price last">
                      ${`${formatCurrency(invoice.tax ?? 0)}`}
                    </td>
                  </tr>
                `
              }
              <tr class="top-line">
                <td colspan="3" class="bold align-right">Totaal:</td>
                <td colspan="2"class="price last bold">${`${formatCurrency(
                  invoice?.priceIncludingTax || 0,
                )}`}</td>
              </tr>
            </tbody>
          </table>
          <div class="pad-15">
            <table class="table report onelinertable footer-table">
              <tbody>
                <tr>
                  <td>Bank
                    <div class="bold">${`${settings.bankName}`}</div>
                  </td>
                  <td>IBAN-nummer
                    <div class="bold">${`${settings.bankIBAN}`}</div>
                  </td>
                  <td>KvK Nummer
                    <div class="bold">${`${settings.chamberOfCommerceNumber}`}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="footer-text">Het openstaande bedrag dient binnen 30 dagen overgemaakt te zijn op rekeningnummer: <br>
            ${`${settings.bankIBAN}`} onder vermelding van factuurnummer: ${`${invoice.invoiceNumber}`}
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

export = invoiceReport
