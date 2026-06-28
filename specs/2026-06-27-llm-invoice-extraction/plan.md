# LLM-Based Invoice/Receipt Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/invoices/scan`, a feature-flagged endpoint that extracts structured invoice/receipt fields from an uploaded image via a multimodal LLM, cross-checked by a new arithmetic/domain validation layer, without touching the existing mobile OCR/rules path.

**Architecture:** A self-contained `services/invoiceExtraction/` module (zod schema → validation rules → swappable provider → orchestration) sits behind a new route on the existing `routes/invoices.ts` router. The controller runs the LLM call and the S3 upload (via the existing `documentUpload.uploadFileNonHttp` helper) in parallel and assembles the response. No database writes happen in this endpoint.

**Tech Stack:** Node.js/TypeScript, Express, zod (new), `@anthropic-ai/sdk` (new), Jest + Supertest + mongodb-memory-server (existing).

## Global Constraints

- Branch: all work happens on `feat/llm-invoice-extraction` (already checked out). Never commit to `main`.
- Run `npm test` before every commit; do not commit on red.
- Coverage gate (`jest.config.js`): global 75% lines/statements/functions, 60% branches — must stay green.
- Amount-comparison tolerance: `0.02` (EUR cents) everywhere two amounts are compared.
- Valid Dutch VAT rates: `[0, 9, 21]` — anything else **warns**, never rejects.
- Date sane range: future skew `1` day, retention `6` years — **warns**, never rejects.
- `needsReview` threshold: `confidence.overall < 0.75`, or any validation warning.
- Accepted image mime types for this endpoint only: `image/jpeg`, `image/png` (the existing `/api/document` route's jpeg/png/pdf whitelist is untouched).
- Default model: `claude-sonnet-4-6`, overridable via `ANTHROPIC_EXTRACTION_MODEL`.
- Retry policy: 3 attempts, exponential backoff starting at 1000ms — mirrors `config/queue.ts`'s `defaultJobOptions`.
- Feature flag: `LLM_INVOICE_EXTRACTION_ENABLED` (default off/unset) gates the route at request time.
- This endpoint never writes to Mongo and never touches `models/Expense.ts` or `models/Invoice.ts`.
- Follow existing import ordering (external packages, blank line, relative imports) and the `export const` (named) / `export =` (default-ish CommonJS) conventions visible in each file you're extending.

---

### Task 1: Extraction schema

**Files:**
- Create: `services/invoiceExtraction/schema.ts`
- Test: `__tests__/unit/services/invoiceExtraction/schema.test.ts`
- Modify: `package.json` (add `zod` dependency)

**Interfaces:**
- Produces: `extractionSchema`, `confidenceSchema`, `lineItemSchema`, `vatBreakdownEntrySchema` (zod schemas), and types `Extraction`, `Confidence`, `LineItem`, `VatBreakdownEntry` (all `z.infer<>`). Every later task imports these from `./schema` (or `../schema`, `../../../../services/invoiceExtraction/schema` from tests).

- [ ] **Step 1: Install zod**

Run: `npm install zod@^4.4.3`
Expected: `package.json` `dependencies` gains `"zod": "^4.4.3"`.

- [ ] **Step 2: Write the failing test**

Create `__tests__/unit/services/invoiceExtraction/schema.test.ts`:

```ts
import {
  extractionSchema,
  confidenceSchema,
} from '../../../../services/invoiceExtraction/schema'

describe('extractionSchema', () => {
  const validExtraction = {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [
      {
        description: 'Melk',
        quantity: 2,
        unitPrice: 1.39,
        taxRate: 9,
        lineTotal: 2.78,
      },
    ],
  }

  it('parses a valid extraction payload', () => {
    const result = extractionSchema.safeParse(validExtraction)
    expect(result.success).toBe(true)
  })

  it('defaults currency to EUR when omitted', () => {
    const { currency, ...rest } = validExtraction
    const result = extractionSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe('EUR')
    }
  })

  it('allows null vendor, invoiceDate, subtotal, and vatAmount', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      vendor: null,
      invoiceDate: null,
      subtotal: null,
      vatAmount: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing total', () => {
    const { total, ...rest } = validExtraction
    const result = extractionSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric total', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      total: 'twenty',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invoiceDate that is not YYYY-MM-DD', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      invoiceDate: '18-06-2026',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a line item missing lineTotal', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      lineItems: [
        { description: 'Melk', quantity: 2, unitPrice: 1.39, taxRate: 9 },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('confidenceSchema', () => {
  it('parses a valid confidence payload', () => {
    const result = confidenceSchema.safeParse({
      overall: 0.91,
      fields: { vendor: 0.95, total: 0.99 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an overall confidence above 1', () => {
    const result = confidenceSchema.safeParse({ overall: 1.5, fields: {} })
    expect(result.success).toBe(false)
  })

  it('rejects a negative field confidence', () => {
    const result = confidenceSchema.safeParse({
      overall: 0.5,
      fields: { total: -0.1 },
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest schema.test.ts`
Expected: FAIL — `Cannot find module '../../../../services/invoiceExtraction/schema'`

- [ ] **Step 3: Write the implementation**

Create `services/invoiceExtraction/schema.ts`:

```ts
import { z } from 'zod'

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest schema.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json services/invoiceExtraction/schema.ts __tests__/unit/services/invoiceExtraction/schema.test.ts
git commit -m "feat(server): add zod schema for LLM invoice extraction output"
```

---

### Task 2: Validation rules

**Files:**
- Create: `services/invoiceExtraction/validate.ts`
- Test: `__tests__/unit/services/invoiceExtraction/validate.test.ts`

**Interfaces:**
- Consumes: `Extraction` type from `./schema` (Task 1).
- Produces: `validateExtraction(extraction: Extraction): ValidationResult`, `needsReview(warnings: ValidationWarning[], overallConfidence: number, threshold?: number): boolean`, `ValidationWarning` and `ValidationResult` types, and the exported constant `AMOUNT_TOLERANCE` (reused by the eval harness in Task 6). Later tasks (`extract.ts` in Task 4, the controller in Task 5) import `validateExtraction` and `needsReview`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/services/invoiceExtraction/validate.test.ts`:

```ts
import {
  validateExtraction,
  needsReview,
} from '../../../../services/invoiceExtraction/validate'
import { Extraction } from '../../../../services/invoiceExtraction/schema'

function buildExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [
      {
        description: 'Melk',
        quantity: 2,
        unitPrice: 1.39,
        taxRate: 9,
        lineTotal: 2.78,
      },
      {
        description: 'Brood',
        quantity: 1,
        unitPrice: 15.67,
        taxRate: 9,
        lineTotal: 15.67,
      },
    ],
    ...overrides,
  }
}

describe('validateExtraction', () => {
  it('produces no warnings for a fully consistent extraction', () => {
    const result = validateExtraction(buildExtraction())
    expect(result.warnings).toEqual([])
  })

  it('warns when line items do not sum to subtotal', () => {
    const result = validateExtraction(buildExtraction({ subtotal: 100 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'LINE_ITEMS_SUBTOTAL_MISMATCH' }),
    )
  })

  it('does not check line-item sum when there are no line items', () => {
    const result = validateExtraction(
      buildExtraction({ lineItems: [], subtotal: 100 }),
    )
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'LINE_ITEMS_SUBTOTAL_MISMATCH' }),
    )
  })

  it('warns when vatBreakdown does not sum to vatAmount', () => {
    const result = validateExtraction(buildExtraction({ vatAmount: 5 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'VAT_BREAKDOWN_MISMATCH' }),
    )
  })

  it('warns when subtotal + vatAmount does not match total', () => {
    const result = validateExtraction(buildExtraction({ total: 999 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'SUBTOTAL_VAT_TOTAL_MISMATCH' }),
    )
  })

  it('warns on a VAT breakdown rate outside {0, 9, 21}', () => {
    const result = validateExtraction(
      buildExtraction({ vatBreakdown: [{ rate: 19, amount: 1.66 }] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'VAT_RATE_UNUSUAL',
        field: 'vatBreakdown[0].rate',
      }),
    )
  })

  it('warns on a line item tax rate outside {0, 9, 21}, never rejects', () => {
    const result = validateExtraction(
      buildExtraction({
        lineItems: [
          {
            description: 'Import duty',
            quantity: 1,
            unitPrice: 10,
            taxRate: 19,
            lineTotal: 10,
          },
        ],
      }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'VAT_RATE_UNUSUAL',
        field: 'lineItems[0].taxRate',
      }),
    )
  })

  it('warns when invoiceDate is more than 1 day in the future', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const result = validateExtraction(
      buildExtraction({ invoiceDate: future.toISOString().split('T')[0] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })

  it('warns when invoiceDate is more than 6 years in the past', () => {
    const past = new Date()
    past.setFullYear(past.getFullYear() - 7)
    const result = validateExtraction(
      buildExtraction({ invoiceDate: past.toISOString().split('T')[0] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })

  it('does not check date range when invoiceDate is null', () => {
    const result = validateExtraction(buildExtraction({ invoiceDate: null }))
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })
})

describe('needsReview', () => {
  it('is true when there are warnings, regardless of confidence', () => {
    expect(needsReview([{ code: 'X', message: 'x' }], 0.99)).toBe(true)
  })

  it('is true when confidence is below the default threshold', () => {
    expect(needsReview([], 0.5)).toBe(true)
  })

  it('is false when there are no warnings and confidence meets the default threshold', () => {
    expect(needsReview([], 0.75)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(needsReview([], 0.8, 0.9)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest validate.test.ts`
Expected: FAIL — `Cannot find module '../../../../services/invoiceExtraction/validate'`

- [ ] **Step 3: Write the implementation**

Create `services/invoiceExtraction/validate.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest validate.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add services/invoiceExtraction/validate.ts __tests__/unit/services/invoiceExtraction/validate.test.ts
git commit -m "feat(server): add arithmetic/domain validation for LLM extraction output"
```

---

### Task 3: Anthropic provider

**Files:**
- Create: `services/invoiceExtraction/provider/types.ts`
- Create: `services/invoiceExtraction/provider/anthropicProvider.ts`
- Create: `services/invoiceExtraction/provider/index.ts`
- Test: `__tests__/unit/services/invoiceExtraction/provider/anthropicProvider.test.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk` dependency)
- Modify: `__tests__/setup/externalMocks.ts` (global mock, matching the existing convention for every other external SDK)

**Interfaces:**
- Produces: `InvoiceExtractionProvider` interface (`extract(image: ExtractionImageInput, options?: ProviderExtractOptions): Promise<ProviderResponse>`, plus `readonly name: string`), `ExtractionImageInput` (`{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' }`), `ProviderResponse` (`{ responseText: string; model: string; latencyMs: number; tokensUsed: { input: number; output: number } }`), `RepairContext` (`{ previousResponseText: string; validationError: string }`), `AnthropicProvider` class, and `getExtractionProvider(): InvoiceExtractionProvider` factory. Task 4 (`extract.ts`) consumes `getExtractionProvider` and the types from `./provider`/`./provider/types`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk@^0.106.0`
Expected: `package.json` `dependencies` gains `"@anthropic-ai/sdk": "^0.106.0"`.

- [ ] **Step 2: Add the global SDK mock**

In `__tests__/setup/externalMocks.ts`, add (after the existing `node-mailjet` mock, before the `string-strip-html` mock — keeping one external-SDK mock per block):

```ts
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '{"extraction":{"vendor":null,"invoiceDate":null,"currency":"EUR","subtotal":null,"vatBreakdown":[],"vatAmount":null,"total":1,"lineItems":[]},"confidence":{"overall":1,"fields":{}}}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    },
  })),
)
```

This matches the existing pattern for `@mollie/api-client`/`firebase-admin`/`@aws-sdk/client-s3` in this same file: a safe default so any test that transitively loads this module never makes a real network call, even though (per this module's design) the real SDK is never constructed unless `extractInvoice()` is actually invoked.

- [ ] **Step 3: Write the failing test**

Create `__tests__/unit/services/invoiceExtraction/provider/anthropicProvider.test.ts`:

```ts
const mockCreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

import { AnthropicProvider } from '../../../../../services/invoiceExtraction/provider/anthropicProvider'

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_EXTRACTION_MODEL = 'claude-sonnet-4-6'
  })

  it('sends the image and prompt, and returns the text response with usage/model/latency', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"total": 20.11}' }],
      usage: { input_tokens: 1450, output_tokens: 210 },
    })

    const provider = new AnthropicProvider()
    const result = await provider.extract({
      buffer: Buffer.from('fake-image'),
      mimeType: 'image/jpeg',
    })

    expect(result.responseText).toBe('{"total": 20.11}')
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.tokensUsed).toEqual({ input: 1450, output: 210 })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('claude-sonnet-4-6')
    expect(callArgs.messages[0].content[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: Buffer.from('fake-image').toString('base64'),
      },
    })
    expect(callArgs.messages[0].content[1].type).toBe('text')
  })

  it('includes the repair context in the prompt when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"total": 20.11}' }],
      usage: { input_tokens: 1500, output_tokens: 220 },
    })

    const provider = new AnthropicProvider()
    await provider.extract(
      { buffer: Buffer.from('fake-image'), mimeType: 'image/jpeg' },
      {
        repairContext: {
          previousResponseText: 'not json',
          validationError: 'Expected object',
        },
      },
    )

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content[1].text).toContain('not json')
    expect(callArgs.messages[0].content[1].text).toContain('Expected object')
  })

  it('retries on a 503 error and succeeds on the second attempt', async () => {
    jest.useFakeTimers()
    mockCreate
      .mockRejectedValueOnce({ status: 503, message: 'Overloaded' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"total": 5}' }],
        usage: { input_tokens: 100, output_tokens: 20 },
      })

    const provider = new AnthropicProvider()
    const resultPromise = provider.extract({
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
    })

    await jest.advanceTimersByTimeAsync(1000)
    const result = await resultPromise

    expect(result.responseText).toBe('{"total": 5}')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  it('does not retry on a 401 authentication error', async () => {
    mockCreate.mockRejectedValueOnce({ status: 401, message: 'Invalid API key' })

    const provider = new AnthropicProvider()
    await expect(
      provider.extract({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ status: 401 })

    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting all retries on persistent 500s', async () => {
    jest.useFakeTimers()
    mockCreate.mockRejectedValue({ status: 500, message: 'Internal error' })

    const provider = new AnthropicProvider()
    const resultPromise = provider.extract({
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
    })
    const assertion = expect(resultPromise).rejects.toMatchObject({
      status: 500,
    })

    await jest.advanceTimersByTimeAsync(1000)
    await jest.advanceTimersByTimeAsync(2000)
    await assertion

    expect(mockCreate).toHaveBeenCalledTimes(3)
    jest.useRealTimers()
  })

  it('returns an empty responseText when the model sends no text block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    })

    const provider = new AnthropicProvider()
    const result = await provider.extract({
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
    })
    expect(result.responseText).toBe('')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest anthropicProvider.test.ts`
Expected: FAIL — `Cannot find module '../../../../../services/invoiceExtraction/provider/anthropicProvider'`

- [ ] **Step 5: Write the implementation**

Create `services/invoiceExtraction/provider/types.ts`:

```ts
export interface ExtractionImageInput {
  buffer: Buffer
  mimeType: 'image/jpeg' | 'image/png'
}

export interface RepairContext {
  previousResponseText: string
  validationError: string
}

export interface ProviderExtractOptions {
  repairContext?: RepairContext
}

export interface ProviderResponse {
  responseText: string
  model: string
  latencyMs: number
  tokensUsed: { input: number; output: number }
}

export interface InvoiceExtractionProvider {
  readonly name: string
  extract(
    image: ExtractionImageInput,
    options?: ProviderExtractOptions,
  ): Promise<ProviderResponse>
}
```

Create `services/invoiceExtraction/provider/anthropicProvider.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

import {
  ExtractionImageInput,
  InvoiceExtractionProvider,
  ProviderExtractOptions,
  ProviderResponse,
} from './types'

const EXTRACTION_PROMPT = `You are an invoice and receipt data extraction assistant for a Dutch bookkeeping application.
Extract the following fields from the attached image and return ONLY a single JSON object, with no markdown
fences and no commentary, matching this exact shape:

{
  "extraction": {
    "vendor": string | null,
    "invoiceDate": string | null,
    "currency": string,
    "subtotal": number | null,
    "vatBreakdown": [{ "rate": number, "amount": number }],
    "vatAmount": number | null,
    "total": number,
    "lineItems": [
      { "description": string, "quantity": number | null, "unitPrice": number | null, "taxRate": number | null, "lineTotal": number }
    ]
  },
  "confidence": {
    "overall": number,
    "fields": { [fieldName: string]: number }
  }
}

invoiceDate must be formatted as YYYY-MM-DD. If a field cannot be determined, use null (or an empty array for
vatBreakdown/lineItems). "total" is required and must be a number. Confidence values are between 0 and 1.`

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

function isRetryableError(error: unknown): boolean {
  const status = (error as { status?: number }).status
  if (typeof status === 'number') {
    return status === 429 || status >= 500
  }
  // No status property means a network/connection-level failure (timeout, DNS, etc).
  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnthropicProvider implements InvoiceExtractionProvider {
  readonly name = 'anthropic'

  private client: Anthropic
  private model: string

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    this.model = process.env.ANTHROPIC_EXTRACTION_MODEL || 'claude-sonnet-4-6'
  }

  async extract(
    image: ExtractionImageInput,
    options: ProviderExtractOptions = {},
  ): Promise<ProviderResponse> {
    const promptText = options.repairContext
      ? `Your previous response was:\n${options.repairContext.previousResponseText}\n\nThat response failed validation with this error:\n${options.repairContext.validationError}\n\n${EXTRACTION_PROMPT}`
      : EXTRACTION_PROMPT

    const content = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: image.mimeType,
          data: image.buffer.toString('base64'),
        },
      },
      { type: 'text' as const, text: promptText },
    ]

    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now()
      try {
        const message = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          messages: [{ role: 'user', content }],
        })

        const textBlock = message.content.find(
          (block) => block.type === 'text',
        ) as { type: 'text'; text: string } | undefined

        return {
          responseText: textBlock?.text ?? '',
          model: this.model,
          latencyMs: Date.now() - startedAt,
          tokensUsed: {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
          },
        }
      } catch (error) {
        lastError = error
        if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
          throw error
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
      }
    }

    throw lastError
  }
}
```

Create `services/invoiceExtraction/provider/index.ts`:

```ts
import { AnthropicProvider } from './anthropicProvider'
import { InvoiceExtractionProvider } from './types'

export function getExtractionProvider(): InvoiceExtractionProvider {
  const providerName = process.env.LLM_PROVIDER || 'anthropic'

  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider()
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${providerName}`)
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest anthropicProvider.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Run the full suite to confirm the global mock didn't break anything else**

Run: `npm test`
Expected: PASS (all existing suites still green)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json services/invoiceExtraction/provider __tests__/setup/externalMocks.ts __tests__/unit/services/invoiceExtraction/provider/anthropicProvider.test.ts
git commit -m "feat(server): add Anthropic vision provider with retry/backoff"
```

---

### Task 4: Extraction orchestration

**Files:**
- Create: `services/invoiceExtraction/extract.ts`
- Test: `__tests__/unit/services/invoiceExtraction/extract.test.ts`

**Interfaces:**
- Consumes: `extractionSchema`, `confidenceSchema`, `Extraction`, `Confidence` from `./schema` (Task 1); `validateExtraction`, `needsReview`, `ValidationWarning` from `./validate` (Task 2); `getExtractionProvider` from `./provider`, `ExtractionImageInput` from `./provider/types` (Task 3).
- Produces: `extractInvoice(image: ExtractionImageInput): Promise<ExtractInvoiceResult>`, `ExtractionFailedError` class, `ExtractInvoiceResult` type. The controller in Task 5 imports both `extractInvoice` and `ExtractionFailedError`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/services/invoiceExtraction/extract.test.ts`:

```ts
const mockExtract = jest.fn()

jest.mock('../../../../services/invoiceExtraction/provider', () => ({
  getExtractionProvider: () => ({ name: 'anthropic', extract: mockExtract }),
}))

import {
  extractInvoice,
  ExtractionFailedError,
} from '../../../../services/invoiceExtraction/extract'

const validJson = JSON.stringify({
  extraction: {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
  },
  confidence: { overall: 0.91, fields: { total: 0.99 } },
})

function fakeResponse(
  responseText: string,
  overrides: Partial<{
    model: string
    latencyMs: number
    tokensUsed: { input: number; output: number }
  }> = {},
) {
  return {
    responseText,
    model: 'claude-sonnet-4-6',
    latencyMs: 1200,
    tokensUsed: { input: 1000, output: 100 },
    ...overrides,
  }
}

describe('extractInvoice', () => {
  beforeEach(() => {
    mockExtract.mockReset()
  })

  it('returns the parsed extraction, confidence, validation, and meta on a clean first response', async () => {
    mockExtract.mockResolvedValueOnce(fakeResponse(validJson))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.vendor).toBe('Albert Heijn')
    expect(result.confidence.overall).toBe(0.91)
    expect(result.validation.warnings).toEqual([])
    expect(result.needsReview).toBe(false)
    expect(result.meta).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      latencyMs: 1200,
      tokensUsed: { input: 1000, output: 100 },
    })
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  it('strips markdown code fences before parsing', async () => {
    mockExtract.mockResolvedValueOnce(
      fakeResponse('```json\n' + validJson + '\n```'),
    )

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.extraction.total).toBe(20.11)
  })

  it('retries once with a repair prompt when the first response is invalid JSON, then succeeds', async () => {
    mockExtract
      .mockResolvedValueOnce(fakeResponse('not json at all'))
      .mockResolvedValueOnce(fakeResponse(validJson))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.total).toBe(20.11)
    expect(mockExtract).toHaveBeenCalledTimes(2)
    const secondCallOptions = mockExtract.mock.calls[1][1]
    expect(secondCallOptions.repairContext.previousResponseText).toBe(
      'not json at all',
    )
  })

  it('throws ExtractionFailedError when both the original and repair attempts fail to parse', async () => {
    mockExtract
      .mockResolvedValueOnce(fakeResponse('not json'))
      .mockResolvedValueOnce(fakeResponse('still not json'))

    await expect(
      extractInvoice({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    ).rejects.toThrow(ExtractionFailedError)
    expect(mockExtract).toHaveBeenCalledTimes(2)
  })

  it('throws ExtractionFailedError when total is missing, without a repair attempt', async () => {
    const noTotal = JSON.stringify({
      extraction: {
        vendor: null,
        invoiceDate: null,
        currency: 'EUR',
        subtotal: null,
        vatBreakdown: [],
        vatAmount: null,
        total: 0,
        lineItems: [],
      },
      confidence: { overall: 0.5, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(noTotal))

    await expect(
      extractInvoice({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    ).rejects.toThrow(ExtractionFailedError)
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  it('sets needsReview true when validation produces a warning, even with high confidence', async () => {
    const unusualRate = JSON.stringify({
      extraction: {
        vendor: 'Foreign Co',
        invoiceDate: '2026-06-18',
        currency: 'EUR',
        subtotal: 100,
        vatBreakdown: [{ rate: 19, amount: 19 }],
        vatAmount: 19,
        total: 119,
        lineItems: [],
      },
      confidence: { overall: 0.95, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(unusualRate))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.needsReview).toBe(true)
    expect(result.validation.warnings).toContainEqual(
      expect.objectContaining({ code: 'VAT_RATE_UNUSUAL' }),
    )
  })

  it('sets needsReview true when confidence is below threshold, even with no warnings', async () => {
    const lowConfidence = JSON.stringify({
      extraction: {
        vendor: null,
        invoiceDate: null,
        currency: 'EUR',
        subtotal: null,
        vatBreakdown: [],
        vatAmount: null,
        total: 10,
        lineItems: [],
      },
      confidence: { overall: 0.4, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(lowConfidence))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.needsReview).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extract.test.ts`
Expected: FAIL — `Cannot find module '../../../../services/invoiceExtraction/extract'`

- [ ] **Step 3: Write the implementation**

Create `services/invoiceExtraction/extract.ts`:

```ts
import { confidenceSchema, Confidence, Extraction, extractionSchema } from './schema'
import { getExtractionProvider } from './provider'
import { ExtractionImageInput } from './provider/types'
import { needsReview, validateExtraction, ValidationWarning } from './validate'

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
  | { ok: true; value: ParsedResponse }
  | { ok: false; error: string }

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
    value: { extraction: extractionResult.data, confidence: confidenceResult.data },
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

  if (!parsed.ok) {
    const repairResponse = await provider.extract(image, {
      repairContext: {
        previousResponseText: firstResponse.responseText,
        validationError: parsed.error,
      },
    })
    meta = repairResponse
    parsed = parseResponse(repairResponse.responseText)
  }

  if (!parsed.ok) {
    throw new ExtractionFailedError(parsed.error)
  }

  const { extraction, confidence } = parsed.value

  if (!(extraction.total > 0)) {
    throw new ExtractionFailedError('Extraction is missing a usable total')
  }

  const validation = validateExtraction(extraction)

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extract.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add services/invoiceExtraction/extract.ts __tests__/unit/services/invoiceExtraction/extract.test.ts
git commit -m "feat(server): orchestrate LLM extraction with repair retry and validation"
```

---

### Task 5: Upload middleware, controller, route, and integration test

**Files:**
- Create: `services/invoiceExtraction/upload.ts`
- Create: `controllers/invoiceExtraction.ts`
- Modify: `routes/invoices.ts`
- Modify: `config/config.env` (new env vars; gitignored, not committed)
- Test: `__tests__/integration/invoiceExtraction.test.ts`

**Interfaces:**
- Consumes: `extractInvoice`, `ExtractionFailedError` from `services/invoiceExtraction/extract` (Task 4); `documentUpload` (default export) from `services/documentUpload` (existing); `getCurrentTenantId` from `middleware/tenantHelper` (existing); `asyncHandlers` (default export) from `middleware/async` (existing); `protect` from `middleware/auth` (existing).
- Produces: `scanInvoice` request handler (named export from `controllers/invoiceExtraction.ts`), mounted as `POST /api/invoices/scan`.

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/integration/invoiceExtraction.test.ts`:

```ts
// __tests__/integration/invoiceExtraction.test.ts
import request from 'supertest'

import app from '../../app'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

jest.mock('../../services/invoiceExtraction/provider', () => ({
  getExtractionProvider: jest.fn(),
}))

import { getExtractionProvider } from '../../services/invoiceExtraction/provider'

const mockGetExtractionProvider = getExtractionProvider as jest.Mock

const cleanExtractionResponse = JSON.stringify({
  extraction: {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
  },
  confidence: { overall: 0.91, fields: { total: 0.99 } },
})

function fakeProvider(responseText: string) {
  return {
    name: 'anthropic',
    extract: jest.fn().mockResolvedValue({
      responseText,
      model: 'claude-sonnet-4-6',
      latencyMs: 1200,
      tokensUsed: { input: 1000, output: 100 },
    }),
  }
}

describe('invoice extraction API', () => {
  let a: AuthedTenant
  const originalFlag = process.env.LLM_INVOICE_EXTRACTION_ENABLED

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = originalFlag
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    mockGetExtractionProvider.mockReset()
  })

  it('POST /api/invoices/scan requires authentication (401)', async () => {
    const res = await request(app)
      .post('/api/invoices/scan')
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })
    expect(res.status).toBe(401)
  })

  it('returns 503 when the feature flag is disabled', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'false'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for an unsupported mime type', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when no file is attached', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))

    expect(res.status).toBe(400)
  })

  it('returns 200 with the extraction, confidence, validation, and fileLocation for a clean scan', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(
      fakeProvider(cleanExtractionResponse),
    )

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.fileLocation).toBe(`${a.organizationId}/receipt.jpg`)
    expect(res.body.data.extraction.vendor).toBe('Albert Heijn')
    expect(res.body.data.validation.warnings).toEqual([])
    expect(res.body.data.needsReview).toBe(false)
  })

  it('returns 422 EXTRACTION_FAILED when the provider never returns parseable JSON', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(fakeProvider('not json'))

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('EXTRACTION_FAILED')
  })

  it('returns 502 when the provider throws a provider-level error', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue({
      name: 'anthropic',
      extract: jest
        .fn()
        .mockRejectedValue({ status: 500, message: 'Overloaded' }),
    })

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(502)
  })

  it("keys the upload under each tenant's own organizationId (tenant isolation)", async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(
      fakeProvider(cleanExtractionResponse),
    )
    const b = await createAuthedTenant()

    const resA = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })
    const resB = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(b.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(resA.body.data.fileLocation).toBe(`${a.organizationId}/receipt.jpg`)
    expect(resB.body.data.fileLocation).toBe(`${b.organizationId}/receipt.jpg`)
    expect(a.organizationId).not.toBe(b.organizationId)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest invoiceExtraction.test.ts`
Expected: FAIL — 404s / `Cannot find module '../../services/invoiceExtraction/provider'` is already satisfied by Task 3-4, so the failures here will be route-not-found (the route doesn't exist yet).

- [ ] **Step 3: Write the upload middleware**

Create `services/invoiceExtraction/upload.ts`:

```ts
import multer from 'multer'

const scanUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type, only JPEG and PNG are allowed!'))
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

export = scanUpload
```

- [ ] **Step 4: Write the controller**

Create `controllers/invoiceExtraction.ts`:

```ts
import { Request, Response, NextFunction } from 'express'

import { getCurrentTenantId } from '../middleware/tenantHelper'
import documentUpload from '../services/documentUpload'
import {
  ExtractionFailedError,
  extractInvoice,
} from '../services/invoiceExtraction/extract'

import asyncHandlers from '../middleware/async'

function isFlagEnabled(): boolean {
  return process.env.LLM_INVOICE_EXTRACTION_ENABLED === 'true'
}

// @Method: POST
// @Route : api/invoices/scan
// @Desc  : Extract structured invoice/receipt fields from an image via LLM
export const scanInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!isFlagEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'LLM invoice extraction is not enabled',
      })
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'No file uploaded' })
    }

    const tenantId = getCurrentTenantId(req.organizationId) || 'unknown'
    const file = req.file

    try {
      const [extractionResult, uploadResult] = await Promise.all([
        extractInvoice({
          buffer: file.buffer,
          mimeType: file.mimetype as 'image/jpeg' | 'image/png',
        }),
        documentUpload.uploadFileNonHttp(
          file.buffer,
          file.originalname,
          tenantId,
          { contentType: file.mimetype },
        ),
      ])

      return res.status(200).json({
        success: true,
        data: {
          fileLocation: uploadResult.key,
          extraction: extractionResult.extraction,
          confidence: extractionResult.confidence,
          validation: extractionResult.validation,
          needsReview: extractionResult.needsReview,
          meta: extractionResult.meta,
        },
      })
    } catch (error) {
      if (error instanceof ExtractionFailedError) {
        return res.status(422).json({
          success: false,
          code: 'EXTRACTION_FAILED',
          message: error.message,
        })
      }

      const status = (error as { status?: number }).status
      if (typeof status === 'number') {
        return res
          .status(502)
          .json({ success: false, message: 'LLM provider error' })
      }

      return next(error)
    }
  },
)
```

- [ ] **Step 5: Wire the route**

Modify `routes/invoices.ts`:

```ts
import express from 'express'

import { getInvoices, getInvoicesList } from '../controllers/invoices'
import { scanInvoice } from '../controllers/invoiceExtraction'
import { protect } from '../middleware/auth'
import scanUpload from '../services/invoiceExtraction/upload'

const router = express.Router()

// Main routes to get all invoices
router.get('/', protect, getInvoices)
// List format
router.get('/list', protect, getInvoicesList)

// LLM-based extraction for a scanned invoice/receipt image — behind
// LLM_INVOICE_EXTRACTION_ENABLED, does not persist anything.
router.post(
  '/scan',
  protect,
  (req, res, next) => {
    scanUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message })
      }
      next()
    })
  },
  scanInvoice,
)

export = router
```

- [ ] **Step 6: Add the new env vars**

Append to `config/config.env` (gitignored — local dev values only, not committed):

```
# LLM invoice extraction (specs/2026-06-27-llm-invoice-extraction)
ANTHROPIC_API_KEY=
ANTHROPIC_EXTRACTION_MODEL=claude-sonnet-4-6
LLM_PROVIDER=anthropic
LLM_INVOICE_EXTRACTION_ENABLED=false
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest invoiceExtraction.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 8: Run the full suite and confirm the coverage gate still passes**

Run: `npm test`
Expected: PASS, coverage thresholds (75/75/75/60) still met.

- [ ] **Step 9: Commit**

```bash
git add services/invoiceExtraction/upload.ts controllers/invoiceExtraction.ts routes/invoices.ts __tests__/integration/invoiceExtraction.test.ts
git commit -m "feat(server): add POST /api/invoices/scan endpoint"
```

Note: `config/config.env` is gitignored (`*/config.env` in `.gitignore`) and will not appear in `git status` — no need to stage it, but confirm your local copy has the new vars before manual testing.

---

### Task 6: Eval harness

**Files:**
- Create: `scripts/evals/invoiceExtraction/scoring.ts`
- Create: `scripts/evals/invoiceExtraction/run.ts`
- Test: `__tests__/unit/scripts/invoiceExtractionScoring.test.ts`
- Modify: `package.json` (add `eval:invoice-extraction` script)

**Interfaces:**
- Consumes: `extractInvoice` from `services/invoiceExtraction/extract` (Task 4); `AMOUNT_TOLERANCE` from `services/invoiceExtraction/validate` (Task 2); `Expense` model (existing, `models/Expense.ts`); `documentUpload` (existing, for `s3Client`/`bucketName`); `connectDB` (existing, `config/db.ts`).
- Produces: `scoreField(predicted, groundTruth, kind): boolean | null` and `scoreRecord(extraction, groundTruth): FieldScore[]` from `scoring.ts` (the only pieces that get a unit test — `run.ts` is DB/S3 I/O orchestration, consistent with the other ungtested scripts in `scripts/`, e.g. `generate-test-data.js`).

- [ ] **Step 1: Write the failing test for scoring**

Create `__tests__/unit/scripts/invoiceExtractionScoring.test.ts`:

```ts
import {
  scoreField,
  scoreRecord,
  GroundTruth,
} from '../../../scripts/evals/invoiceExtraction/scoring'
import { Extraction } from '../../../services/invoiceExtraction/schema'

function buildExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
    ...overrides,
  }
}

function buildGroundTruth(overrides: Partial<GroundTruth> = {}): GroundTruth {
  return {
    vendor: 'Albert Heijn',
    date: '2026-06-18',
    total: 20.11,
    taxLow: 1.66,
    taxHigh: 0,
    ...overrides,
  }
}

describe('scoreField', () => {
  it('matches numeric fields within the shared amount tolerance', () => {
    expect(scoreField(20.1, 20.11, 'amount')).toBe(true)
  })

  it('rejects numeric fields outside the tolerance', () => {
    expect(scoreField(19, 20.11, 'amount')).toBe(false)
  })

  it('matches strings case-insensitively after trimming', () => {
    expect(scoreField('  Albert Heijn ', 'albert heijn', 'string')).toBe(true)
  })

  it('matches dates by calendar day only', () => {
    expect(scoreField('2026-06-18', '2026-06-18', 'date')).toBe(true)
  })

  it('returns null (not scorable) when ground truth is null or undefined', () => {
    expect(scoreField('anything', null, 'string')).toBeNull()
    expect(scoreField('anything', undefined, 'amount')).toBeNull()
  })
})

describe('scoreRecord', () => {
  it('scores vendor, date, total, taxLow, and taxHigh against ground truth', () => {
    const scores = scoreRecord(buildExtraction(), buildGroundTruth())
    const byField = Object.fromEntries(scores.map((s) => [s.field, s.correct]))

    expect(byField.vendor).toBe(true)
    expect(byField.invoiceDate).toBe(true)
    expect(byField.total).toBe(true)
    expect(byField.taxLow).toBe(true)
    expect(byField.taxHigh).toBe(true)
  })

  it('maps vatBreakdown 9%/21% buckets to taxLow/taxHigh before comparing', () => {
    const scores = scoreRecord(
      buildExtraction({
        vatBreakdown: [
          { rate: 9, amount: 1.66 },
          { rate: 21, amount: 3.5 },
        ],
      }),
      buildGroundTruth({ taxLow: 1.66, taxHigh: 3.5 }),
    )
    const byField = Object.fromEntries(scores.map((s) => [s.field, s.correct]))

    expect(byField.taxLow).toBe(true)
    expect(byField.taxHigh).toBe(true)
  })

  it('excludes a field from scoring when ground truth has no value for it', () => {
    const scores = scoreRecord(buildExtraction(), buildGroundTruth({ vendor: undefined }))
    const fields = scores.map((s) => s.field)
    expect(fields).not.toContain('vendor')
  })

  it('marks total as incorrect when it does not match', () => {
    const scores = scoreRecord(
      buildExtraction({ total: 999 }),
      buildGroundTruth(),
    )
    const totalScore = scores.find((s) => s.field === 'total')
    expect(totalScore?.correct).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest invoiceExtractionScoring.test.ts`
Expected: FAIL — `Cannot find module '../../../scripts/evals/invoiceExtraction/scoring'`

- [ ] **Step 3: Write the scoring implementation**

Create `scripts/evals/invoiceExtraction/scoring.ts`:

```ts
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
    return (
      predicted.slice(0, 10) === (groundTruth as string).slice(0, 10)
    )
  }

  // string
  if (typeof predicted !== 'string') return false
  return predicted.trim().toLowerCase() === (groundTruth as string).trim().toLowerCase()
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
    { field: 'vendor', predicted: extraction.vendor, groundTruth: groundTruth.vendor, kind: 'string' },
    { field: 'invoiceDate', predicted: extraction.invoiceDate, groundTruth: groundTruth.date, kind: 'date' },
    { field: 'total', predicted: extraction.total, groundTruth: groundTruth.total, kind: 'amount' },
    { field: 'taxLow', predicted: vatBreakdownAmount(extraction, 9), groundTruth: groundTruth.taxLow, kind: 'amount' },
    { field: 'taxHigh', predicted: vatBreakdownAmount(extraction, 21), groundTruth: groundTruth.taxHigh, kind: 'amount' },
  ]

  const scores: FieldScore[] = []
  for (const candidate of candidates) {
    const correct = scoreField(candidate.predicted, candidate.groundTruth, candidate.kind)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest invoiceExtractionScoring.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Write the run script (not unit-tested — DB/S3 I/O orchestration, run manually)**

Create `scripts/evals/invoiceExtraction/run.ts`:

```ts
import fs from 'fs'
import path from 'path'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { program } from 'commander'

import '../../../config/loadEnv'
import connectDB from '../../../config/db'
import Expense from '../../../models/Expense'
import documentUpload from '../../../services/documentUpload'
import { extractInvoice } from '../../../services/invoiceExtraction/extract'
import { scoreRecord, FieldScore } from './scoring'

program.option('--limit <n>', 'number of Expense records to sample', '20')
program.parse(process.argv)
const { limit } = program.opts<{ limit: string }>()

interface ExpenseFixture {
  _id: string
  expenseFile: string
  expenseDate: Date
  info?: string
  contactName?: string
  tax?: number
  taxLow?: number
  price?: number
}

function resolveS3Key(expenseFile: string): string {
  // Some historical records store the bare S3 key; others store the
  // "/api/document/<key>" path returned by documentsService.uploadDocument().
  return expenseFile.replace(/^\/api\/document\//, '')
}

function inferMimeType(key: string): 'image/jpeg' | 'image/png' | null {
  const lower = key.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return null
}

async function fetchImageBuffer(key: string): Promise<Buffer> {
  const response = await documentUpload.s3Client.send(
    new GetObjectCommand({ Bucket: documentUpload.bucketName, Key: key }),
  )
  const chunks: Buffer[] = []
  const body = response.Body as NodeJS.ReadableStream
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function run(): Promise<void> {
  await connectDB()

  const fixtures = (await Expense.find({
    expenseFile: { $exists: true, $ne: '' },
  })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean()) as unknown as ExpenseFixture[]

  console.log(`Loaded ${fixtures.length} Expense fixtures (limit=${limit})`)

  const allScores: FieldScore[] = []
  const perRecord: Array<{ id: string; status: string; scores?: FieldScore[] }> = []

  for (const fixture of fixtures) {
    const key = resolveS3Key(fixture.expenseFile)
    const mimeType = inferMimeType(key)

    if (!mimeType) {
      perRecord.push({ id: fixture._id, status: 'skipped: unsupported file type (V1 is jpeg/png only)' })
      continue
    }

    try {
      const buffer = await fetchImageBuffer(key)
      const result = await extractInvoice({ buffer, mimeType })

      const scores = scoreRecord(result.extraction, {
        vendor: fixture.info ?? fixture.contactName ?? null,
        date: fixture.expenseDate?.toISOString().split('T')[0] ?? null,
        total: fixture.price ?? null,
        taxLow: fixture.taxLow ?? null,
        taxHigh: fixture.tax ?? null,
      })

      allScores.push(...scores)
      perRecord.push({ id: fixture._id, status: 'scored', scores })
    } catch (error) {
      perRecord.push({
        id: fixture._id,
        status: `failed: ${(error as Error).message}`,
      })
    }
  }

  const byField = new Map<string, { correct: number; total: number }>()
  for (const score of allScores) {
    const bucket = byField.get(score.field) ?? { correct: 0, total: 0 }
    bucket.total += 1
    if (score.correct) bucket.correct += 1
    byField.set(score.field, bucket)
  }

  console.log('\nPer-field accuracy:')
  for (const [field, bucket] of byField.entries()) {
    const pct = ((bucket.correct / bucket.total) * 100).toFixed(1)
    console.log(`  ${field}: ${pct}% (${bucket.correct}/${bucket.total})`)
  }

  const overallCorrect = allScores.filter((s) => s.correct).length
  const overallPct = allScores.length
    ? ((overallCorrect / allScores.length) * 100).toFixed(1)
    : 'n/a'
  console.log(`\nOverall: ${overallPct}% (${overallCorrect}/${allScores.length})`)

  const resultsDir = path.join(__dirname, 'results')
  fs.mkdirSync(resultsDir, { recursive: true })
  const reportPath = path.join(resultsDir, `${Date.now()}.json`)
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ perRecord, byField: Object.fromEntries(byField), overallPct }, null, 2),
  )
  console.log(`\nFull report: ${reportPath}`)

  process.exit(0)
}

run().catch((error) => {
  console.error('Eval run failed:', error)
  process.exit(1)
})
```

- [ ] **Step 6: Wire the npm script and gitignore the results directory**

In `package.json`, add to `"scripts"` (after `"test:integration"`):

```json
"eval:invoice-extraction": "tsx scripts/evals/invoiceExtraction/run.ts"
```

Append to `.gitignore`:

```
scripts/evals/invoiceExtraction/results/
```

- [ ] **Step 7: Run the new unit test plus the full suite**

Run: `npx jest invoiceExtractionScoring.test.ts && npm test`
Expected: Both PASS. (`run.ts` itself is excluded from `tsc --noEmit` via `tsconfig.json`'s `exclude: ["scripts"]`, matching every other file in `scripts/` — it is run directly via `tsx`, never type-checked or unit-tested, same as `generate-test-data.js`.)

- [ ] **Step 8: Commit**

```bash
git add scripts/evals/invoiceExtraction package.json .gitignore __tests__/unit/scripts/invoiceExtractionScoring.test.ts
git commit -m "feat(server): add invoice-extraction eval harness against real Expense data"
```

---

### Task 7: README documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Add the new env vars to the Environment block**

In `README.md`, the `### Environment` code block (currently ending `MOLLIE_WEBHOOK=...`), append:

```
ANTHROPIC_API_KEY=<your anthropic api key>
ANTHROPIC_EXTRACTION_MODEL=claude-sonnet-4-6
LLM_PROVIDER=anthropic
LLM_INVOICE_EXTRACTION_ENABLED=false
```

- [ ] **Step 2: Add a subsection under "Additional tooling"**

In `README.md`, after the existing `### Dashboard aggregation jobs` subsection, add:

```markdown
### LLM invoice extraction

`POST /api/invoices/scan` extracts structured invoice/receipt fields (vendor,
date, currency, subtotal, VAT breakdown, total, line items) from an uploaded
image using a multimodal LLM, cross-checked by a lightweight arithmetic/domain
validation layer (line items vs subtotal, subtotal + VAT vs total, VAT rate
plausibility, date sanity). It does not write to the database — the client
reviews/edits the result and persists via the existing `POST /api/expense`.

Behind `LLM_INVOICE_EXTRACTION_ENABLED` (default `false`); when disabled the
route returns `503`. Requires `ANTHROPIC_API_KEY`; `ANTHROPIC_EXTRACTION_MODEL`
defaults to `claude-sonnet-4-6`.

Request: `multipart/form-data`, field `file` (`image/jpeg` or `image/png`
only — PDF is not yet supported for this endpoint).

Response (`200`):

```json
{
  "success": true,
  "data": {
    "fileLocation": "<tenantId>/<filename>",
    "extraction": {
      "vendor": "Albert Heijn",
      "invoiceDate": "2026-06-18",
      "currency": "EUR",
      "subtotal": 18.45,
      "vatBreakdown": [{ "rate": 9, "amount": 1.66 }],
      "vatAmount": 1.66,
      "total": 20.11,
      "lineItems": []
    },
    "confidence": { "overall": 0.91, "fields": { "total": 0.99 } },
    "validation": { "warnings": [] },
    "needsReview": false,
    "meta": { "provider": "anthropic", "model": "claude-sonnet-4-6", "latencyMs": 1200, "tokensUsed": { "input": 1000, "output": 100 } }
  }
}
```

Errors: `400` (no file / unsupported mime), `503` (flag disabled), `422`
`EXTRACTION_FAILED` (LLM output failed schema validation, or missing/invalid
`total`), `502` (provider error after retries).

Run the eval harness (scores extraction accuracy against real, previously
saved Expense records) with:

```
npm run eval:invoice-extraction
npm run eval:invoice-extraction -- --limit 50
```

Full design: `specs/2026-06-27-llm-invoice-extraction/design.md`.
```

- [ ] **Step 3: Verify the README renders sensibly**

Run: `BASH_OK=1 grep -n "LLM invoice extraction" README.md`
Expected: the new subsection header is present, nested under `## Additional tooling`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document POST /api/invoices/scan and the eval harness"
```
