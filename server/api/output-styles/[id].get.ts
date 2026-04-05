import { existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseFrontmatter } from '../../utils/frontmatter'
import { getClaudeDir } from '../../utils/claudeDir'
import { DEFAULT_OUTPUT_STYLES } from '../../utils/defaultOutputStyles'
import { resolveHome } from '../../utils/path'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const scope = query.scope as string
  const workingDir = query.workingDir as string
  const expandedWorkingDir = workingDir ? resolveHome(workingDir) : null

  // Check built-in styles first
  const defaultStyle = DEFAULT_OUTPUT_STYLES.find(s => s.id === id)
  if (defaultStyle) {
    return defaultStyle
  }

  const globalDir = join(getClaudeDir(), 'output-styles')
  const projectDir = expandedWorkingDir ? join(expandedWorkingDir, '.claude', 'output-styles') : null
  
  const targetDir = scope === 'global' ? globalDir : projectDir
  if (!targetDir || !id) {
    throw createError({ statusCode: 400, message: 'Invalid request' })
  }

  const filePath = join(targetDir, `${id}.md`)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'Output style not found' })
  }

  const content = readFileSync(filePath, 'utf8')
  const { frontmatter, body } = parseFrontmatter<any>(content)

  return {
    id,
    name: frontmatter.name || id,
    description: frontmatter.description || '',
    keepCodingInstructions: frontmatter['keep-coding-instructions'] === true || frontmatter.keepCodingInstructions === true,
    content: body,
    scope,
    path: filePath
  }
})
