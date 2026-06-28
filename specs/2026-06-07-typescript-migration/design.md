# Design: TypeScript migration (continuously green, shared types)

Date: 2026-06-07
Status: Draft for review
Branch: `chore/typescript-migration` (off `main`)
Supersedes tooling-wise: the JS-only `chore/lint-prettier-setup` branch is the
fallback if this migration is abandoned.

## Problem / goal

paperwork is a mature, fully untyped codebase: ~111 CommonJS backend files
(Express 4, Mongoose 8, Bull) and ~114 CRA client files. The highest-risk logic
(multi-tenant isolation, Mollie payment/subscription flows, VAT math) carries no
compile-time guarantees. The user's standard is strict TypeScript end-to-end,
and the sibling project `ww-menopause` is already TS.

Goal: migrate the entire project to TypeScript with a `shared/` types package
used by both backend and client — **without ever breaking the running app** —
and raise test coverage as we go.

## Decisions (from brainstorming)

- **Scope:** everything — backend + client + shared types.
- **Mechanics:** continuously green. `allowJs` coexistence; convert
  module-by-module with the test suite green at every checkpoint. The app boots
  at all times. "Abandon" = stop at a working, partially-typed state (not a
  wreck).
- **Branch:** fresh `chore/typescript-migration` off `main`. Merge if it works;
  reassess if it doesn't.
- **Tests:** add at least one test for each file we touch, pragmatically —
  trivial/tiny files (pure constants, one-line re-exports) are exempt. Don't go
  overboard; favor meaningful behavior tests over ceremony.
- **Tooling subsumes the lint/Prettier phase:** ESLint moves to
  `typescript-eslint`; Prettier uses the same `ww-menopause` house style.

## End state

- All backend and client source in `.ts` / `.tsx`, `strict: true`, 0 `tsc`
  errors, no remaining `.js` source (config files may stay `.js`/`.mjs`).
- `shared/` holds domain + API request/response types, imported by both ends.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test`
  all green in CI.

## Foundation (built first, before converting feature code)

### Build & run tooling (backend)

- **Run (dev AND prod):** `tsx` (esbuild-based, no compile step), running the
  entry point **in place** — `tsx server.js` today, `tsx server.ts` once
  renamed. Supports `.ts` and `.js` together.
- **Why tsx in prod (not compiled `dist/`):** `server.js` resolves `robots.txt`
  and the CRA `client/build` directory **relative to `__dirname`**. Compiling
  to `dist/` would move `__dirname` and break those paths (and require copying
  assets). Running tsx in place keeps `__dirname`, `client/build`, `robots.txt`,
  and the cwd-relative `dotenv` path **byte-for-byte identical to today** — the
  smallest, most provable deploy delta. (Compiled `dist/` is a possible later
  optimization once everything is TS and stable; low-risk at that point.)
- **Typecheck:** `tsc --noEmit` — pure type gate, used in CI and locally. Never
  emits; prod runs via tsx.
- **Deploy delta (entire):**
  1. `Procfile`: `web: node server.js` -> `web: tsx server.js` (works while the
     code is still 100% JS, since tsx runs `.js`).
  2. Move `tsx` (and `typescript`) into `dependencies` so Heroku's post-build
     devDependency prune keeps `tsx` available at runtime.
  3. `heroku-postbuild` unchanged (still builds the client). No `dist/`, no asset
     copy, no path edits.
  - `engines.node` is already `>=20.x` (tsx-compatible); no change.

### tsconfig (backend, root `tsconfig.json`)

- `target: ES2022`, `module: commonjs`, `moduleResolution: node`,
  `esModuleInterop: true`, `resolveJsonModule: true`.
- `allowJs: true`, `checkJs: false` — `.js` files compile and run but are not
  type-checked, enabling coexistence. Converted `.ts` files get full strict
  checking.
- `strict: true`, `skipLibCheck: true`, `noEmit: true` (prod runs via tsx; tsc
  is only a type gate, never emits).
- Path alias `@shared/*` -> `shared/*`.

### tsconfig (client)

- CRA supports TS natively; add `client/tsconfig.json` (CRA generates one on
  first `.tsx`). `craco` config relaxed (ModuleScopePlugin) to allow importing
  `shared/` from outside `client/src`, with a matching path alias.

### shared/ types package

- `shared/` directory of type-only `.ts` modules (domain entities, API
  request/response shapes, queue job payloads). No runtime code.
- Consumed via `@shared/*` alias on both ends.
- Caveat to handle: CRA blocks imports outside `src/` by default; the craco
  ModuleScopePlugin tweak + alias resolves it.

### ESLint (typescript-eslint, replaces the JS-only config)

- Flat config with `typescript-eslint` recommended, `eslint-config-prettier`
  last, plus the `ww-menopause` stylistic rules:
  `quotes single`, `semi never`, `no-extra-semi`, `comma-dangle always-multiline`,
  `@typescript-eslint/no-unused-vars` (after-used, ignoreRestSiblings).
- `import/order` **is** included here (converted files use ES `import` syntax,
  so it applies and matches ww-menopause), via `eslint-plugin-import`.
- Applies to `.ts`/`.tsx`; `.js` files still in transit get the lighter
  recommended ruleset.

### Prettier

- Same `ww-menopause` house style: `singleQuote: true`, `semi: false`,
  `printWidth: 80`, `trailingComma: "all"`, `tabWidth: 2`, `useTabs: false`.
- One-time gated reformat (tests + `node --check` analog via `tsc`/build).
- `.prettierignore` excludes lockfiles, `dist/`, build outputs, generated files.

### Test transform

- Jest gains a TS transform: `ts-jest` (strict, type-aware) so tests can be
  written in `.ts`. (swc/jest is a faster alternative if ts-jest proves slow.)
- Existing `.js` tests keep working through the same config.

### Scripts (root `package.json`)

- `typecheck`: `tsc --noEmit`
- `lint` / `lint:fix`: `eslint .` (+ `--fix`)
- `format` / `format:check`: `prettier --write .` / `--check .`
- `start`: `tsx server.js` (later `server.ts`); `server`/dev: `tsx watch ...`
  (or `nodemon` invoking `tsx`).
- `build` stays client-only (`npm run build --prefix client`); there is no
  backend compile step.

### CI

- GitHub Actions: `npm ci`, then `typecheck`, `lint`, `format:check`, `test`.
- Self-contained (mongodb-memory-server; no service containers).

## Conversion order (each slice = its own plan increment, green between each)

Backend, dependency order (leaves first so types flow upward):

1. `shared/` foundation types.
2. `constants/`, `common/` (low-risk leaf utilities).
3. `models/` (Mongoose schemas -> typed models; tenant fields typed).
4. `services/` (incl. `services/queues/`, queue payload types from `shared/`).
5. `middleware/` (tenant, auth, logging).
6. `controllers/`.
7. `routes/`.
8. `server.ts` / `worker.ts` entry points.

Client:

9. `client` TS enablement (tsconfig, craco, one `.tsx` to bootstrap).
10. `client/src/hooks/api/` (consume `shared/` API types).
11. components / pages.

Order is a guide; adjust if a dependency forces it. Each slice:
convert files -> add/extend tests for touched files -> `tsc --noEmit` clean for
converted files -> `npm test` green -> `npm run build --prefix client` if client
touched -> commit.

## Test policy

- When we touch a file, check whether it has a test. If it already has one, keep
  it green (update imports/types as the file converts).
- If a touched file has **no** test, make a deliberate decision rather than
  reflexively adding one:
  - **Add** a meaningful test when the file has real behavior/logic worth
    locking down (services, controllers, middleware, calculations, queue
    processors).
  - **Skip** trivial files (pure constant maps, thin re-export/barrel files,
    type-only modules, glue with no branching) and note the skip in the commit
    message (e.g. "no test: trivial constants").
- Prefer behavior/integration tests at the seams (mirroring the existing
  `__tests__/integration/tenant-isolation.test.js`) over shallow unit tests.
- Tests written in `.ts`.

## Continuously-green discipline

- The app must boot and `npm test` must pass after every slice's commit.
- `allowJs: true` guarantees un-converted `.js` keeps running.
- If a slice can't be made green within reason, revert that slice and reassess
  (the abandon off-ramp), leaving the prior green state intact.

## Abandon criteria (the "if it fails" branch)

Stop and reassess (keeping the last green commit) if any of:
- The Heroku/prod build path can't be made to work reliably.
- The CRA + `shared/` import story proves too brittle.
- A foundational slice (models or services) explodes into unbounded type churn.

Because every commit is green and the app runs, abandoning means shipping the
partial migration or parking the branch — not a broken main.

## Decomposition

This spec defines strategy + foundation. Execution is a **program of plan
increments**, not one monolithic plan:

- **Increment 0a — Deploy proof (FIRST, before any conversion):** add `tsx` to
  `dependencies`, set `start`/`Procfile` to `tsx server.js`, codebase still 100%
  JS. Prove it locally in production mode:
  1. `NPM_CONFIG_PRODUCTION=false npm ci` then `npm run build --prefix client`.
  2. `npm prune --omit=dev` (reproduce Heroku's devDep prune) and confirm `tsx`
     survives (it's a dependency).
  3. `NODE_ENV=production tsx server.js` -> app boots, serves `client/build`,
     connects to Mongo/Redis (local), serves `robots.txt`, handles a request.
  This is the gate for the whole migration. Green here = the prod runtime is
  proven; conversions never touch deploy mechanics again. (No real Heroku deploy
  until the eventual merge, per decision.)
- **Increment 0b — Foundation:** tsconfig (noEmit), `shared/` scaffold,
  typescript-eslint, Prettier + gated reformat, ts-jest, scripts, CI. Ends with
  one trivial `.ts` file type-checking and tests green.
- **Increment 1 — First proof slice:** `constants/` + `common/` + one `models/`
  file with a test, proving the coexistence + test loop end to end.
- **Increments 2..N:** the remaining slices in the order above.

Each increment gets its own implementation plan via the writing-plans skill,
reviewed and executed before the next.

## Verification

- Increment 0a gate: local production-mode boot via `tsx server.js` after a
  devDep prune, serving the client build and handling a request.
- After every increment: `npm test` green, `tsc --noEmit` clean, app boots on
  `tsx`.
- Final: 0 `.js` source files remain (config excepted), `strict` on, CI green.

## Follow-ups / out of scope

- Removing `allowJs` and flipping `checkJs`/deleting the last `.js` shims is the
  final increment, not an early one.
- The stale `.windsurf.json` comments cleanup rides along when those files are
  converted.
- **Test backfill (tracked — do later).** The decide-per-file test policy was
  followed through Increment 3d but drifted in the services tier (3b logger, 3c
  leaf services, 3e export services/processors, 3f dashboardAggregation, 3g VAT
  trio): those conversions added no tests. Much of that tail is genuinely
  integration-level (S3/Mailjet/firebase-admin/Bull/DB) and fine to defer, but
  several pure, unit-testable helpers were skipped and should be tested (which
  requires exporting the currently-internal ones):
  - `dashboardAggregation`: `mergeAggregationResults` + `formatPeriodLabel`
    (highest value — real merge/label branching).
  - `vatReturnNotificationProcessor`: `formatPeriodLabel` (Dutch month map) +
    `formatDate`.
  - `exportService`: `formatDateForFilename`.
  - `services/logger/utils`: `redact` (sensitive-field redaction).
  Also worth: integration tests for the DB-coupled BTW aggregation
  (`aggregateInvoicesByTaxRate` reverse-tax math) and the dashboard daily/
  monthly/quarterly/yearly cascade, using mongodb-memory-server + tenant
  context (mirroring `__tests__/integration/tenant-isolation.test.js`).

- **Bugs / drift surfaced during the controllers tier (Increment 5).** Found
  while converting controllers; handled behavior-preservingly and noted here for
  follow-up decisions:
  - `controllers/export.js` **deleted** — dead code (no route/server/client
    reference; the live export path is `exportQueue` POST + `exportSummary`
    GET `/summary`). It also read a removed `exportService` receipts contract
    (`zipPath`/`zipFileName`, now `receiptData`). Verified via routes + client
    hooks before deleting.
  - `export-summary` renamed to `exportSummary` (camelCase consistency); route
    import updated.
  - `emailService.sendEmail` now returns only `{ success }`; `auth.sendResetEmail`
    still reads `request.body` (resolves to `undefined`, omitted from JSON). The
    client (`Reset.jsx`) reads only `success`/`message`, so inert. **Decide:**
    drop the `data` field or restore a real payload.
  - `emails.sendEmail`: the no-invoice branch + catch handlers referenced
    `emailText`/`filter` declared only inside the invoice branch (threw on a
    client-reachable path). **Fixed** by hoisting them (user-approved).
  - `notifications.registerToken` called `firebaseService.validateToken` but
    never imported `firebaseService` (always 500'd). **Fixed** by importing it.
  - `dashboard.getReportTemplates` reads `req.tenant` (not a real request
    property; always `undefined` -> 401). Kept via a local cast — **decide**
    whether report templates should be wired to a real tenant source.
  - `dashboard.getPresetDateRange` had a dead `case PERIOD_PRESETS.ALL_TIME`
    (constant is `undefined`, never matched). Removed; "all-time" still falls
    through to the null range. **Decide:** add a real `ALL_TIME` preset if the
    feature is wanted.
  - `payments`: `subscription.profileId = payment.profileId` written in two
    places but `profileId` is not a Subscription schema field (strict mode
    dropped it — never persisted). Dead writes removed. **Decide:** add
    `profileId` to the schema if it should be stored.

- **Client tier (Increment 8).** Converting `client/` (CRA + craco, ~113
  files). Toolchain set up (`client/tsconfig.json` strict + allowJs,
  `react-app-env.d.ts`, `shims.d.ts`); `craco build` verified green with the
  mixed JS/TS tree. Redux foundation (action-type modules, reducers, store,
  actions/thunks via a shared `AppDispatch`/`ApiError` in `redux/types.ts`),
  constants, and leaf utils converted. Decisions/findings:
  - **Client tests deferred + tracked** (user decision): client conversions
    are type-only/behavior-preserving and the client has no existing test
    infra. A dedicated client test-backfill effort is the follow-up; the
    highest-value targets are the pure reducers and `stringUtils` formatters.
  - **Fixed typo:** the action axios configs used `header:` (singular) instead
    of `headers:`, so axios silently ignored it and the Content-Type was never
    set. The typed `AxiosRequestConfig` rejected the unknown key; corrected to
    `headers`. Behavior-neutral in practice (axios already sends
    application/json for object POST bodies; GET/DELETE ignore the header).
  - `react-query` `cacheTime` (v4) → `gcTime` (v5, same 5-min value) in the
    QueryClient config; `cacheTime` was a silently-ignored no-op under v5.
  - Untyped client deps shimmed (`react-gtm-module`, `uuid`).
