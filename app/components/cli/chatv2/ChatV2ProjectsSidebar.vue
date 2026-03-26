<script setup lang="ts">
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'

const emit = defineEmits<{
  (e: 'sessionSelected', payload: { projectName: string; sessionId: string }): void
  (e: 'newChat'): void
  (e: 'selectionCleared'): void
  (e: 'toggleCollapse'): void
}>()

const props = defineProps<{
  collapsed: boolean
  currentSessionId?: string | null
  initialProjectName?: string | null
  initialSessionId?: string | null
}>()

const {
  projects,
  sessions,
  selectedProject,
  selectedSession,
  isLoadingProjects,
  isLoadingSessions,
  sessionsHasMore,
  fetchProjects,
  selectProject,
  selectSession,
  loadMoreSessions,
  clearSelection,
  fetchSessions
} = useClaudeCodeHistory()

// View mode: 'projects' or 'sessions'
const viewMode = ref<'projects' | 'sessions'>('projects')

// Restore selection from initial props
async function restoreSelectionFromProps() {
  if (props.initialProjectName && props.initialSessionId) {
    // Wait for projects to be loaded if they aren't yet
    if (projects.value.length === 0) {
      await fetchProjects()
    }

    const project = projects.value.find(p => p.name === props.initialProjectName)
    if (project) {
      await selectProject(project)
      viewMode.value = 'sessions'

      // Wait for sessions to load
      await new Promise(resolve => setTimeout(resolve, 150))

      // Try to find and select the session
      const session = sessions.value.find(s => s.id === props.initialSessionId)
      if (session) {
        selectSession(session)
      }

      // Always emit event to load messages (even if session not found in list)
      emit('sessionSelected', {
        projectName: project.name,
        sessionId: props.initialSessionId
      })
    }
  }
}

// Load projects on mount and restore selection from URL
onMounted(async () => {
  await fetchProjects()
  await restoreSelectionFromProps()
})

// Watch for prop changes (browser back/forward)
watch(
  () => ({ project: props.initialProjectName, session: props.initialSessionId }),
  async (newVal, oldVal) => {
    // Only react if values actually changed
    if (newVal.project !== oldVal?.project || newVal.session !== oldVal?.session) {
      if (newVal.project && newVal.session) {
        await restoreSelectionFromProps()
      } else if (!newVal.project && !newVal.session) {
        // Props cleared, go back to projects view
        viewMode.value = 'projects'
        clearSelection()
      }
    }
  },
  { deep: true }
)

// Handle project click
async function handleProjectClick(project: typeof projects.value[0]) {
  await selectProject(project)
  viewMode.value = 'sessions'
}

// Handle session click
function handleSessionClick(session: typeof sessions.value[0]) {
  selectSession(session)
  if (selectedProject.value) {
    emit('sessionSelected', {
      projectName: selectedProject.value.name,
      sessionId: session.id
    })
  }
}

// Go back to projects list
function goBackToProjects() {
  viewMode.value = 'projects'
  clearSelection()
  emit('selectionCleared')
}

// Format relative time
function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return ''

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

// Truncate text
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Sidebar Header -->
    <div class="shrink-0 px-3 py-2 border-b flex items-center gap-2" style="border-color: var(--border-subtle);">
      <template v-if="!collapsed">
        <!-- Back button when viewing sessions -->
        <button
          v-if="viewMode === 'sessions'"
          class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
          style="background: var(--surface-raised);"
          @click="goBackToProjects"
          title="Back to projects"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" style="color: var(--text-secondary);" />
        </button>

        <div class="flex-1 min-w-0">
          <h3 class="text-[14px] font-semibold truncate" style="color: var(--text-primary);">
            {{ viewMode === 'projects' ? 'Claude Code History' : selectedProject?.displayName || 'Sessions' }}
          </h3>
          <p v-if="viewMode === 'sessions' && selectedProject" class="text-[10px] truncate" style="color: var(--text-tertiary);">
            {{ selectedProject.path }}
          </p>
        </div>
      </template>

      <!-- Toggle button (always visible) -->
      <button
        class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
        :class="{ 'ml-auto': !collapsed }"
        style="background: var(--surface-raised);"
        @click="emit('toggleCollapse')"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <UIcon
          :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          class="size-4"
          style="color: var(--text-secondary);"
        />
      </button>
    </div>

    <!-- Sidebar Content -->
    <template v-if="!collapsed">
      <!-- New Chat Button -->
      <div class="shrink-0 p-2 border-b" style="border-color: var(--border-subtle);">
        <button
          class="w-full px-3 py-2 rounded-lg text-[12px] font-medium hover-bg transition-all flex items-center justify-center gap-2"
          style="background: var(--accent); color: white;"
          @click="emit('newChat')"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
          New Chat
        </button>
      </div>

      <!-- Projects List -->
      <div v-if="viewMode === 'projects'" class="flex-1 overflow-y-auto p-2 space-y-1">
        <!-- Loading state -->
        <div v-if="isLoadingProjects" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
        </div>

        <!-- Projects -->
        <div
          v-for="project in projects"
          :key="project.name"
          class="px-3 py-2.5 rounded-lg cursor-pointer transition-all hover-bg group"
          style="background: var(--surface-raised);"
          @click="handleProjectClick(project)"
        >
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" style="color: var(--accent);" />
            <span class="text-[12px] font-medium truncate flex-1" style="color: var(--text-primary);">
              {{ project.displayName }}
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style="color: var(--text-tertiary);"
            />
          </div>
          <div class="flex items-center gap-2 text-[10px]" style="color: var(--text-tertiary);">
            <span>{{ project.sessionCount }} sessions</span>
            <span v-if="project.lastActivity">{{ formatRelativeTime(project.lastActivity) }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="projects.length === 0 && !isLoadingProjects" class="text-center py-8">
          <UIcon name="i-lucide-folder-x" class="size-10 mx-auto mb-3" style="color: var(--text-disabled);" />
          <p class="text-[12px]" style="color: var(--text-secondary);">No Claude Code projects found</p>
          <p class="text-[10px] mt-1" style="color: var(--text-tertiary);">
            Projects appear after using Claude Code CLI
          </p>
        </div>
      </div>

      <!-- Sessions List -->
      <div v-else-if="viewMode === 'sessions'" class="flex-1 overflow-y-auto p-2 space-y-1">
        <!-- Loading state -->
        <div v-if="isLoadingSessions" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
        </div>

        <!-- Sessions -->
        <template v-else>
          <div
            v-for="session in sessions"
            :key="session.id"
            class="px-3 py-2.5 rounded-lg cursor-pointer transition-all hover-bg"
            :style="{
              background: selectedSession?.id === session.id || currentSessionId === session.id
                ? 'var(--accent-light)'
                : 'var(--surface-raised)',
              borderLeft: selectedSession?.id === session.id || currentSessionId === session.id
                ? '3px solid var(--accent)'
                : '3px solid transparent'
            }"
            @click="handleSessionClick(session)"
          >
            <div class="text-[12px] font-medium truncate mb-1" style="color: var(--text-primary);">
              {{ truncate(session.summary, 60) }}
            </div>
            <div class="flex items-center gap-2 text-[10px]" style="color: var(--text-tertiary);">
              <span>{{ session.messageCount }} messages</span>
              <span>{{ formatRelativeTime(session.lastActivity) }}</span>
            </div>
            <div v-if="session.isGrouped" class="mt-1">
              <span class="text-[9px] px-1.5 py-0.5 rounded" style="background: var(--accent-light); color: var(--accent);">
                {{ session.groupSize }} related sessions
              </span>
            </div>
          </div>

          <!-- Load more button -->
          <button
            v-if="sessionsHasMore && !isLoadingSessions"
            class="w-full px-3 py-2 rounded-lg text-[11px] font-medium hover-bg transition-all mt-2"
            style="background: var(--surface-raised); color: var(--text-secondary);"
            @click="loadMoreSessions"
          >
            Load more sessions
          </button>

          <!-- Empty state -->
          <div v-if="sessions.length === 0" class="text-center py-8">
            <p class="text-[12px]" style="color: var(--text-secondary);">No sessions in this project</p>
          </div>
        </template>
      </div>
    </template>

    <!-- Collapsed state -->
    <template v-else>
      <div class="flex-1 flex flex-col items-center gap-2 pt-3">
        <button
          class="p-2 rounded-lg transition-all"
          style="background: var(--accent);"
          title="New Chat"
          @click="emit('newChat')"
        >
          <UIcon name="i-lucide-plus" class="size-4" style="color: white;" />
        </button>
        <button
          class="p-2 rounded-lg transition-all hover-bg"
          style="background: var(--surface-raised);"
          title="Claude Code History"
        >
          <UIcon name="i-lucide-history" class="size-4" style="color: var(--text-secondary);" />
        </button>
      </div>
    </template>
  </div>
</template>
