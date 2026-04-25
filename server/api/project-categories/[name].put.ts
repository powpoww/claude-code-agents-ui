import { renameProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const oldName = getRouterParam(event, 'name', { decode: true })
  if (!oldName) throw createError({ statusCode: 400, message: 'category name required' })
  const body = await readBody<{ name?: string }>(event)
  if (typeof body?.name !== 'string') throw createError({ statusCode: 400, message: 'new name required' })
  try {
    const updated = await renameProjectCategory(oldName, body.name)
    return { name: updated.name }
  } catch (err: any) {
    const msg = String(err.message || 'invalid')
    const statusCode = /not found/i.test(msg) ? 404 : /exists/i.test(msg) ? 409 : 400
    throw createError({ statusCode, message: msg })
  }
})
