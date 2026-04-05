import type { SkillInvocation, ChatMessage, StreamActivity } from '~/types'

export function useChat() {
  const messages = useState<ChatMessage[]>('chat-messages', () => [])
  const isStreaming = ref(false)
  const sessionId = useState<string | null>('chat-session', () => null)
  const error = ref<string | null>(null)
  const activity = ref<StreamActivity>(null)

  const isPanelOpen = useState<boolean>('chat-panel-open', () => false)
  const activeAgent = useState<{ slug: string; name: string; color?: string } | null>('chat-active-agent', () => null)
  const selectedOutputStyleId = useState('chat-active-output-style-id', () => 'default')
  const pendingInput = useState<string>('chat-pending-input', () => '')

  let abortController: AbortController | null = null

  function addMessage(role: 'user' | 'assistant', content: string): ChatMessage {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      timestamp: Date.now(),
    }
    messages.value.push(msg)
    return msg
  }

  function updateMessage(id: string, updates: Partial<ChatMessage>) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) {
      messages.value[idx] = Object.assign({}, messages.value[idx], updates)
    }
  }

  const usedTools = ref(false)

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming.value) return

    error.value = null
    usedTools.value = false
    addMessage('user', content)

    // Parse slash command
    let invoke: SkillInvocation | undefined
    const trimmed = content.trim()
    if (trimmed.startsWith('/')) {
      const withoutSlash = trimmed.slice(1)
      const spaceIdx = withoutSlash.indexOf(' ')
      if (spaceIdx === -1) {
        invoke = { skill: withoutSlash, args: null }
      } else {
        invoke = {
          skill: withoutSlash.slice(0, spaceIdx),
          args: withoutSlash.slice(spaceIdx + 1).trim() || null,
        }
      }
    }

    const { workingDir } = useWorkingDir()

    const assistantMsg = addMessage('assistant', '')
    isStreaming.value = true
    activity.value = null

    abortController = new AbortController()

    try {
      const response = await $fetch<ReadableStream>('/api/chat', {
        method: 'POST',
        body: {
          messages: messages.value
            .filter(m => m.content)
            .map(m => ({ role: m.role, content: m.content })),
          sessionId: sessionId.value,
          ...(invoke ? { invoke } : {}),
          ...(activeAgent.value ? { agentSlug: activeAgent.value.slug } : {}),
          outputStyleId: selectedOutputStyleId.value,
          ...(workingDir.value ? { projectDir: workingDir.value } : {}),
        },
        signal: abortController.signal,
        responseType: 'stream',
      })

      const reader = (response as unknown as ReadableStream).getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedText = ''
      let streamedThinking = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'session') {
              sessionId.value = data.sessionId
            } else if (data.type === 'thinking_start') {
              activity.value = { type: 'thinking' }
              streamedThinking = ''
            } else if (data.type === 'thinking_delta') {
              streamedThinking += data.text
              activity.value = { type: 'thinking' }
              updateMessage(assistantMsg.id, { thinking: streamedThinking })
            } else if (data.type === 'text_delta') {
              streamedText += data.text
              activity.value = { type: 'writing' }
              updateMessage(assistantMsg.id, { content: streamedText })
            } else if (data.type === 'tool_progress') {
              usedTools.value = true
              activity.value = { type: 'tool', name: data.toolName, elapsed: data.elapsed }
            } else if (data.type === 'tool_call') {
              usedTools.value = true
              const current = messages.value.find(m => m.id === assistantMsg.id)
              const toolCalls = [...(current?.toolCalls || []), { id: data.id, toolName: data.toolName, input: data.input }]
              updateMessage(assistantMsg.id, { toolCalls })
            } else if (data.type === 'tool_result') {
              const current = messages.value.find(m => m.id === assistantMsg.id)
              const toolResults = [...(current?.toolResults || []), { id: data.id, toolName: data.toolName, result: data.result, isError: data.isError }]
              updateMessage(assistantMsg.id, { toolResults })
            } else if (data.type === 'result') {
              updateMessage(assistantMsg.id, { content: data.text })
            } else if (data.type === 'error') {
              error.value = data.message
            } else if (data.type === 'done') {
              sessionId.value = data.sessionId
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      error.value = err instanceof Error ? err.message : 'Failed to send message'
    } finally {
      isStreaming.value = false
      activity.value = null
      abortController = null
    }
  }

  function stopStreaming() {
    abortController?.abort()
    isStreaming.value = false
    activity.value = null
  }

  function clearChat() {
    messages.value = []
    sessionId.value = null
    error.value = null
    activity.value = null
  }

  function startWithPrompt(prompt: string) {
    clearChat()
    nextTick(() => sendMessage(prompt))
  }

  function startAgentChat(agent: { slug: string; name: string; color?: string }) {
    activeAgent.value = agent
    clearChat()
    isPanelOpen.value = true
  }

  function prefillSkill(skillName: string) {
    pendingInput.value = `/${skillName} `
    isPanelOpen.value = true
  }

  function clearAgent() {
    activeAgent.value = null
  }

  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    activity: readonly(activity),
    sessionId: readonly(sessionId),
    usedTools: readonly(usedTools),
    isPanelOpen,
    activeAgent: readonly(activeAgent),
    pendingInput,
    sendMessage,
    stopStreaming,
    clearChat,
    startWithPrompt,
    startAgentChat,
    prefillSkill,
    clearAgent,
  }
}
