/**
 * Composable for fetching Claude Code chat history
 */

interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
}

interface ClaudeCodeSession {
  id: string
  summary: string
  messageCount: number
  lastActivity: string
  cwd: string
  isGrouped?: boolean
  groupSize?: number
}

interface ClaudeCodeMessage {
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

export function useClaudeCodeHistory() {
  const projects = ref<ClaudeCodeProject[]>([])
  const sessions = ref<ClaudeCodeSession[]>([])
  const messages = ref<ClaudeCodeMessage[]>([])

  const isLoadingProjects = ref(false)
  const isLoadingSessions = ref(false)
  const isLoadingMessages = ref(false)

  const selectedProject = ref<ClaudeCodeProject | null>(null)
  const selectedSession = ref<ClaudeCodeSession | null>(null)

  const sessionsHasMore = ref(false)
  const sessionsTotal = ref(0)
  const messagesHasMore = ref(false)
  const messagesTotal = ref(0)

  /**
   * Fetch all Claude Code projects
   */
  async function fetchProjects() {
    isLoadingProjects.value = true
    try {
      const response = await $fetch<{
        projects: ClaudeCodeProject[]
        total: number
      }>('/api/v2/claude-code/projects')

      projects.value = response.projects
      return response.projects
    } catch (error) {
      console.error('Failed to fetch Claude Code projects:', error)
      projects.value = []
      return []
    } finally {
      isLoadingProjects.value = false
    }
  }

  /**
   * Fetch sessions for a specific project
   */
  async function fetchSessions(projectName: string, limit = 20, offset = 0) {
    isLoadingSessions.value = true
    try {
      const response = await $fetch<{
        sessions: ClaudeCodeSession[]
        hasMore: boolean
        total: number
        projectName: string
      }>(`/api/v2/claude-code/projects/${encodeURIComponent(projectName)}/sessions`, {
        query: { limit, offset }
      })

      if (offset === 0) {
        sessions.value = response.sessions
      } else {
        sessions.value = [...sessions.value, ...response.sessions]
      }

      sessionsHasMore.value = response.hasMore
      sessionsTotal.value = response.total
      return response.sessions
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
      if (offset === 0) {
        sessions.value = []
      }
      return []
    } finally {
      isLoadingSessions.value = false
    }
  }

  /**
   * Fetch messages for a specific session
   */
  async function fetchMessages(
    projectName: string,
    sessionId: string,
    limit: number | null = 50,
    offset = 0
  ) {
    isLoadingMessages.value = true
    try {
      const query: Record<string, any> = { offset }
      if (limit !== null) {
        query.limit = limit
      }

      const response = await $fetch<{
        messages: ClaudeCodeMessage[]
        total: number
        hasMore: boolean
        projectName: string
        sessionId: string
      }>(`/api/v2/claude-code/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/messages`, {
        query
      })

      if (offset === 0) {
        messages.value = response.messages
      } else {
        // Prepend older messages
        messages.value = [...response.messages, ...messages.value]
      }

      messagesHasMore.value = response.hasMore
      messagesTotal.value = response.total
      return response.messages
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      if (offset === 0) {
        messages.value = []
      }
      return []
    } finally {
      isLoadingMessages.value = false
    }
  }

  /**
   * Select a project and load its sessions
   */
  async function selectProject(project: ClaudeCodeProject | null) {
    selectedProject.value = project
    selectedSession.value = null
    sessions.value = []
    messages.value = []

    if (project) {
      await fetchSessions(project.name)
    }
  }

  /**
   * Select a session and load its messages
   */
  async function selectSession(session: ClaudeCodeSession | null) {
    selectedSession.value = session
    messages.value = []

    if (session && selectedProject.value) {
      await fetchMessages(selectedProject.value.name, session.id)
    }
  }

  /**
   * Load more sessions (pagination)
   */
  async function loadMoreSessions() {
    if (!selectedProject.value || !sessionsHasMore.value || isLoadingSessions.value) {
      return
    }

    await fetchSessions(selectedProject.value.name, 20, sessions.value.length)
  }

  /**
   * Load more messages (pagination)
   */
  async function loadMoreMessages() {
    if (!selectedProject.value || !selectedSession.value || !messagesHasMore.value || isLoadingMessages.value) {
      return
    }

    await fetchMessages(
      selectedProject.value.name,
      selectedSession.value.id,
      50,
      messagesTotal.value - messages.value.length
    )
  }

  /**
   * Clear selection
   */
  function clearSelection() {
    selectedProject.value = null
    selectedSession.value = null
    sessions.value = []
    messages.value = []
  }

  return {
    // State
    projects,
    sessions,
    messages,
    selectedProject,
    selectedSession,
    isLoadingProjects,
    isLoadingSessions,
    isLoadingMessages,
    sessionsHasMore,
    sessionsTotal,
    messagesHasMore,
    messagesTotal,

    // Actions
    fetchProjects,
    fetchSessions,
    fetchMessages,
    selectProject,
    selectSession,
    loadMoreSessions,
    loadMoreMessages,
    clearSelection
  }
}
