/**
 * Claude Code History Reader
 * Reads chat history from Claude Code CLI stored in ~/.claude/projects/
 */

import { promises as fs, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { homedir } from 'os'

export interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
}

export interface ClaudeCodeSession {
  id: string
  summary: string
  messageCount: number
  lastActivity: string
  cwd: string
  isGrouped?: boolean
  groupSize?: number
}

export interface ClaudeCodeMessage {
  uuid?: string
  parentUuid?: string | null
  sessionId: string
  timestamp: string
  type?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>
  }
  cwd?: string
  toolName?: string
  toolInput?: unknown
  toolUseResult?: unknown
  [key: string]: unknown
}

const projectDirectoryCache = new Map<string, string>()

/**
 * Get the Claude projects directory path
 */
function getClaudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

/**
 * Extract the actual project directory from JSONL sessions
 */
async function extractProjectDirectory(projectName: string): Promise<string> {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName)!
  }

  const projectDir = join(getClaudeProjectsDir(), projectName)
  const cwdCounts = new Map<string, number>()
  let latestTimestamp = 0
  let latestCwd: string | null = null
  let extractedPath: string

  try {
    await fs.access(projectDir)

    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      extractedPath = projectName.replace(/-/g, '/')
    } else {
      // Process JSONL files to collect cwd values
      for (const file of jsonlFiles.slice(0, 3)) { // Limit to first 3 files for performance
        const jsonlFile = join(projectDir, file)
        const fileStream = createReadStream(jsonlFile)
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        })

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line)
              if (entry.cwd) {
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1)
                const timestamp = new Date(entry.timestamp || 0).getTime()
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp
                  latestCwd = entry.cwd
                }
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      if (cwdCounts.size === 0) {
        extractedPath = projectName.replace(/-/g, '/')
      } else if (cwdCounts.size === 1) {
        extractedPath = Array.from(cwdCounts.keys())[0]
      } else {
        // Multiple cwd values - prefer most recent if it has reasonable usage
        const mostRecentCount = latestCwd ? (cwdCounts.get(latestCwd) || 0) : 0
        const maxCount = Math.max(...cwdCounts.values())

        if (mostRecentCount >= maxCount * 0.25 && latestCwd) {
          extractedPath = latestCwd
        } else {
          for (const [cwd, count] of cwdCounts.entries()) {
            if (count === maxCount) {
              extractedPath = cwd
              break
            }
          }
          extractedPath = extractedPath || latestCwd || projectName.replace(/-/g, '/')
        }
      }
    }

    projectDirectoryCache.set(projectName, extractedPath)
    return extractedPath
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      extractedPath = projectName.replace(/-/g, '/')
    } else {
      extractedPath = projectName.replace(/-/g, '/')
    }
    projectDirectoryCache.set(projectName, extractedPath)
    return extractedPath
  }
}

/**
 * Generate display name from project name
 */
async function generateDisplayName(projectName: string, actualProjectDir: string): Promise<string> {
  // Try to read package.json from the project path
  try {
    const packageJsonPath = join(actualProjectDir, 'package.json')
    const packageData = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageData)
    if (packageJson.name) {
      return packageJson.name
    }
  } catch {
    // Fall back to path-based naming
  }

  // If it starts with /, return only the last folder name
  if (actualProjectDir.startsWith('/')) {
    const parts = actualProjectDir.split('/').filter(Boolean)
    return parts[parts.length - 1] || actualProjectDir
  }

  return actualProjectDir
}

/**
 * Get all Claude Code projects
 */
export async function getClaudeCodeProjects(): Promise<ClaudeCodeProject[]> {
  const claudeDir = getClaudeProjectsDir()
  const projects: ClaudeCodeProject[] = []

  try {
    await fs.access(claudeDir)

    const entries = await fs.readdir(claudeDir, { withFileTypes: true })
    const directories = entries.filter(e => e.isDirectory())

    for (const entry of directories) {
      const actualProjectDir = await extractProjectDirectory(entry.name)
      const displayName = await generateDisplayName(entry.name, actualProjectDir)

      // Get session count and last activity
      const projectDir = join(claudeDir, entry.name)
      const files = await fs.readdir(projectDir)
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

      let lastActivity: string | undefined
      if (jsonlFiles.length > 0) {
        // Get modification time of most recent file
        const filesWithStats = await Promise.all(
          jsonlFiles.slice(0, 5).map(async (file) => {
            const filePath = join(projectDir, file)
            const stats = await fs.stat(filePath)
            return { mtime: stats.mtime }
          })
        )
        filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        lastActivity = filesWithStats[0]?.mtime.toISOString()
      }

      projects.push({
        name: entry.name,
        path: actualProjectDir,
        displayName,
        lastActivity,
        sessionCount: jsonlFiles.length
      })
    }

    // Sort by last activity (newest first)
    projects.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0
      if (!a.lastActivity) return 1
      if (!b.lastActivity) return -1
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    })

    return projects
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    console.error('Error reading Claude Code projects:', error)
    return []
  }
}

/**
 * Parse JSONL file to extract sessions
 */
async function parseJsonlSessions(filePath: string): Promise<{
  sessions: Map<string, ClaudeCodeSession>
  entries: ClaudeCodeMessage[]
}> {
  const sessions = new Map<string, ClaudeCodeSession>()
  const entries: ClaudeCodeMessage[] = []
  const pendingSummaries = new Map<string, string>()

  try {
    const fileStream = createReadStream(filePath)
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line) as ClaudeCodeMessage
          entries.push(entry)

          // Handle summary entries that don't have sessionId yet
          if (entry.type === 'summary' && (entry as any).summary && !entry.sessionId && (entry as any).leafUuid) {
            pendingSummaries.set((entry as any).leafUuid, (entry as any).summary)
          }

          if (entry.sessionId) {
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                id: entry.sessionId,
                summary: 'New Session',
                messageCount: 0,
                lastActivity: new Date().toISOString(),
                cwd: entry.cwd || ''
              })
            }

            const session = sessions.get(entry.sessionId)!

            // Apply pending summary
            if (session.summary === 'New Session' && entry.parentUuid && pendingSummaries.has(entry.parentUuid)) {
              session.summary = pendingSummaries.get(entry.parentUuid)!
            }

            // Update summary from summary entries
            if (entry.type === 'summary' && (entry as any).summary) {
              session.summary = (entry as any).summary
            }

            // Count messages and track activity
            session.messageCount++
            if (entry.timestamp) {
              const timestamp = new Date(entry.timestamp)
              if (timestamp > new Date(session.lastActivity)) {
                session.lastActivity = entry.timestamp
              }
            }

            if (entry.cwd) {
              session.cwd = entry.cwd
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    }
  } catch (error) {
    console.error(`Error parsing JSONL file ${filePath}:`, error)
  }

  return { sessions, entries }
}

/**
 * Get sessions for a specific Claude Code project
 */
export async function getClaudeCodeSessions(
  projectName: string,
  limit = 20,
  offset = 0
): Promise<{
  sessions: ClaudeCodeSession[]
  hasMore: boolean
  total: number
}> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  try {
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return { sessions: [], hasMore: false, total: 0 }
    }

    // Sort files by modification time (newest first)
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectDir, file)
        const stats = await fs.stat(filePath)
        return { file, mtime: stats.mtime }
      })
    )
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    const allSessions = new Map<string, ClaudeCodeSession>()

    // Collect sessions from all files
    for (const { file } of filesWithStats) {
      const jsonlFile = join(projectDir, file)
      const result = await parseJsonlSessions(jsonlFile)

      result.sessions.forEach((session, id) => {
        if (!allSessions.has(id)) {
          allSessions.set(id, session)
        }
      })

      // Early exit for performance
      if (allSessions.size >= (limit + offset) * 2) {
        break
      }
    }

    // Convert to array and sort by last activity
    const visibleSessions = Array.from(allSessions.values())
      .filter(session => !session.summary.startsWith('{ "'))
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

    const total = visibleSessions.length
    const paginatedSessions = visibleSessions.slice(offset, offset + limit)
    const hasMore = offset + limit < total

    return { sessions: paginatedSessions, hasMore, total }
  } catch (error: any) {
    console.error(`Error reading sessions for project ${projectName}:`, error)
    return { sessions: [], hasMore: false, total: 0 }
  }
}

/**
 * Get messages for a specific session
 */
export async function getClaudeCodeSessionMessages(
  projectName: string,
  sessionId: string,
  limit: number | null = null,
  offset = 0
): Promise<{
  messages: ClaudeCodeMessage[]
  total: number
  hasMore: boolean
}> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  try {
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return { messages: [], total: 0, hasMore: false }
    }

    const messages: ClaudeCodeMessage[] = []

    // Process all JSONL files to find messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectDir, file)
      const fileStream = createReadStream(jsonlFile)
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      })

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line) as ClaudeCodeMessage
            if (entry.sessionId === sessionId) {
              messages.push(entry)
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }

    // Sort messages by timestamp
    const sortedMessages = messages.sort((a, b) =>
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    )

    const total = sortedMessages.length

    // If no limit, return all
    if (limit === null) {
      return { messages: sortedMessages, total, hasMore: false }
    }

    // Apply pagination - get most recent messages
    const startIndex = Math.max(0, total - offset - limit)
    const endIndex = total - offset
    const paginatedMessages = sortedMessages.slice(startIndex, endIndex)
    const hasMore = startIndex > 0

    return { messages: paginatedMessages, total, hasMore }
  } catch (error: any) {
    console.error(`Error reading messages for session ${sessionId}:`, error)
    return { messages: [], total: 0, hasMore: false }
  }
}
