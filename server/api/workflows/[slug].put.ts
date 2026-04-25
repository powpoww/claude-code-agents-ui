import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import type { Workflow } from '~/types'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true })
  const filePath = resolveClaudePath('workflows', `${slug}.json`)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'Workflow not found' })
  }

  const body = await readBody(event)
  const existing = JSON.parse(await readFile(filePath, 'utf-8'))
  const updated = { ...existing, ...body }
  await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
  return { slug, filePath, ...updated } as Workflow
})
