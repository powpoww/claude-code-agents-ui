import { listSessions } from '../../../utils/claudeProjects'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'project', { decode: true })

  if (!projectName) {
    throw createError({
      statusCode: 400,
      message: 'Project name is required',
    })
  }

  const sessions = await listSessions(projectName)
  return sessions
})
