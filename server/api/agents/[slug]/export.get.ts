import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../../utils/claudeDir'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true })!
  const filePath = resolveClaudePath('agents', `${slug}.md`)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Agent not found: ${slug}` })
  }

  const content = await readFile(filePath, 'utf-8')

  setResponseHeaders(event, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}.md"`,
  })

  return content
})
