import { renameClaudeCodeProject } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  const body = await readBody(event)
  const newDisplayName = body.displayName

  if (!projectName) {
    throw createError({
      statusCode: 400,
      message: 'Project name is required'
    })
  }

  if (!newDisplayName) {
    throw createError({
      statusCode: 400,
      message: 'New display name is required'
    })
  }

  try {
    const success = await renameClaudeCodeProject(projectName, newDisplayName)
    if (!success) {
      throw createError({
        statusCode: 500,
        message: 'Failed to rename project'
      })
    }
    return { success: true }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to rename project'
    })
  }
})
