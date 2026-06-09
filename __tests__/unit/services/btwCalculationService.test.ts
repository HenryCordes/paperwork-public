import { Types } from 'mongoose'

import {
  calculateBTWDeadline,
  formatBTWPeriodLabel,
} from '../../../common/constants/btwPeriods'
import Expense from '../../../models/Expense'
import Invoice from '../../../models/Invoice'
import {
  aggregateExpensesByTaxRate,
  aggregateInvoicesByTaxRate,
  calculateBTWForPeriod,
  getNextBTWDeadline,
} from '../../../services/btwCalculationService'
import * as dbHandler from '../../setup/helper-db'

// The aggregation helpers reverse-calculate the exclusive amount from the
// stored tax amount: excl = tax / rate. Seeding with tax amounts that divide
// cleanly (210 @ 21%, 90 @ 9%, 60 @ 6%) yields exact, assertable totals.
const TENANT_A = 'tenant-aggregation-a'
const TENANT_B = 'tenant-aggregation-b'

const seedInvoice = (
  tenantId: string,
  invoiceDate: Date,
  over: Record<string, unknown> = {},
) =>
  Invoice.create({
    tenantId,
    owner: new Types.ObjectId(),
    invoiceDate,
    ...over,
  })

const seedExpense = (
  tenantId: string,
  expenseDate: Date,
  over: Record<string, unknown> = {},
) =>
  Expense.create({
    tenantId,
    owner: new Types.ObjectId(),
    expenseDate,
    tax: 0,
    taxLow: 0,
    ...over,
  })

// getNextBTWDeadline depends on the current date, so rather than asserting a
// fixed deadline we assert the function's internal invariants: the returned
// deadline/label must correspond to the period/year it selected, and the
// overdue flag must agree with the day count.
describe('btwCalculationService.getNextBTWDeadline', () => {
  for (const periodType of ['monthly', 'quarterly', 'yearly']) {
    it(`returns a self-consistent ${periodType} deadline`, async () => {
      const result = await getNextBTWDeadline('tenant-1', periodType)

      expect(result.periodType).toBe(periodType)

      const expectedDeadline = calculateBTWDeadline(
        periodType,
        result.period,
        result.year,
      )
        .toISOString()
        .split('T')[0]
      expect(result.deadline).toBe(expectedDeadline)

      expect(result.label).toBe(
        formatBTWPeriodLabel(periodType, result.period, result.year),
      )

      expect(result.isOverdue).toBe(result.daysUntilDeadline < 0)
    })
  }

  it('throws on an unknown period type', async () => {
    await expect(getNextBTWDeadline('tenant-1', 'weekly')).rejects.toThrow()
  })
})

describe('btwCalculationService aggregation (DB-coupled)', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  describe('aggregateInvoicesByTaxRate', () => {
    const start = new Date('2026-01-01')
    const end = new Date('2026-03-31')

    it('reverse-calculates the exclusive/inclusive totals per tax rate', async () => {
      // tax 210 @ 21% -> excl 1000, incl 1210
      await seedInvoice(TENANT_A, new Date('2026-01-15'), { tax: 210 })
      // tax 90 @ 9% -> excl 1000, incl 1090
      await seedInvoice(TENANT_A, new Date('2026-02-10'), { taxLow: 90 })
      // tax 60 @ 6% -> excl 1000, incl 1060
      await seedInvoice(TENANT_A, new Date('2026-03-05'), { taxLowest: 60 })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(3)

      expect(agg.tax21.totalTax).toBeCloseTo(210, 6)
      expect(agg.tax21.totalExcl).toBeCloseTo(1000, 6)
      expect(agg.tax21.totalIncl).toBeCloseTo(1210, 6)
      expect(agg.tax21.count).toBe(1)

      expect(agg.tax9.totalTax).toBeCloseTo(90, 6)
      expect(agg.tax9.totalExcl).toBeCloseTo(1000, 6)
      expect(agg.tax9.totalIncl).toBeCloseTo(1090, 6)
      expect(agg.tax9.count).toBe(1)

      expect(agg.tax6.totalTax).toBeCloseTo(60, 6)
      expect(agg.tax6.totalExcl).toBeCloseTo(1000, 6)
      expect(agg.tax6.totalIncl).toBeCloseTo(1060, 6)
      expect(agg.tax6.count).toBe(1)
    })

    it('sums multiple invoices into the same tax bucket', async () => {
      await seedInvoice(TENANT_A, new Date('2026-01-15'), { tax: 210 })
      await seedInvoice(TENANT_A, new Date('2026-02-15'), { tax: 420 })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.tax21.count).toBe(2)
      expect(agg.tax21.totalTax).toBeCloseTo(630, 6)
      expect(agg.tax21.totalExcl).toBeCloseTo(3000, 6) // 1000 + 2000
      expect(agg.tax21.totalIncl).toBeCloseTo(3630, 6)
    })

    it('buckets a zero-tax invoice with a positive net price into tax0', async () => {
      await seedInvoice(TENANT_A, new Date('2026-01-20'), {
        priceWithoutTaxes: 500,
      })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.tax0.count).toBe(1)
      expect(agg.tax0.totalExcl).toBeCloseTo(500, 6)
      expect(agg.tax0.totalTax).toBe(0)
      expect(agg.tax0.totalIncl).toBeCloseTo(500, 6)
      expect(agg.tax21.count).toBe(0)
    })

    it('counts a single invoice in every applicable tax bucket', async () => {
      // One invoice carrying all three tax rates at once.
      await seedInvoice(TENANT_A, new Date('2026-02-01'), {
        tax: 210,
        taxLow: 90,
        taxLowest: 60,
      })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(1)
      expect(agg.tax21.count).toBe(1)
      expect(agg.tax9.count).toBe(1)
      expect(agg.tax6.count).toBe(1)
      // totalTax > 0, so the tax0 bucket must stay empty even though
      // priceWithoutTaxes is unset (0).
      expect(agg.tax0.count).toBe(0)
    })

    it('excludes invoices dated outside the requested period', async () => {
      await seedInvoice(TENANT_A, new Date('2025-12-31'), { tax: 210 })
      await seedInvoice(TENANT_A, new Date('2026-04-01'), { tax: 210 })
      await seedInvoice(TENANT_A, new Date('2026-02-15'), { tax: 210 })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(1)
      expect(agg.tax21.totalTax).toBeCloseTo(210, 6)
    })

    it('scopes aggregation to the requested tenant only', async () => {
      await seedInvoice(TENANT_A, new Date('2026-01-15'), { tax: 210 })
      await seedInvoice(TENANT_B, new Date('2026-01-15'), { tax: 9999 })

      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(1)
      expect(agg.tax21.totalTax).toBeCloseTo(210, 6)
    })

    it('returns all-zero buckets when no invoices match', async () => {
      const agg = await aggregateInvoicesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(0)
      expect(agg.tax21.totalTax).toBe(0)
      expect(agg.tax9.totalTax).toBe(0)
      expect(agg.tax6.totalTax).toBe(0)
      expect(agg.tax0.totalExcl).toBe(0)
    })
  })

  describe('aggregateExpensesByTaxRate', () => {
    const start = new Date('2026-01-01')
    const end = new Date('2026-03-31')

    it('sums tax (high + low), excl and incl across expenses (voorbelasting)', async () => {
      await seedExpense(TENANT_A, new Date('2026-01-10'), {
        tax: 210,
        taxLow: 0,
        priceWOTaxes: 1000,
        price: 1210,
      })
      await seedExpense(TENANT_A, new Date('2026-02-10'), {
        tax: 0,
        taxLow: 90,
        priceWOTaxes: 1000,
        price: 1090,
      })

      const agg = await aggregateExpensesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(2)
      expect(agg.tax21).toBeCloseTo(210, 6)
      expect(agg.tax9).toBeCloseTo(90, 6)
      expect(agg.totalTax).toBeCloseTo(300, 6) // 210 + 90 reclaimable
      expect(agg.totalExcl).toBeCloseTo(2000, 6)
      expect(agg.totalIncl).toBeCloseTo(2300, 6)
    })

    it('excludes expenses outside the period and other tenants', async () => {
      await seedExpense(TENANT_A, new Date('2025-12-31'), { tax: 500 })
      await seedExpense(TENANT_B, new Date('2026-01-10'), { tax: 500 })
      await seedExpense(TENANT_A, new Date('2026-01-10'), {
        tax: 210,
        priceWOTaxes: 1000,
        price: 1210,
      })

      const agg = await aggregateExpensesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(1)
      expect(agg.totalTax).toBeCloseTo(210, 6)
      expect(agg.totalExcl).toBeCloseTo(1000, 6)
      expect(agg.totalIncl).toBeCloseTo(1210, 6)
    })

    it('returns zeros when no expenses match', async () => {
      const agg = await aggregateExpensesByTaxRate(TENANT_A, start, end)

      expect(agg.count).toBe(0)
      expect(agg.totalTax).toBe(0)
      expect(agg.tax21).toBe(0)
      expect(agg.tax9).toBe(0)
      expect(agg.totalExcl).toBe(0)
      expect(agg.totalIncl).toBe(0)
    })
  })

  describe('calculateBTWForPeriod', () => {
    it('computes verschuldigde BTW, voorbelasting and te betalen for a quarter', async () => {
      // Q1 2026 = 2026-01-01 .. 2026-03-31.
      // Invoices: BTW owed = 210 + 90 = 300, omzet excl = 1000 + 1000 = 2000.
      await seedInvoice(TENANT_A, new Date('2026-01-15'), { tax: 210 })
      await seedInvoice(TENANT_A, new Date('2026-02-15'), { taxLow: 90 })
      // Expenses: voorbelasting = 60.
      await seedExpense(TENANT_A, new Date('2026-03-01'), {
        tax: 60,
        priceWOTaxes: 1000,
        price: 1060,
      })

      const result = await calculateBTWForPeriod(
        TENANT_A,
        'quarterly',
        'Q1',
        2026,
      )

      expect(result.period.type).toBe('quarterly')
      expect(result.period.period).toBe('Q1')
      expect(result.period.year).toBe(2026)
      expect(result.period.label).toBe('Q1 2026')
      // FIXME(btw-daterange-tz): the service builds the period range with
      // local-time `new Date(year, month-1, day)` then serializes via
      // `toISOString()`, so in a UTC-behind timezone the dates shift back a
      // day (start becomes "2025-12-31"). We assert it derives from the same
      // boundaries calculateBTWDeadline uses rather than pinning a UTC string.
      expect(result.period.deadline).toBe(
        calculateBTWDeadline('quarterly', 'Q1', 2026)
          .toISOString()
          .split('T')[0],
      )

      expect(result.omzet.hoogTarief21.excl).toBeCloseTo(1000, 6)
      expect(result.omzet.hoogTarief21.btw).toBeCloseTo(210, 6)
      expect(result.omzet.laagTarief9.btw).toBeCloseTo(90, 6)

      expect(result.subtotaalOmzet).toBeCloseTo(2000, 6)
      expect(result.verschuldigdeBTW).toBeCloseTo(300, 6)
      expect(result.voorbelasting).toBeCloseTo(60, 6)
      expect(result.teBetalen).toBeCloseTo(240, 6) // 300 - 60

      expect(result.invoiceCount).toBe(2)
      expect(result.expenseCount).toBe(1)
    })

    it('yields a negative teBetalen (reclaim) when voorbelasting exceeds BTW owed', async () => {
      await seedInvoice(TENANT_A, new Date('2026-02-01'), { tax: 21 }) // owed 21
      await seedExpense(TENANT_A, new Date('2026-02-01'), {
        tax: 210, // reclaimable 210
        priceWOTaxes: 1000,
        price: 1210,
      })

      const result = await calculateBTWForPeriod(
        TENANT_A,
        'quarterly',
        'Q1',
        2026,
      )

      expect(result.verschuldigdeBTW).toBeCloseTo(21, 6)
      expect(result.voorbelasting).toBeCloseTo(210, 6)
      expect(result.teBetalen).toBeCloseTo(-189, 6)
    })

    it('returns zeroed totals for a period with no data', async () => {
      const result = await calculateBTWForPeriod(TENANT_A, 'monthly', 5, 2026)

      expect(result.period.label).toBe('Mei 2026')
      expect(result.subtotaalOmzet).toBe(0)
      expect(result.verschuldigdeBTW).toBe(0)
      expect(result.voorbelasting).toBe(0)
      expect(result.teBetalen).toBe(0)
      expect(result.invoiceCount).toBe(0)
      expect(result.expenseCount).toBe(0)
    })

    it('propagates errors from an invalid period type', async () => {
      await expect(
        calculateBTWForPeriod(TENANT_A, 'weekly', 1, 2026),
      ).rejects.toThrow()
    })
  })
})
