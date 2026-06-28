import { z } from 'zod'

function isValidCalendarDateString(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive().nullable(),
  unitPrice: z.number().nullable(),
  taxRate: z.number().nullable(),
  lineTotal: z.number(),
})

export const vatBreakdownEntrySchema = z.object({
  rate: z.number(),
  amount: z.number(),
})

export const extractionSchema = z.object({
  vendor: z.string().nullable(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .refine(isValidCalendarDateString, {
      message: 'invoiceDate must be a real calendar date',
    })
    .nullable(),
  currency: z.string().length(3).default('EUR'),
  subtotal: z.number().nullable(),
  vatBreakdown: z.array(vatBreakdownEntrySchema),
  vatAmount: z.number().nullable(),
  total: z.number(),
  lineItems: z.array(lineItemSchema),
})

export const confidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  fields: z.record(z.string(), z.number().min(0).max(1)),
})

export type LineItem = z.infer<typeof lineItemSchema>
export type VatBreakdownEntry = z.infer<typeof vatBreakdownEntrySchema>
export type Extraction = z.infer<typeof extractionSchema>
export type Confidence = z.infer<typeof confidenceSchema>
