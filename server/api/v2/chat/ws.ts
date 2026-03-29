import type { Peer } from 'crossws'
import { providerRegistry } from '../../../utils/providers/registry'
import { saveMessageToSession } from '../../../utils/chatSessionStorage'
import type { ChatV2WebSocketMessage, NormalizedMessage } from '~/types'

// Store pending permissions for permission responses
const pendingPermissions = new Map<string, { sessionId: string; peer: Peer }>()

export default defineWebSocketHandler({
  open(peer: Peer) {
    console.log('[Chat v2 WS] Client connected', peer.id)

    peer.send(JSON.stringify({
      type: 'connected',
    }))
  },

  async message(peer: Peer, message) {
    try {
      const msg: ChatV2WebSocketMessage = JSON.parse(message.text())

      switch (msg.type) {
        case 'start': {
          const providerName = msg.provider || 'claude'
          const provider = providerRegistry.get(providerName)

          if (!provider) {
            peer.send(JSON.stringify({
              kind: 'error',
              id: `error-${Date.now()}`,
              sessionId: msg.sessionId || peer.id,
              timestamp: new Date().toISOString(),
              content: `Provider '${providerName}' not found`,
              isError: true,
            }))
            return
          }

          // Create user message for immediate display
          // Note: We don't save the user message here - the provider will save it
          // with the correct sessionId (SDK's session_id for new sessions)
          const userMessage: NormalizedMessage = {
            kind: 'text',
            id: `user-${Date.now()}`,
            sessionId: msg.sessionId || 'pending', // Will be updated by session_created event
            timestamp: new Date().toISOString(),
            role: 'user',
            content: msg.message,
            images: msg.images,
            provider: providerName,
            metadata: {
              agentSlug: msg.agentSlug,
              workingDir: msg.workingDir,
              permissionMode: msg.permissionMode,
            },
          }

          // Send user message back to client for immediate display
          // The client will update the sessionId when it receives session_created
          peer.send(JSON.stringify(userMessage))

          // Load agent instructions if agent specified
          let agentInstructions: string | undefined
          if (msg.agentSlug && provider.loadAgentInstructions) {
            const instructions = await provider.loadAgentInstructions(msg.agentSlug)
            if (instructions) {
              agentInstructions = instructions
            }
          }

          // Query provider - provider will handle saving all messages with correct sessionId
          await provider.query(
            msg.message,
            {
              sessionId: msg.sessionId,
              agentSlug: msg.agentSlug,
              agentInstructions,
              workingDir: msg.workingDir,
              permissionMode: msg.permissionMode,
              model: msg.model,
              thinkingEnabled: msg.thinkingEnabled,
              images: msg.images,
              // Pass user message for provider to save with correct sessionId
              userMessage,
            },
            peer
          )

          break
        }

        case 'abort': {
          // Try to interrupt with all providers (start with default)
          const provider = providerRegistry.getDefault()
          const interrupted = await provider.interrupt(msg.sessionId)

          if (interrupted) {
            peer.send(JSON.stringify({
              kind: 'status',
              id: `status-${Date.now()}`,
              sessionId: msg.sessionId,
              timestamp: new Date().toISOString(),
              content: 'Interrupted',
            }))
          }

          break
        }

        case 'permission_response': {
          const permissionInfo = pendingPermissions.get(msg.permissionId)

          if (permissionInfo) {
            const provider = providerRegistry.getDefault()

            if (provider.respondToPermission) {
              await provider.respondToPermission(msg.permissionId, msg.decision)
            }

            pendingPermissions.delete(msg.permissionId)

            peer.send(JSON.stringify({
              kind: 'status',
              id: `status-${Date.now()}`,
              sessionId: permissionInfo.sessionId,
              timestamp: new Date().toISOString(),
              content: `Permission ${msg.decision === 'allow' ? 'granted' : 'denied'}`,
            }))
          } else {
            peer.send(JSON.stringify({
              kind: 'error',
              id: `error-${Date.now()}`,
              sessionId: peer.id,
              timestamp: new Date().toISOString(),
              content: `Permission request '${msg.permissionId}' not found or expired`,
              isError: true,
            }))
          }

          break
        }

        case 'interactive_response': {
          // Handle interactive prompt responses (future feature)
          console.log('[Chat v2 WS] Interactive response:', msg.promptId, msg.value)
          break
        }

        default: {
          peer.send(JSON.stringify({
            kind: 'error',
            id: `error-${Date.now()}`,
            sessionId: peer.id,
            timestamp: new Date().toISOString(),
            content: `Unknown message type: ${(msg as any).type}`,
            isError: true,
          }))
        }
      }
    } catch (error: any) {
      console.error('[Chat v2 WS] Error handling message:', error)
      peer.send(JSON.stringify({
        kind: 'error',
        id: `error-${Date.now()}`,
        sessionId: peer.id,
        timestamp: new Date().toISOString(),
        content: error.message || 'Internal server error',
        isError: true,
      }))
    }
  },

  close(peer: Peer) {
    console.log('[Chat v2 WS] Client disconnected', peer.id)

    // Clean up any pending permissions for this peer
    for (const [permissionId, info] of pendingPermissions) {
      if (info.peer === peer) {
        pendingPermissions.delete(permissionId)
      }
    }
  },

  error(peer: Peer, error) {
    console.error('[Chat v2 WS] Error:', error)
  },
})

/**
 * Register a pending permission (called from provider when permission is requested)
 */
export function registerPendingPermission(permissionId: string, sessionId: string, peer: Peer) {
  pendingPermissions.set(permissionId, { sessionId, peer })

  // Auto-expire after 5 minutes
  setTimeout(() => {
    if (pendingPermissions.has(permissionId)) {
      pendingPermissions.delete(permissionId)
      peer.send(JSON.stringify({
        type: 'permission_expired',
        permissionId,
      }))
    }
  }, 5 * 60 * 1000)
}
