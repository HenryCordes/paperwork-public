import { Extraction } from './schema'

export interface ValidationWarning {
  code: string
  message: string
  field?: string
}

export interface ValidationResult {
  warnings: ValidationWarning[]
}

export const AMOUNT_TOLERANCE = 0.02
const RETRYABLE_VALIDATION_CODES = new Set([
  'LINE_ITEMS_SUBTOTAL_MISMATCH',
  'VAT_BREAKDOWN_MISMATCH',
  'SUBTOTAL_VAT_TOTAL_MISMATCH',
])
const VALID_VAT_RATES = [0, 9, 21]
const FUTURE_SKEW_DAYS = 1
const MAX_RETENTION_YEARS = 6
const DEFAULT_REVIEW_THRESHOLD = 0.75

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function isWithinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE
}

export function hasRetryableValidationIssue(
  warnings: ValidationWarning[],
): boolean {
  return warnings.some((warning) =>
    RETRYABLE_VALIDATION_CODES.has(warning.code),
  )
}

export function validateExtraction(extraction: Extraction): ValidationResult {
  const warnings: ValidationWarning[] = []

  if (
    extraction.lineItems.length > 0 &&
    extraction.subtotal !== null &&
    !isWithinTolerance(
      sum(extraction.lineItems.map((item) => item.lineTotal)),
      extraction.subtotal,
    )
  ) {
    warnings.push({
      code: 'LINE_ITEMS_SUBTOTAL_MISMATCH',
      message: 'Sum of line item totals does not match subtotal',
      field: 'lineItems',
    })
  }

  if (
    extraction.vatBreakdown.length > 0 &&
    extraction.vatAmount !== null &&
    !isWithinTolerance(
      sum(extraction.vatBreakdown.map((entry) => entry.amount)),
      extraction.vatAmount,
    )
  ) {
    warnings.push({
      code: 'VAT_BREAKDOWN_MISMATCH',
      message: 'Sum of VAT breakdown amounts does not match vatAmount',
      field: 'vatBreakdown',
    })
  }

  if (
    extraction.subtotal !== null &&
    extraction.vatAmount !== null &&
    !isWithinTolerance(
      extraction.subtotal + extraction.vatAmount,
      extraction.total,
    )
  ) {
    warnings.push({
      code: 'SUBTOTAL_VAT_TOTAL_MISMATCH',
      message: 'subtotal + vatAmount does not match total',
      field: 'total',
    })
  }

  extraction.vatBreakdown.forEach((entry, index) => {
    if (!VALID_VAT_RATES.includes(entry.rate)) {
      warnings.push({
        code: 'VAT_RATE_UNUSUAL',
        message: `VAT rate ${entry.rate}% is outside expected Dutch rates`,
        field: `vatBreakdown[${index}].rate`,
      })
    }
  })

  extraction.lineItems.forEach((item, index) => {
    if (item.taxRate !== null && !VALID_VAT_RATES.includes(item.taxRate)) {
      warnings.push({
        code: 'VAT_RATE_UNUSUAL',
        message: `Line item VAT rate ${item.taxRate}% is outside expected Dutch rates`,
        field: `lineItems[${index}].taxRate`,
      })
    }
  })

  if (extraction.invoiceDate !== null) {
    const date = new Date(extraction.invoiceDate)
    const now = new Date()
    const maxFuture = new Date(
      now.getTime() + FUTURE_SKEW_DAYS * 24 * 60 * 60 * 1000,
    )
    const minPast = new Date(now)
    minPast.setFullYear(minPast.getFullYear() - MAX_RETENTION_YEARS)

    if (date > maxFuture || date < minPast) {
      warnings.push({
        code: 'DATE_OUT_OF_RANGE',
        message: `invoiceDate ${extraction.invoiceDate} is outside the expected range`,
        field: 'invoiceDate',
      })
    }
  }

  return { warnings }
}

export function needsReview(
  warnings: ValidationWarning[],
  overallConfidence: number,
  threshold: number = DEFAULT_REVIEW_THRESHOLD,
): boolean {
  return warnings.length > 0 || overallConfidence < threshold
}
