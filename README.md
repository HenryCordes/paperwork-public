# Paperwork

[![CI](https://github.com/HenryCordes/paperwork-public/actions/workflows/ci.yml/badge.svg)](https://github.com/HenryCordes/paperwork-public/actions/workflows/ci.yml)
[![License: view-only](https://img.shields.io/badge/license-view--only-red)](LICENSE)

**Bookkeeping and tax administration for small-business owners in the Netherlands.**

[paper-work.nl](https://paper-work.nl)

Paperwork helps freelancers and small-business owners stay on top of their bookkeeping and tax admin without leaning on an accountant for the everyday — registering clients and contact moments, capturing invoices and expenses, and preparing the figures needed for Dutch tax filing, quickly and reliably.

I designed and built Paperwork end to end — product, architecture, web and native mobile — as part of my independent practice, Dev Artist.

### Dashboard
<img width="500"  alt="Scherm­afbeelding 2026-06-07 om 21 51 06" src="https://github.com/user-attachments/assets/24707bbd-5392-4692-9901-2937f12f4b75" />


### Invoice
<img width="500"  alt="factuur-details" src="https://github.com/user-attachments/assets/37e50d12-8687-4c78-9e40-e9059fd0ef68" />



## What it does

- Register clients, contacts and contact moments
- Create and send invoices
- Capture and organise expenses, with document storage
- Dashboard reporting via scheduled aggregation jobs
- Prepare the numbers needed for Dutch tax administration

## Built with

- **Frontend:** React
- **Backend:** Node.js · Express · MongoDB
- **Infrastructure:** Redis (caching + background job queues) · AWS S3 (document storage)
- **Engineering:** TDD, clean architecture, queue-based background processing, CI/CD

## Getting started

### Prerequisites

A local **MongoDB** and **Redis** instance.

Run MongoDB locally:

1. To start — execute: `brew services start mongodb-community@8.0`
2. To stop — execute: `brew services stop mongodb-community@8.0`

Run Redis locally:

1. To start — execute: `brew services start redis`
2. To stop — execute: `brew services stop redis`

### Environment

Create a `config/config.env` file with your own values (none are committed):

```
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:<mongoport>/<databaseName>
JWT_SECRET=<your secret>
JWT_EXPIRES=<your jwt expires>
COOKIE_EXPIRES=<your cookie expires>
TINYMCE_API_KEY=<your tinymce api key>
MOLLIE_API_KEY=<your mollie api key>
AWS_ID=<your aws id>
AWS_SECRET=<your aws secret>
AWS_DOCUMENT_BUCKET_NAME=<your aws document bucket name>
AWS_REGION=<your aws region>
MJ_APIKEY_PUBLIC=<your mailjet public api key>
MJ_APIKEY_PRIVATE=<your mailjet private api key>
EMAIL_FROM=<your email from>
MOLLIE_PAYMENT_SUCCESS_PAGE=http://localhost:3000/payments/success
MOLLIE_WEBHOOK=http://localhost:3000/api/payment/mollie/webhook
ANTHROPIC_API_KEY=<your anthropic api key>
ANTHROPIC_EXTRACTION_MODEL=claude-sonnet-4-6
LLM_PROVIDER=anthropic
LLM_INVOICE_EXTRACTION_ENABLED=false
```

### Install & run

1. Execute `npm install` in the root directory
2. Execute `npm install` in the `client` directory
3. Execute `npm run dev` in the root directory
4. Open the browser and go to `http://localhost:3000`

## Additional tooling

### Generate test data

1. Generate test data — execute: `node scripts/generate-test-data.js`
2. Generate test data and keep existing data — execute: `node scripts/generate-test-data.js --keep-data`
3. Generate only organizations and users — execute: `node scripts/generate-test-data.js --organizations-only`
4. Generate only dashboard aggregations — execute: `node scripts/generate-test-data.js --dashboard-only`

### Dashboard aggregation jobs

1. To activate in production, set the environment variable: `ACTIVATE_DASHBOARD_AGGREGATION_JOBS=true`
2. To deactivate, set `ACTIVATE_DASHBOARD_AGGREGATION_JOBS=false` or remove the variable

### LLM invoice extraction

[`POST /api/invoices/scan`](https://github.com/HenryCordes/paperwork-public/blob/b2ccd88ffd6d928dd6ec7547af2af5c1388f80c3/controllers/invoiceExtraction.ts#L32) extracts structured invoice/receipt fields (vendor,
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
npm run eval:invoice-extraction -- --tenant-id <id>
npm run eval:invoice-extraction -- --tenant-id <id> --limit 50
```

Full design: [`specs/2026-06-27-llm-invoice-extraction/design.md`](https://github.com/HenryCordes/paperwork-public/blob/main/specs/2026-06-27-llm-invoice-extraction/design.md#llm-based-invoicereceipt-extraction--design).

## Testing

Server tests (Jest + Supertest + mongodb-memory-server), run from the repo root:

```bash
npm test                  # full server suite
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only
npm run test:coverage     # with coverage report
```

Client tests (Create React App / craco, one-shot) — reducers, formatters, and
React components via RTL:

```bash
cd client && CI=true npm test -- --watchAll=false
```

Typecheck and lint/format:

```bash
npm run typecheck                                # server (root tsconfig)
cd client && npx tsc --noEmit -p tsconfig.json   # client
npm run lint                                     # server (ESLint 9 flat config)
npm run format                                   # Prettier write
npm run format:check                             # Prettier check (CI uses this)
```

## Git hooks (Husky)

Hooks are installed automatically via the `prepare` script on `npm install`.
They are **per-area**: server checks run only when server files change, client
checks only when `client/` files change.

- **pre-commit** — `lint-staged` formats staged files and runs ESLint --fix on
  staged server TypeScript, then `tsc --noEmit` runs for whichever area(s) you
  touched (server root tsconfig and/or `client/tsconfig.json`). Fast.
- **pre-push** — runs the test suite(s) for whatever changed in the range being
  pushed: the server Jest suite for server changes, the client `craco test`
  suite for client changes, both if both changed.

Bypass in a pinch with `git commit --no-verify` / `git push --no-verify`.

Note: client **ESLint** is not yet wired into the hooks (CRA lints during
`craco build`); see `specs/` for the planned ESLint 9 unification.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull
request, as two parallel jobs:

- **`build` (server)** — `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and `npm test`.
- **`client`** — installs the client, then `tsc --noEmit -p tsconfig.json` and
  `craco test --watchAll=false`.

Client **lint** is not in CI (CRA lints only via `craco build`, tied to the
planned ESLint 9 unification); client **format** is covered by the server job's
`format:check` (`prettier --check .` includes `client/`).

## Status

Live and in active use at **[paper-work.nl](https://paper-work.nl)**.

---

Built by Henry Cordes — [devartist.nl](https://devartist.nl) · [LinkedIn](https://www.linkedin.com/in/henrycordes)
