import { terminateSession, getCliSession } from '../../../utils/cliSession'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  // Check if session exists
  const session = getCliSession(id)
  if (!session) {
    throw createError({
      statusCode: 404,
      message: `Session ${id} not found`,
    })
  }

  // Terminate the session
  await terminateSession(id)

  return {
    success: true,
    message: `Session ${id} terminated`,
  }
})
