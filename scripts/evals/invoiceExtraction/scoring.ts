import { AMOUNT_TOLERANCE } from '../../../services/invoiceExtraction/validate'
import { Extraction } from '../../../services/invoiceExtraction/schema'

export interface GroundTruth {
  vendor?: string | null
  date?: string | null
  total?: number | null
  taxLow?: number | null
  taxHigh?: number | null
}

export interface FieldScore {
  field: string
  predicted: unknown
  groundTruth: unknown
  correct: boolean
}

type FieldKind = 'amount' | 'string' | 'date'

export function scoreField(
  predicted: unknown,
  groundTruth: unknown,
  kind: FieldKind,
): boolean | null {
  if (groundTruth === null || groundTruth === undefined) {
    return null
  }

  if (kind === 'amount') {
    return (
      typeof predicted === 'number' &&
      Math.abs(predicted - (groundTruth as number)) <= AMOUNT_TOLERANCE
    )
  }

  if (kind === 'date') {
    if (typeof predicted !== 'string') return false
    return predicted.slice(0, 10) === (groundTruth as string).slice(0, 10)
  }

  // string
  if (typeof predicted !== 'string') return false
  return (
    predicted.trim().toLowerCase() ===
    (groundTruth as string).trim().toLowerCase()
  )
}

function vatBreakdownAmount(extraction: Extraction, rate: number): number {
  return extraction.vatBreakdown
    .filter((entry) => entry.rate === rate)
    .reduce((total, entry) => total + entry.amount, 0)
}

export function scoreRecord(
  extraction: Extraction,
  groundTruth: GroundTruth,
): FieldScore[] {
  const candidates: Array<{
    field: string
    predicted: unknown
    groundTruth: unknown
    kind: FieldKind
  }> = [
    {
      field: 'vendor',
      predicted: extraction.vendor,
      groundTruth: groundTruth.vendor,
      kind: 'string',
    },
    {
      field: 'invoiceDate',
      predicted: extraction.invoiceDate,
      groundTruth: groundTruth.date,
      kind: 'date',
    },
    {
      field: 'total',
      predicted: extraction.total,
      groundTruth: groundTruth.total,
      kind: 'amount',
    },
    {
      field: 'taxLow',
      predicted: vatBreakdownAmount(extraction, 9),
      groundTruth: groundTruth.taxLow,
      kind: 'amount',
    },
    {
      field: 'taxHigh',
      predicted: vatBreakdownAmount(extraction, 21),
      groundTruth: groundTruth.taxHigh,
      kind: 'amount',
    },
  ]

  const scores: FieldScore[] = []
  for (const candidate of candidates) {
    const correct = scoreField(
      candidate.predicted,
      candidate.groundTruth,
      candidate.kind,
    )
    if (correct === null) continue
    scores.push({
      field: candidate.field,
      predicted: candidate.predicted,
      groundTruth: candidate.groundTruth,
      correct,
    })
  }
  return scores
}
