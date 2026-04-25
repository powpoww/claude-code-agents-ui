import { getCliSession, loadSessionHistory } from '../../../utils/cliSession'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  // First check if it's an active session
  const activeSession = getCliSession(id)
  if (activeSession) {
    return {
      ...activeSession.metadata,
      output: activeSession.output.join(''),
      active: true,
    }
  }

  // Otherwise, try to load from history
  try {
    const history = await loadSessionHistory(id)
    return {
      ...history,
      active: false,
    }
  } catch (error: any) {
    throw createError({
      statusCode: 404,
      message: `Session ${id} not found`,
    })
  }
})
