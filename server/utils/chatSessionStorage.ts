import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getClaudeDir } from './claudeDir'
import type { NormalizedMessage, ChatSession, ChatSessionSummary } from '~/types'

/**
 * Get the chat sessions directory
 */
function getChatSessionsDir(): string {
  return path.join(getClaudeDir(), 'chat-sessions')
}

/**
 * Get session file path
 */
function getSessionFilePath(sessionId: string): string {
  return path.join(getChatSessionsDir(), `${sessionId}.jsonl`)
}

/**
 * Ensure chat sessions directory exists
 */
async function ensureSessionsDir(): Promise<void> {
  const dir = getChatSessionsDir()
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
  }
}

/**
 * Save a message to a session (append to JSONL)
 */
export async function saveMessageToSession(
  sessionId: string,
  message: NormalizedMessage
): Promise<void> {
  await ensureSessionsDir()

  const filePath = getSessionFilePath(sessionId)
  const line = JSON.stringify(message) + '\n'

  await fs.appendFile(filePath, line, 'utf-8')
}

/**
 * Load messages from a session with pagination
 * Returns empty array if session doesn't exist yet (graceful handling)
 */
export async function loadSessionMessages(
  sessionId: string,
  options: {
    limit?: number
    offset?: number
  } = {}
): Promise<{ messages: NormalizedMessage[]; total: number; hasMore: boolean }> {
  const filePath = getSessionFilePath(sessionId)

  // If session file doesn't exist, return empty (not an error - session just has no messages yet)
  if (!existsSync(filePath)) {
    return { messages: [], total: 0, hasMore: false }
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    // Handle empty files gracefully
    if (lines.length === 0) {
      return { messages: [], total: 0, hasMore: false }
    }

    const allMessages = lines.map((line) => JSON.parse(line) as NormalizedMessage)

    const limit = options.limit || 50
    const offset = options.offset || 0

    // For chat display, return messages in chronological order (oldest first)
    // Pagination: offset=0 means most recent messages
    const total = allMessages.length

    // Get the most recent messages within the limit
    const startIndex = Math.max(0, total - offset - limit)
    const endIndex = total - offset
    const paginated = allMessages.slice(startIndex, endIndex)

    return {
      messages: paginated, // In chronological order (oldest to newest)
      total,
      hasMore: startIndex > 0, // There are older messages available
    }
  } catch (error) {
    console.error(`Failed to load messages for session ${sessionId}:`, error)
    // Return empty on error (graceful degradation)
    return { messages: [], total: 0, hasMore: false }
  }
}

/**
 * List all chat sessions
 */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  await ensureSessionsDir()

  const dir = getChatSessionsDir()
  const files = await fs.readdir(dir)

  const sessions: ChatSessionSummary[] = []

  for (const file of files) {
    if (file.endsWith('.jsonl')) {
      const sessionId = file.replace('.jsonl', '')
      const filePath = path.join(dir, file)

      try {
        const stats = await fs.stat(filePath)
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        if (lines.length === 0) continue

        const messages = lines.map((line) => JSON.parse(line) as NormalizedMessage)

        // Find first user message
        const firstUserMessage = messages.find((m) => m.role === 'user')
        const firstUserContent = firstUserMessage?.content || '(No message)'

        // Find agent slug from any message
        const messageWithAgent = messages.find((m) => m.metadata?.agentSlug)
        const agentSlug = messageWithAgent?.metadata?.agentSlug

        // Get last message for activity timestamp
        const lastMessage = messages[messages.length - 1]

        // Determine status
        const completeMessage = messages.find((m) => m.kind === 'complete')
        const errorMessage = messages.find((m) => m.kind === 'error')
        const status = errorMessage ? 'error' : completeMessage ? 'completed' : 'active'

        sessions.push({
          id: sessionId,
          agentSlug,
          messageCount: messages.length,
          firstUserMessage: firstUserContent.slice(0, 100), // Truncate
          lastActivity: lastMessage.timestamp,
          createdAt: messages[0].timestamp,
          status,
        })
      } catch (error) {
        console.error(`Failed to load session ${sessionId}:`, error)
      }
    }
  }

  // Sort by last activity (newest first)
  sessions.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

  return sessions
}

/**
 * Get full session details
 * Returns a valid session object even if the file doesn't exist yet (empty session)
 */
export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const filePath = getSessionFilePath(sessionId)

  // If session file doesn't exist yet, return an empty session
  // This happens when a session ID is generated but no messages have been sent
  if (!existsSync(filePath)) {
    const now = new Date().toISOString()
    return {
      id: sessionId,
      agentSlug: undefined,
      workingDir: undefined,
      messages: [],
      createdAt: now,
      lastActivity: now,
      status: 'active',
      messageCount: 0,
    }
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    // Handle empty files (edge case - file exists but has no content)
    if (lines.length === 0) {
      const stats = await fs.stat(filePath)
      const now = stats.birthtime.toISOString()

      return {
        id: sessionId,
        agentSlug: undefined,
        workingDir: undefined,
        messages: [],
        createdAt: now,
        lastActivity: now,
        status: 'active',
        messageCount: 0,
      }
    }

    const messages = lines.map((line) => JSON.parse(line) as NormalizedMessage)

    // Extract metadata
    const messageWithAgent = messages.find((m) => m.metadata?.agentSlug)
    const agentSlug = messageWithAgent?.metadata?.agentSlug

    const workingDir = messageWithAgent?.metadata?.workingDir

    const lastMessage = messages[messages.length - 1]

    const completeMessage = messages.find((m) => m.kind === 'complete')
    const errorMessage = messages.find((m) => m.kind === 'error')
    const status = errorMessage ? 'error' : completeMessage ? 'completed' : 'active'

    // Extract token usage if available
    const completeWithUsage = messages.find((m) => m.kind === 'complete' && m.metadata?.usage)
    const tokenUsage = completeWithUsage?.metadata?.usage

    return {
      id: sessionId,
      agentSlug,
      workingDir,
      messages,
      createdAt: messages[0].timestamp,
      lastActivity: lastMessage.timestamp,
      status,
      tokenUsage,
      messageCount: messages.length,
    }
  } catch (error) {
    console.error(`Failed to load session ${sessionId}:`, error)
    // Return empty session on error rather than null (graceful degradation)
    const now = new Date().toISOString()
    return {
      id: sessionId,
      agentSlug: undefined,
      workingDir: undefined,
      messages: [],
      createdAt: now,
      lastActivity: now,
      status: 'active',
      messageCount: 0,
    }
  }
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  const filePath = getSessionFilePath(sessionId)

  if (!existsSync(filePath)) {
    return false
  }

  try {
    await fs.unlink(filePath)
    return true
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error)
    return false
  }
}

/**
 * Get session messages (alias for provider compatibility)
 */
export async function getSessionMessages(
  sessionId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<NormalizedMessage[]> {
  const result = await loadSessionMessages(sessionId, options)
  return result.messages
}

/**
 * Get total message count for a session
 */
export async function getSessionMessagesCount(sessionId: string): Promise<number> {
  const filePath = getSessionFilePath(sessionId)

  if (!existsSync(filePath)) {
    return 0
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    return lines.length
  } catch (error) {
    console.error(`Failed to count messages for session ${sessionId}:`, error)
    return 0
  }
}
