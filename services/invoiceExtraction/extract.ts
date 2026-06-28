import { getExtractionProvider } from './provider'
import { ExtractionImageInput } from './provider/types'
import {
  confidenceSchema,
  Confidence,
  Extraction,
  extractionSchema,
} from './schema'
import {
  hasRetryableValidationIssue,
  needsReview,
  validateExtraction,
  ValidationWarning,
} from './validate'

export class ExtractionFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionFailedError'
  }
}

export interface ExtractInvoiceResult {
  extraction: Extraction
  confidence: Confidence
  validation: { warnings: ValidationWarning[] }
  needsReview: boolean
  meta: {
    provider: string
    model: string
    latencyMs: number
    tokensUsed: { input: number; output: number }
  }
}

interface ParsedResponse {
  extraction: Extraction
  confidence: Confidence
}

type ParseOutcome =
  { ok: true; value: ParsedResponse } | { ok: false; error: string }

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

function parseResponse(responseText: string): ParseOutcome {
  let json: unknown
  try {
    json = JSON.parse(stripCodeFences(responseText))
  } catch {
    return { ok: false, error: 'Response was not valid JSON' }
  }

  const candidate = json as { extraction?: unknown; confidence?: unknown }

  const extractionResult = extractionSchema.safeParse(candidate.extraction)
  if (!extractionResult.success) {
    return { ok: false, error: extractionResult.error.message }
  }

  const confidenceResult = confidenceSchema.safeParse(
    candidate.confidence ?? { overall: 0, fields: {} },
  )
  if (!confidenceResult.success) {
    return { ok: false, error: confidenceResult.error.message }
  }

  return {
    ok: true,
    value: {
      extraction: extractionResult.data,
      confidence: confidenceResult.data,
    },
  }
}

// TODO(async-extraction): move this call behind services/queues/invoiceExtractionQueue.ts
// once volume needs it. This function has no Express/Bull coupling today, so that
// move is a relocation, not a rewrite.
export async function extractInvoice(
  image: ExtractionImageInput,
): Promise<ExtractInvoiceResult> {
  const provider = getExtractionProvider()

  const firstResponse = await provider.extract(image)
  let parsed = parseResponse(firstResponse.responseText)
  let meta = firstResponse
  let validation = parsed.ok
    ? validateExtraction(parsed.value.extraction)
    : { warnings: [] as ValidationWarning[] }

  const needsRepair =
    !parsed.ok || hasRetryableValidationIssue(validation.warnings)

  if (needsRepair) {
    const repairResponse = await provider.extract(image, {
      repairContext: {
        previousResponseText: firstResponse.responseText,
        validationError: parsed.ok
          ? validation.warnings.map((warning) => warning.message).join('; ')
          : parsed.error,
      },
    })
    meta = repairResponse
    const repaired = parseResponse(repairResponse.responseText)
    // An unparseable repair is strictly worse than a parseable-but-warned
    // original — only adopt the repair if it actually parsed.
    if (repaired.ok) {
      parsed = repaired
      validation = validateExtraction(repaired.value.extraction)
    }
  }

  if (!parsed.ok) {
    throw new ExtractionFailedError(parsed.error)
  }

  const { extraction, confidence } = parsed.value

  if (!(extraction.total > 0)) {
    throw new ExtractionFailedError('Extraction is missing a usable total')
  }

  return {
    extraction,
    confidence,
    validation,
    needsReview: needsReview(validation.warnings, confidence.overall),
    meta: {
      provider: provider.name,
      model: meta.model,
      latencyMs: meta.latencyMs,
      tokensUsed: meta.tokensUsed,
    },
  }
}
