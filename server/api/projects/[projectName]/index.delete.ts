import { deleteClaudeCodeProject } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  if (!projectName) {
    throw createError({
      statusCode: 400,
      message: 'Project name is required'
    })
  }

  try {
    const success = await deleteClaudeCodeProject(projectName)
    if (!success) {
      throw createError({
        statusCode: 500,
        message: 'Failed to delete project'
      })
    }
    return { success: true }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete project'
    })
  }
})
