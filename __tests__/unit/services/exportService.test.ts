import Expense from '../../../models/Expense'
import Invoice from '../../../models/Invoice'
import {
  exportExpenses,
  exportInvoices,
  formatDateForFilename,
} from '../../../services/exportService'
import * as dbHandler from '../../setup/helper-db'

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

// Owner ObjectId is required-ish on the schema; supply a valid 24-hex string.
const OWNER = '64b7f0c2e1a2b3c4d5e6f701'

type ExportResult = Awaited<ReturnType<typeof exportExpenses>>

const expectSuccess = (
  result: ExportResult,
): Extract<ExportResult, { success: true }> => {
  if (!result.success) {
    throw new Error(`expected success but got failure: ${result.message}`)
  }
  return result
}

const seedExpense = (
  tenantId: string,
  over: Record<string, unknown> = {},
): Promise<unknown> =>
  Expense.create({
    tenantId,
    owner: OWNER,
    expenseNumber: 5001,
    expenseDate: new Date(2026, 2, 10),
    info: 'Kantoorbenodigdheden',
    contactName: 'Acme BV',
    price: 121,
    priceWOTaxes: 100,
    tax: 21,
    taxLow: 0,
    ...over,
  })

const seedInvoice = (
  tenantId: string,
  over: Record<string, unknown> = {},
): Promise<unknown> =>
  Invoice.create({
    tenantId,
    owner: OWNER,
    invoiceNumber: 7001,
    invoiceDate: new Date(2026, 2, 10),
    payDate: new Date(2026, 2, 20),
    info: 'Consultancy',
    contactName: 'Klant BV',
    state: 'Open',
    price: 121,
    priceWithoutTaxes: 100,
    tax: 21,
    taxLow: 0,
    taxLowest: 0,
    ...over,
  })

describe('formatDateForFilename', () => {
  it('pads single-digit month and day to YYYY-MM-DD', () => {
    // Local components: March (month index 2) 5th.
    expect(formatDateForFilename(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('leaves two-digit month and day unchanged', () => {
    // Local components: December (month index 11) 31st.
    expect(formatDateForFilename(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('exportExpenses', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  const start = new Date(2026, 2, 1)
  const end = new Date(2026, 2, 31)

  it('returns a success result whose CSV header lists the expense columns', async () => {
    await seedExpense(TENANT_A)

    const result = expectSuccess(await exportExpenses(TENANT_A, start, end))

    const [header] = result.csv.split('\n')
    expect(header).toContain('"Nummer"')
    expect(header).toContain('"Leverancier"')
    expect(header).toContain('"Bedrag (incl. BTW)"')
    expect(header).toContain('"BTW Hoog (21%)"')
    expect(header).toContain('"Bestand"')
  })

  it('formats amounts as Dutch currency with two decimals and emits one data row per expense', async () => {
    await seedExpense(TENANT_A, {
      price: 1234.5,
      priceWOTaxes: 1020.25,
      tax: 214.25,
      taxLow: 0,
      contactName: 'Acme BV',
    })

    const result = expectSuccess(await exportExpenses(TENANT_A, start, end))

    // nl-NL uses '.' for thousands and ',' for the decimal separator.
    expect(result.csv).toContain('"1.234,50"')
    expect(result.csv).toContain('"1.020,25"')
    expect(result.csv).toContain('"214,25"')
    expect(result.csv).toContain('"Acme BV"')

    const dataRows = result.csv.split('\n').slice(1).filter(Boolean)
    expect(dataRows).toHaveLength(1)
  })

  it('builds the filename from the period bounds', async () => {
    await seedExpense(TENANT_A)

    const result = expectSuccess(
      await exportExpenses(
        TENANT_A,
        new Date(2026, 0, 5),
        new Date(2026, 11, 31),
      ),
    )

    expect(result.fileName).toBe('uitgaven_2026-01-05_2026-12-31.csv')
  })

  it('writes a relative receipts path into the Bestand column when an expense has a file', async () => {
    // mongoose-sequence assigns expenseNumber from the counter (start 1001),
    // overriding any explicit value; the receipt filename uses the assigned one.
    const seeded = (await seedExpense(TENANT_A, {
      expenseFile: 'tenant-a/receipt-photo.png',
    })) as { expenseNumber: number }

    const result = expectSuccess(await exportExpenses(TENANT_A, start, end))

    expect(result.csv).toContain(`"receipts/${seeded.expenseNumber}.png"`)
  })

  it('excludes expenses outside the date range', async () => {
    await seedExpense(TENANT_A, {
      expenseNumber: 5100,
      expenseDate: new Date(2026, 5, 15),
      contactName: 'OutOfRange BV',
    })
    await seedExpense(TENANT_A, {
      expenseNumber: 5101,
      contactName: 'InRange BV',
    })

    const result = expectSuccess(await exportExpenses(TENANT_A, start, end))

    expect(result.csv).toContain('"InRange BV"')
    expect(result.csv).not.toContain('"OutOfRange BV"')
    const dataRows = result.csv.split('\n').slice(1).filter(Boolean)
    expect(dataRows).toHaveLength(1)
  })

  it('scopes results to the requested tenant', async () => {
    await seedExpense(TENANT_A, { contactName: 'TenantA Supplier' })
    await seedExpense(TENANT_B, { contactName: 'TenantB Supplier' })

    const result = expectSuccess(await exportExpenses(TENANT_A, start, end))

    expect(result.csv).toContain('"TenantA Supplier"')
    expect(result.csv).not.toContain('"TenantB Supplier"')
  })

  it('returns a localized failure when no expenses match the period', async () => {
    const result = await exportExpenses(TENANT_A, start, end)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.message).toBe(
      'Geen uitgaven gevonden voor de geselecteerde periode.',
    )
  })
})

describe('exportInvoices', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  const start = new Date(2026, 2, 1)
  const end = new Date(2026, 2, 31)

  it('returns a success result whose CSV header lists the invoice columns', async () => {
    await seedInvoice(TENANT_A)

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    const [header] = result.csv.split('\n')
    expect(header).toContain('"Factuurnummer"')
    expect(header).toContain('"Klant"')
    expect(header).toContain('"Totaalbedrag (incl. BTW)"')
    expect(header).toContain('"BTW Laagst (6%)"')
    expect(header).toContain('"Factuur"')
  })

  it('formats amounts with toFixed(2) and emits one data row per invoice', async () => {
    await seedInvoice(TENANT_A, {
      price: 1234.5,
      priceWithoutTaxes: 1020.25,
      tax: 214.25,
      taxLow: 0,
      taxLowest: 0,
      contactName: 'Klant BV',
    })

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    // exportInvoices uses Number.toFixed(2) -> plain '.' decimal, no separators.
    expect(result.csv).toContain('"1234.50"')
    expect(result.csv).toContain('"1020.25"')
    expect(result.csv).toContain('"214.25"')
    expect(result.csv).toContain('"Klant BV"')

    const dataRows = result.csv.split('\n').slice(1).filter(Boolean)
    expect(dataRows).toHaveLength(1)
  })

  it('derives the total from its components when price is absent', async () => {
    await seedInvoice(TENANT_A, {
      price: undefined,
      priceWithoutTaxes: 100,
      tax: 21,
      taxLow: 9,
      taxLowest: 6,
    })

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    // priceWithoutTaxes(100) + tax(21) + taxLow(9) + taxLowest(6) = 136.00
    expect(result.csv).toContain('"136.00"')
  })

  it('emits a PDF path in the Factuur column only for paid invoices', async () => {
    // mongoose-sequence assigns invoiceNumber from the counter (start 1001),
    // overriding any explicit value; the PDF filename uses the assigned one.
    const seeded = (await seedInvoice(TENANT_A, {
      state: 'Betaald',
    })) as { invoiceNumber: number }

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    expect(result.csv).toContain(`"invoices/${seeded.invoiceNumber}.pdf"`)
    expect(result.csv).toContain('"Betaald"')
  })

  it('leaves the Factuur column empty for unpaid invoices', async () => {
    const seeded = (await seedInvoice(TENANT_A, {
      state: 'Open',
    })) as { invoiceNumber: number }

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    expect(result.csv).not.toContain(`invoices/${seeded.invoiceNumber}.pdf`)
  })

  it('builds the filename from the period bounds', async () => {
    await seedInvoice(TENANT_A)

    const result = expectSuccess(
      await exportInvoices(
        TENANT_A,
        new Date(2026, 0, 5),
        new Date(2026, 11, 31),
      ),
    )

    expect(result.fileName).toBe('facturen_2026-01-05_2026-12-31.csv')
  })

  it('excludes invoices outside the date range', async () => {
    await seedInvoice(TENANT_A, {
      invoiceNumber: 7070,
      invoiceDate: new Date(2026, 5, 15),
      contactName: 'OutOfRange Klant',
    })
    await seedInvoice(TENANT_A, {
      invoiceNumber: 7071,
      contactName: 'InRange Klant',
    })

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    expect(result.csv).toContain('"InRange Klant"')
    expect(result.csv).not.toContain('"OutOfRange Klant"')
    const dataRows = result.csv.split('\n').slice(1).filter(Boolean)
    expect(dataRows).toHaveLength(1)
  })

  it('scopes results to the requested tenant', async () => {
    await seedInvoice(TENANT_A, { contactName: 'TenantA Klant' })
    await seedInvoice(TENANT_B, { contactName: 'TenantB Klant' })

    const result = expectSuccess(await exportInvoices(TENANT_A, start, end))

    expect(result.csv).toContain('"TenantA Klant"')
    expect(result.csv).not.toContain('"TenantB Klant"')
  })

  it('returns a localized failure when no invoices match the period', async () => {
    const result = await exportInvoices(TENANT_A, start, end)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.message).toBe(
      'Geen facturen gevonden voor de geselecteerde periode.',
    )
  })
})
