const fs = require('fs')
const path = require('path')

// Read the config file
const configPath = path.join(process.cwd(), '.windsurf.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

// Create rules directory if it doesn't exist
const rulesDir = path.join(process.cwd(), '.windsurf', 'rules')
if (!fs.existsSync(rulesDir)) {
  fs.mkdirSync(rulesDir, { recursive: true })
}

// Process each rule
console.log(`Found ${config.rules.length} rules to migrate`)

// Save each rule as a separate file
config.rules.forEach((rule) => {
  if (!rule.id) {
    console.warn(
      'Skipping rule with missing id:',
      JSON.stringify(rule, null, 2),
    )
    return
  }

  const rulePath = path.join(rulesDir, `${rule.id}.json`)
  fs.writeFileSync(rulePath, JSON.stringify(rule, null, 2) + '\n', 'utf-8')
  console.log(`Created rule file: ${rulePath}`)
})

// Update the config to reference the rule files
const newConfig = {
  ...config,
  rules: config.rules.map((rule) => ({
    $ref: `./rules/${rule.id}.json`,
  })),
}

// Save the updated config
fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8')
console.log(
  'Successfully updated .windsurf.json to reference individual rule files',
)
