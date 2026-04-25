<script setup lang="ts">
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'

const history = useClaudeCodeHistory()
const {
  projects, categories, isLoadingProjects,
  fetchProjects, fetchCategories,
  setProjectHidden, setProjectCategory,
  createCategory, renameCategory, deleteCategory, reorderCategories,
} = history
const toast = useToast()

const showAddProjectModal = ref(false)
const newPath = ref('')
const newDisplayName = ref('')
const adding = ref(false)
const browsing = ref(false)

const showHidden = ref(false)
const isAddingCategory = ref(false)
const newCategoryName = ref('')

const hiddenCount = computed(() => projects.value.filter(p => p.hidden).length)

async function browseFolder() {
  browsing.value = true
  try {
    const res = await $fetch<{ path: string | null }>('/api/utils/pick-folder', { method: 'POST' })
    if (res.path) newPath.value = res.path
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Could not open folder picker', color: 'error' })
  } finally {
    browsing.value = false
  }
}

function openAddModal() {
  newPath.value = ''
  newDisplayName.value = ''
  showAddProjectModal.value = true
}

async function addProject() {
  if (!newPath.value.trim()) return
  adding.value = true
  try {
    await $fetch('/api/projects', {
      method: 'POST',
      body: { path: newPath.value.trim(), displayName: newDisplayName.value.trim() || undefined },
    })
    showAddProjectModal.value = false
    toast.add({ title: 'Project added', color: 'success' })
    await fetchProjects()
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to add project', color: 'error' })
  } finally {
    adding.value = false
  }
}

async function onToggleHidden(project: { name: string; hidden?: boolean }) {
  const next = !project.hidden
  try {
    await setProjectHidden(project.name, next)
    toast.add({ title: next ? 'Hidden from list' : 'Restored to list', color: 'success' })
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to update', color: 'error' })
  }
}

async function commitNewCategory() {
  const name = newCategoryName.value.trim()
  if (!name) { isAddingCategory.value = false; return }
  try {
    await createCategory(name)
    newCategoryName.value = ''
    isAddingCategory.value = false
    toast.add({ title: 'Category created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to create', color: 'error' })
  }
}

async function onRenameCategory(oldName: string, newName: string) {
  try {
    await renameCategory(oldName, newName)
    toast.add({ title: 'Renamed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to rename', color: 'error' })
  }
}

async function onDeleteCategory(name: string) {
  try {
    await deleteCategory(name)
    toast.add({ title: 'Category deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to delete', color: 'error' })
  }
}

async function onAssignProject(projectName: string, category: string | null) {
  try {
    await setProjectCategory(projectName, category)
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to assign', color: 'error' })
  }
}

async function onReorderCategories(orderedNames: string[]) {
  try {
    await reorderCategories(orderedNames)
  } catch (err: any) {
    toast.add({ title: err.data?.message || 'Failed to reorder', color: 'error' })
  }
}

onMounted(async () => {
  await Promise.all([fetchProjects(), fetchCategories()])
})

useHead({ title: 'Project Artifacts | Agent Manager' })
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <PageHeader title="Project Artifacts">
      <template #trailing>
        <span class="text-[12px] text-meta">
          {{ projects.length }}<span v-if="hiddenCount" class="ml-1 text-[11px]">(+{{ hiddenCount }} hidden)</span>
        </span>
      </template>
      <template #right>
        <div class="flex items-center gap-3">
          <button
            v-if="hiddenCount > 0"
            class="px-3 py-2 rounded-xl text-[12px] font-medium transition-all flex items-center gap-1.5 hover-bg"
            style="border: 1px solid var(--border-subtle); color: var(--text-secondary);"
            @click="showHidden = !showHidden"
          >
            <UIcon :name="showHidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5" />
            {{ showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})` }}
          </button>
          <button
            class="px-3 py-2 rounded-xl text-[12px] font-medium transition-all flex items-center gap-1.5 hover-bg"
            style="border: 1px solid var(--border-subtle); color: var(--text-secondary);"
            @click="isAddingCategory = true"
          >
            <UIcon name="i-lucide-folder-plus" class="size-3.5" />
            Add Category
          </button>
          <button
            class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2"
            style="background: var(--accent); color: white;"
            @click="openAddModal"
          >
            <UIcon name="i-lucide-folder-plus" class="size-4" />
            Add Project
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
      <div
        v-if="isAddingCategory"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md"
        style="background: var(--surface-raised); border: 1px solid var(--accent);"
      >
        <UIcon name="i-lucide-folder-plus" class="size-4" style="color: var(--accent);" />
        <input
          v-model="newCategoryName"
          autofocus
          placeholder="Category name"
          class="text-[13px] font-semibold flex-1 px-1 outline-none bg-transparent"
          @keydown.enter="commitNewCategory"
          @keydown.esc="() => { isAddingCategory = false; newCategoryName = '' }"
          @blur="commitNewCategory"
        />
      </div>

      <div v-if="isLoadingProjects && projects.length === 0" class="space-y-2">
        <div v-for="i in 6" :key="i" class="h-8 rounded-md animate-pulse" style="background: var(--surface-raised);" />
      </div>

      <ProjectTree
        v-else-if="projects.length > 0"
        :projects="projects"
        :categories="categories"
        :show-hidden="showHidden"
        @toggle-hidden="onToggleHidden"
        @rename-category="onRenameCategory"
        @delete-category="onDeleteCategory"
        @assign-project="onAssignProject"
        @reorder-categories="onReorderCategories"
      />

      <div v-else class="flex flex-col items-center justify-center py-20 text-center">
        <div class="size-20 rounded-3xl flex items-center justify-center mb-6" style="background: var(--surface-raised);">
          <UIcon name="i-lucide-folder-x" class="size-10 text-meta" />
        </div>
        <h2 class="text-[18px] font-semibold mb-2" style="color: var(--text-primary);">No Claude projects found</h2>
        <p class="text-[14px] text-meta max-w-sm mx-auto mb-8">
          Projects will appear here after you start a chat in a specific directory using Claude Code CLI.
        </p>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddProjectModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);" @click.self="showAddProjectModal = false">
          <div class="w-full max-w-md rounded-2xl p-6 flex flex-col gap-5" style="background: var(--surface-base); border: 1px solid var(--border-subtle);">
            <div class="flex items-center justify-between">
              <h2 class="text-[17px] font-semibold" style="color: var(--text-primary);">Add Project</h2>
              <button class="p-1.5 rounded-lg hover-bg" style="color: var(--text-secondary);" @click="showAddProjectModal = false">
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </div>
            <div class="flex flex-col gap-4">
              <div class="space-y-1">
                <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Directory Path <span style="color: var(--error);">*</span></label>
                <div class="flex gap-2">
                  <input v-model="newPath" placeholder="/Users/you/my-project" class="field-input flex-1 font-mono" autofocus @keydown.enter="addProject" />
                  <button class="px-3 py-2 rounded-xl text-[13px] font-medium transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50" style="background: var(--surface-raised); border: 1px solid var(--border-subtle); color: var(--text-secondary);" :disabled="browsing" @click="browseFolder">
                    <UIcon v-if="browsing" name="i-lucide-loader-2" class="size-4 animate-spin" />
                    <UIcon v-else name="i-lucide-folder-open" class="size-4" />
                    Browse
                  </button>
                </div>
              </div>
              <div class="space-y-1">
                <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Display Name <span style="color: var(--text-tertiary); font-weight: normal;">(optional)</span></label>
                <input v-model="newDisplayName" placeholder="My Project" class="field-input w-full" @keydown.enter="addProject" />
              </div>
            </div>
            <div class="flex items-center justify-end gap-3">
              <button class="px-4 py-2 rounded-xl text-[13px] font-medium transition-all hover-bg" style="color: var(--text-secondary);" @click="showAddProjectModal = false">Cancel</button>
              <button class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2 disabled:opacity-50" style="background: var(--accent); color: white;" :disabled="!newPath.trim() || adding" @click="addProject">
                <UIcon v-if="adding" name="i-lucide-loader-2" class="size-4 animate-spin" />
                <UIcon v-else name="i-lucide-folder-plus" class="size-4" />
                Add Project
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
