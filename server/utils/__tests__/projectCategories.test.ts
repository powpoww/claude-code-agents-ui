import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadProjectCategories, saveProjectCategories, createProjectCategory, renameProjectCategory, deleteProjectCategory, reorderProjectCategories, setProjectCategoryAssignment, getClaudeCodeProjects } from '../claudeCodeHistory'

let tmp: string
let originalClaudeDir: string | undefined

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'agents-ui-test-'))
  originalClaudeDir = process.env.CLAUDE_DIR
  process.env.CLAUDE_DIR = tmp
})

afterEach(() => {
  if (originalClaudeDir === undefined) delete process.env.CLAUDE_DIR
  else process.env.CLAUDE_DIR = originalClaudeDir
  rmSync(tmp, { recursive: true, force: true })
})

describe('saveProjectCategories', () => {
  it('roundtrips data to disk', async () => {
    const store = {
      categories: [{ name: 'personal' }, { name: 'workspace' }],
      assignments: { 'slug-a': 'personal', 'slug-b': 'workspace' },
    }
    await saveProjectCategories(store)
    const loaded = await loadProjectCategories()
    expect(loaded).toEqual(store)
  })
})

describe('loadProjectCategories', () => {
  it('returns empty struct when file does not exist', async () => {
    const data = await loadProjectCategories()
    expect(data).toEqual({ categories: [], assignments: {} })
  })

  it('treats array-typed assignments as empty object', async () => {
    writeFileSync(
      join(tmp, 'project-categories.json'),
      JSON.stringify({ categories: [], assignments: ['a', 'b'] })
    )
    const data = await loadProjectCategories()
    expect(data).toEqual({ categories: [], assignments: {} })
  })
})

describe('createProjectCategory', () => {
  it('appends a new category and persists', async () => {
    await createProjectCategory('personal')
    const { categories } = await loadProjectCategories()
    expect(categories).toEqual([{ name: 'personal' }])
  })

  it('rejects empty / whitespace-only names', async () => {
    await expect(createProjectCategory('   ')).rejects.toThrow(/empty/i)
  })

  it('rejects duplicate names (case-sensitive)', async () => {
    await createProjectCategory('personal')
    await expect(createProjectCategory('personal')).rejects.toThrow(/exists/i)
  })

  it('rejects reserved name "order"', async () => {
    await expect(createProjectCategory('order')).rejects.toThrow(/reserved/i)
  })

  it('trims surrounding whitespace before storing', async () => {
    await createProjectCategory('  workspace  ')
    const { categories } = await loadProjectCategories()
    expect(categories[0]?.name).toBe('workspace')
  })
})

describe('renameProjectCategory', () => {
  it('renames category and updates all assignments', async () => {
    await saveProjectCategories({
      categories: [{ name: 'personal' }],
      assignments: { a: 'personal', b: 'personal' },
    })
    await renameProjectCategory('personal', 'home')
    const store = await loadProjectCategories()
    expect(store.categories).toEqual([{ name: 'home' }])
    expect(store.assignments).toEqual({ a: 'home', b: 'home' })
  })

  it('throws 404-style when source category missing', async () => {
    await expect(renameProjectCategory('nope', 'x')).rejects.toThrow(/not found/i)
  })

  it('rejects rename to existing other name (conflict)', async () => {
    await saveProjectCategories({
      categories: [{ name: 'a' }, { name: 'b' }],
      assignments: {},
    })
    await expect(renameProjectCategory('a', 'b')).rejects.toThrow(/exists/i)
  })

  it('allows rename to itself (no-op)', async () => {
    await saveProjectCategories({ categories: [{ name: 'a' }], assignments: {} })
    await renameProjectCategory('a', 'a')
    const store = await loadProjectCategories()
    expect(store.categories).toEqual([{ name: 'a' }])
  })
})

describe('deleteProjectCategory', () => {
  it('removes category and clears matching assignments', async () => {
    await saveProjectCategories({
      categories: [{ name: 'personal' }, { name: 'workspace' }],
      assignments: { a: 'personal', b: 'workspace', c: 'personal' },
    })
    const result = await deleteProjectCategory('personal')
    expect(result.orphanedCount).toBe(2)
    const store = await loadProjectCategories()
    expect(store.categories).toEqual([{ name: 'workspace' }])
    expect(store.assignments).toEqual({ b: 'workspace' })
  })

  it('throws when category missing', async () => {
    await expect(deleteProjectCategory('nope')).rejects.toThrow(/not found/i)
  })

  it('returns orphanedCount=0 when no projects assigned', async () => {
    await saveProjectCategories({ categories: [{ name: 'empty' }], assignments: {} })
    const result = await deleteProjectCategory('empty')
    expect(result.orphanedCount).toBe(0)
  })
})

describe('reorderProjectCategories', () => {
  it('reorders categories to match given names array', async () => {
    await saveProjectCategories({
      categories: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      assignments: {},
    })
    await reorderProjectCategories(['c', 'a', 'b'])
    const { categories } = await loadProjectCategories()
    expect(categories.map(c => c.name)).toEqual(['c', 'a', 'b'])
  })

  it('rejects when names array is missing existing categories', async () => {
    await saveProjectCategories({
      categories: [{ name: 'a' }, { name: 'b' }],
      assignments: {},
    })
    await expect(reorderProjectCategories(['a'])).rejects.toThrow(/mismatch|set/i)
  })

  it('rejects when names array contains unknown', async () => {
    await saveProjectCategories({ categories: [{ name: 'a' }], assignments: {} })
    await expect(reorderProjectCategories(['a', 'b'])).rejects.toThrow(/mismatch|set/i)
  })
})

describe('setProjectCategoryAssignment', () => {
  beforeEach(async () => {
    await saveProjectCategories({
      categories: [{ name: 'personal' }, { name: 'workspace' }],
      assignments: {},
    })
  })

  it('assigns project to existing category', async () => {
    await setProjectCategoryAssignment('proj-a', 'personal')
    const { assignments } = await loadProjectCategories()
    expect(assignments).toEqual({ 'proj-a': 'personal' })
  })

  it('clears assignment when category=null', async () => {
    await setProjectCategoryAssignment('proj-a', 'personal')
    await setProjectCategoryAssignment('proj-a', null)
    const { assignments } = await loadProjectCategories()
    expect(assignments).toEqual({})
  })

  it('rejects unknown category', async () => {
    await expect(setProjectCategoryAssignment('proj-a', 'nope')).rejects.toThrow(/not found/i)
  })

  it('overwrites existing assignment', async () => {
    await setProjectCategoryAssignment('proj-a', 'personal')
    await setProjectCategoryAssignment('proj-a', 'workspace')
    const { assignments } = await loadProjectCategories()
    expect(assignments).toEqual({ 'proj-a': 'workspace' })
  })
})

describe('getClaudeCodeProjects category attach', () => {
  it('marks projects with their assigned category and leaves others undefined', async () => {
    const projectsDir = join(tmp, 'projects')
    mkdirSync(join(projectsDir, '-home-miso-personal-payment'), { recursive: true })
    writeFileSync(join(projectsDir, '-home-miso-personal-payment', 'session.jsonl'), '{}')
    mkdirSync(join(projectsDir, '-home-miso-workspace-foo'), { recursive: true })
    writeFileSync(join(projectsDir, '-home-miso-workspace-foo', 'session.jsonl'), '{}')
    mkdirSync(join(projectsDir, '-home-miso-dotfiles'), { recursive: true })
    writeFileSync(join(projectsDir, '-home-miso-dotfiles', 'session.jsonl'), '{}')

    await saveProjectCategories({
      categories: [{ name: 'personal' }, { name: 'workspace' }],
      assignments: {
        '-home-miso-personal-payment': 'personal',
        '-home-miso-workspace-foo': 'workspace',
      },
    })

    const projects = await getClaudeCodeProjects()
    const byName = Object.fromEntries(projects.map(p => [p.name, p]))
    expect(byName['-home-miso-personal-payment']?.category).toBe('personal')
    expect(byName['-home-miso-workspace-foo']?.category).toBe('workspace')
    expect(byName['-home-miso-dotfiles']?.category).toBeUndefined()
  })
})
