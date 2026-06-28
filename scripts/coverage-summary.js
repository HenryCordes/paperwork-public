// Renders a Markdown coverage table for the GitHub Actions job summary.
// Usage: node scripts/coverage-summary.js "<title>" <linesGate> <stmtsGate> <funcsGate> <branchesGate>
// Reads ./coverage/coverage-summary.json (relative to the cwd it is run from).
const fs = require('fs')
const path = require('path')

const [, , title = 'Coverage', lG, sG, fG, bG] = process.argv
const gates = {
  lines: Number(lG),
  statements: Number(sG),
  functions: Number(fG),
  branches: Number(bG),
}

const file = path.join(process.cwd(), 'coverage', 'coverage-summary.json')
if (!fs.existsSync(file)) {
  console.log(`## ${title}\n\n_No coverage report found at ${file}._`)
  process.exit(0)
}

const total = JSON.parse(fs.readFileSync(file, 'utf8')).total

const row = (label, key) => {
  const m = total[key]
  const gate = gates[key]
  const pass = !Number.isNaN(gate) ? m.pct >= gate : true
  const gateCell = Number.isNaN(gate) ? '-' : `${gate}%`
  const mark = Number.isNaN(gate) ? '' : pass ? '✅' : '❌'
  return `| ${label} | ${m.pct}% (${m.covered}/${m.total}) | ${gateCell} | ${mark} |`
}

console.log(
  [
    `## ${title}`,
    '',
    '| Metric | Coverage | Gate | |',
    '| --- | --- | --- | --- |',
    row('Lines', 'lines'),
    row('Statements', 'statements'),
    row('Functions', 'functions'),
    row('Branches', 'branches'),
  ].join('\n'),
)
