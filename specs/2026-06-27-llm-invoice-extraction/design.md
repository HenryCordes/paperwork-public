# LLM-Based Invoice/Receipt Extraction — Design

**Date:** 2026-06-27
**Status:** Approved (design); implementation plan pending
**Branch:** `feat/llm-invoice-extraction` (also used, same name, in the sibling `paperwork-app` repo for any later mobile-side wiring)
**Goal:** Add a backend endpoint that extracts structured invoice/receipt fields from an image using a multimodal LLM, cross-checked by a new lightweight arithmetic/domain validation layer, running side-by-side with (not replacing) the mobile app's existing on-device OCR + rules engine.

## Context

**Mobile today** (`paperwork-app`): OCR runs on-device via `@capacitor-community/image-to-text` (`src/hooks/useScan.ts:45`). A regex/spatial rule engine (`src/hooks/receipt-parsing/rules/{dateRules,totalRules,taxRules}.ts`) extracts exactly 4 fields — `date`, `total`, `taxLow`, `taxHigh` — each with a per-rule confidence (0-0.99); highest-confidence match wins, no threshold gate. The user reviews/edits via a checkbox modal, then the app uploads the image (`POST /api/document`, multipart, field `file`) and saves the result as an Expense (`POST /api/expense`, JSON).

**Backend today** (`paperwork`): no extraction logic exists anywhere (confirmed by grep for ocr/extract/scan/rules/vat). The real target model is `models/Expense.ts`: `expenseDate`, `info`, `tax` (21% amount), `taxLow` (9% amount), `priceWOTaxes`, `price`, `contactId`, `contactName`, `expenseFile` (S3 key). There is no `currency` field anywhere in the codebase (single-currency, Dutch/EUR app), and no line items on `Expense` (only `Invoice.invoiceLines`, which is for outgoing invoices the tenant sends, not scanned receipts) — though `Invoice`'s line schema confirms the valid Dutch VAT rate set: `[21, 9, 6, 0]`. Document upload (`controllers/documents.ts`, `services/documentUpload.ts`) is generic multer-s3, accepts jpeg/png/pdf, keys as `{tenantId}/{originalname}`, returns `{ success, data: { fileLocation } }`. There is no feature-flag system (plain env-var booleans only) and no validation lib actually in use (`express-validator` is installed but dead; the real convention is `_.pick` + manual checks). Bull queues follow a consistent template (`services/queues/<name>Queue.ts` + `services/queues/<domain>/<name>Processor.ts`, registered by import in `worker.ts`, `attempts: 3` exponential backoff from `config/queue.ts`). Secrets are plain `process.env` reads, one singleton client per integration.

## Decisions

- **Hybrid validation = new arithmetic/domain rules, not a second extraction pipeline.** The mobile rule engine operates on raw OCR text + spatial coordinates; it cannot run as-is on the backend (no server-side OCR step exists), and porting it plus adding a server-side OCR call would add a second extractor to maintain for little benefit — the vision LLM is already more accurate at field extraction than the regex engine it's replacing. Instead, the backend validates the LLM's own output for *internal consistency* (sums, plausibility, date range).
- **VAT-rate checks warn, never reject.** Reverse-charge, EU, and foreign-VAT invoices legitimately fall outside the Dutch `{0, 9, 21}` set; an unusual rate lowers confidence and flags for review, it does not fail the request.
- **Provider: Anthropic**, behind a swappable interface. Build and run evals on `claude-sonnet-4-6`; the model id is env-configurable so production can move to a cheaper tier (e.g. Haiku) once evals confirm parity.
- **V1 image formats: `image/jpeg` and `image/png` only.** PDF support is explicitly deferred — PDFs are a web-only use case (emailed invoices), not something mobile camera scanning produces, and Claude's API handles PDFs via a different content-block type than raw images, so it's a distinct follow-up, not a mime-whitelist tweak.
- **No Expense model changes in this PR.** The extraction endpoint returns `vendor`, `subtotal`, `lineItems`, and `currency`, but `Expense` has no fields for them today. Persisting remains entirely through the existing `POST /api/expense`; mapping/dropping those richer fields on save is a client-side decision, out of scope here.
- **Synchronous for V1, worker-ready by construction.** The extraction call is a plain async function with no Express or Bull coupling, so moving it behind a queue later is a relocation, not a rewrite.
- **Two feature branches, no merge to main yet.** `paperwork` and `paperwork-app` both carry a `feat/llm-invoice-extraction` branch. Neither merges to its `main` until the user has manually validated the feature end-to-end.
- **Minimal mobile wiring is in scope, for manual end-to-end testing.** The mobile app needs a way to actually call this endpoint so the user can scan a real receipt and validate the result on-device, not just run the offline eval harness. See the `paperwork-app` design doc (same spec date/slug, that repo's `specs/`) for the mobile-side design; the contract above is what it calls.

## Design

### Module layout (`services/invoiceExtraction/`)

- `provider/types.ts` — `InvoiceExtractionProvider` interface: `extract(image: { buffer: Buffer; mimeType: string }): Promise<RawExtraction>`.
- `provider/anthropicProvider.ts` — implements the interface via the Anthropic SDK's vision message API. Model id from `ANTHROPIC_EXTRACTION_MODEL` (default `claude-sonnet-4-6`). Structured prompt instructs JSON-only output matching `schema.ts`. Retries with exponential backoff (mirrors `config/queue.ts`'s `attempts: 3` convention) on timeout/5xx/rate-limit.
- `provider/index.ts` — factory selecting the provider by env var (`LLM_PROVIDER`, default `anthropic`); only one implementation ships now, but callers depend on the interface, not the concrete class.
- `schema.ts` — zod schema for the extraction payload (see below). New dependency: nothing in this repo can parse/coerce/refine untrusted nested LLM JSON — `express-validator` and `_.pick` only whitelist known request fields, they don't validate arbitrary structured output with cross-field refinements. This is a genuine case where the existing tooling doesn't fit.
- `validate.ts` — pure function, arithmetic/domain cross-checks over an already-parsed extraction; no network dependency, fully unit-testable in isolation.
- `extract.ts` — orchestrates: call provider → zod-parse → on parse failure, one repair re-prompt (send the validation error back to the model) → on second failure, throw `ExtractionFailedError` → run `validate.ts` → assemble the response (extraction + confidence + validation + `needsReview`). Marked with `// TODO(async-extraction): move this call behind services/queues/invoiceExtractionQueue.ts once volume needs it`, following the `emailQueue.ts` template for when that day comes.

### Extraction schema (`schema.ts`)

```ts
const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive().nullable(),
  unitPrice: z.number().nullable(),
  taxRate: z.number().nullable(),
  lineTotal: z.number(),
})

const vatBreakdownEntrySchema = z.object({
  rate: z.number(),
  amount: z.number(),
})

const extractionSchema = z.object({
  vendor: z.string().nullable(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .nullable(),
  currency: z.string().length(3).default('EUR'),
  subtotal: z.number().nullable(),
  vatBreakdown: z.array(vatBreakdownEntrySchema),
  vatAmount: z.number().nullable(),
  total: z.number(), // hard requirement — see validate.ts
  lineItems: z.array(lineItemSchema),
})
```

Per-field confidence (`Record<string, number>`) and `overall` confidence come from the provider response alongside the extraction, validated as a separate small schema (`confidenceSchema`), not folded into `extractionSchema` itself — confidence is metadata about the extraction, not part of its data shape.

### Route and controller

There is no `routes/index` in this codebase — routes are mounted directly in `app.ts`, and `/api/invoices` is already mounted to `routes/invoices.ts` (currently just `GET /` and `GET /list`). The new route is added to that existing router rather than a new top-level path: `router.post('/scan', protect, ...)`, giving `POST /api/invoices/scan`.

**Upload correction:** `multer-s3` (used by the existing `/api/document` route) streams the file directly to S3 and never populates `req.file.buffer` — so it cannot also hand the raw bytes to the LLM call. This route instead uses `multer.memoryStorage()` (`services/invoiceExtraction/upload.ts`, fileFilter restricted to `image/jpeg`/`image/png`) to get `req.file.buffer` for the provider call, and persists to S3 explicitly via the *existing* `documentUpload.uploadFileNonHttp(buffer, originalname, tenantId, { contentType })` helper (`services/documentUpload.ts`, already used by export processors) — run in parallel with the LLM call via `Promise.all`, since the two are independent. The shared `/api/document` route and its jpeg/png/pdf whitelist are unaffected.

`controllers/invoiceExtraction.ts`:
1. Check `LLM_INVOICE_EXTRACTION_ENABLED === 'true'`; if not, `503` (`{ success: false, message: 'LLM invoice extraction is not enabled' }`).
2. If `!req.file`, `400` (`{ success: false, message: 'No file uploaded' }`). An unsupported mime type is rejected earlier, by the upload middleware itself, also as `400`.
3. Resolve tenant via `getCurrentTenantId(req.organizationId)`.
4. Run `extractInvoice({ buffer: req.file.buffer, mimeType: req.file.mimetype })` and `documentUpload.uploadFileNonHttp(...)` in parallel.
5. On success, `200` with the contract below (`fileLocation` from the upload result's `key`). On `ExtractionFailedError`, `422`. On a provider error (has a numeric `status`) after retries exhausted, `502`. Unexpected errors fall through to `next(error)` per the existing convention.

**Accepted edge case:** if extraction fails after the S3 upload already succeeded (they run in parallel), the uploaded image is orphaned in S3. Acceptable for this low-volume, flag-gated endpoint; not worth the added complexity of sequencing/cleanup.

### Endpoint contract

`POST /api/invoices/scan` — `multipart/form-data`, field `file` (`image/jpeg` or `image/png`).

200 response:

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
      "lineItems": [
        { "description": "Melk", "quantity": 2, "unitPrice": 1.39, "taxRate": 9, "lineTotal": 2.78 }
      ]
    },
    "confidence": {
      "overall": 0.91,
      "fields": { "vendor": 0.95, "invoiceDate": 0.9, "total": 0.99, "vatAmount": 0.8 }
    },
    "validation": {
      "warnings": [
        { "code": "VAT_RATE_UNUSUAL", "message": "Line item VAT rate 19% is outside expected Dutch rates", "field": "lineItems[2].taxRate" }
      ]
    },
    "needsReview": false,
    "meta": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "latencyMs": 2140,
      "tokensUsed": { "input": 1450, "output": 210 }
    }
  }
}
```

Error responses:

| Status | Code | Cause |
|--------|------|-------|
| 400 | — | no file, wrong field name, or unsupported mime type |
| 503 | — | `LLM_INVOICE_EXTRACTION_ENABLED` is not `'true'` |
| 422 | `EXTRACTION_FAILED` | schema-invalid after one repair attempt, or `total` missing/<= 0 |
| 502 | — | provider error after retries exhausted (timeout, 5xx, rate limit) |
| 500 | — | unexpected |

This endpoint does **not** write to Mongo. It mirrors the current mobile flow: extract → user reviews/edits client-side → client persists via the existing `POST /api/expense`, with `expenseFile` set to the returned `fileLocation`.

### Validation rules (`validate.ts`)

All amount comparisons use a fixed tolerance of **EUR 0.02** (two cents — covers per-line rounding accumulation without masking real mismatches).

- Sum of `lineItems[].lineTotal` vs `subtotal` — warn (`LINE_ITEMS_SUBTOTAL_MISMATCH`) outside tolerance. Skipped if `lineItems` is empty (most receipts aren't itemized).
- Sum of `vatBreakdown[].amount` vs `vatAmount` — warn (`VAT_BREAKDOWN_MISMATCH`) outside tolerance. The schema carries both an aggregate and a per-rate breakdown; without this check the two could silently disagree.
- `subtotal + vatAmount` vs `total` — warn (`SUBTOTAL_VAT_TOTAL_MISMATCH`) outside tolerance.
- VAT rate per `vatBreakdown` entry and per line item, against `{0, 9, 21}` — warn (`VAT_RATE_UNUSUAL`) if outside; never reject.
- `invoiceDate` sane range — warn (`DATE_OUT_OF_RANGE`) if more than 1 day in the future, or older than a configurable retention constant (default 6 years, matching Dutch bookkeeping retention). Format correctness (`YYYY-MM-DD`) is enforced by the schema itself, not here, so this check never has to handle an unparseable string.
- `total` present and `> 0` — this is the one hard requirement; missing/invalid `total` throws `ExtractionFailedError` (422), everything else only warns.
- `needsReview = true` if any warning fired, or `confidence.overall` is below a configurable threshold (default `0.75`).

### Environment variables (`config/config.env`)

`ANTHROPIC_API_KEY`, `ANTHROPIC_EXTRACTION_MODEL` (default `claude-sonnet-4-6`), `LLM_INVOICE_EXTRACTION_ENABLED` (default `false`), `LLM_PROVIDER` (default `anthropic`).

### Eval harness

`scripts/evals/invoiceExtraction/`:
- A labeled fixture set built from existing `Expense` records that have both `expenseFile` (S3 image) and known-correct fields — sampled, with a hand-verified holdout set.
- `run.ts` calls `extract.ts` directly (no HTTP/auth plumbing), scores each field with type-appropriate tolerance (numeric tolerance for amounts, normalized-string for vendor, exact for date/currency), prints a per-field + overall accuracy table, and writes a JSON report to `scripts/evals/invoiceExtraction/results/<timestamp>.json`.
- Wired as `npm run eval:invoice-extraction`.

### Tests

- `schema.test.ts` — valid payloads parse; malformed payloads (missing `total`, wrong types, out-of-range types) fail with expected zod issues.
- `validate.test.ts` — each rule in isolation, plus a fully-clean fixture producing zero warnings.
- `extract.test.ts` — provider mocked: retry → repair → clean-fail paths; confidence/`needsReview` derivation from validation warnings.
- Controller integration test (Supertest): flag off → 503; flag on + mocked provider → 200 with expected shape; bad mime → 400.

## Edge cases

- Image with no readable text / blank receipt → provider likely returns `total: null` or fails schema → `422 EXTRACTION_FAILED`, not a 200 with garbage data.
- Reverse-charge / EU / non-Dutch VAT invoice → `VAT_RATE_UNUSUAL` warning, `needsReview: true`, still a `200`.
- Provider timeout or 5xx → retried with backoff; if retries exhaust, `502`, not a hung request.
- Multi-currency receipt (e.g. a USD receipt) → `currency` reflects what the model reads off the document; no conversion or validation against tenant locale happens here (this app has no existing currency field/concept to validate against).

## Success criteria

- `POST /api/invoices/scan` behind the flag returns the documented 200 shape for a clean Dutch receipt image, and the documented error codes for each failure mode above.
- Disabling `LLM_INVOICE_EXTRACTION_ENABLED` fully disables the route (503) without touching the existing mobile/document/expense flows.
- `npm run eval:invoice-extraction` runs against the fixture set and prints per-field + overall accuracy.
- All new code has the test coverage listed above; `npm test` stays green.

## Out of scope (explicit, for follow-up)

- PDF input support (web-only invoices) — deferred per decision above.
- Extending `Expense` (or any model) with `vendor`/`subtotal`/`lineItems`/`currency` — deferred per decision above.
- **HEIC/HEIF image input.** Not produced by the current mobile scan flow — `capacitor-document-scanner` writes its own `.jpg` output regardless of the device camera's photo-format setting (`paperwork-app/src/hooks/useScan.ts:109`) — and not accepted by Claude's vision API, which supports only `image/jpeg`, `image/png`, `image/gif`, `image/webp` ([Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). Would need a client-side HEIC→JPEG conversion step before upload if a future flow (e.g. picking an existing photo from the library, instead of using the document scanner) needs it.
- Moving extraction behind a Bull queue — the seam is left as a `TODO`, not implemented.
- A second LLM provider (OpenAI) — the interface supports it; no second implementation ships now.
- A dedicated review UI for confidence/warnings on mobile, a settings toggle UI for the new LLM-scan flag, and the redundant-upload optimization (see the `paperwork-app` design doc) — the mobile wiring in this round is deliberately minimal.
