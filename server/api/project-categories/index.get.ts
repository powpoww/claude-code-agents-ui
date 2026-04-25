import { loadProjectCategories } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async () => {
  const { categories, assignments } = await loadProjectCategories()
  const counts = new Map<string, number>()
  for (const cat of Object.values(assignments)) {
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return {
    categories: categories.map(c => ({ name: c.name, projectCount: counts.get(c.name) ?? 0 })),
  }
})
