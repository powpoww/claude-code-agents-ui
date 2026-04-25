import { writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import { serializeFrontmatter } from '../../utils/frontmatter'
import { slugToPath, pathToSlug } from '../../utils/slugUtils'
import type { CommandPayload } from '~/types'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true })!
  const { directory, filename } = slugToPath(slug)
  const filePath = directory
    ? resolveClaudePath('commands', directory, filename)
    : resolveClaudePath('commands', filename)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Command not found: ${slug}` })
  }

  const payload = await readBody<CommandPayload>(event)
  const content = serializeFrontmatter(payload.frontmatter, payload.body)

  let finalFilePath = filePath
  let finalSlug = slug

  // Rename file if the name in frontmatter changed
  const newName = payload.frontmatter.name
  if (newName && newName !== slug) {
    const newFilename = `${newName}.md`
    const newFilePath = directory
      ? resolveClaudePath('commands', directory, newFilename)
      : resolveClaudePath('commands', newFilename)

    if (newFilePath !== filePath) {
      // Ensure we don't overwrite an existing file
      if (existsSync(newFilePath)) {
        throw createError({ statusCode: 409, message: `A command with the name "${newName}" already exists.` })
      }
      await rename(filePath, newFilePath)
      finalFilePath = newFilePath
      finalSlug = pathToSlug(directory, newFilename)
    }
  }

  await writeFile(finalFilePath, content, 'utf-8')

  return {
    slug: finalSlug,
    filename: finalFilePath.split('/').pop(),
    directory,
    frontmatter: payload.frontmatter,
    body: payload.body,
    filePath: finalFilePath,
  }
})
