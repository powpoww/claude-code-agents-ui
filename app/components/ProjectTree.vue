<script setup lang="ts">
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

function isExpanded(name: string) { return expandedCategories.value.includes(name) }
function toggleExpand(name: string) {
  expandedCategories.value = expandedCategories.value.includes(name)
    ? expandedCategories.value.filter(n => n !== name)
    : [...expandedCategories.value, name]
}

const sortedProjects = computed(() => {
  const list = props.showHidden ? props.projects : props.projects.filter(p => !p.hidden)
  return [...list].sort((a, b) => {
    const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
    const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
    return bt - at
  })
})

const standalone = computed(() => sortedProjects.value.filter(p => !p.category))
function projectsIn(catName: string) {
  return sortedProjects.value.filter(p => p.category === catName)
}
function hiddenCountIn(catName: string): number {
  return props.projects.filter(p => p.category === catName && p.hidden).length
}

const isRootDragOver = ref(false)
function onRootDragOver(ev: DragEvent) {
  if (!ev.dataTransfer?.types.includes('application/x-project')) return
  ev.preventDefault()
  isRootDragOver.value = true
  ev.dataTransfer.dropEffect = 'move'
}
function onRootDragLeave() { isRootDragOver.value = false }
function onRootDrop(ev: DragEvent) {
  ev.preventDefault()
  isRootDragOver.value = false
  const projectName = ev.dataTransfer?.getData('application/x-project')
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
      <div v-if="isExpanded(cat.name)">
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
      </div>
    </div>
  </div>
</template>
