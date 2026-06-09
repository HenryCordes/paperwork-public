import invoiceReport from '../../../modules/invoice-report'

const baseArgs = () => ({
  invoice: {
    invoiceNumber: 2024,
    invoiceDate: '2026-03-01',
    payDate: '2026-03-31',
    contactName: 'Acme BV',
    invoiceLines: [
      {
        description: 'Consultancy',
        numberOfItems: 2,
        priceIncludingTax: 1210,
        taxRate: 21,
      },
    ],
    tax: 210,
    taxLow: 0,
    taxLowest: 0,
    priceWithoutTaxes: 1000,
    priceIncludingTax: 1210,
  },
  settings: {
    companyName: 'Paperwork BV',
    street: 'Hoofdstraat',
    houseNumber: '1',
    postalCode: '1000 AA',
    city: 'Amsterdam',
    taxNumber: 'NL0001',
    chamberOfCommerceNumber: 'KVK123',
    bankName: 'INGB',
    bankIBAN: 'NL00INGB0000000000',
  },
  contact: {
    street: 'Klantweg',
    houseNumber: '5',
    postalCode: '2000 BB',
    city: 'Rotterdam',
  },
})

describe('invoiceReport', () => {
  it('renders an HTML document containing the invoice, contact and company details', () => {
    const html = invoiceReport(baseArgs())

    expect(typeof html).toBe('string')
    expect(html).toContain('<!doctype html>')
    // invoice + contact + company fields are interpolated into the template
    expect(html).toContain('2024')
    expect(html).toContain('Acme BV')
    expect(html).toContain('Paperwork BV')
    expect(html).toContain('Consultancy')
    expect(html).toContain('2026-03-01')
  })

  it('formats line and total amounts as Dutch euro currency', () => {
    const html = invoiceReport(baseArgs())

    // formatCurrency uses Intl NumberFormat EUR -> a euro sign is present
    expect(html).toContain('€')
  })

  it('tolerates missing optional amounts (defaults to 0) without throwing', () => {
    const args = baseArgs()
    delete (args.invoice as { tax?: number }).tax
    delete (args.invoice as { taxLow?: number }).taxLow
    delete (args.invoice as { taxLowest?: number }).taxLowest

    expect(() => invoiceReport(args)).not.toThrow()
  })
})
