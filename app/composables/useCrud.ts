interface CrudOptions {
  stateKey: string
  label?: string
}

export function useCrud<T extends { slug: string }, P = unknown>(basePath: string, opts: CrudOptions) {
  const items = useState<T[]>(opts.stateKey, () => [])
  const loading = useState(`${opts.stateKey}Loading`, () => false)
  const error = useState<string | null>(`${opts.stateKey}Error`, () => null)
  const { workingDir } = useWorkingDir()

  const label = opts.label || opts.stateKey

  async function fetchAll(params: any = {}) {
    loading.value = true
    error.value = null
    try {
      items.value = await $fetch<T[]>(basePath, { 
        query: { workingDir: workingDir.value, ...params } 
      }) as T[]
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Failed to load ${label}`
      error.value = msg
      console.error(`[useCrud:${label}] fetchAll:`, msg)
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(slug: string, params: any = {}) {
    return await $fetch<T>(`${basePath}/${slug}`, {
      query: { workingDir: workingDir.value, ...params }
    }) as T
  }

  async function create(payload: P) {
    const item = await $fetch<T>(basePath, { 
      method: 'POST', 
      body: { ...payload as Record<string, unknown>, workingDir: workingDir.value } 
    }) as T
    items.value.push(item)
    return item
  }

  async function update(slug: string, payload: P) {
    const item = await $fetch<T>(`${basePath}/${slug}`, { 
      method: 'PUT', 
      body: { ...payload as Record<string, unknown>, workingDir: workingDir.value } 
    }) as T
    const idx = items.value.findIndex(i => i.slug === slug)
    if (idx >= 0) items.value[idx] = item
    else items.value.push(item)
    return item
  }

  async function remove(slug: string) {
    await $fetch(`${basePath}/${slug}`, { 
      method: 'DELETE' as const,
      query: { workingDir: workingDir.value }
    })
    items.value = items.value.filter(i => i.slug !== slug)
  }

  return { items, loading, error, fetchAll, fetchOne, create, update, remove }
}
