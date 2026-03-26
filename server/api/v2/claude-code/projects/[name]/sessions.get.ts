import { getClaudeCodeSessions } from '../../../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'name')

  if (!projectName) {
    throw createError({
      statusCode: 400,
      message: 'Project name is required'
    })
  }

  const query = getQuery(event)
  const limit = parseInt(query.limit as string) || 20
  const offset = parseInt(query.offset as string) || 0

  try {
    const result = await getClaudeCodeSessions(projectName, limit, offset)

    return {
      sessions: result.sessions,
      hasMore: result.hasMore,
      total: result.total,
      projectName
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch sessions'
    })
  }
})
