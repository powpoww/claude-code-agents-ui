import type { Peer } from 'crossws'
import { queryClaudeChat, interruptQuery, loadAgentInstructions, cleanupQueries } from '../../utils/claudeSdk'
import { saveMessageToSession } from '../../utils/chatSessionStorage'
import type { ChatWebSocketMessage, NormalizedMessage } from '~/types'

export default defineWebSocketHandler({
  open(peer: Peer) {
    console.log('[Chat WS] Client connected', peer.id)

    // Send connected event (no sessionId - that comes when user creates/selects a session)
    peer.send(JSON.stringify({
      type: 'connected',
    }))
  },

  async message(peer: Peer, message) {
    try {
      const msg: ChatWebSocketMessage = JSON.parse(message.text())

      switch (msg.type) {
        case 'start': {
          // Create user message first
          const userMessage: NormalizedMessage = {
            kind: 'text',
            id: `user-${Date.now()}`,
            sessionId: msg.sessionId || peer.id,
            timestamp: new Date().toISOString(),
            role: 'user',
            content: msg.message,
            metadata: {
              agentSlug: msg.agentSlug,
              workingDir: msg.workingDir,
            },
          }

          // Save user message
          if (msg.sessionId) {
            await saveMessageToSession(msg.sessionId, userMessage)
          }

          // Send user message back to client for immediate display
          peer.send(JSON.stringify(userMessage))

          // Load agent instructions if agent specified
          let agentInstructions: string | undefined
          if (msg.agentSlug) {
            const instructions = await loadAgentInstructions(msg.agentSlug)
            if (instructions) {
              agentInstructions = instructions
            }
          }

          // Query Claude SDK
          await queryClaudeChat(
            msg.message,
            {
              sessionId: msg.sessionId,
              agentSlug: msg.agentSlug,
              agentInstructions,
              workingDir: msg.workingDir,
            },
            peer
          )

          break
        }

        case 'abort': {
          // Interrupt active query
          const interrupted = await interruptQuery(msg.sessionId)

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
      console.error('[Chat WS] Error handling message:', error)
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

  async close(peer: Peer) {
    console.log('[Chat WS] Client disconnected', peer.id)
    await cleanupQueries(peer.id)
  },

  error(peer: Peer, error) {
    console.error('[Chat WS] Error:', error)
  },
})
