# Increment 0b — TypeScript Tooling Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TypeScript toolchain so `.ts` and `.js` coexist — type-checking, the `shared/` types package, a Jest TS transform, dev/typecheck scripts, and a minimal CI — proven by a new `.ts` test that runs green, **without converting any production source**.

**Architecture:** `tsconfig.json` with `allowJs: true` / `checkJs: false` lets `.ts` files be strictly checked while `.js` files keep running untouched. Runtime is already `tsx` (Increment 0a). Jest gains a `ts-jest` transform for `.ts` only; existing `.js` tests are unaffected. A `shared/` directory holds reusable types, resolved via a `@shared/*` path alias in both tsconfig and Jest.

**Tech Stack:** TypeScript 5, `tsx` (already a dependency), `ts-jest`, Jest 29, Node 20.

**Spec:** [design.md](design.md) (Increment 0b). Prettier + the gated reformat + `typescript-eslint` are deferred to Increment 0c.

**Branch:** `chore/typescript-migration` (already checked out)

---

## Context for the implementer

- **Do not convert any production `.js` file in this increment.** The only new
  `.ts` files are `shared/types/index.ts` and one test. Real conversions begin
  in Increment 1.
- The backend is CommonJS (`require`/`module.exports`). tsconfig uses
  `module: commonjs` to match.
- `common/constants/periodPresets.js` exports
  `module.exports = { PERIOD_PRESETS, PERIOD_TYPES }` (verified). The proof test
  imports those named exports — this works under `allowJs` + `esModuleInterop`.
- `tsc --noEmit` is a pure type gate (prod runs via tsx; nothing is emitted).
- `scripts/` contains two pre-existing `.ts` files (dead Windsurf migration
  scripts) that reference deleted paths; they are **excluded** in tsconfig so
  they don't fail the type gate. (Their cleanup is a separate follow-up.)

---

## Task 1: Add TypeScript dev dependencies

**Files:** `package.json` (devDependencies)

- [ ] **Step 1: Install**

Run: `npm install --save-dev typescript@^5 ts-jest@^29 @types/node@^20 @types/jest@^29`
Expected: all four land under `devDependencies`.

- [ ] **Step 2: Verify**

Run: `node -e "const d=require('./package.json').devDependencies; console.log(['typescript','ts-jest','@types/node','@types/jest'].map(k=>k+':'+(d[k]||'MISSING')).join('  '))"`
Expected: a version for each, none `MISSING`.

(No commit yet — committed with Task 5 once green.)

---

## Task 2: Add tsconfig.json

**Files:** Create `tsconfig.json`

- [ ] **Step 1: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["server.js", "worker.js", "shared/**/*", "__tests__/**/*.ts"],
  "exclude": ["node_modules", "client", "coverage", "scripts", "dist"]
}
```

Note: `include` is intentionally narrow for this increment — the toolchain is
proven against `shared/` and the new `.ts` test. As production files convert to
`.ts` in later increments, they are picked up automatically (they'll live in
already-included dirs) or `include` is widened then. Keeping it narrow now avoids
the type gate scanning all 111 `.js` files before any of them are typed.

- [ ] **Step 2: Sanity-check tsconfig parses**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exits 0 (no files with type errors yet; `shared/` and the test are
added in later tasks, so at this point it simply finds nothing to complain
about). If it prints config errors, fix them before continuing.

---

## Task 3: Wire Jest for TypeScript + add scripts

**Files:** Modify `jest.config.js`, `package.json` (scripts)

- [ ] **Step 1: Update `jest.config.js`**

Replace the file with:
```js
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.[jt]s", "**/?(*.)+(spec|test).[jt]s"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/client/",
    "helper-db.js",
    "helper-fixtures.js",
  ],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
    "^.+\\.js$": "babel-jest",
  },
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/shared/$1",
  },
  setupFilesAfterEnv: ["./jest.setup.js"],
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/client/",
    "/coverage/",
    "/__tests__/",
  ],
  verbose: true,
};
```
Changes from the original: `testMatch` now also matches `.ts`; a `transform`
compiles `.ts` via `ts-jest`; `moduleNameMapper` resolves the `@shared/*` alias
so tests can import shared types. **The `"^.+\\.js$": "babel-jest"` line is
required:** defining `transform` overrides Jest's implicit default, and without
re-declaring `babel-jest` for `.js`, Jest loses `jest.mock` hoisting and the
existing `.js` tests fail (spies not installed, models double-register).

- [ ] **Step 2: Add `typecheck` script and switch dev to tsx**

In `package.json` scripts, add `typecheck` and update `server`:
```json
"typecheck": "tsc --noEmit",
"server": "nodemon --exec tsx --ext js,ts,json server.js",
```
(Leave `start` as `tsx server.js` from Increment 0a. `nodemon --exec tsx` keeps
dev working as files convert to `.ts`.)

- [ ] **Step 3: Confirm existing JS tests still pass with the new Jest config**

Run: `npm test`
Expected: `Tests: 18 passed, 18 total` (the `.ts` transform doesn't touch `.js`).

---

## Task 4: Create the shared types scaffold

**Files:** Create `shared/types/index.ts`

- [ ] **Step 1: Write `shared/types/index.ts`**

```ts
// Shared domain and API types, consumed by both backend and client via the
// "@shared/*" path alias. Keep this runtime-free (types only).

/** Organization/tenant identifier (Mongo ObjectId as string). */
export type TenantId = string

/** Period preset keys, mirroring common/constants/periodPresets.js values. */
export type PeriodPreset =
  | 'last-month'
  | 'last-3-months'
  | 'last-12-months'
  | 'this-year'
  | 'last-year'
  | 'custom'

/** Standard successful API envelope. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/** Standard error API envelope. */
export interface ApiError {
  success: false
  error: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
```

- [ ] **Step 2: Typecheck the shared module**

Run: `npm run typecheck`
Expected: exits 0.

---

## Task 5: Prove the loop with a TypeScript test

**Files:** Create `__tests__/unit/constants/periodPresets.test.ts`

This test proves four things at once: ts-jest runs `.ts` tests, `.ts` can import
an existing `.js` module (coexistence), the `@shared/*` alias resolves, and it
adds real coverage to a currently-untested constants file.

- [ ] **Step 1: Write the test**

```ts
import { PERIOD_PRESETS, PERIOD_TYPES } from '../../../common/constants/periodPresets'
import type { PeriodPreset } from '@shared/types'

describe('periodPresets constants', () => {
  it('exposes the expected preset values', () => {
    expect(PERIOD_PRESETS.LAST_MONTH).toBe('last-month')
    expect(PERIOD_PRESETS.LAST_THREE_MONTHS).toBe('last-3-months')
    expect(PERIOD_PRESETS.CUSTOM).toBe('custom')
  })

  it('every preset value is a valid PeriodPreset (shared type)', () => {
    // Compile-time: assignability to the shared union proves the alias + type.
    const values: PeriodPreset[] = Object.values(PERIOD_PRESETS) as PeriodPreset[]
    expect(values).toContain('this-year')
    expect(values).toContain('last-year')
  })

  it('exposes period types', () => {
    expect(PERIOD_TYPES.MONTHLY).toBe('monthly')
    expect(PERIOD_TYPES.QUARTERLY).toBe('quarterly')
  })
})
```

- [ ] **Step 2: Run the new test specifically and watch it pass**

Run: `npx jest __tests__/unit/constants/periodPresets.test.ts`
Expected: PASS, 3 tests. (Proves the `.ts` transform, the `.js` import, and the
`@shared` alias all work.)

- [ ] **Step 3: Full typecheck + full test suite green**

Run: `npm run typecheck && npm test`
Expected: `tsc` exits 0; Jest reports `Tests: 21 passed, 21 total` (the original
18 plus the 3 new).

- [ ] **Step 4: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json jest.config.js shared/types/index.ts __tests__/unit/constants/periodPresets.test.ts
git commit -m "build: add TypeScript toolchain (tsconfig, ts-jest, shared types)

allowJs coexistence so .ts and .js run side by side; tsc --noEmit type
gate; ts-jest transform for .ts tests only (JS tests untouched); shared/
types package with @shared/* alias resolved in tsconfig and Jest. Proven
by a new .ts test that imports a .js constant and a shared type. No
production source converted."
```
Note: `package-lock.json` is gitignored in this repo, so `git add` will skip it
(that is expected — do not force-add it).

---

## Task 6: Minimal CI (typecheck + test)

**Files:** Create `.github/workflows/ci.yml`

CI runs only `typecheck` + `test` for now; `lint` and `format:check` are added
in Increment 0c once ESLint/Prettier exist.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm test
```
Note: `npm install` (not `npm ci`) because `package-lock.json` is gitignored and
`npm ci` requires a committed lockfile. Tests need no service containers
(`mongodb-memory-server` is in-memory).

- [ ] **Step 2: Validate the workflow is well-formed YAML**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!/jobs:/.test(s)||!/runs-on:/.test(s))throw new Error('workflow missing keys');console.log('workflow OK')"`
Expected: `workflow OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add minimal GitHub Actions workflow (typecheck + test)

Runs npm run typecheck and npm test on push/PR. lint and format:check
join in Increment 0c. Self-contained: mongodb-memory-server means no
service containers."
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Implements the Increment 0b foundation — tsconfig with
  allowJs/noEmit (Task 2), shared/ + @shared alias (Task 4, mapped in tsconfig
  and Jest in Task 3), ts-jest transform (Task 3), scripts (Task 3), a proving
  `.ts` test (Task 5), minimal CI (Task 6). Prettier + reformat + typescript-eslint
  are explicitly deferred to 0c per the scope note. Matches design.md.
- **Placeholder scan:** No TBD/TODO; every step has exact file content/commands
  and expected output.
- **Consistency:** The `@shared/*` alias is defined identically in tsconfig
  `paths` (Task 2) and Jest `moduleNameMapper` (Task 3); the test (Task 5)
  imports `@shared/types`, which resolves to `shared/types/index.ts` (Task 4).
  Expected test count goes 18 -> 21 (3 added), used consistently in Task 5.3.
  The proof test's relative import (`../../../common/constants/periodPresets`)
  matches the file's actual location and named exports (verified).

## Notes for the implementer

- If `npm run typecheck` surfaces unexpected errors from `.js` files, confirm
  `checkJs` is `false` and that `scripts/` is excluded.
- Stop and report if the `.ts` test cannot import the `.js` constant — that
  would indicate an `esModuleInterop`/module-resolution misconfig to fix before
  proceeding, not to work around.
- Real source conversion (starting with `common/constants/`, including the CRA
  client-boundary handling) is Increment 1 — not part of this plan.
