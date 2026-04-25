import { deleteProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name', { decode: true })
  if (!name) throw createError({ statusCode: 400, message: 'category name required' })
  try {
    const result = await deleteProjectCategory(name)
    return { success: true, orphanedCount: result.orphanedCount }
  } catch (err: any) {
    throw createError({ statusCode: /not found/i.test(err.message) ? 404 : 400, message: err.message || 'invalid' })
  }
})
