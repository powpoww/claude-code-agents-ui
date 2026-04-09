interface DraftData {
  frontmatter: Record<string, unknown>
  body: string
  savedAt: number
}

const DRAFT_PREFIX = 'claude-code-agents-ui-draft:'
const DRAFT_TTL = 24 * 60 * 60 * 1000 // 24 hours

export function useDraftRecovery(key: string) {
  const storageKey = DRAFT_PREFIX + key
  const hasDraft = ref(false)
  const draftAge = ref('')

  function saveDraft(frontmatter: object, body: string) {
    if (!import.meta.client) return
    try {
      const data: DraftData = {
        frontmatter: frontmatter as Record<string, unknown>,
        body,
        savedAt: Date.now(),
      }
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {
      // localStorage full or unavailable
    }
  }

  function loadDraft(): DraftData | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const data = JSON.parse(raw) as DraftData
      // Expire old drafts
      if (Date.now() - data.savedAt > DRAFT_TTL) {
        localStorage.removeItem(storageKey)
        return null
      }
      return data
    } catch {
      return null
    }
  }

  function clearDraft() {
    if (!import.meta.client) return
    localStorage.removeItem(storageKey)
    hasDraft.value = false
  }

  function formatAge(savedAt: number): string {
    const mins = Math.round((Date.now() - savedAt) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return 'yesterday'
  }

  // Check for existing draft on init
  if (import.meta.client) {
    const existing = loadDraft()
    if (existing) {
      hasDraft.value = true
      draftAge.value = formatAge(existing.savedAt)
    }
  }

  // Auto-save with debounce
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave(frontmatter: object, body: string) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveDraft(frontmatter, body), 2000)
  }

  onUnmounted(() => {
    if (saveTimer) clearTimeout(saveTimer)
  })

  return {
    hasDraft,
    draftAge,
    saveDraft,
    loadDraft,
    clearDraft,
    scheduleSave,
  }
}
