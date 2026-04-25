import { reorderProjectCategories } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ names?: unknown }>(event)
  if (!Array.isArray(body?.names) || !body.names.every((n: unknown) => typeof n === 'string')) {
    throw createError({ statusCode: 400, message: 'names array of strings required' })
  }
  try {
    await reorderProjectCategories(body.names as string[])
    return { success: true }
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.message || 'invalid order' })
  }
})
