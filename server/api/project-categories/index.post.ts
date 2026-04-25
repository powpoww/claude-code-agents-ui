import { createProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const name = body?.name
  if (typeof name !== 'string') {
    throw createError({ statusCode: 400, message: 'name required' })
  }
  try {
    const created = await createProjectCategory(name)
    setResponseStatus(event, 201)
    return { name: created.name }
  } catch (err: any) {
    const msg = String(err.message || 'invalid')
    const statusCode = /exists/i.test(msg) ? 409 : 400
    throw createError({ statusCode, message: msg })
  }
})
