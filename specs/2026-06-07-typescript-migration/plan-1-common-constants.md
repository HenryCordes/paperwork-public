# Increment 1 — Convert `common/` to TypeScript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the backend-only `common/` leaf modules from CommonJS `.js` to strict TypeScript `.ts`, keeping behavior identical and the app green, and add a test for the one module with real logic (`btwPeriods`).

**Architecture:** These four files are imported only by the backend via extensionless `require('../common/...')`; tsx resolves the renamed `.ts` transparently, and the consuming `.js` files keep using `require().named`. The CRA client is unaffected — it has its own copy at `client/src/common/constants.js` and does not import root `common/`.

**Tech Stack:** TypeScript 5 (strict), tsx, ts-jest, typescript-eslint.

**Spec:** [design.md](design.md) (Increment 1, first conversion slice).

**Branch:** `chore/typescript-migration`.

---

## Scope & conversion rules

Files (all under root `common/`, backend-only):
- `common/constants/periodPresets.js` — pure data (PERIOD_PRESETS, PERIOD_TYPES)
- `common/constants/paths.js` — pure data (PATHS)
- `common/plans.js` — pure data (availablePlans)
- `common/constants/btwPeriods.js` — data + 3 functions (real logic)

Conversion rules (apply to each):
1. `git mv` the file `.js` -> `.ts` (preserve history).
2. Replace `const x = require('mod')` with `import x from 'mod'`
   (esModuleInterop is on).
3. Replace `module.exports = { a, b }` with `export { a, b }` (or `export const`
   at declaration). Keep the **same export names** so existing `require()`
   call-sites are unchanged.
4. Add explicit types where `strict`/`noImplicitAny` requires (function params,
   indexable maps). Use `as const` for literal constant maps.
5. Wrap any `case` body that declares `const`/`let` in `{ }` to satisfy
   `no-case-declarations` (typescript-eslint). No behavior change.
6. Do **not** change runtime behavior — only types, syntax, and braces.

Backend call-sites that must keep working unchanged (verified, extensionless):
`controllers/btwExport.js`, `controllers/payments.js`, `controllers/dashboard.js`,
`controllers/plans.js`, `services/btwExportService.js`, `services/exportService.js`,
`services/btwCalculationService.js`, `services/queues/export/invoiceProcessor.js`,
`services/queues/export/expenseProcessor.js`.

Gate run after each task (the full CI gate + a prod boot):
```
npm run typecheck && npm run lint && npm run format:check && npm test
```
plus the production-mode tsx boot (Mongo+Redis up):
```
NODE_ENV=production PORT=5001 npx tsx server.js  # GET / and a btw route -> 200, then kill
```

---

## Task 1: Convert the three pure-data modules

**Files:** `common/constants/periodPresets.{js->ts}`, `common/constants/paths.{js->ts}`, `common/plans.{js->ts}`; modify `tsconfig.json`

- [ ] **Step 1: Add `common/` to tsconfig `include`**

In `tsconfig.json`, change the `include` array to add `"common/**/*"`:
```json
"include": ["server.js", "worker.js", "common/**/*", "shared/**/*", "__tests__/**/*.ts"],
```
(So the converted `.ts` files are type-checked directly, not only via the import
graph.)

- [ ] **Step 2: Convert `periodPresets.js` -> `.ts`**

`git mv common/constants/periodPresets.js common/constants/periodPresets.ts`, then
make the body:
```ts
export const PERIOD_PRESETS = {
  LAST_MONTH: 'last-month',
  LAST_THREE_MONTHS: 'last-3-months',
  LAST_TWELVE_MONTHS: 'last-12-months',
  THIS_YEAR: 'this-year',
  LAST_YEAR: 'last-year',
  CUSTOM: 'custom',
} as const

export const PERIOD_TYPES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
} as const
```

- [ ] **Step 3: Convert `paths.js` -> `.ts`**

`git mv common/constants/paths.js common/constants/paths.ts`, then:
```ts
import path from 'path'

export const PATHS = {
  TEMP_DIR: path.join(process.cwd(), 'tmp/temp'),
} as const
```

- [ ] **Step 4: Convert `plans.js` -> `.ts`**

`git mv common/plans.js common/plans.ts`, then keep the array as-is but as an
export with a type:
```ts
export interface Plan {
  id: string
  name: string
  description: string
  price: string
  priceNL: string
  currency: string
  interval: string
  intervalNL: string
}

export const availablePlans: Plan[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    description: 'Maand abonnement voor 1 gebruiker',
    price: '9.99',
    priceNL: '9,99',
    currency: 'EUR',
    interval: '1 month',
    intervalNL: 'Betaal per maand',
  },
  {
    id: 'essentials yearly',
    name: 'Essentials Year',
    description: 'Jaar abonnement (2 maanden bespaard)',
    price: '99.99',
    priceNL: '99,99',
    currency: 'EUR',
    interval: '12 months',
    intervalNL: 'Betaal per jaar',
  },
]
```

- [ ] **Step 5: Gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass; `Tests: 21 passed` (the existing periodPresets `.ts` test now
imports the `.ts` source). Then the prod-boot check -> `GET / -> 200`.

No new tests added (these three are pure data — trivial per the test policy).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json common/constants/periodPresets.ts common/constants/paths.ts common/plans.ts
git commit -m "refactor(ts): convert common/ data constants to TypeScript

periodPresets, paths, plans -> .ts with as-const/typed exports; same
export names so backend require() call-sites are unchanged. Pure data,
no tests (trivial per test policy). Backend-only; client has its own copy."
```

---

## Task 2: Convert `btwPeriods.js` -> `.ts` with a test

**Files:** `common/constants/btwPeriods.{js->ts}`; Create `__tests__/unit/constants/btwPeriods.test.ts`

- [ ] **Step 1: Convert `btwPeriods.js` -> `.ts`**

`git mv common/constants/btwPeriods.js common/constants/btwPeriods.ts`. Apply the
conversion rules: `export const`/`export {}` with the same names
(`BTW_PERIOD_TYPES`, `BTW_QUARTERS`, `BTW_MONTHS`, `BTW_TAX_RATES`,
`calculateBTWDeadline`, `getBTWPeriodRange`, `formatBTWPeriodLabel`); type the
function signatures `(periodType: string, period: string | number, year: number)`
returning `Date`, `{ startDate: Date; endDate: Date }`, and `string`
respectively; type the lookup maps so indexing by month-number / quarter-key is
allowed (e.g. `Record<number, {...}>` for months, `Record<string, {...}>` for
quarters), and **wrap each `case` block that declares a `const` in `{ }`** to
satisfy `no-case-declarations`. Preserve all logic and the December/Q4
next-year rollover exactly.

- [ ] **Step 2: Write the test (new code — full spec)**

`__tests__/unit/constants/btwPeriods.test.ts`:
```ts
import {
  BTW_PERIOD_TYPES,
  calculateBTWDeadline,
  getBTWPeriodRange,
  formatBTWPeriodLabel,
} from '../../../common/constants/btwPeriods'

describe('btwPeriods', () => {
  describe('calculateBTWDeadline', () => {
    it('monthly deadline is the 20th of the following month', () => {
      // March (3) -> 2024-04-20
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.MONTHLY, 3, 2024)).toEqual(
        new Date(2024, 3, 20),
      )
    })

    it('December monthly deadline rolls into next year', () => {
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.MONTHLY, 12, 2024)).toEqual(
        new Date(2025, 0, 20),
      )
    })

    it('Q4 quarterly deadline rolls into next January', () => {
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.QUARTERLY, 'Q4', 2024)).toEqual(
        new Date(2025, 0, 31),
      )
    })

    it('yearly deadline is March 31 of the following year', () => {
      expect(calculateBTWDeadline(BTW_PERIOD_TYPES.YEARLY, 2024, 2024)).toEqual(
        new Date(2025, 2, 31),
      )
    })

    it('throws on an invalid period type', () => {
      expect(() => calculateBTWDeadline('weekly', 1, 2024)).toThrow()
    })
  })

  describe('getBTWPeriodRange', () => {
    it('monthly range covers the whole month', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.MONTHLY,
        2,
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 1, 1))
      expect(endDate).toEqual(new Date(2024, 2, 0)) // Feb 29 2024 (leap)
    })

    it('quarterly range covers the quarter', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.QUARTERLY,
        'Q1',
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 0, 1))
      expect(endDate).toEqual(new Date(2024, 2, 31))
    })

    it('yearly range covers the whole year', () => {
      const { startDate, endDate } = getBTWPeriodRange(
        BTW_PERIOD_TYPES.YEARLY,
        2024,
        2024,
      )
      expect(startDate).toEqual(new Date(2024, 0, 1))
      expect(endDate).toEqual(new Date(2024, 11, 31))
    })
  })

  describe('formatBTWPeriodLabel', () => {
    it('formats monthly, quarterly, and yearly labels', () => {
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.MONTHLY, 3, 2024)).toBe(
        'Maart 2024',
      )
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.QUARTERLY, 'Q2', 2024)).toBe(
        'Q2 2024',
      )
      expect(formatBTWPeriodLabel(BTW_PERIOD_TYPES.YEARLY, 2024, 2024)).toBe(
        'Jaar 2024',
      )
    })
  })
})
```

- [ ] **Step 3: Gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass; test count rises from 21 to **30** (9 new btwPeriods tests).
Then the prod-boot check -> `GET / -> 200`.

- [ ] **Step 4: Commit**

```bash
git add common/constants/btwPeriods.ts __tests__/unit/constants/btwPeriods.test.ts
git commit -m "refactor(ts): convert btwPeriods to TypeScript with tests

Typed the BTW period maps and the deadline/range/label functions; braced
case blocks for no-case-declarations; behavior unchanged. Added 9 unit
tests covering monthly/quarterly/yearly deadlines, the December/Q4
next-year rollover, period ranges, and labels."
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** First conversion slice per design.md Increment 1
  (`common/constants/`), backend-only, with the decide-per-file test policy
  applied (btwPeriods tested; the three data files skipped as trivial). CRA
  boundary correctly determined to be a non-issue (client has its own copy).
- **Placeholder scan:** Trivial-file conversions shown in full; btwPeriods
  conversion is rule-driven (the file is mechanical to convert) with the new
  test fully specified. No TBD/TODO.
- **Consistency:** Export names preserved exactly so the 9 verified call-sites
  keep working; test count 21 -> 30 stated consistently; `tsconfig include`
  gains `common/**/*` so the new `.ts` are type-checked.

## Notes for the implementer

- Verify date expectations against `new Date(year, monthIndex, day)` (month is
  0-based) — the test uses that form deliberately.
- If `strict` indexing of `BTW_MONTHS`/`BTW_QUARTERS` fights you, type them as
  `Record<number, ...>` / `Record<string, ...>` (or `as const` + a typed
  accessor) rather than loosening to `any`.
- Run the prod boot with Mongo+Redis up; `controllers/btwExport.js` and the
  export services import these modules, so a successful boot also exercises the
  new `.ts` resolution.
