import { setProjectCategoryAssignment } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  if (!projectName) throw createError({ statusCode: 400, message: 'project name required' })
  const body = await readBody<{ category?: string | null }>(event)
  const category = body?.category ?? null
  if (category !== null && typeof category !== 'string') {
    throw createError({ statusCode: 400, message: 'category must be string or null' })
  }
  try {
    await setProjectCategoryAssignment(projectName, category)
    return { success: true, category }
  } catch (err: any) {
    throw createError({ statusCode: /not found/i.test(err.message) ? 404 : 400, message: err.message || 'invalid' })
  }
})
