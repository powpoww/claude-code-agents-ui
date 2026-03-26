import { query } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import type { Peer } from 'crossws'
import type { NormalizedMessage, ProviderFetchOptions } from '~/types'
import type { ProviderAdapter, ProviderQueryOptions, ProviderInfo } from './types'
import { normalizeSDKMessage } from '../messageNormalizer'
import { resolveClaudePath } from '../claudeDir'
import { parseFrontmatter } from '../frontmatter'
import { saveMessageToSession, getSessionMessages, getSessionMessagesCount } from '../chatSessionStorage'

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
 */
export const claudeProvider: ProviderAdapter = {
  name: 'claude',

  async query(prompt: string, options: ProviderQueryOptions, ws: Peer): Promise<void> {
    let capturedSessionId = options.sessionId || null
    let sessionCreatedSent = false
    let accumulatedText = ''
    let hasTextMessageFromResult = false

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

      // Resume session if ID provided
      if (options.sessionId) {
        sdkOptions.resume = options.sessionId
      }

      // Add model if specified
      if (options.model) {
        sdkOptions.model = options.model
      }

      console.log('[ClaudeProvider] Starting query with options:', {
        hasSessionId: !!capturedSessionId,
        cwd: sdkOptions.cwd,
        model: sdkOptions.model,
        permissionMode: sdkOptions.permissionMode,
      })

      // Create query instance
      const queryInstance = query({
        prompt,
        options: sdkOptions,
      })

      // Stream responses
      for await (const message of queryInstance) {
        // Capture session ID from SDK (for new sessions)
        if (message.session_id && !capturedSessionId) {
          capturedSessionId = message.session_id
          activeQueries.set(capturedSessionId, queryInstance)

          // Send session-created event only once for new sessions
          if (!options.sessionId && !sessionCreatedSent) {
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
          }
        }

        // Normalize SDK message
        const normalized = normalizeSDKMessage(message, capturedSessionId || options.sessionId || 'unknown')

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
        sessionId: capturedSessionId || options.sessionId || 'unknown',
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
        sessionId: capturedSessionId || options.sessionId || 'unknown',
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
  models: ['sonnet', 'opus', 'haiku'],
  supportsPermissions: true,
  supportsImages: true,
  supportsInterrupt: true,
}
