import * as xlsx from 'xlsx'

import Expense from '../../../models/Expense'
import Invoice from '../../../models/Invoice'
import {
  formatCurrencyDutch,
  generateBTWExport,
} from '../../../services/btwExportService'
import * as dbHandler from '../../setup/helper-db'

describe('btwExportService.formatCurrencyDutch', () => {
  it('formats amounts in Dutch currency style (period thousands, comma decimals)', () => {
    expect(formatCurrencyDutch(1234.5)).toContain('1.234,50')
    expect(formatCurrencyDutch(0)).toContain('0,00')
    expect(formatCurrencyDutch(9.99)).toContain('9,99')
  })

  it('always renders a euro sign and two decimals', () => {
    const formatted = formatCurrencyDutch(42)
    expect(formatted).toMatch(/€/)
    expect(formatted).toMatch(/42,00/)
  })

  it('falls back to "€ 0,00" for NaN / invalid input', () => {
    expect(formatCurrencyDutch(NaN)).toBe('€ 0,00')
    // @ts-expect-error - guarding runtime callers that pass null/undefined
    expect(formatCurrencyDutch(null)).toBe('€ 0,00')
    // @ts-expect-error - guarding runtime callers that pass null/undefined
    expect(formatCurrencyDutch(undefined)).toBe('€ 0,00')
  })
})

// A success result from generateBTWExport. The service returns a discriminated
// union on `success`; this is the shape on the happy path.
interface BTWExportSuccess {
  success: true
  fileName: string
  fileData: Buffer | string
  contentType: string
  btwData: {
    period: { label: string; dateRange: { start: string; end: string } }
    omzet: {
      hoogTarief21: { excl: number; btw: number }
      laagTarief9: { excl: number; btw: number }
      laagsteTarief6: { excl: number; btw: number }
      overige: { excl: number; btw: number }
    }
    subtotaalOmzet: number
    verschuldigdeBTW: number
    voorbelasting: number
    teBetalen: number
    invoiceCount: number
    expenseCount: number
  }
}

interface BTWExportFailure {
  success: false
  message: string
}

const TENANT = '507f1f77bcf86cd799439011'
const OTHER_TENANT = '507f1f77bcf86cd799439012'

// Seed an invoice with an explicit tenantId so the tenant pre-find hook is
// bypassed and the doc is unambiguously scoped (matches the contacts.test.ts
// pattern of passing tenantId explicitly).
const seedInvoice = (tenantId: string, over: Record<string, unknown> = {}) =>
  Invoice.create({
    tenantId,
    invoiceDate: new Date('2026-02-15'),
    tax: 0,
    taxLow: 0,
    taxLowest: 0,
    priceWithoutTaxes: 0,
    ...over,
  })

const seedExpense = (tenantId: string, over: Record<string, unknown> = {}) =>
  Expense.create({
    tenantId,
    expenseDate: new Date('2026-02-15'),
    tax: 0,
    taxLow: 0,
    priceWOTaxes: 0,
    price: 0,
    ...over,
  })

describe('btwExportService.generateBTWExport', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  it('aggregates seeded invoices/expenses into the returned btwData totals', async () => {
    // tax amounts are reverse-calculated to excl in the calculation service:
    //   excl21 = tax/0.21, excl9 = tax/0.09, excl6 = tax/0.06.
    // tax=21 -> excl 100; taxLow=9 -> excl 100; taxLowest=6 -> excl 100.
    await seedInvoice(TENANT, {
      tax: 21,
      taxLow: 9,
      taxLowest: 6,
      priceWithoutTaxes: 300,
    })
    // Expense voorbelasting = tax + taxLow = 10 + 5 = 15.
    await seedExpense(TENANT, { tax: 10, taxLow: 5, priceWOTaxes: 200 })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportSuccess

    expect(result.success).toBe(true)
    const { btwData } = result

    expect(btwData.omzet.hoogTarief21.excl).toBeCloseTo(100, 6)
    expect(btwData.omzet.hoogTarief21.btw).toBe(21)
    expect(btwData.omzet.laagTarief9.excl).toBeCloseTo(100, 6)
    expect(btwData.omzet.laagTarief9.btw).toBe(9)
    expect(btwData.omzet.laagsteTarief6.excl).toBeCloseTo(100, 6)
    expect(btwData.omzet.laagsteTarief6.btw).toBe(6)

    expect(btwData.subtotaalOmzet).toBeCloseTo(300, 6)
    expect(btwData.verschuldigdeBTW).toBe(36)
    expect(btwData.voorbelasting).toBe(15)
    expect(btwData.teBetalen).toBe(21)
    expect(btwData.invoiceCount).toBe(1)
    expect(btwData.expenseCount).toBe(1)
  })

  it("excludes another tenant's documents in the same period", async () => {
    await seedInvoice(TENANT, { tax: 21, priceWithoutTaxes: 100 })
    await seedInvoice(OTHER_TENANT, { tax: 210, priceWithoutTaxes: 1000 })
    await seedExpense(OTHER_TENANT, { tax: 999, priceWOTaxes: 5000 })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportSuccess

    expect(result.success).toBe(true)
    // Only the caller-tenant invoice (tax 21) counts; the other tenant's
    // tax 210 and expense 999 must not leak into the totals.
    expect(result.btwData.invoiceCount).toBe(1)
    expect(result.btwData.expenseCount).toBe(0)
    expect(result.btwData.verschuldigdeBTW).toBe(21)
    expect(result.btwData.voorbelasting).toBe(0)
    expect(result.btwData.teBetalen).toBe(21)
  })

  it('excludes documents dated outside the requested period', async () => {
    // In Q1 (Jan-Mar): counts. In Q2 (Apr): excluded.
    await seedInvoice(TENANT, {
      invoiceDate: new Date('2026-01-10'),
      tax: 21,
      priceWithoutTaxes: 100,
    })
    await seedInvoice(TENANT, {
      invoiceDate: new Date('2026-04-10'),
      tax: 42,
      priceWithoutTaxes: 200,
    })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportSuccess

    expect(result.btwData.invoiceCount).toBe(1)
    expect(result.btwData.verschuldigdeBTW).toBe(21)
  })

  it('returns an Excel buffer whose summary sheet reflects the figures', async () => {
    await seedInvoice(TENANT, { tax: 21, priceWithoutTaxes: 100 })
    await seedExpense(TENANT, { tax: 5, priceWOTaxes: 50 })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportSuccess

    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(result.fileName).toBe('BTW_Aangifte_Q1_2026.xlsx')
    expect(Buffer.isBuffer(result.fileData)).toBe(true)

    // Parse the workbook back and verify the rendered summary content.
    const workbook = xlsx.read(result.fileData as Buffer, { type: 'buffer' })
    expect(workbook.SheetNames).toContain('BTW Aangifte Overzicht')
    const sheet = workbook.Sheets['BTW Aangifte Overzicht']
    const csv = xlsx.utils.sheet_to_csv(sheet)

    expect(csv).toContain('Periode: Q1 2026')
    expect(csv).toContain('Bedrijf: Bedrijfsnaam')
    expect(csv).toContain('KvK: 12345678')
    // verschuldigde btw 21 and voorbelasting 5; te betalen = 16.
    expect(csv).toContain(formatCurrencyDutch(21))
    expect(csv).toContain(formatCurrencyDutch(5))
    expect(csv).toContain(formatCurrencyDutch(16))
    expect(csv).toContain('Te betalen btw')
  })

  it('renders a semicolon-delimited CSV with the company header and totals', async () => {
    await seedInvoice(TENANT, { tax: 21, priceWithoutTaxes: 100 })
    await seedExpense(TENANT, { tax: 5, priceWOTaxes: 50 })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'csv',
    )) as BTWExportSuccess

    expect(result.success).toBe(true)
    expect(result.contentType).toBe('text/csv')
    expect(result.fileName).toBe('BTW_Aangifte_Q1_2026.csv')
    expect(typeof result.fileData).toBe('string')

    const csv = result.fileData as string
    const header = csv.split('\n')[0]
    // json2csv quotes field names; delimiter is a semicolon for Dutch CSV.
    expect(header).toContain('"Omschrijving";"Periode";"Bedrag"')
    expect(csv).toContain('Bedrijfsnaam')
    expect(csv).toContain('12345678')
    expect(csv).toContain('NL123456789B01')
    expect(csv).toContain(formatCurrencyDutch(21))
    expect(csv).toContain('Te betalen btw')
  })

  it('labels the result "Te ontvangen btw" when voorbelasting exceeds verschuldigde btw', async () => {
    await seedInvoice(TENANT, { tax: 10, priceWithoutTaxes: 50 })
    // voorbelasting 100 > verschuldigde 10 -> teBetalen = -90 (refund).
    await seedExpense(TENANT, { tax: 100, priceWOTaxes: 500 })

    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'csv',
    )) as BTWExportSuccess

    expect(result.btwData.teBetalen).toBe(-90)
    const csv = result.fileData as string
    // The final summary row carries the refund amount. Match it precisely:
    // "Te ontvangen btw" with the absolute value (90), not the signed -90.
    // ("2. Te betalen btw" is a static section header and always present.)
    expect(csv).toContain(`"Te ontvangen btw";"";"${formatCurrencyDutch(90)}"`)
    expect(csv).not.toContain(`"Te betalen btw";"";`)
  })

  it('produces all-zero totals when no documents exist for the period', async () => {
    const result = (await generateBTWExport(
      TENANT,
      'quarterly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportSuccess

    expect(result.success).toBe(true)
    expect(result.btwData.subtotaalOmzet).toBe(0)
    expect(result.btwData.verschuldigdeBTW).toBe(0)
    expect(result.btwData.voorbelasting).toBe(0)
    expect(result.btwData.teBetalen).toBe(0)
    expect(result.btwData.invoiceCount).toBe(0)
  })

  it('returns a failure result (not a throw) for an invalid period type', async () => {
    const result = (await generateBTWExport(
      TENANT,
      'fortnightly',
      'Q1',
      2026,
      'excel',
    )) as BTWExportFailure

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Invalid period type/)
  })
})
