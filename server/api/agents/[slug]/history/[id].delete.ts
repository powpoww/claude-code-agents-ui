import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true })
  const id = getRouterParam(event, 'id', { decode: true })
  if (!slug || !id) throw createError({ statusCode: 400, message: 'slug and id are required' })

  const filePath = resolveClaudePath('agent-history', slug, `${id}.json`)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Session not found: ${id}` })
  }

  await unlink(filePath)
  return { deleted: true, id }
})
