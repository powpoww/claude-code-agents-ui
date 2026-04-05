import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveHome(path: string): string {
  if (!path) return path
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1))
  }
  return path
}
