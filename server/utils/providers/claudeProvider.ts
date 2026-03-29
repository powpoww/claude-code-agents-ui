import { query } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import type { Peer } from 'crossws'
import type { NormalizedMessage, ProviderFetchOptions } from '~/types'
import type { ProviderAdapter, ProviderQueryOptions, ProviderInfo } from './types'
import { normalizeSDKMessage } from '../messageNormalizer'
import { resolveClaudePath } from '../claudeDir'
import { parseFrontmatter } from '../frontmatter'
import { saveMessageToSession, getSessionMessages, getSessionMessagesCount, hasAssistantMessages } from '../chatSessionStorage'
import { MODEL_ALIAS_KEY } from '../models'

// Store active query instances for interruption
interface QueryInstance {
  interrupt(): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<any>
}

const activeQueries = new Map<string, QueryInstance>()

/**
 * Map permission mode to SDK format
 */
function mapPermissionMode(mode?: string): string {
  switch (mode) {
    case 'default':
      return 'default'
    case 'skip':
      return 'skip'
    case 'acceptEdits':
      return 'acceptEdits'
    case 'bypassPermissions':
      return 'bypassPermissions'
    case 'plan':
      return 'plan'
    default:
      return 'bypassPermissions' // Default for chat v2
  }
}

/**
 * Claude provider adapter implementation.
 * Wraps the Claude Agent SDK for multi-provider support.
 *
 * Session Management:
 * - For NEW sessions: Don't use resume, let SDK create session_id
 * - For EXISTING sessions: Use resume with the SDK's session_id
 * - The SDK's session_id is returned to frontend via session_created event
 * - Frontend should store and use the SDK's session_id for subsequent queries
 */
export const claudeProvider: ProviderAdapter = {
  name: 'claude',

  async query(prompt: string, options: ProviderQueryOptions, ws: Peer): Promise<void> {
    // capturedSessionId will hold the SDK's session_id (either from resume or newly created)
    let capturedSessionId: string | null = null
    let sessionCreatedSent = false
    let userMessageSaved = false
    let accumulatedText = ''
    let hasTextMessageFromResult = false

    // Check if this is a resume (session has prior SDK interaction)
    // If sessionId is provided and has assistant messages, it's a valid SDK session
    let shouldResume = false
    if (options.sessionId) {
      shouldResume = await hasAssistantMessages(options.sessionId)
      if (shouldResume) {
        capturedSessionId = options.sessionId
        // For resumed sessions, save user message immediately
        if (options.userMessage) {
          const userMsgWithCorrectSession: NormalizedMessage = {
            ...options.userMessage,
            sessionId: capturedSessionId,
          }
          await saveMessageToSession(capturedSessionId, userMsgWithCorrectSession)
          userMessageSaved = true
        }
      }
    }

    try {
      // Prepare SDK options
      const sdkOptions: any = {
        cwd: options.workingDir || process.cwd(),
        permissionMode: mapPermissionMode(options.permissionMode),
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        maxTurns: 10,
        includePartialMessages: true,
      }

      // Add system prompt configuration
      if (options.agentInstructions) {
        sdkOptions.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: options.agentInstructions,
        }
      } else {
        sdkOptions.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
        }
      }

      // Resume session if this is an existing SDK session
      // Only resume if the session has had prior SDK interaction (has assistant messages)
      if (shouldResume && options.sessionId) {
        sdkOptions.resume = options.sessionId
        console.log('[ClaudeProvider] Resuming SDK session:', options.sessionId)
      } else {
        console.log('[ClaudeProvider] Starting new SDK session')
      }

      // Add model if specified
      if (options.model) {
        sdkOptions.model = options.model
      }

      // Add thinking mode if enabled
      if (options.thinkingEnabled) {
        sdkOptions.model = { type: 'thinking', enabled: true }
      }

      console.log('[ClaudeProvider] Starting query with options:', {
        hasSessionId: !!options.sessionId,
        shouldResume,
        cwd: sdkOptions.cwd,
        model: sdkOptions.model,
        permissionMode: sdkOptions.permissionMode,
        thinkingEnabled: options.thinkingEnabled,
      })

      // Create query instance
      const queryInstance = query({
        prompt,
        options: sdkOptions,
      })

      // Stream responses
      for await (const message of queryInstance) {
        // Capture session ID from SDK
        // For new sessions, SDK returns session_id in the first message
        // For resumed sessions, we already have the session_id
        if (message.session_id && !capturedSessionId) {
          capturedSessionId = message.session_id
          activeQueries.set(capturedSessionId, queryInstance)

          // Send session-created event for new sessions
          // This tells the frontend what sessionId to use going forward
          if (!shouldResume && !sessionCreatedSent) {
            sessionCreatedSent = true
            sendMessage(ws, {
              kind: 'session_created',
              id: randomUUID(),
              sessionId: capturedSessionId,
              timestamp: new Date().toISOString(),
              content: capturedSessionId,
              newSessionId: capturedSessionId,
              provider: 'claude',
            })

            // Save user message with SDK's session_id for new sessions
            if (options.userMessage && !userMessageSaved) {
              const userMsgWithCorrectSession: NormalizedMessage = {
                ...options.userMessage,
                sessionId: capturedSessionId,
              }
              await saveMessageToSession(capturedSessionId, userMsgWithCorrectSession)
              userMessageSaved = true
            }
          }
        } else if (shouldResume && capturedSessionId && !activeQueries.has(capturedSessionId)) {
          // For resumed sessions, register the query instance
          activeQueries.set(capturedSessionId, queryInstance)
        }

        // Normalize SDK message
        const normalized = normalizeSDKMessage(message, capturedSessionId || 'unknown')

        // Send all normalized messages
        for (const msg of normalized) {
          // Add provider info
          const msgWithProvider: NormalizedMessage = {
            ...msg,
            provider: 'claude',
          }
          sendMessage(ws, msgWithProvider)

          // Accumulate streaming text deltas
          if (msg.kind === 'stream_delta' && msg.content) {
            accumulatedText += msg.content
          }

          // Track if we got a text message from SDK result
          if (msg.kind === 'text' && msg.role === 'assistant') {
            hasTextMessageFromResult = true
          }

          // Save persistable messages to session
          if (capturedSessionId && shouldSaveMessage(msg)) {
            await saveMessageToSession(capturedSessionId, msgWithProvider)
          }
        }
      }

      // Save accumulated streaming text as final assistant message
      if (capturedSessionId && accumulatedText.trim() && !hasTextMessageFromResult) {
        const finalTextMessage: NormalizedMessage = {
          kind: 'text',
          id: randomUUID(),
          sessionId: capturedSessionId,
          timestamp: new Date().toISOString(),
          role: 'assistant',
          content: accumulatedText,
          provider: 'claude',
        }
        await saveMessageToSession(capturedSessionId, finalTextMessage)
      }

      // Send complete message
      const completeMsg: NormalizedMessage = {
        kind: 'complete',
        id: randomUUID(),
        sessionId: capturedSessionId || 'unknown',
        timestamp: new Date().toISOString(),
        content: '',
        provider: 'claude',
      }
      sendMessage(ws, completeMsg)

      if (capturedSessionId) {
        await saveMessageToSession(capturedSessionId, completeMsg)
      }

      console.log('[ClaudeProvider] Query completed:', capturedSessionId)
    } catch (error: any) {
      console.error('[ClaudeProvider] Error:', error)

      // Send error message
      const errorMsg: NormalizedMessage = {
        kind: 'error',
        id: randomUUID(),
        sessionId: capturedSessionId || 'unknown',
        timestamp: new Date().toISOString(),
        content: error.message || 'An error occurred',
        provider: 'claude',
      }
      sendMessage(ws, errorMsg)

      if (capturedSessionId) {
        await saveMessageToSession(capturedSessionId, errorMsg)
      }
    } finally {
      // Cleanup
      if (capturedSessionId) {
        activeQueries.delete(capturedSessionId)
      }
    }
  },

  async interrupt(sessionId: string): Promise<boolean> {
    const queryInstance = activeQueries.get(sessionId)
    if (queryInstance) {
      try {
        await queryInstance.interrupt()
        activeQueries.delete(sessionId)
        return true
      } catch (error) {
        console.error('[ClaudeProvider] Error interrupting query:', error)
        return false
      }
    }
    return false
  },

  normalizeMessage(raw: any, sessionId: string): NormalizedMessage[] {
    return normalizeSDKMessage(raw, sessionId)
  },

  async fetchHistory(sessionId: string, options: ProviderFetchOptions) {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0

    const messages = await getSessionMessages(sessionId, { limit, offset })
    const total = await getSessionMessagesCount(sessionId)

    return {
      messages,
      total,
      hasMore: offset + messages.length < total,
    }
  },

  async loadAgentInstructions(agentSlug: string): Promise<string | null> {
    try {
      const agentPath = resolveClaudePath('agents', `${agentSlug}.md`)
      const content = await fs.readFile(agentPath, 'utf-8')
      const { body } = parseFrontmatter(content)
      return body || null
    } catch (error) {
      console.error(`[ClaudeProvider] Failed to load agent ${agentSlug}:`, error)
      return null
    }
  },
}

/**
 * Determine if a message should be saved to session history
 */
function shouldSaveMessage(msg: NormalizedMessage): boolean {
  if (msg.kind === 'stream_delta') return false
  if (msg.kind === 'stream_end') return false
  if (msg.kind === 'session_created') return false
  return true
}

/**
 * Send a normalized message via WebSocket
 */
function sendMessage(ws: Peer, message: NormalizedMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error('[ClaudeProvider] Error sending message:', error)
  }
}

/**
 * Provider info for registration
 */
export const claudeProviderInfo: ProviderInfo = {
  name: 'claude',
  displayName: 'Claude',
  description: 'Anthropic Claude via Claude Agent SDK',
  models: Object.values(MODEL_ALIAS_KEY),
  supportsPermissions: true,
  supportsImages: true,
  supportsInterrupt: true,
}
