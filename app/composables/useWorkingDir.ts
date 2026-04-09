export function useWorkingDir() {
  const workingDir = useState<string>('working-dir', () => '')

  // On client, try to initialize from localStorage immediately
  if (import.meta.client && !workingDir.value) {
    const stored = localStorage.getItem('claude-code-agents-ui:working-dir')
    if (stored) {
      workingDir.value = stored
    }
  }

  function setWorkingDir(dir: string) {
    const trimmed = dir.trim()
    workingDir.value = trimmed
    if (import.meta.client) {
      if (trimmed) {
        localStorage.setItem('claude-code-agents-ui:working-dir', trimmed)
      } else {
        localStorage.removeItem('claude-code-agents-ui:working-dir')
      }
    }
  }

  function clearWorkingDir() {
    setWorkingDir('')
  }

  const displayPath = computed(() => {
    if (!workingDir.value) return ''
    const parts = workingDir.value.split('/')
    return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : workingDir.value
  })

  return {
    workingDir,
    displayPath,
    setWorkingDir,
    clearWorkingDir,
  }
}
