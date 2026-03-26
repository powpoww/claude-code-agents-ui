/**
 * Chat v2 real-time handler composable.
 * Integrates WebSocket communication, streaming buffer, and permissions.
 */

import type {
  ChatV2WebSocketMessage,
  ChatV2WebSocketEvent,
  NormalizedMessage,
  PermissionMode,
} from '~/types'
import { useStreamingBuffer } from './useStreamingBuffer'
import { usePermissions } from './usePermissions'
import { useSessionStore } from './useSessionStore'

export function useChatV2Handler() {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const error = ref<string | null>(null)
  const currentSessionId = ref<string | null>(null)

  // Integrate streaming buffer
  const streamingBuffer = useStreamingBuffer()

  // Integrate permissions
  const permissions = usePermissions()

  // Session store for message persistence
  const sessionStore = useSessionStore()

  // Reconnection logic
  let reconnectTimer: NodeJS.Timeout | null = null
  const RECONNECT_DELAY = 3000

  /**
   * Connect to Chat v2 WebSocket
   */
  function connect() {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      console.log('[ChatV2] Already connected')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/v2/chat/ws`

    console.log('[ChatV2] Connecting to:', wsUrl)

    ws.value = new WebSocket(wsUrl)

    ws.value.onopen = () => {
      console.log('[ChatV2] Connected')
      isConnected.value = true
      error.value = null
    }

    ws.value.onmessage = (event) => {
      try {
        const data: ChatV2WebSocketEvent = JSON.parse(event.data)
        handleEvent(data)
      } catch (e) {
        console.error('[ChatV2] Error parsing message:', e)
      }
    }

    ws.value.onerror = (event) => {
      console.error('[ChatV2] Error:', event)
      error.value = 'WebSocket connection error'
    }

    ws.value.onclose = () => {
      console.log('[ChatV2] Disconnected')
      isConnected.value = false
      streamingBuffer.reset()

      // Auto-reconnect after delay
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, RECONNECT_DELAY)
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    isConnected.value = false
    streamingBuffer.reset()
  }

  /**
   * Send a WebSocket message
   */
  function sendMessage(message: ChatV2WebSocketMessage): boolean {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      error.value = 'WebSocket not connected'
      return false
    }

    try {
      ws.value.send(JSON.stringify(message))
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to send message'
      return false
    }
  }

  /**
   * Handle incoming WebSocket events
   */
  function handleEvent(event: ChatV2WebSocketEvent) {
    // Handle connection events
    if ('type' in event) {
      switch (event.type) {
        case 'connected':
          console.log('[ChatV2] WebSocket connected')
          return
        case 'disconnected':
          isConnected.value = false
          return
        case 'permission_expired':
          permissions.removePending(event.permissionId)
          return
      }
    }

    // Handle normalized messages
    if ('kind' in event) {
      handleNormalizedMessage(event as NormalizedMessage)
    }
  }

  /**
   * Handle normalized messages
   */
  function handleNormalizedMessage(message: NormalizedMessage) {
    const sessionId = message.sessionId

    switch (message.kind) {
      case 'session_created':
        currentSessionId.value = message.newSessionId || message.content || null
        sessionStore.setActiveSession(currentSessionId.value)
        break

      case 'stream_delta':
        streamingBuffer.handleStreamDelta(message)
        // Also update session store for realtime display
        if (sessionId) {
          sessionStore.updateStreaming(sessionId, streamingBuffer.accumulatedText.value)
        }
        break

      case 'stream_end':
        const finalText = streamingBuffer.handleStreamEnd(message)
        // Finalize streaming in session store
        if (sessionId) {
          sessionStore.finalizeStreaming(sessionId)
        }
        break

      case 'text':
      case 'tool_use':
      case 'tool_result':
      case 'thinking':
        // Add to session store for display
        if (sessionId) {
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'permission_request':
        // Add to permissions
        const permission = permissions.createFromMessage(message)
        permissions.addPending(permission)
        // Also add to session store
        if (sessionId) {
          sessionStore.addPermission(sessionId, permission)
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'permission_cancelled':
        // Remove from permissions
        if (message.requestId) {
          permissions.removePending(message.requestId)
          if (sessionId) {
            sessionStore.removePermission(sessionId, message.requestId)
          }
        }
        break

      case 'interactive_prompt':
      case 'task_notification':
        // Add to session store for display
        if (sessionId) {
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'complete':
        // Query complete
        if (sessionId) {
          sessionStore.setStatus(sessionId, 'idle')
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'error':
        error.value = message.content || 'An error occurred'
        if (sessionId) {
          sessionStore.setStatus(sessionId, 'error')
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'status':
        // Status updates (like "Thinking...")
        // Optionally display but don't persist
        break

      default:
        console.log('[ChatV2] Unknown message kind:', (message as any).kind)
    }
  }

  /**
   * Send a chat message
   */
  function sendChat(
    text: string,
    options: {
      sessionId?: string
      agentSlug?: string
      workingDir?: string
      provider?: string
      permissionMode?: PermissionMode
      images?: string[]
    } = {}
  ): boolean {
    const message: ChatV2WebSocketMessage = {
      type: 'start',
      message: text,
      sessionId: options.sessionId || currentSessionId.value || undefined,
      agentSlug: options.agentSlug,
      workingDir: options.workingDir,
      provider: options.provider,
      permissionMode: options.permissionMode || permissions.permissionMode.value,
      images: options.images,
    }

    return sendMessage(message)
  }

  /**
   * Abort current query
   */
  function abort(sessionId?: string): boolean {
    const sid = sessionId || currentSessionId.value
    if (!sid) return false

    const message: ChatV2WebSocketMessage = {
      type: 'abort',
      sessionId: sid,
    }

    return sendMessage(message)
  }

  /**
   * Respond to a permission request
   */
  function respondToPermission(
    permissionId: string,
    decision: 'allow' | 'deny',
    remember = false
  ): boolean {
    const message: ChatV2WebSocketMessage = {
      type: 'permission_response',
      permissionId,
      decision,
      remember,
    }

    return sendMessage(message)
  }

  /**
   * Respond to an interactive prompt
   */
  function respondToPrompt(promptId: string, value: string): boolean {
    const message: ChatV2WebSocketMessage = {
      type: 'interactive_response',
      promptId,
      value,
    }

    return sendMessage(message)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    // State
    isConnected: readonly(isConnected),
    error: readonly(error),
    currentSessionId: readonly(currentSessionId),

    // Streaming state
    isStreaming: streamingBuffer.isStreaming,
    streamingText: streamingBuffer.accumulatedText,

    // Permissions
    permissions,
    hasPendingPermissions: permissions.hasPending,

    // Actions
    connect,
    disconnect,
    sendChat,
    abort,
    respondToPermission,
    respondToPrompt,

    // Session store access
    sessionStore,
  }
}
