<script setup lang="ts">
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

interface ProjectCategorySummary { name: string; projectCount: number }

const props = defineProps<{
  projects: ClaudeCodeProject[]
  categories: ProjectCategorySummary[]
  showHidden: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-hidden', project: ClaudeCodeProject): void
  (e: 'rename-category', oldName: string, newName: string): void
  (e: 'delete-category', name: string): void
  (e: 'assign-project', projectName: string, category: string | null): void
  (e: 'reorder-categories', orderedNames: string[]): void
}>()

// Use string[] (not Set) so Nuxt's SSR payload can JSON-serialize it.
const expandedCategories = useState<string[]>('artifacts-expanded', () => [])

const expandedSet = computed(() => new Set(expandedCategories.value))
function isExpanded(name: string) { return expandedSet.value.has(name) }
function toggleExpand(name: string) {
  expandedCategories.value = expandedSet.value.has(name)
    ? expandedCategories.value.filter(n => n !== name)
    : [...expandedCategories.value, name]
}

// Drop stale entries when categories disappear (rename / delete / fetch).
watch(
  () => props.categories.map(c => c.name),
  (names) => {
    const live = new Set(names)
    const filtered = expandedCategories.value.filter(n => live.has(n))
    if (filtered.length !== expandedCategories.value.length) {
      expandedCategories.value = filtered
    }
  },
  { flush: 'post' },
)

const sortedProjects = computed(() => {
  const list = props.showHidden ? props.projects : props.projects.filter(p => !p.hidden)
  return [...list].sort((a, b) => {
    const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
    const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
    return bt - at
  })
})

// Pre-bucket projects per category once; turns N×C scans into O(1) lookups.
const projectsByCategory = computed(() => {
  const map = new Map<string, ClaudeCodeProject[]>()
  for (const p of sortedProjects.value) {
    if (!p.category) continue
    const list = map.get(p.category)
    if (list) list.push(p); else map.set(p.category, [p])
  }
  return map
})
const hiddenCountByCategory = computed(() => {
  const map = new Map<string, number>()
  for (const p of props.projects) {
    if (p.hidden && p.category) map.set(p.category, (map.get(p.category) ?? 0) + 1)
  }
  return map
})

const standalone = computed(() => sortedProjects.value.filter(p => !p.category))
function projectsIn(catName: string) {
  return projectsByCategory.value.get(catName) ?? []
}
function hiddenCountIn(catName: string): number {
  return hiddenCountByCategory.value.get(catName) ?? 0
}

const isRootDragOver = ref(false)
function onRootDragOver(ev: DragEvent) {
  if (!ev.dataTransfer?.types.includes(DND_PROJECT)) return
  ev.preventDefault()
  isRootDragOver.value = true
  ev.dataTransfer.dropEffect = 'move'
}
function onRootDragLeave() { isRootDragOver.value = false }
function onRootDrop(ev: DragEvent) {
  ev.preventDefault()
  isRootDragOver.value = false
  const projectName = ev.dataTransfer?.getData(DND_PROJECT)
  if (projectName) emit('assign-project', projectName, null)
}

function onCategoryReorder(targetName: string, draggedName: string) {
  if (draggedName === targetName) return
  const order = props.categories.map(c => c.name)
  const fromIdx = order.indexOf(draggedName)
  const toIdx = order.indexOf(targetName)
  if (fromIdx < 0 || toIdx < 0) return
  order.splice(fromIdx, 1)
  order.splice(toIdx, 0, draggedName)
  emit('reorder-categories', order)
}

async function confirmDelete(name: string) {
  const count = props.projects.filter(p => p.category === name).length
  const msg = count
    ? `Delete category "${name}"? ${count} project(s) will become standalone.`
    : `Delete category "${name}"?`
  if (window.confirm(msg)) emit('delete-category', name)
}
</script>

<template>
  <div
    class="rounded-xl p-3 transition-colors"
    :class="{ 'bg-accent-muted': isRootDragOver }"
    style="border: 1px dashed transparent;"
    @dragover="onRootDragOver"
    @dragleave="onRootDragLeave"
    @drop="onRootDrop"
  >
    <ProjectTreeRow
      v-for="p in standalone"
      :key="p.name"
      :project="p"
      :indent="0"
      @toggle-hidden="emit('toggle-hidden', $event)"
    />

    <div v-for="cat in categories" :key="cat.name" class="group">
      <CategoryHeader
        :name="cat.name"
        :project-count="cat.projectCount"
        :hidden-count="hiddenCountIn(cat.name)"
        :expanded="isExpanded(cat.name)"
        @toggle="toggleExpand(cat.name)"
        @rename="(newName: string) => emit('rename-category', cat.name, newName)"
        @delete="confirmDelete(cat.name)"
        @drop-project="(p: string) => emit('assign-project', p, cat.name)"
        @drop-reorder="(d: string) => onCategoryReorder(cat.name, d)"
      />
      <template v-if="isExpanded(cat.name)">
        <ProjectTreeRow
          v-for="p in projectsIn(cat.name)"
          :key="p.name"
          :project="p"
          :indent="1"
          @toggle-hidden="emit('toggle-hidden', $event)"
        />
        <div
          v-if="projectsIn(cat.name).length === 0"
          class="py-2 ml-6 text-[11px] italic"
          style="color: var(--text-tertiary); border: 1px dashed var(--border-subtle); border-radius: 6px; padding: 8px 12px;"
        >
          Drop projects here
        </div>
      </template>
    </div>
  </div>
</template>
