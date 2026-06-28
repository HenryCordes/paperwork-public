# Increment 2 — Convert `models/` to TypeScript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 13 Mongoose models from CommonJS `.js` to TypeScript `.ts`, typed with document interfaces and `mongoose.model<I>()`, keeping the `module.exports = model` shape (`export =`) so the many `.js` consumers are unchanged, and the app green throughout.

**Architecture:** Each model becomes a `.ts` file with a (file-local) document interface, a `new mongoose.Schema<I>(...)`, the existing plugins (`tenantMiddleware()`, pagination, AutoIncrement) reattached, and `export = mongoose.model<I>(...)`. Untyped npm plugins get a declaration shim. The tenant/pagination middleware stays `.js` for now (imported as `any` under `allowJs`).

**Tech Stack:** Mongoose 8 + TypeScript 5 (strict), tsx, ts-jest, typescript-eslint.

**Spec:** [design.md](design.md) (Increment, conversion order step 3: models).

**Branch:** `chore/typescript-migration`.

---

## The Mongoose + TypeScript pattern (apply to every model)

Conversion rules:
1. `git mv Foo.js Foo.ts`.
2. `const mongoose = require('mongoose')` -> `import mongoose, { Schema } from 'mongoose'`.
3. Other `require()`s -> `import` (esModuleInterop). Remove **dead** imports
   (ESLint `no-unused-vars` will flag them — e.g. `Organization` imports
   `bcrypt`/`jwt` but never uses them).
4. Define a **file-local** document interface `interface IFoo { ... }` matching
   the schema fields (optional where not required). Do NOT `export` it — see
   note below.
5. `mongoose.Schema({...})` -> `new mongoose.Schema<IFoo>({...})` (TS needs `new`;
   mongoose treats both the same at runtime).
6. Reattach plugins exactly as before (`schema.plugin(tenantMiddleware())`, etc.).
7. End with `export = mongoose.model<IFoo>('Foo', schema, 'collection')`.

**Why `export =` (not `export default`):** consumers do
`const Foo = require('../models/Foo')` and use it directly. `export =` compiles to
`module.exports = model`, so `require()` keeps returning the model itself. With
`export default`, CJS `require()` would return `{ default: model }` and break
every call-site. `export =` forbids other ES exports in the file, which is why
the document interface stays file-local for now. (When `.ts` consumers later need
the document type, we lift shared document types into `shared/` — out of scope
here.)

**Untyped plugins:** `mongoose-sequence` ships no types. Add a declaration shim
(Task 1) so `import` of it doesn't trip `noImplicitAny` (TS 7016).

**Test policy:** model files that are pure schema definitions are not given new
unit tests — the tenant plugin behavior is already covered by
`__tests__/integration/tenant-isolation.test.js`. Models with **custom
methods/statics or non-trivial logic** (e.g. `User` auth helpers) get a focused
test. Decide per file; note skips in the commit.

Gate after each task:
```
npm run typecheck && npm run lint && npm run format:check && npm test
```
plus a production-mode tsx boot (Mongo+Redis up) returning `GET / -> 200`
(boot wires every model through the controllers/services).

---

## Task 1: Declaration shim + pattern-setters (Organization, Note)

**Files:** Create `types/shims.d.ts`; modify `tsconfig.json`; convert
`models/Organization.{js->ts}`, `models/Note.{js->ts}`

- [ ] **Step 1: Add untyped-module shim**

Create `types/shims.d.ts`:
```ts
declare module 'mongoose-sequence'
```

- [ ] **Step 2: Include `types/` in tsconfig**

In `tsconfig.json` `include`, add `"types/**/*"`:
```json
"include": ["server.js", "worker.js", "common/**/*", "shared/**/*", "types/**/*", "__tests__/**/*.ts"],
```

- [ ] **Step 3: Convert `Organization.js` -> `.ts`** (drops dead bcrypt/jwt imports)

`git mv models/Organization.js models/Organization.ts`, body:
```ts
import mongoose, { Schema } from 'mongoose'

interface IOrganization {
  name?: string
  createdAt: Date
}

const organizationSchema = new Schema<IOrganization>({
  name: {
    type: String,
    require: [false, 'Please add a companyName'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

export = mongoose.model<IOrganization>('Organization', organizationSchema)
```

- [ ] **Step 4: Convert `Note.js` -> `.ts`** (tenant + pagination + AutoIncrement plugins)

`git mv models/Note.js models/Note.ts`, body:
```ts
import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

// Custom tenant + pagination middleware (still JS; typed as any under allowJs)
import { tenantMiddleware } from '../middleware/mongoose/tenant-middleware'
import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface INote {
  owner: mongoose.Types.ObjectId
  noteNumber: number
  noteDate: Date
  description: string
  contactId?: string
  contactName?: string
  createdAt: Date
}

const noteSchema = new Schema<INote>({
  owner: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  noteNumber: {
    type: Number,
    require: true,
  },
  noteDate: {
    type: Date,
    require: true,
    default: Date.now,
  },
  description: {
    type: String,
    require: true,
    maxLength: 2255,
    label: 'Omschrijving',
  },
  contactId: {
    type: String,
    require: false,
    max: 255,
    index: true,
  },
  contactName: {
    type: String,
    require: false,
    maxLength: 255,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

noteSchema.plugin(paginationMiddleware)
noteSchema.plugin(tenantMiddleware())
noteSchema.plugin(AutoIncrement, {
  id: 'note_seq',
  inc_field: 'noteNumber',
  reference_fields: ['tenantId'],
  start_seq: 1501,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

export = mongoose.model<INote>('Note', noteSchema, 'notes')
```
Note: the `label` schema option on `description` is custom/non-standard; if TS
rejects it on the typed schema, keep it (it's used elsewhere) by leaving the
schema definition untyped at that property or casting — do not delete it.

- [ ] **Step 5: Gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all green; tests stay at 30. Then prod boot -> `GET / -> 200`.

- [ ] **Step 6: Commit**

```bash
git add types/shims.d.ts tsconfig.json models/Organization.ts models/Note.ts
git commit -m "refactor(ts): convert Organization + Note models to TypeScript

Establish the Mongoose+TS pattern: file-local document interface,
new Schema<I>, plugins reattached, export = mongoose.model<I> so CJS
require() consumers are unchanged. Add mongoose-sequence declaration
shim. Drops dead bcrypt/jwt imports from Organization."
```

---

## Task 2: Schema-only models batch

**Files:** convert `FCMToken`, `Notification`, `Email`, `Settings`,
`Subscription`, `VATReturnNotificationPreferences` (`.js -> .ts`)

- [ ] **Step 1: Convert each, applying the pattern**

For each model, follow the pattern (Step 2-7 of the pattern section): import
mongoose, define a file-local `I<Name>` interface from the schema fields,
`new Schema<I>(...)`, reattach any plugins, `export = mongoose.model<I>(...)`
with the same model name and collection string. Remove any dead imports.

- [ ] **Step 2: Gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green; tests still 30 (no new tests — schema-only, covered by the
tenant-isolation integration test). Then prod boot -> `GET / -> 200`.

- [ ] **Step 3: Commit**

```bash
git add models/FCMToken.ts models/Notification.ts models/Email.ts models/Settings.ts models/Subscription.ts models/VATReturnNotificationPreferences.ts
git commit -m "refactor(ts): convert schema-only models to TypeScript

FCMToken, Notification, Email, Settings, Subscription,
VATReturnNotificationPreferences -> .ts with typed schemas and
export = model. No new tests (schema-only; tenant behavior covered by
the isolation integration test)."
```

---

## Task 3: Models with logic/methods (User, Invoice, Expense, Contact, DashboardStats)

**Files:** convert `User`, `Invoice`, `Expense`, `Contact`, `DashboardStats`
(`.js -> .ts`); add tests for any custom methods/statics

- [ ] **Step 1: Convert each, applying the pattern**

Same pattern. For models with instance methods / statics (e.g. `User` password
or JWT helpers), type them on the interface (methods) and on the model
(statics), preserving behavior. Inspect each file before converting; keep all
hooks, virtuals, methods, and plugin order identical.

- [ ] **Step 2: Add tests for real logic**

For each custom method/static with real behavior (per the decide-per-file
policy), add a focused `.ts` test. Concretely: if `User` has password-hash /
compare or signed-JWT helpers, test that a correct password compares true and a
wrong one false, and that a generated token is a non-empty string. (Write the
exact assertions against the actual method names found in `User.js`.)

- [ ] **Step 3: Gate**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: green; test count rises by the number of new method tests. Then prod
boot -> `GET / -> 200`.

- [ ] **Step 4: Commit**

```bash
git add models/User.ts models/Invoice.ts models/Expense.ts models/Contact.ts models/DashboardStats.ts __tests__
git commit -m "refactor(ts): convert remaining models to TypeScript with tests

User, Invoice, Expense, Contact, DashboardStats -> .ts with typed
schemas, methods, and statics. Added tests for the custom model methods."
```

---

## Task 4: Confirm models/ fully converted

**Files:** none (verification)

- [ ] **Step 1: No `.js` models remain**

Run: `find models -name '*.js' | wc -l`
Expected: `0`.

- [ ] **Step 2: Full gate + boot**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
and the prod boot. Expected: all green; `GET / -> 200`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Converts `models/` (conversion-order step 3) in reviewable
  batches, each green; applies the decide-per-file test policy (schema-only
  skipped, method-bearing models tested). Matches design.md.
- **Placeholder scan:** Pattern-setters (Organization, Note) shown in full;
  batches 2-3 are rule-driven against the established pattern with per-file
  guidance (the conversion is mechanical once the pattern + shim exist). Test
  guidance for Task 3 is conditional on the actual method names, to be read
  before writing — flagged explicitly rather than inventing assertions.
- **Consistency:** Every model uses `export =` + file-local interface +
  `new Schema<I>`; model names/collection strings preserved so the existing
  `.js` consumers are unchanged; the `mongoose-sequence` shim + `types/` include
  added once in Task 1 and relied on thereafter.

## Notes for the implementer

- Read each model file before converting; preserve hooks/virtuals/methods/plugin
  order exactly. Behavior must not change.
- If Mongoose's generic `Schema<I>` rejects a custom/non-standard schema option
  (e.g. `label`), prefer leaving that schema's generic off (`new Schema(...)`)
  over deleting the option or using `any` broadly.
- If another untyped npm module surfaces a TS 7016 error, add it to
  `types/shims.d.ts` (one `declare module '...'` line) — don't disable
  `noImplicitAny`.
- Run the prod boot with Mongo+Redis up; booting registers every model, so it is
  a strong end-to-end check that conversions didn't break schema/plugin wiring.
