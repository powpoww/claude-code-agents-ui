import { marked } from 'marked'
import { protectMathBlocks, restoreMathBlocks } from './messageFormatting'

// Configure marked with GFM (GitHub Flavored Markdown) and line breaks
marked.use({
  breaks: true,
  gfm: true,
  async: false,
})

/**
 * Render markdown to HTML (synchronous)
 * Note: This is a synchronous function for use in Vue templates
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text) as string
}

/**
 * Render markdown with math block protection.
 * Math blocks ($...$ and $$...$$) are preserved and not processed as markdown.
 */
export function renderMarkdownWithMath(text: string): string {
  if (!text) return ''

  // Protect math blocks
  const { text: protectedText, blocks } = protectMathBlocks(text)

  // Render markdown
  let html = marked.parse(protectedText) as string

  // Restore math blocks
  html = restoreMathBlocks(html, blocks)

  return html
}

/**
 * Render markdown inline (no paragraph wrapper).
 * Useful for single-line content.
 */
export function renderMarkdownInline(text: string): string {
  if (!text) return ''
  return marked.parseInline(text) as string
}

/**
 * Strip markdown formatting and return plain text.
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''

  // Remove code blocks
  let result = text.replace(/```[\s\S]*?```/g, '')

  // Remove inline code
  result = result.replace(/`[^`]+`/g, '')

  // Remove headers
  result = result.replace(/^#+\s+/gm, '')

  // Remove bold/italic
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1')
  result = result.replace(/\*([^*]+)\*/g, '$1')
  result = result.replace(/__([^_]+)__/g, '$1')
  result = result.replace(/_([^_]+)_/g, '$1')

  // Remove links (keep text)
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Remove images
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, '')

  // Clean up multiple newlines
  result = result.replace(/\n{3,}/g, '\n\n')

  return result.trim()
}
