import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseFrontmatter } from '../../utils/frontmatter'
import { getClaudeDir } from '../../utils/claudeDir'
import { DEFAULT_OUTPUT_STYLES } from '../../utils/defaultOutputStyles'
import { resolveHome } from '../../utils/path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workingDir = query.workingDir as string
  const expandedWorkingDir = workingDir ? resolveHome(workingDir) : null
  
  const globalDir = join(getClaudeDir(), 'output-styles')
  const projectDir = expandedWorkingDir ? join(expandedWorkingDir, '.claude', 'output-styles') : null

  const styles: any[] = [...DEFAULT_OUTPUT_STYLES]

  function loadFromDir(dir: string, scope: 'global' | 'project') {
    if (!dir || !existsSync(dir)) return
    
    const files = readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      try {
        const path = join(dir, file)
        const content = readFileSync(path, 'utf8')
        const { frontmatter, body } = parseFrontmatter<any>(content)
        
        styles.push({
          id: basename(file, '.md'),
          name: frontmatter.name || basename(file, '.md'),
          description: frontmatter.description || '',
          keepCodingInstructions: frontmatter['keep-coding-instructions'] === true || frontmatter.keepCodingInstructions === true,
          content: body,
          scope,
          path
        })
      } catch (e) {
        console.error(`Failed to parse output style ${file}:`, e)
      }
    }
  }

  loadFromDir(globalDir, 'global')
  if (projectDir) {
    loadFromDir(projectDir, 'project')
  }

  return styles
})
