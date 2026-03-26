import { marked } from 'marked'
import { protectMathBlocks, restoreMathBlocks } from './messageFormatting'

marked.setOptions({
  breaks: true,
  gfm: true,
})

// Custom renderer for code blocks with language class
const renderer = new marked.Renderer()
const originalCodeRenderer = renderer.code.bind(renderer)

renderer.code = function (code: string, language: string | undefined, isEscaped: boolean) {
  const lang = language || 'text'
  const langClass = `language-${lang}`

  // Use highlight.js class format for potential syntax highlighting
  return `<pre><code class="${langClass}" data-language="${lang}">${
    isEscaped ? code : escapeHtml(code)
  }</code></pre>`
}

// Helper to escape HTML in code blocks
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render markdown to HTML (synchronous)
 * Note: This is a synchronous function for use in Vue templates
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text, { renderer }) as string
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
  let html = marked.parse(protectedText, { renderer }) as string

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
