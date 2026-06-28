export const meta = {
  name: 'client-component-tests',
  description:
    'Write React component tests (renderWithProviders + approach-A hook mocking) for client components/pages, each adversarially reviewed',
  phases: [
    {
      title: 'Implement',
      detail: 'one agent per component writes + runs its test',
    },
    {
      title: 'Verify',
      detail:
        'adversarial review: test-only diff, meaningful assertions, green',
    },
  ],
}

// args.modules: [{ name, source, testPath, notes }]
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const modules = parsedArgs.modules || []
if (!Array.isArray(modules) || modules.length === 0) {
  throw new Error(
    'client-component-tests: args.modules must be a non-empty array',
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
) => `You are writing a React component test for \`${m.name}\` in /Users/henry/Projects/devartist/paperwork (the client app under \`client/\`). Goal: meaningful behavior coverage so the component can be refactored with confidence. One of several parallel agents -- touch ONLY your test file.

## Stack + harness
CRA + craco, React 18, @testing-library/react 14, user-event 14 (use \`userEvent.setup()\`), react-hook-form, redux, react-query, react-router.
- Import the harness from \`../../test-utils\` (it is \`client/src/test-utils.tsx\`; test files for both \`src/components/X/\` and \`src/pages/X/\` resolve it at \`../../test-utils\`). It exports \`renderWithProviders\` (redux Provider + MemoryRouter) and \`createQueryWrapper\`, and re-exports RTL (\`screen\`, \`fireEvent\`, \`waitFor\`). \`import userEvent from '@testing-library/user-event'\` separately.
- Read \`client/src/components/authentication/Login.test.tsx\` for the redux/render pattern and \`client/src/hooks/api/useContacts.test.ts\` for the hook-mock pattern.

## Approach A (mock the data layer, render the real component)
- Read \`${m.source}\` fully. Identify its data dependencies: react-query hooks from \`../../hooks/api\` (or a submodule), redux thunk action-creators, or direct \`axios\` calls.
- jest.mock the hook module(s) the component imports and supply the return shape the component reads (e.g. a query \`{ data, isLoading, isError }\`, or a mutation \`{ mutate / mutateAsync, isPending }\`). For redux thunks, mock the action-creator module (creators must return a thunk function, NOT undefined). For direct axios, \`jest.mock('axios')\`.
- Mock heavy/irrelevant children if they pull in their own data (e.g. \`SideBar\` calls a subscription hook) -- stub them with a simple \`data-testid\` div.
- Render via \`renderWithProviders(<Component />)\`. If the component reads route params, use the router (MemoryRouter is built into renderWithProviders; set the path via \`window.history.pushState\` or the harness's router options).

## File mode: ${m.mode === 'extend' ? 'EXTEND an EXISTING test file' : 'CREATE a new test file'}
${
  m.mode === 'extend'
    ? `\`${m.testPath}\` ALREADY EXISTS with passing tests. APPEND new \`describe\`/\`it\` blocks for the CURRENTLY-UNCOVERED behavior; do NOT remove, rename, or weaken any existing test. First read the existing test to see what's already covered, then add only what's missing.`
    : `Create \`${m.testPath}\`.`
}

## What to cover (MEANINGFUL -- not just "renders")
- Renders the key controls/fields/labels.
- Primary interaction: selecting options + clicking the action button calls the mocked hook/mutation with the RIGHT arguments (assert the call args), or dispatches the right action.
- State branches: loading/disabled, empty/no-data, and error -> \`setAlert\` (the alert dispatch / message), whichever the component implements.
Assert observable output (rendered text, control state, mock call args), never a bare "is in the document" on a wrapper alone.

## Notes for this component
${m.notes}

## Hard rules
- DO NOT modify ANY production file (anything under \`client/src\` that is not your test). If a test reveals a bug, characterize current behavior with an inline \`// FIXME(<topic>)\` (or assert the correct behavior and report it) -- never edit the component to make a test pass.
- No \`as any\`. Real types or \`unknown\` + narrowing (a small \`as <RealType>\` for a mock return is fine).
- DO NOT run git. DO NOT commit. Only create \`${m.testPath}\`.

## Run + iterate
\`cd /Users/henry/Projects/devartist/paperwork/client && CI=true npx craco test --watchAll=false ${m.testPath.replace('client/', '')}\`. Iterate until green.

Return: testPath, status (DONE|BLOCKED), testCount, allPassing, productionFilesTouched (MUST be empty), summary (what you covered + any FIXME/bug + anything you could not test and why).`

const reviewPrompt = (
  m,
) => `Adversarially review the React component test at \`${m.testPath}\` in /Users/henry/Projects/devartist/paperwork (component: \`${m.source}\`). Verify by reading + running; do not trust the implementer.

Check:
1. isTestOnly: run \`cd /Users/henry/Projects/devartist/paperwork && git diff -- ${m.source}\` and confirm EMPTY (no change to the component under test); spot-check no other client production file changed. Sibling untracked test files + .claude/ are EXPECTED (parallel agents) -- ignore. isTestOnly = no production source changed.
2. allGreen: run \`cd /Users/henry/Projects/devartist/paperwork/client && CI=true npx craco test --watchAll=false ${m.testPath.replace('client/', '')}\` -- all tests pass.${m.mode === 'extend' ? ' Confirm the PRE-EXISTING tests in this file were NOT removed or weakened (original tests PLUS new ones).' : ''}
3. vacuous: read the test. VACUOUS if it only asserts the component "renders" without asserting interactions (mock called with the right args on click), state branches, or rendered data. A meaningful test drives the primary action and asserts the hook/mutation/dispatch call, plus at least one state branch.
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
log(`approved ${approved.length}/${results.length} client test files`)
if (flagged.length)
  log(`flagged: ${flagged.map((r) => r && r.module).join(', ')}`)

return { results, approvedCount: approved.length, total: results.length }
