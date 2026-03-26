<script setup lang="ts">
import type { Agent } from '~/types'

const route = useRoute()
const router = useRouter()

// If accessing /cli without session in chat mode, redirect will happen in ChatInterface
// This page is primarily for terminal mode now

const { agents } = useAgents()
const {
  selectedAgent,
  mode,
  executionOptions,
  canExecute,
  statusInfo,
  setAgent,
  toggleMode,
  workingDirectory,
  setWorkingDirectory,
} = useCliExecution()

// CLI Mode: 'chatv2' only (Terminal and Chat v1 disabled)
const cliMode = ref<'chatv2'>('chatv2')

const showAgentSelector = ref(false)

// Sidebar state
const showSidebar = ref(false)

// Debug: Watch showAgentSelector changes
watch(() => showAgentSelector.value, (newVal) => {
  console.log('[CLI] showAgentSelector changed:', newVal)
})

function selectAgent(agent: Agent | null) {
  console.log('[CLI] Selecting agent and closing modal:', agent?.frontmatter?.name || 'null')
  setAgent(agent)
  showAgentSelector.value = false
}

// Close modals when navigating away from this page
watch(() => route.path, (newPath) => {
  if (newPath !== '/cli') {
    showAgentSelector.value = false
  }
})

// Also close on unmount (in case component is destroyed)
onBeforeUnmount(() => {
  showAgentSelector.value = false
})

const title = computed(() => {
  if (mode.value === 'agent' && selectedAgent.value) {
    return `Claude Code - ${selectedAgent.value.frontmatter.name}`
  }
  return 'Claude Code - Standalone'
})

useHead({
  title: title.value,
})
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <!-- Top bar -->
    <div class="shrink-0 flex items-center justify-between px-6 py-3 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-3">
        <!-- Mode Badge (Chat v2 only) -->
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium" style="background: var(--accent); color: white;">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
          Chat v2
        </div>

        <!-- Mode Badge -->
        <div class="flex items-center gap-2 px-2 py-1 rounded-lg text-[12px] font-medium" :style="{ background: `${statusInfo.color}15`, color: statusInfo.color }">
          <div class="size-1.5 rounded-full" :style="{ background: statusInfo.color }" />
          {{ statusInfo.label }}
        </div>

        <!-- Working Directory -->
        <DirectoryPicker
          :model-value="workingDirectory"
          @update:model-value="setWorkingDirectory"
        />
      </div>

      <div class="flex items-center gap-2">
        <!-- Sidebar Toggle -->
        <button
          class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          :style="{
            background: showSidebar ? 'var(--accent)' : 'var(--surface-raised)',
            color: showSidebar ? 'white' : 'var(--text-secondary)',
            border: showSidebar ? 'none' : '1px solid var(--border-subtle)',
          }"
          @click="showSidebar = !showSidebar"
        >
          <UIcon name="i-lucide-panel-right" class="size-3 inline-block mr-1" />
          Context
        </button>

        <!-- Mode Toggle -->
        <button
          class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
          @click="toggleMode"
        >
          <UIcon :name="mode === 'agent' ? 'i-lucide-cpu' : 'i-lucide-terminal-square'" class="size-3 inline-block mr-1" />
          {{ mode === 'agent' ? 'Switch to Standalone' : 'Switch to Agent Mode' }}
        </button>

        <!-- Agent Selector (only in agent mode) -->
        <button
          v-if="mode === 'agent'"
          class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          style="background: var(--accent); color: white;"
          @click="showAgentSelector = !showAgentSelector"
        >
          <UIcon name="i-lucide-cpu" class="size-3 inline-block mr-1" />
          {{ selectedAgent ? selectedAgent.frontmatter.name : 'Select Agent' }}
        </button>
      </div>
    </div>

    <!-- Agent Selector Modal -->
    <div
      v-if="showAgentSelector"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      @click.self="showAgentSelector = false"
    >
      <div class="w-[500px] max-h-[600px] overflow-auto p-6 rounded-xl shadow-xl" style="background: var(--surface);">
        <h3 class="text-[14px] font-semibold mb-3" style="color: var(--text-primary);">Select Agent</h3>

        <button
          class="w-full text-left px-3 py-2 rounded-lg text-[13px] mb-2 hover-bg"
          style="background: var(--surface-raised); color: var(--text-secondary);"
          @click="selectAgent(null)"
        >
          <UIcon name="i-lucide-x" class="size-4 inline-block mr-2" />
          None (Standalone Mode)
        </button>

        <div v-for="agent in agents" :key="agent.slug" class="mb-2">
          <button
            class="w-full text-left px-3 py-2 rounded-lg text-[13px] hover-bg flex items-center gap-2"
            :style="{
              background: selectedAgent?.slug === agent.slug ? `${agent.frontmatter.color || '#3b82f6'}15` : 'var(--surface-raised)',
              color: selectedAgent?.slug === agent.slug ? (agent.frontmatter.color || '#3b82f6') : 'var(--text-primary)',
            }"
            @click="selectAgent(agent)"
          >
            <div class="size-2 rounded-full" :style="{ background: agent.frontmatter.color || '#3b82f6' }" />
            <span class="font-medium">{{ agent.frontmatter.name }}</span>
            <span class="text-[11px] opacity-70">{{ agent.frontmatter.description }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex min-h-0 relative">
      <!-- Chat v2 Interface -->
      <div class="flex-1 flex flex-col">
        <ChatV2Interface :execution-options="executionOptions" />
      </div>

      <!-- Sidebar Overlay -->
      <Transition name="sidebar">
        <div
          v-if="showSidebar"
          class="absolute top-0 right-0 bottom-0 w-[400px] flex flex-col border-l shadow-xl"
          style="background: var(--surface); border-color: var(--border-subtle); z-index: 10;"
        >
          <!-- Close button -->
          <div class="shrink-0 flex items-center justify-between px-4 py-2 border-b" style="border-color: var(--border-subtle);">
            <h2 class="text-[13px] font-semibold" style="color: var(--text-primary);">
              Context Monitoring
            </h2>
            <button
              class="p-1 rounded-lg hover:bg-[var(--surface-raised)] transition-all"
              @click="showSidebar = false"
            >
              <UIcon name="i-lucide-x" class="size-4" style="color: var(--text-secondary);" />
            </button>
          </div>

          <!-- Context Panel -->
          <div class="flex-1 flex flex-col min-h-0">
            <ContextPanel />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition: transform 0.3s ease-out;
}

.sidebar-enter-from {
  transform: translateX(100%);
}

.sidebar-leave-to {
  transform: translateX(100%);
}
</style>
