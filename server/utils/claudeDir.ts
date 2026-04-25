import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let cachedDir: string | null = null

export function getClaudeDir(): string {
  const envDir = process.env.CLAUDE_DIR
  if (envDir) return envDir
  if (!cachedDir) cachedDir = join(homedir(), '.claude')
  return cachedDir
}

export function setClaudeDir(dir: string): void {
  if (!existsSync(dir)) {
    throw createError({ statusCode: 400, message: `Directory does not exist: ${dir}` })
  }
  cachedDir = dir
}

export function resolveClaudePath(...segments: string[]): string {
  return join(getClaudeDir(), ...segments)
}
