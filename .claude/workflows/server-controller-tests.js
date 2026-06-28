export const meta = {
  name: 'server-controller-tests',
  description:
    'Write integration tests for untested server controllers, each adversarially reviewed (test-only, non-vacuous, green)',
  phases: [
    {
      title: 'Implement',
      detail: 'one agent per controller writes + runs its integration test',
    },
    {
      title: 'Verify',
      detail:
        'adversarial review: test-only diff, meaningful assertions, green',
    },
  ],
}

// args.modules: [{ name, source, route, testPath, notes }]
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const modules = parsedArgs.modules || []
if (!Array.isArray(modules) || modules.length === 0) {
  throw new Error(
    'server-controller-tests: args.modules must be a non-empty array',
  )
}

const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testPath: { type: 'string' },
    status: { type: 'string', enum: ['DONE', 'BLOCKED'] },
    testCount: { type: 'number' },
    allPassing: { type: 'boolean' },
    productionFilesTouched: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: [
    'testPath',
    'status',
    'testCount',
    'allPassing',
    'productionFilesTouched',
    'summary',
  ],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    approved: { type: 'boolean' },
    isTestOnly: { type: 'boolean' },
    allGreen: { type: 'boolean' },
    vacuous: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: [
    'approved',
    'isTestOnly',
    'allGreen',
    'vacuous',
    'issues',
    'notes',
  ],
}

const implPrompt = (
  m,
) => `You are writing a Supertest integration test for the \`${m.name}\` server controller in /Users/henry/Projects/devartist/paperwork. Goal: meaningful behavior coverage so the controller can be refactored with confidence. This is one of several parallel agents — touch ONLY your test file.

## Read first (do not skip)
- \`__tests__/integration/contacts.test.ts\` — the TEMPLATE. Copy its structure exactly: \`import app from '../../app'\`, \`import request from 'supertest'\`, \`createAuthedTenant\`/\`authHeader\` from \`../setup/authHarness\`, \`* as dbHandler from '../setup/helper-db'\`. Use beforeAll \`dbHandler.connect()\`, afterEach \`dbHandler.clearDatabase()\`, afterAll \`dbHandler.closeDatabase()\`, beforeEach create two tenants \`a\` and \`b\` via \`createAuthedTenant()\`.
- \`${m.source}\` — the controller under test. Read every handler.
- \`${m.route}\` — the routes (exact paths, HTTP verbs, express-validator rules, middleware).
- The relevant Mongoose model(s) the controller uses (for seeding + DB-state assertions).

## External boundaries are already globally mocked (do NOT re-mock, do NOT mock our own code)
\`__tests__/setup/externalMocks.ts\` mocks: bull, firebase-admin, @mollie/api-client, @aws-sdk/client-s3, multer-s3, node-mailjet, string-strip-html. Everything inside our code stays real (real Express, routing, validators, Mongoose via mongodb-memory-server, tenant-isolation plugin).

## What to cover (MEANINGFUL assertions — not bare status 200)
For each endpoint the controller exposes:
- Happy path: assert HTTP status AND response body shape AND resulting DB state where it mutates.
- Validation: a request that violates the route's validators returns 400 with \`success:false\`.
- Tenant isolation (REQUIRED wherever the resource is tenant-scoped): tenant \`a\` cannot read or mutate tenant \`b\`'s data (expect 404/403; verify b's data still present in DB after a's delete attempt).
- Notable branches called out here: ${m.notes}
Seed data directly via the model with an explicit \`tenantId\` (the authHarness shows the pattern). Use \`authHeader(a.token)\` to authenticate.

## Hard rules
- DO NOT modify ANY production file. If a test reveals a likely bug, assert the CURRENT behavior and add an inline \`// FIXME(<topic>): ...\` note, OR if the correct behavior is unambiguous assert that (the test will go red) and report it in your summary — but NEVER edit the controller/route/model to make a test pass.
- No \`as any\`. Use \`unknown\` + narrowing or real types.
- DO NOT run git. DO NOT commit. Only create \`${m.testPath}\`.

## Run + iterate
Run ONLY your file: \`cd /Users/henry/Projects/devartist/paperwork && npx jest ${m.testPath} --coverage=false\`. Iterate write->run until green. If a genuine product bug blocks a correct-behavior assertion, leave that test characterizing current behavior with a FIXME and keep the suite green; note it.

Return: testPath, status (DONE|BLOCKED), testCount, allPassing, productionFilesTouched (MUST be empty — list anything you changed), summary (what you covered + any FIXME/bug found).`

const reviewPrompt = (
  m,
) => `Adversarially review the integration test at \`${m.testPath}\` in /Users/henry/Projects/devartist/paperwork (controller: \`${m.source}\`). Verify by reading + running; do not trust the implementer.

Check:
1. isTestOnly: run \`cd /Users/henry/Projects/devartist/paperwork && git diff -- controllers routes models middleware services app.ts\` and confirm it is EMPTY (no production change). Then confirm \`${m.testPath}\` exists and is a test file. IGNORE other untracked test files and the .claude/ dir in the working tree — sibling agents in this run create their own test files concurrently; that is expected and NOT a failure. isTestOnly is true iff NO production source changed.
2. allGreen: run \`npx jest ${m.testPath} --coverage=false\` — all tests pass.
3. vacuous: read the test. It is VACUOUS if it mostly asserts bare status 200 without asserting body content, DB state, or tenant isolation; or if mocks/assertions are tautological. Tenant-scoped endpoints MUST have an isolation test (a cannot touch b). If shallow, vacuous=true and list what's missing.
4. No \`as any\`.
Return: approved (true only if isTestOnly AND allGreen AND not vacuous AND no \`as any\`), isTestOnly, allGreen, vacuous, issues[], notes.`

const results = await pipeline(
  modules,
  (m) =>
    agent(implPrompt(m), {
      label: `impl:${m.name}`,
      phase: 'Implement',
      schema: IMPL_SCHEMA,
    }),
  (impl, m) =>
    agent(reviewPrompt(m), {
      label: `review:${m.name}`,
      phase: 'Verify',
      schema: VERDICT_SCHEMA,
      agentType: 'code-reviewer',
    }).then((verdict) => ({
      module: m.name,
      testPath: m.testPath,
      impl,
      verdict,
    })),
)

const approved = results.filter((r) => r && r.verdict && r.verdict.approved)
const flagged = results.filter((r) => r && (!r.verdict || !r.verdict.approved))

log(`approved ${approved.length}/${results.length} controller test files`)
if (flagged.length) {
  log(`flagged: ${flagged.map((r) => r && r.module).join(', ')}`)
}

return { results, approvedCount: approved.length, total: results.length }
