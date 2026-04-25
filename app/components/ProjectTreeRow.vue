<script setup lang="ts">
import { formatRelativeTime } from '~/utils/messageFormatting'
import { DND_PROJECT } from '~/utils/dnd'

interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
  hidden?: boolean
  category?: string
}

const props = defineProps<{
  project: ClaudeCodeProject
  indent?: number
}>()

const emit = defineEmits<{
  (e: 'toggle-hidden', project: ClaudeCodeProject): void
}>()

function onDragStart(ev: DragEvent) {
  if (!ev.dataTransfer) return
  ev.dataTransfer.setData(DND_PROJECT, props.project.name)
  ev.dataTransfer.effectAllowed = 'move'
}

function onToggleHidden(ev: Event) {
  ev.preventDefault(); ev.stopPropagation()
  emit('toggle-hidden', props.project)
}
</script>

<template>
  <NuxtLink
    :to="`/project-artifacts/${encodeURIComponent(project.name)}`"
    class="group flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors hover-bg"
    :class="{ 'opacity-50': project.hidden }"
    :style="{ paddingLeft: `${(indent ?? 0) * 16 + 8}px`, cursor: 'grab' }"
    draggable="true"
    @dragstart="onDragStart"
  >
    <UIcon name="i-lucide-grip-vertical" class="size-3.5 opacity-0 group-hover:opacity-100" style="color: var(--text-tertiary);" />
    <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" style="color: var(--text-tertiary);" />
    <div class="flex-1 min-w-0">
      <span class="text-[13px] font-medium" style="color: var(--text-primary);">
        {{ project.displayName }}
      </span>
      <span class="text-[10px] ml-2 font-mono truncate" style="color: var(--text-tertiary);" :title="project.path">
        {{ project.path }}
      </span>
    </div>
    <span class="text-[10px] tabular-nums" style="color: var(--text-tertiary);">
      {{ formatRelativeTime(project.lastActivity) || '—' }}
    </span>
    <NuxtLink
      :to="`/cli/project/${encodeURIComponent(project.name)}`"
      @click.stop
      class="text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
      style="background: var(--accent-muted); color: var(--accent);"
      title="Open in CLI"
    >
      CLI
    </NuxtLink>
    <button
      class="size-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover-bg"
      :title="project.hidden ? 'Show' : 'Hide'"
      style="color: var(--text-secondary);"
      @click="onToggleHidden"
    >
      <UIcon :name="project.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="size-3.5" />
    </button>
  </NuxtLink>
</template>
