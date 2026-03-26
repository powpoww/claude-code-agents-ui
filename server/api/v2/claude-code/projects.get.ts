import { getClaudeCodeProjects } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async () => {
  try {
    const projects = await getClaudeCodeProjects()

    return {
      projects,
      total: projects.length
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch Claude Code projects'
    })
  }
})
