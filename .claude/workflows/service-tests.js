export const meta = {
  name: 'service-tests',
  description:
    'Write unit/integration tests for server service modules (direct function calls + seeded in-memory DB), each adversarially reviewed',
  phases: [
    {
      title: 'Implement',
      detail: 'one agent per service writes + runs its test',
    },
    {
      title: 'Verify',
      detail:
        'adversarial review: test-only diff, meaningful assertions, green',
    },
  ],
}

// args.modules: [{ name, source, testPath, mode: 'create'|'extend', notes }]
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const modules = parsedArgs.modules || []
if (!Array.isArray(modules) || modules.length === 0) {
  throw new Error('service-tests: args.modules must be a non-empty array')
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
) => `You are writing tests for the server service module \`${m.name}\` in /Users/henry/Projects/devartist/paperwork. Goal: meaningful behavior coverage so the service can be refactored with confidence. This is one of several parallel agents -- touch ONLY your test file.

## Read first
- \`${m.source}\` -- the service under test. Read the exported function(s) end to end.
- The Mongoose model(s) it queries (for seeding + DB-state assertions).
- \`__tests__/integration/contacts.test.ts\` -- for the DB lifecycle + tenant-seeding pattern: beforeAll \`dbHandler.connect()\` from \`../setup/helper-db\`, afterEach \`clearDatabase()\`, afterAll \`closeDatabase()\`; seed docs via the model with an explicit \`tenantId\`.
- \`__tests__/unit/services/dashboardAggregation.test.ts\` -- for pure-function test style.

## Test style (NO supertest -- call the exported function directly)
- DB-coupled functions: connect the in-memory DB (dbHandler lifecycle), seed tenant-scoped data, call the EXPORTED function with real args, assert the RETURN VALUE and/or resulting DB state and/or that the right external mock was invoked.
- Bull job processors: construct a mock Job, e.g. \`const job = { id: 'j1', data: { tenantId, userId, requestId: 'r1', data: {}, options: {} }, progress: jest.fn() }\` (match the fields the processor reads), call the processor, and assert it completes and produces its effect (return value, an S3 PutObjectCommand call via the global @aws-sdk/client-s3 mock, an email send, and/or job.progress calls).
- External boundaries are GLOBALLY mocked in \`__tests__/setup/externalMocks.ts\` (bull, firebase-admin, @mollie/api-client, @aws-sdk/client-s3, multer-s3, node-mailjet, string-strip-html). Do NOT re-mock them unless you must control a return value; never mock our own code.

## File mode: ${m.mode === 'extend' ? 'EXTEND an EXISTING test file' : 'CREATE a new test file'}
${
  m.mode === 'extend'
    ? `\`${m.testPath}\` ALREADY EXISTS with passing tests. APPEND your new \`describe\` block(s); do NOT remove, rename, or weaken any existing test. Keep the existing imports and add what you need.`
    : `Create \`${m.testPath}\`.`
}

## What to cover
${m.notes}
Assertions must be MEANINGFUL (assert returned values / aggregated totals / DB state / external-mock calls), never just "does not throw" or a bare truthy check.

## Hard rules
- DO NOT modify ANY production file. If a test reveals a likely bug, characterize CURRENT behavior with an inline \`// FIXME(<topic>)\` note (or assert the correct behavior and report it) -- NEVER edit the service to make a test pass.
- No \`as any\`. Use \`unknown\` + narrowing or real types (a small \`as <RealType>\` for a mock is fine).
- DO NOT run git. DO NOT commit. Only touch \`${m.testPath}\`.

## Run + iterate
Run ONLY your file: \`cd /Users/henry/Projects/devartist/paperwork && NODE_ENV=test npx jest ${m.testPath} --coverage=false\`. Iterate until green (existing + new tests all pass).

Return: testPath, status (DONE|BLOCKED), testCount (total in the file), allPassing, productionFilesTouched (MUST be empty), summary (what you covered + any FIXME/bug found + any function you could not test and why).`

const reviewPrompt = (
  m,
) => `Adversarially review the service test at \`${m.testPath}\` in /Users/henry/Projects/devartist/paperwork (service: \`${m.source}\`, mode: ${m.mode}). Verify by reading + running; do not trust the implementer.

Check:
1. isTestOnly: run \`cd /Users/henry/Projects/devartist/paperwork && git diff -- controllers routes models middleware services app.ts config\` and confirm it is EMPTY (no production change). Sibling untracked test files and .claude/ in the working tree are EXPECTED (parallel agents) -- ignore them. isTestOnly is true iff NO production source changed.
2. allGreen: run \`NODE_ENV=test npx jest ${m.testPath} --coverage=false\` -- all tests pass.${m.mode === 'extend' ? ' Confirm the PRE-EXISTING tests in this file were NOT removed or weakened (the file should have its original tests PLUS new ones).' : ''}
3. vacuous: read the test. VACUOUS if it mostly asserts "does not throw" / bare truthy / status without asserting real return values, aggregated numbers, DB state, or external-mock calls. For DB-coupled services it must seed data and assert the function's output reflects that data.
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
log(`approved ${approved.length}/${results.length} service test files`)
if (flagged.length)
  log(`flagged: ${flagged.map((r) => r && r.module).join(', ')}`)

return { results, approvedCount: approved.length, total: results.length }
