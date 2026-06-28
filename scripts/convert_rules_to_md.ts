import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join, basename } from 'path'

interface Rule {
  id: string
  name: string
  description: string
  principles: string[]
}

function convertJsonToMarkdown(jsonContent: string): string {
  const rule: Rule = JSON.parse(jsonContent)

  // Format the markdown content
  let markdown = `# ${rule.name}\n\n`
  markdown += `## ${rule.description}\n\n`

  // Add principles as a bulleted list
  if (rule.principles && rule.principles.length > 0) {
    markdown += rule.principles.map((p) => `- ${p}`).join('\n')
    markdown += '\n'
  }

  return markdown
}

async function convertAllRules() {
  try {
    const rulesDir = join(process.cwd(), '.windsurf/rules')
    const files = readdirSync(rulesDir).filter((file) => file.endsWith('.json'))

    for (const file of files) {
      const jsonPath = join(rulesDir, file)
      const mdPath = join(rulesDir, `${basename(file, '.json')}.md`)

      // Read JSON file
      const jsonContent = readFileSync(jsonPath, 'utf-8')

      // Convert to Markdown
      const markdownContent = convertJsonToMarkdown(jsonContent)

      // Write Markdown file
      writeFileSync(mdPath, markdownContent, 'utf-8')
      console.log(`Created: ${mdPath}`)
    }

    console.log('\nAll rules have been converted to Markdown format.')
  } catch (error) {
    console.error('Error converting rules to Markdown:', error)
    process.exit(1)
  }
}

convertAllRules()
