<script setup lang="ts">
import { DND_PROJECT, DND_CATEGORY } from '~/utils/dnd'

const props = defineProps<{
  name: string
  projectCount: number
  hiddenCount?: number
  expanded: boolean
  isDropTarget?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'rename', newName: string): void
  (e: 'delete'): void
  (e: 'drop-project', projectName: string): void
  (e: 'drop-reorder', dragName: string): void
}>()

const isEditing = ref(false)
const editValue = ref('')
const isDragOver = ref(false)

function startRename(ev: Event) {
  ev.preventDefault(); ev.stopPropagation()
  editValue.value = props.name
  isEditing.value = true
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-rename-input="${props.name}"]`)
    input?.focus(); input?.select()
  })
}

function commitRename() {
  const next = editValue.value.trim()
  if (next && next !== props.name) emit('rename', next)
  isEditing.value = false
}

function cancelRename() {
  isEditing.value = false
}

function onDragOver(ev: DragEvent) {
  ev.preventDefault()
  isDragOver.value = true
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
}

function onDragLeave() { isDragOver.value = false }

function onDrop(ev: DragEvent) {
  ev.preventDefault()
  isDragOver.value = false
  const projectName = ev.dataTransfer?.getData(DND_PROJECT)
  if (projectName) {
    emit('drop-project', projectName)
    return
  }
  const reorderName = ev.dataTransfer?.getData(DND_CATEGORY)
  if (reorderName) emit('drop-reorder', reorderName)
}

function onCategoryDragStart(ev: DragEvent) {
  if (!ev.dataTransfer) return
  ev.dataTransfer.setData(DND_CATEGORY, props.name)
  ev.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="flex items-center gap-2 py-1.5 px-2 rounded-md select-none transition-colors"
    :class="{ 'bg-accent-muted': isDragOver }"
    draggable="true"
    @dragstart="onCategoryDragStart"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="emit('toggle')"
  >
    <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5 shrink-0" style="color: var(--text-tertiary);" />
    <UIcon name="i-lucide-folder" class="size-4 shrink-0" style="color: var(--accent);" />
    <input
      v-if="isEditing"
      v-model="editValue"
      :data-rename-input="name"
      class="text-[13px] font-semibold flex-1 px-1 rounded outline-none"
      style="background: var(--surface-base); border: 1px solid var(--accent);"
      @click.stop
      @keydown.enter="commitRename"
      @keydown.esc="cancelRename"
      @blur="commitRename"
    />
    <span v-else class="text-[13px] font-semibold flex-1 truncate" style="color: var(--text-primary);">
      {{ name }}
    </span>
    <span class="text-[11px] tabular-nums" style="color: var(--text-tertiary);">
      {{ projectCount }}<span v-if="hiddenCount" class="ml-1">({{ hiddenCount }} hidden)</span>
    </span>
    <button
      class="size-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover-bg"
      title="Rename"
      style="color: var(--text-secondary);"
      @click.stop="startRename"
    >
      <UIcon name="i-lucide-pencil" class="size-3.5" />
    </button>
    <button
      class="size-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover-bg"
      title="Delete"
      style="color: var(--text-secondary);"
      @click.stop="emit('delete')"
    >
      <UIcon name="i-lucide-trash-2" class="size-3.5" />
    </button>
  </div>
</template>
