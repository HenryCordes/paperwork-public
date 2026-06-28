# Increment 0c — Prettier + repo reformat + typescript-eslint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the `ww-menopause` Prettier house style with a single gated repo-wide reformat, add a `typescript-eslint` flat config that enforces the house style on TypeScript files, and expand CI to run lint + format:check.

**Architecture:** Prettier owns formatting (single quotes, no semicolons, printWidth 80) applied once across the codebase in an isolated, blame-ignored `style:` commit, gated by the test suite and typecheck. ESLint (flat config, typescript-eslint) enforces code-quality rules on `.ts`/`.tsx` only; legacy `.js` is formatted by Prettier but not linted until it converts to TypeScript — this keeps the lint gate green now and ratchets strictness up as files migrate.

**Tech Stack:** Prettier 3, ESLint 9 (flat config), typescript-eslint 8, eslint-config-prettier, eslint-plugin-import.

**Spec:** [design.md](design.md) (foundation: Prettier + typescript-eslint, deferred here from Increment 0b).

**Branch:** `chore/typescript-migration` (already checked out)

---

## Context for the implementer

- Prettier config mirrors `ww-menopause/.prettierrc.json` (minus its Tailwind
  plugin): `singleQuote: true`, `semi: false`, `printWidth: 80`,
  `trailingComma: "all"`, `tabWidth: 2`, `useTabs: false`.
- The reformat is a **large** diff (single quotes + no semicolons across ~225
  files). It is safe: Prettier reprints from the AST and its `semi: false` is
  ASI-aware (inserts protective leading `;`). The gates (tests + typecheck)
  prove no behavior change. It must be its **own commit**, nothing else in it.
- Markdown is intentionally **excluded** from Prettier (keeps the style commit
  code-focused; avoids churning the hand-written specs/docs).
- ESLint targets `.ts`/`.tsx` only in this increment. Do **not** mass-edit
  legacy `.js` to satisfy lint — those files convert later.
- Current baseline: `npm test` = 21 passed; `npm run typecheck` clean.

---

## Task 1: Add Prettier + config + scripts

**Files:** Create `.prettierrc.json`, `.prettierignore`; modify `package.json`

- [ ] **Step 1: Install Prettier**

Run: `npm install --save-dev prettier@^3`
Expected: `prettier` under `devDependencies`.

- [ ] **Step 2: Write `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": false,
  "printWidth": 80,
  "trailingComma": "all",
  "tabWidth": 2,
  "useTabs": false
}
```

- [ ] **Step 3: Write `.prettierignore`**

```
node_modules/
client/node_modules/
coverage/
client/build/
dist/
package-lock.json
client/package-lock.json
repomix-output.xml
docs/Belastingdienst/
client/public/pdf.worker.js
*.min.js
**/*.md
```

- [ ] **Step 4: Add format scripts to `package.json`**

Add to scripts:
```json
"format": "prettier --write .",
"format:check": "prettier --check .",
```

- [ ] **Step 5: Commit the tooling (no reformat yet)**

```bash
git add package.json .prettierrc.json .prettierignore
git commit -m "build: add Prettier with ww-menopause house style

singleQuote, semi:false, printWidth 80, trailing-comma all. Markdown and
lockfiles ignored. No reformat in this commit."
```
(`package-lock.json` is gitignored — `git add` skips it; do not force-add.)

---

## Task 2: The gated repo-wide reformat

**Files:** every non-ignored source/JSON file (Prettier output only)

- [ ] **Step 1: Baseline — confirm green before touching anything**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; `Tests: 21 passed, 21 total`. If not green, STOP.

- [ ] **Step 2: Run Prettier across the repo**

Run: `npm run format`
Expected: completes; many files reported as reformatted.

- [ ] **Step 3: Gate A — tests still green after reformat**

Run: `npm test`
Expected: `Tests: 21 passed, 21 total` (identical behavior; formatting only).

- [ ] **Step 4: Gate B — typecheck still clean**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Gate C — app still boots under tsx in production mode**

Ensure Mongo + Redis are running, then:
```bash
NODE_ENV=production PORT=5001 npx tsx server.js & APP_PID=$!; \
( for i in $(seq 1 25); do nc -z localhost 5001 2>/dev/null && break; done ); \
curl -s --retry 5 --retry-connrefused -o /dev/null http://localhost:5001/; \
echo "GET / -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/)"; \
kill $APP_PID 2>/dev/null
```
Expected: `GET / -> 200`. (Proves the reformat — including semicolon removal —
didn't break the runtime.) If anything other than 200, STOP and inspect.

- [ ] **Step 6: Commit the reformat ALONE**

```bash
git add -A
git commit -m "style: apply Prettier across the codebase

One-time reformat to the ww-menopause house style (single quotes, no
semicolons, printWidth 80). Mechanical Prettier output only; verified by
the test suite, typecheck, and a production-mode tsx boot. Recorded in
.git-blame-ignore-revs."
```

- [ ] **Step 7: Record the reformat in `.git-blame-ignore-revs`**

```bash
REFORMAT_SHA=$(git rev-parse HEAD)
printf '# Repo-wide Prettier reformat (Increment 0c)\n%s\n' "$REFORMAT_SHA" > .git-blame-ignore-revs
git add .git-blame-ignore-revs
git commit -m "chore: ignore the Prettier reformat commit in git blame

Adds the style: reformat SHA to .git-blame-ignore-revs so blame skips it.
Run 'git config blame.ignoreRevsFile .git-blame-ignore-revs' locally;
GitHub honors the file automatically."
```

- [ ] **Step 8: Confirm the working tree is clean**

Run: `git status --porcelain`
Expected: empty (everything committed).

---

## Task 3: typescript-eslint flat config

**Files:** Create `eslint.config.mjs`; modify `package.json`

- [ ] **Step 1: Install ESLint + plugins**

Run: `npm install --save-dev eslint@^9 @eslint/js typescript-eslint eslint-config-prettier eslint-plugin-import globals`
Expected: all under `devDependencies`.

- [ ] **Step 2: Write `eslint.config.mjs`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'client/',
      'coverage/',
      'dist/',
      'scripts/',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    plugins: { import: importPlugin },
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
          argsIgnorePattern: '^_',
        },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
)
```
Design notes (intentional deviations from ww-menopause, which is Next/TS):
- No `next/*` extends (paperwork is Express, not Next).
- Formatting rules (`quotes`, `semi`, `comma-dangle`) are NOT re-asserted in
  ESLint — `eslint-config-prettier` turns them off and Prettier owns them
  (enforced separately via `format:check`). This avoids double-reporting.
- `.js`/`.mjs` are ignored: legacy JS is formatted but not linted until it
  converts to `.ts`.

- [ ] **Step 3: Add lint scripts to `package.json`**

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
```

- [ ] **Step 4: Run lint and reach 0 errors**

Run: `npm run lint`
Expected: exits 0. Currently only `.ts` files are `shared/types/index.ts` and
`__tests__/unit/constants/periodPresets.test.ts`, both of which should be clean.
If `import/order` or `no-unused-vars` flags the test, fix that single file
(e.g. reorder imports) — it is new code we own. Do NOT touch legacy `.js`.

- [ ] **Step 5: Confirm everything still green**

Run: `npm run typecheck && npm run format:check && npm test`
Expected: typecheck 0; `format:check` reports all matched files already
formatted; `Tests: 21 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json eslint.config.mjs
git commit -m "build: add typescript-eslint flat config

Lints .ts/.tsx with typescript-eslint recommended plus no-unused-vars,
no-var, prefer-const, eqeqeq, and import/order. Prettier owns formatting
(eslint-config-prettier). Legacy .js is not linted until it converts."
```

---

## Task 4: Expand CI to lint + format:check

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1: Add lint + format:check steps**

Insert these two steps before the `Test` step in `.github/workflows/ci.yml`:
```yaml
      - name: Lint
        run: npm run lint
      - name: Format check
        run: npm run format:check
```
The full `steps:` list becomes: checkout, setup-node, install, Typecheck, Lint,
Format check, Test.

- [ ] **Step 2: Run the full local gate (what CI will run)**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint and format:check alongside typecheck and test"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Implements the deferred foundation pieces — Prettier +
  ww-menopause house style (Task 1), the one-time gated blame-ignored reformat
  (Task 2), typescript-eslint flat config (Task 3), CI expansion (Task 4).
  Matches design.md (Prettier + typescript-eslint sections, "Increment 0b"
  foundation list, minus what 0b already shipped).
- **Placeholder scan:** No TBD/TODO; every step has exact file content/commands
  and expected output.
- **Consistency:** Prettier options match design.md exactly (single quotes,
  semi:false, printWidth 80, trailing-comma all). The reformat gate reuses the
  same production-mode tsx boot proven in Increment 0a. ESLint scope (.ts only,
  ignore .js) is stated identically in the config and the context notes. Test
  count stays 21 throughout (no behavior change).

## Notes for the implementer

- If `npm run lint` errors because typescript-eslint can't find a tsconfig for
  type-aware rules: the config uses the **non-type-checked** `recommended`
  preset (no `parserOptions.project`), so this should not occur. If it does,
  confirm `tseslint.configs.recommended` (not `recommendedTypeChecked`) is used.
- If the reformat's Gate C boot fails, do not "fix" by editing reformatted
  files — revert the reformat commit and report; a boot failure would mean a
  Prettier/ASI edge case worth investigating, not patching over.
- Keep the reformat in its own commit; never combine it with config or eslint
  changes (that's what makes blame-ignore work).
