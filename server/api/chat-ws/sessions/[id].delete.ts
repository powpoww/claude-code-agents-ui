export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })

  // We don't support deleting SDK native sessions via this legacy API
  // Returning 404 as we no longer have custom chat-session files to delete
  throw createError({
    statusCode: 404,
    message: `Session ${id} delete not supported via legacy API`,
  })
})
