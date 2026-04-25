import { deleteClaudeCodeSession } from '../../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  const sessionId = getRouterParam(event, 'sessionId', { decode: true })

  if (!projectName || !sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Project name and session ID are required',
    })
  }

  try {
    console.log(`[API] Deleting Claude Code session: ${sessionId} from project: ${projectName}`)
    const success = await deleteClaudeCodeSession(projectName, sessionId)

    if (!success) {
      throw createError({
        statusCode: 404,
        message: `Session ${sessionId} not found in project ${projectName}`,
      })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete session',
    })
  }
})
