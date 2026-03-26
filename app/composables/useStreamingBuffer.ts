/**
 * Streaming buffer composable for Chat v2.
 * Implements 100ms debounced streaming updates for better performance.
 */

import type { NormalizedMessage } from '~/types'

const DEBOUNCE_MS = 100
const MAX_BUFFER_SIZE = 1000

export function useStreamingBuffer() {
  // Buffer for incoming stream deltas
  const buffer = ref<string[]>([])

  // Accumulated text (what gets displayed)
  const accumulatedText = ref('')

  // Flush timer
  let flushTimer: NodeJS.Timeout | null = null

  // Session being streamed
  const currentSessionId = ref<string | null>(null)

  // Streaming state
  const isStreaming = ref(false)

  /**
   * Start a new streaming session
   */
  function startStreaming(sessionId: string) {
    // Reset state
    buffer.value = []
    accumulatedText.value = ''
    currentSessionId.value = sessionId
    isStreaming.value = true

    // Clear any pending flush
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  /**
   * Add a stream delta to the buffer.
   * Will be flushed after DEBOUNCE_MS.
   */
  function addDelta(delta: string) {
    if (!isStreaming.value) return

    // Add to buffer
    buffer.value.push(delta)

    // Prevent buffer overflow
    if (buffer.value.length > MAX_BUFFER_SIZE) {
      // Force flush
      flush()
      return
    }

    // Schedule flush with debounce
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flush()
      }, DEBOUNCE_MS)
    }
  }

  /**
   * Flush the buffer - combine all deltas and update accumulated text
   */
  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    if (buffer.value.length === 0) return

    // Combine buffer
    const combined = buffer.value.join('')
    buffer.value = []

    // Update accumulated text
    accumulatedText.value += combined
  }

  /**
   * End streaming session.
   * Flushes any remaining buffer and returns final text.
   */
  function endStreaming(): string {
    // Final flush
    flush()

    // Capture final text
    const finalText = accumulatedText.value

    // Reset state
    isStreaming.value = false
    currentSessionId.value = null
    accumulatedText.value = ''

    return finalText
  }

  /**
   * Handle a stream_delta message
   */
  function handleStreamDelta(message: NormalizedMessage) {
    if (message.kind !== 'stream_delta') return

    // Start streaming if not already
    if (!isStreaming.value && message.sessionId) {
      startStreaming(message.sessionId)
    }

    // Check session match
    if (currentSessionId.value && message.sessionId !== currentSessionId.value) {
      console.warn('[StreamingBuffer] Session mismatch, ignoring delta')
      return
    }

    // Add delta content
    if (message.content) {
      addDelta(message.content)
    }
  }

  /**
   * Handle a stream_end message
   */
  function handleStreamEnd(message: NormalizedMessage): string {
    if (message.kind !== 'stream_end') return ''

    // Check session match
    if (currentSessionId.value && message.sessionId !== currentSessionId.value) {
      console.warn('[StreamingBuffer] Session mismatch on stream_end')
      return ''
    }

    return endStreaming()
  }

  /**
   * Force reset (e.g., on disconnect)
   */
  function reset() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    buffer.value = []
    accumulatedText.value = ''
    currentSessionId.value = null
    isStreaming.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    reset()
  })

  return {
    // State
    isStreaming: readonly(isStreaming),
    accumulatedText: readonly(accumulatedText),
    currentSessionId: readonly(currentSessionId),

    // Actions
    startStreaming,
    addDelta,
    flush,
    endStreaming,
    handleStreamDelta,
    handleStreamEnd,
    reset,
  }
}
