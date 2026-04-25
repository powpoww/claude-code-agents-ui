import { setProjectHidden } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  if (!projectName) {
    throw createError({ statusCode: 400, message: 'Project name is required' })
  }
  const body = await readBody<{ hidden?: boolean }>(event)
  const hidden = body?.hidden !== false
  await setProjectHidden(projectName, hidden)
  return { success: true, hidden }
})
