# Project Tree (조감도) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat card grid on `/project-artifacts` with an indented tree where the user creates categories on demand and drags projects between them. Standalone (uncategorized) projects appear at the tree root.

**Architecture:** Single new JSON store (`~/.claude/project-categories.json`) holds categories and project→category assignments. Six new REST endpoints expose CRUD; one extended endpoint (`GET /api/projects`) attaches the `category` field. Frontend uses three new Vue components (`ProjectTree`, `CategoryHeader`, `ProjectTreeRow`) with HTML5-native drag-and-drop. The existing `hidden-projects.json` flow is left untouched.

**Tech Stack:** Nuxt 3 (Nitro server + Vue 3 client), TypeScript, Tailwind via Nuxt UI, vitest (newly introduced for server-side unit tests), HTML5 native drag API.

**Spec:** `docs/superpowers/specs/2026-04-25-project-tree-design.md`

---

## File Structure

| Status | Path | Responsibility |
|---|---|---|
| New | `~/.claude/project-categories.json` (runtime data, not in repo) | Persistence: ordered category list + project→category map |
| Modify | `server/utils/claudeCodeHistory.ts` | Add `ProjectCategory` type, `category` field on `ClaudeCodeProject`, file I/O + mutator helpers, attach `category` in `getClaudeCodeProjects` |
| New | `server/utils/__tests__/projectCategories.test.ts` | Unit tests for the helpers (load/save/create/rename/delete/reorder/setProjectCategory) |
| New | `server/api/project-categories/index.get.ts` | `GET /api/project-categories` |
| New | `server/api/project-categories/index.post.ts` | `POST /api/project-categories` |
| New | `server/api/project-categories/[name].put.ts` | `PUT /api/project-categories/[name]` (rename) |
| New | `server/api/project-categories/[name].delete.ts` | `DELETE /api/project-categories/[name]` |
| New | `server/api/project-categories/order.put.ts` | `PUT /api/project-categories/order` (reorder) |
| New | `server/api/projects/[projectName]/category.put.ts` | `PUT /api/projects/[projectName]/category` (assign / clear) |
| New | `vitest.config.ts` | Vitest config restricted to `server/**` |
| Modify | `package.json` | Add `vitest` devDependency + `"test"` script |
| Modify | `app/composables/useClaudeCodeHistory.ts` | `categories` state, fetch/mutator actions, `setProjectCategory` |
| New | `app/components/CategoryHeader.vue` | Category row: chevron, folder icon, name, count, rename/delete buttons, drop target |
| New | `app/components/ProjectTreeRow.vue` | Project row: drag handle, name+path, hover actions (CLI link, hide), drag source |
| New | `app/components/ProjectTree.vue` | Container: orchestrates drag state, renders standalone projects + ordered categories, handles drop dispatch |
| Modify | `app/pages/project-artifacts/index.vue` | Swap card grid for `<ProjectTree>`; keep header (counter, Show hidden, Add Project) and add `+ Add Category` button + add-category inline input row |
| Delete | `app/components/ProjectCard.vue` | Replaced by `ProjectTreeRow` |

---

## Phase 0 — Test Infrastructure

### Task 1: Introduce vitest for server-side unit tests

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
cd ~/workspace/claude-code-agents-ui
bun add -d vitest@^2
```
Expected: `+ vitest@2.x.y` in install output, `vitest` in devDependencies.

- [ ] **Step 2: Add test script to package.json**

Edit `package.json` `"scripts"` block. Insert `"test": "vitest run"` and `"test:watch": "vitest"` after `"typecheck"`:

```json
"scripts": {
  "build": "nuxt build",
  "dev": "nuxt dev --port 3030",
  "generate": "nuxt generate",
  "preview": "nuxt preview",
  "postinstall": "nuxt prepare",
  "typecheck": "nuxt typecheck",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 4: Smoke run**

```bash
bun run test
```
Expected: `No test files found` (zero exit, just no tests yet).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb vitest.config.ts
git commit -m "chore(test): add vitest for server-side unit tests"
```

---

## Phase 1 — Server Helpers (TDD)

### Task 2: Storage roundtrip — load when file is missing

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/claudeDir.ts` (only if currently caches at first call)
- Create: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/utils/__tests__/projectCategories.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadProjectCategories } from '../claudeCodeHistory'

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

describe('loadProjectCategories', () => {
  it('returns empty struct when file does not exist', async () => {
    const data = await loadProjectCategories()
    expect(data).toEqual({ categories: [], assignments: {} })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run test
```
Expected: FAIL with `loadProjectCategories is not a function` or similar import error.

- [ ] **Step 3: Implement loadProjectCategories**

In `server/utils/claudeCodeHistory.ts`, after the existing `loadHiddenProjects`/`saveHiddenProjects` block, add:

```ts
/**
 * Project category store (UI-only grouping; transcripts on disk untouched)
 */
export interface ProjectCategory {
  name: string
}

export interface ProjectCategoryStore {
  categories: ProjectCategory[]
  assignments: Record<string, string>
}

const EMPTY_STORE: ProjectCategoryStore = { categories: [], assignments: {} }

export async function loadProjectCategories(): Promise<ProjectCategoryStore> {
  const filePath = join(getClaudeDir(), 'project-categories.json')
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(data) as Partial<ProjectCategoryStore>
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories.filter(c => c && typeof c.name === 'string') : [],
      assignments: parsed.assignments && typeof parsed.assignments === 'object' ? { ...parsed.assignments } : {},
    }
  } catch {
    return { ...EMPTY_STORE, categories: [], assignments: {} }
  }
}
```

Also ensure the `getClaudeDir` import resolves the env var dynamically. Check that `getClaudeDir()` reads `process.env.CLAUDE_DIR` at call time. If currently cached at module load, refactor to read at call time:

```ts
// claudeDir.ts (only if currently cached): replace the cache with a per-call check
let cachedDir: string | null = null
export function getClaudeDir(): string {
  const envDir = process.env.CLAUDE_DIR
  if (envDir) return envDir
  if (!cachedDir) cachedDir = join(homedir(), '.claude')
  return cachedDir
}
```

(Skip this sub-edit if the existing implementation already reads env at call time.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run test
```
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): load store returns empty when file missing"
```

---

### Task 3: Save then load roundtrips correctly

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
import { saveProjectCategories } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run the test, verify FAIL**

```bash
bun run test
```
Expected: FAIL with `saveProjectCategories is not a function`.

- [ ] **Step 3: Implement saveProjectCategories**

Add below `loadProjectCategories`:

```ts
export async function saveProjectCategories(store: ProjectCategoryStore): Promise<void> {
  const filePath = join(getClaudeDir(), 'project-categories.json')
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
bun run test
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): persist store to project-categories.json"
```

---

### Task 4: createProjectCategory — happy path + duplicate / reserved / empty

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
import { createProjectCategory } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run, verify FAIL**

Expected: FAIL with import error.

- [ ] **Step 3: Implement**

Add helper near other category functions:

```ts
const RESERVED_CATEGORY_NAMES = new Set(['order'])
const MAX_CATEGORY_NAME_LEN = 50

function normalizeCategoryName(name: string): string {
  return name.trim()
}

function validateNewCategoryName(name: string, existing: ProjectCategory[]): string {
  const trimmed = normalizeCategoryName(name)
  if (!trimmed) throw new Error('Category name cannot be empty')
  if (trimmed.length > MAX_CATEGORY_NAME_LEN) throw new Error(`Category name exceeds ${MAX_CATEGORY_NAME_LEN} chars`)
  if (RESERVED_CATEGORY_NAMES.has(trimmed)) throw new Error(`"${trimmed}" is a reserved name`)
  if (existing.some(c => c.name === trimmed)) throw new Error(`Category "${trimmed}" already exists`)
  return trimmed
}

export async function createProjectCategory(name: string): Promise<ProjectCategory> {
  const store = await loadProjectCategories()
  const trimmed = validateNewCategoryName(name, store.categories)
  const category: ProjectCategory = { name: trimmed }
  store.categories.push(category)
  await saveProjectCategories(store)
  return category
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
bun run test
```
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): create with empty/duplicate/reserved validation"
```

---

### Task 5: renameProjectCategory — cascades to assignments

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { renameProjectCategory } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```ts
export async function renameProjectCategory(oldName: string, newName: string): Promise<ProjectCategory> {
  const store = await loadProjectCategories()
  const idx = store.categories.findIndex(c => c.name === oldName)
  if (idx < 0) throw new Error(`Category "${oldName}" not found`)
  const trimmed = normalizeCategoryName(newName)
  if (trimmed === oldName) return store.categories[idx]!
  const others = store.categories.filter((_, i) => i !== idx)
  const validated = validateNewCategoryName(trimmed, others)
  store.categories[idx] = { ...store.categories[idx]!, name: validated }
  for (const [proj, cat] of Object.entries(store.assignments)) {
    if (cat === oldName) store.assignments[proj] = validated
  }
  await saveProjectCategories(store)
  return store.categories[idx]!
}
```

- [ ] **Step 4: Run, verify PASS**

Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): rename cascades to all assignments"
```

---

### Task 6: deleteProjectCategory — orphans become standalone

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { deleteProjectCategory } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```ts
export async function deleteProjectCategory(name: string): Promise<{ orphanedCount: number }> {
  const store = await loadProjectCategories()
  const idx = store.categories.findIndex(c => c.name === name)
  if (idx < 0) throw new Error(`Category "${name}" not found`)
  store.categories.splice(idx, 1)
  let orphanedCount = 0
  for (const [proj, cat] of Object.entries(store.assignments)) {
    if (cat === name) {
      delete store.assignments[proj]
      orphanedCount++
    }
  }
  await saveProjectCategories(store)
  return { orphanedCount }
}
```

- [ ] **Step 4: Run, verify PASS**

Expected: `14 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): delete clears matching assignments"
```

---

### Task 7: reorderProjectCategories — exact set match

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { reorderProjectCategories } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```ts
export async function reorderProjectCategories(orderedNames: string[]): Promise<void> {
  const store = await loadProjectCategories()
  const currentNames = new Set(store.categories.map(c => c.name))
  const givenNames = new Set(orderedNames)
  if (currentNames.size !== givenNames.size || [...currentNames].some(n => !givenNames.has(n))) {
    throw new Error('Order set mismatch — names array must equal current categories exactly')
  }
  const byName = new Map(store.categories.map(c => [c.name, c]))
  store.categories = orderedNames.map(n => byName.get(n)!)
  await saveProjectCategories(store)
}
```

- [ ] **Step 4: Run, verify PASS**

Expected: `17 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): reorder with strict set-equal validation"
```

---

### Task 8: setProjectCategoryAssignment — assign / clear / validate

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts`
- Modify: `server/utils/__tests__/projectCategories.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { setProjectCategoryAssignment } from '../claudeCodeHistory'

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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```ts
export async function setProjectCategoryAssignment(projectName: string, category: string | null): Promise<void> {
  const store = await loadProjectCategories()
  if (category === null) {
    if (store.assignments[projectName] !== undefined) {
      delete store.assignments[projectName]
      await saveProjectCategories(store)
    }
    return
  }
  if (!store.categories.some(c => c.name === category)) {
    throw new Error(`Category "${category}" not found`)
  }
  store.assignments[projectName] = category
  await saveProjectCategories(store)
}
```

- [ ] **Step 4: Run, verify PASS**

Expected: `21 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): set/clear project category assignment"
```

---

### Task 9: Attach `category` field on getClaudeCodeProjects

**Files:**
- Modify: `server/utils/claudeCodeHistory.ts` (existing `ClaudeCodeProject` interface + `getClaudeCodeProjects` function)

- [ ] **Step 1: Write failing test**

Append:

```ts
import { getClaudeCodeProjects } from '../claudeCodeHistory'
import { mkdirSync, writeFileSync } from 'node:fs'

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
```

- [ ] **Step 2: Run, verify FAIL**

Expected: assertion fails because `category` not yet attached.

- [ ] **Step 3: Implement**

In `claudeCodeHistory.ts`:

a) Extend the interface (locate `export interface ClaudeCodeProject`):

```ts
export interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
  hidden?: boolean
  category?: string
}
```

b) In `getClaudeCodeProjects()`, **after** the existing hidden-marking block, add the category attach:

```ts
    // Mark hidden projects (existing block — keep as-is)
    const hidden = await loadHiddenProjects()
    for (const project of projects) {
      if (hidden.has(project.name)) project.hidden = true
    }

    // Attach category assignment (new)
    const { assignments } = await loadProjectCategories()
    for (const project of projects) {
      const cat = assignments[project.name]
      if (cat) project.category = cat
    }
```

- [ ] **Step 4: Run, verify PASS**

Expected: `22 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claudeCodeHistory.ts server/utils/__tests__/projectCategories.test.ts
git commit -m "feat(categories): attach category field on /api/projects response"
```

---

## Phase 2 — REST Endpoints

### Task 10: GET /api/project-categories

**Files:**
- Create: `server/api/project-categories/index.get.ts`

- [ ] **Step 1: Implement**

```ts
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
```

- [ ] **Step 2: Smoke probe**

```bash
curl -s http://localhost:3030/api/project-categories | python3 -m json.tool
```
Expected: `{ "categories": [...] }` (initially empty `[]` if no `project-categories.json` yet).

- [ ] **Step 3: Commit**

```bash
git add server/api/project-categories/index.get.ts
git commit -m "feat(api): GET /api/project-categories"
```

---

### Task 11: POST /api/project-categories

**Files:**
- Create: `server/api/project-categories/index.post.ts`

- [ ] **Step 1: Implement**

```ts
import { createProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const name = body?.name
  if (typeof name !== 'string') {
    throw createError({ statusCode: 400, message: 'name required' })
  }
  try {
    const created = await createProjectCategory(name)
    setResponseStatus(event, 201)
    return { name: created.name }
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.message || 'invalid' })
  }
})
```

- [ ] **Step 2: Smoke probe — create + verify**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"_test_personal"}' \
  http://localhost:3030/api/project-categories
curl -s http://localhost:3030/api/project-categories | python3 -m json.tool
```
Expected: first call returns `{"name":"_test_personal"}`; second includes it.

- [ ] **Step 3: Smoke probe — duplicate / empty / reserved**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"_test_personal"}' \
  -w '\n%{http_code}\n' http://localhost:3030/api/project-categories
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":""}' \
  -w '\n%{http_code}\n' http://localhost:3030/api/project-categories
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"order"}' \
  -w '\n%{http_code}\n' http://localhost:3030/api/project-categories
```
Expected: all return `400`.

- [ ] **Step 4: Cleanup**

```bash
# Remove test category via direct file edit since DELETE not yet implemented
node -e 'const f="/home/miso/.claude/project-categories.json";const j=JSON.parse(require("fs").readFileSync(f));j.categories=j.categories.filter(c=>c.name!=="_test_personal");require("fs").writeFileSync(f,JSON.stringify(j,null,2));'
```

- [ ] **Step 5: Commit**

```bash
git add server/api/project-categories/index.post.ts
git commit -m "feat(api): POST /api/project-categories"
```

---

### Task 12: PUT /api/project-categories/[name] (rename)

**Files:**
- Create: `server/api/project-categories/[name].put.ts`

- [ ] **Step 1: Implement**

```ts
import { renameProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const oldName = getRouterParam(event, 'name', { decode: true })
  if (!oldName) throw createError({ statusCode: 400, message: 'category name required' })
  const body = await readBody<{ name?: string }>(event)
  if (typeof body?.name !== 'string') throw createError({ statusCode: 400, message: 'new name required' })
  try {
    const updated = await renameProjectCategory(oldName, body.name)
    return { name: updated.name }
  } catch (err: any) {
    const msg = String(err.message || 'invalid')
    const statusCode = /not found/i.test(msg) ? 404 : /exists/i.test(msg) ? 409 : 400
    throw createError({ statusCode, message: msg })
  }
})
```

- [ ] **Step 2: Smoke probe**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"_pre"}' http://localhost:3030/api/project-categories
curl -s -X PUT  -H 'Content-Type: application/json' -d '{"name":"_post"}' http://localhost:3030/api/project-categories/_pre
curl -s http://localhost:3030/api/project-categories | python3 -m json.tool
```
Expected: `_post` appears in list, `_pre` gone.

- [ ] **Step 3: Cleanup test entry**

```bash
node -e 'const f="/home/miso/.claude/project-categories.json";const j=JSON.parse(require("fs").readFileSync(f));j.categories=j.categories.filter(c=>!c.name.startsWith("_"));require("fs").writeFileSync(f,JSON.stringify(j,null,2));'
```

- [ ] **Step 4: Commit**

```bash
git add server/api/project-categories/\[name\].put.ts
git commit -m "feat(api): PUT /api/project-categories/[name] (rename)"
```

---

### Task 13: DELETE /api/project-categories/[name]

**Files:**
- Create: `server/api/project-categories/[name].delete.ts`

- [ ] **Step 1: Implement**

```ts
import { deleteProjectCategory } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name', { decode: true })
  if (!name) throw createError({ statusCode: 400, message: 'category name required' })
  try {
    const result = await deleteProjectCategory(name)
    return { success: true, orphanedCount: result.orphanedCount }
  } catch (err: any) {
    throw createError({ statusCode: /not found/i.test(err.message) ? 404 : 400, message: err.message || 'invalid' })
  }
})
```

- [ ] **Step 2: Smoke probe**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"_to_delete"}' http://localhost:3030/api/project-categories
curl -s -X DELETE http://localhost:3030/api/project-categories/_to_delete
curl -s http://localhost:3030/api/project-categories | python3 -m json.tool
```
Expected: response `{"success":true,"orphanedCount":0}`; list no longer contains `_to_delete`.

- [ ] **Step 3: Commit**

```bash
git add server/api/project-categories/\[name\].delete.ts
git commit -m "feat(api): DELETE /api/project-categories/[name]"
```

---

### Task 14: PUT /api/project-categories/order

**Files:**
- Create: `server/api/project-categories/order.put.ts`

- [ ] **Step 1: Implement**

```ts
import { reorderProjectCategories } from '../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ names?: unknown }>(event)
  if (!Array.isArray(body?.names) || !body.names.every((n: unknown) => typeof n === 'string')) {
    throw createError({ statusCode: 400, message: 'names array of strings required' })
  }
  try {
    await reorderProjectCategories(body.names as string[])
    return { success: true }
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.message || 'invalid order' })
  }
})
```

- [ ] **Step 2: Smoke probe**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"a"}'  http://localhost:3030/api/project-categories
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"b"}'  http://localhost:3030/api/project-categories
curl -s -X PUT  -H 'Content-Type: application/json' -d '{"names":["b","a"]}' \
  http://localhost:3030/api/project-categories/order
curl -s http://localhost:3030/api/project-categories | python3 -m json.tool
```
Expected: order in list is `[b, a]`.

- [ ] **Step 3: Cleanup**

```bash
curl -s -X DELETE http://localhost:3030/api/project-categories/a
curl -s -X DELETE http://localhost:3030/api/project-categories/b
```

- [ ] **Step 4: Commit**

```bash
git add server/api/project-categories/order.put.ts
git commit -m "feat(api): PUT /api/project-categories/order"
```

---

### Task 15: PUT /api/projects/[projectName]/category

**Files:**
- Create: `server/api/projects/[projectName]/category.put.ts`

- [ ] **Step 1: Implement**

```ts
import { setProjectCategoryAssignment } from '../../../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  if (!projectName) throw createError({ statusCode: 400, message: 'project name required' })
  const body = await readBody<{ category?: string | null }>(event)
  const category = body?.category ?? null
  if (category !== null && typeof category !== 'string') {
    throw createError({ statusCode: 400, message: 'category must be string or null' })
  }
  try {
    await setProjectCategoryAssignment(projectName, category)
    return { success: true, category }
  } catch (err: any) {
    throw createError({ statusCode: /not found/i.test(err.message) ? 400 : 400, message: err.message || 'invalid' })
  }
})
```

- [ ] **Step 2: Smoke probe — full lifecycle**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"_smoke"}' http://localhost:3030/api/project-categories
SLUG=$(curl -s http://localhost:3030/api/projects | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["name"])')
curl -s -X PUT -H 'Content-Type: application/json' -d '{"category":"_smoke"}' \
  "http://localhost:3030/api/projects/$SLUG/category"
curl -s "http://localhost:3030/api/projects" | python3 -c 'import json,sys;p=[x for x in json.load(sys.stdin) if x.get("category")=="_smoke"];print(len(p),"matched")'
curl -s -X PUT -H 'Content-Type: application/json' -d '{"category":null}' \
  "http://localhost:3030/api/projects/$SLUG/category"
curl -s -X DELETE "http://localhost:3030/api/project-categories/_smoke"
```
Expected: `1 matched` after assign, then clear, then category deleted.

- [ ] **Step 3: Commit**

```bash
git add server/api/projects/\[projectName\]/category.put.ts
git commit -m "feat(api): PUT /api/projects/[projectName]/category"
```

---

### Task 16: Run all server tests + typecheck

- [ ] **Step 1: Test**

```bash
bun run test
```
Expected: `22 passed` (or whatever total tasks 2–9 produced).

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: zero errors.

- [ ] **Step 3: If anything fails, fix it before continuing.**

No commit step here — this is a checkpoint.

---

## Phase 3 — Frontend

### Task 17: Composable — categories state, fetch, mutators

**Files:**
- Modify: `app/composables/useClaudeCodeHistory.ts`

- [ ] **Step 1: Update local type + add state**

Locate the `interface ClaudeCodeProject` block:

```ts
interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
  hidden?: boolean
  category?: string
}
```

Right after, define:

```ts
interface ProjectCategorySummary {
  name: string
  projectCount: number
}
```

Inside the `useClaudeCodeHistory` function body (after `const projects = useState...`), add:

```ts
const categories = useState<ProjectCategorySummary[]>('project-categories', () => [])
```

- [ ] **Step 2: Add fetch + mutator actions**

Below the existing `setProjectHidden` function, add:

```ts
async function fetchCategories() {
  try {
    const data = await $fetch<{ categories: ProjectCategorySummary[] }>('/api/project-categories')
    categories.value = data.categories
  } catch (error) {
    console.error('Failed to fetch project categories:', error)
    categories.value = []
  }
}

async function createCategory(name: string) {
  await $fetch('/api/project-categories', { method: 'POST', body: { name } })
  await fetchCategories()
}

async function renameCategory(oldName: string, newName: string) {
  await $fetch(`/api/project-categories/${encodeURIComponent(oldName)}`, {
    method: 'PUT', body: { name: newName },
  })
  await fetchCategories()
  for (const p of projects.value) if (p.category === oldName) p.category = newName
}

async function deleteCategory(name: string) {
  await $fetch(`/api/project-categories/${encodeURIComponent(name)}`, { method: 'DELETE' })
  await fetchCategories()
  for (const p of projects.value) if (p.category === name) p.category = undefined
}

async function reorderCategories(orderedNames: string[]) {
  await $fetch('/api/project-categories/order', { method: 'PUT', body: { names: orderedNames } })
  // optimistic local sort already done by caller; re-fetch to confirm counts unchanged
  await fetchCategories()
}

async function setProjectCategory(projectName: string, category: string | null) {
  await $fetch(`/api/projects/${encodeURIComponent(projectName)}/category`, {
    method: 'PUT', body: { category },
  })
  const p = projects.value.find(x => x.name === projectName)
  if (p) p.category = category ?? undefined
  await fetchCategories()
}
```

- [ ] **Step 3: Export new state/actions**

In the `return` block, add:

```ts
    categories,
    fetchCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    setProjectCategory,
```

- [ ] **Step 4: Smoke verify in browser console**

```bash
# In dev tools console (cmux browser surface):
# await $fetch('/api/project-categories')
# Expected: { categories: [...] }
```

- [ ] **Step 5: Commit**

```bash
git add app/composables/useClaudeCodeHistory.ts
git commit -m "feat(ui): expose project categories state and mutators"
```

---

### Task 18: CategoryHeader.vue

**Files:**
- Create: `app/components/CategoryHeader.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
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
  const projectName = ev.dataTransfer?.getData('application/x-project')
  if (projectName) emit('drop-project', projectName)
  const reorderName = ev.dataTransfer?.getData('application/x-category')
  if (reorderName) emit('drop-reorder', reorderName)
}

function onCategoryDragStart(ev: DragEvent) {
  ev.dataTransfer?.setData('application/x-category', props.name)
  ev.dataTransfer!.effectAllowed = 'move'
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
      @blur="cancelRename"
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
```

- [ ] **Step 2: Commit**

```bash
git add app/components/CategoryHeader.vue
git commit -m "feat(ui): CategoryHeader component (drop target + inline rename)"
```

---

### Task 19: ProjectTreeRow.vue

**Files:**
- Create: `app/components/ProjectTreeRow.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { formatRelativeTime } from '~/utils/messageFormatting'

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
  ev.dataTransfer?.setData('application/x-project', props.project.name)
  ev.dataTransfer!.effectAllowed = 'move'
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
```

- [ ] **Step 2: Commit**

```bash
git add app/components/ProjectTreeRow.vue
git commit -m "feat(ui): ProjectTreeRow component (drag source + hover actions)"
```

---

### Task 20: ProjectTree.vue (container + drop dispatch)

**Files:**
- Create: `app/components/ProjectTree.vue`

- [ ] **Step 1: Implement**

```vue
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

const expandedCategories = useState<Set<string>>('artifacts-expanded', () => new Set())

function isExpanded(name: string) { return expandedCategories.value.has(name) }
function toggleExpand(name: string) {
  const next = new Set(expandedCategories.value)
  if (next.has(name)) next.delete(name); else next.add(name)
  expandedCategories.value = next
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
```

- [ ] **Step 2: Commit**

```bash
git add app/components/ProjectTree.vue
git commit -m "feat(ui): ProjectTree container with drag dispatch and reorder"
```

---

### Task 21: Replace card grid in project-artifacts/index.vue

**Files:**
- Modify: `app/pages/project-artifacts/index.vue`

- [ ] **Step 1: Update script block**

Replace the existing `<script setup>` body with:

```ts
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
```

- [ ] **Step 2: Replace template body**

Replace the body grid block (the `<div v-else-if="visibleProjects.length > 0">` group from the previous hide-feature) with:

```vue
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
```

- [ ] **Step 3: Reload browser, smoke check**

```bash
# In cmux browser, navigate to /project-artifacts
# Confirm tree renders, all projects visible at root (no categories yet)
# Click "Add Category" → input appears → type "personal" → Enter
# Drag a project onto the personal category header
# Confirm project moves under category and ~/.claude/project-categories.json updated
cat ~/.claude/project-categories.json
```
Expected: file contains the created category and assignment.

- [ ] **Step 4: Commit**

```bash
git add app/pages/project-artifacts/index.vue
git commit -m "feat(ui): replace project-artifacts card grid with categorized tree"
```

---

### Task 22: Remove ProjectCard.vue

**Files:**
- Delete: `app/components/ProjectCard.vue`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd ~/workspace/claude-code-agents-ui
grep -rn "ProjectCard" app/ server/ 2>&1 | grep -v node_modules
```
Expected: empty output (no usages).

- [ ] **Step 2: Delete file**

```bash
rm app/components/ProjectCard.vue
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): remove ProjectCard (replaced by ProjectTreeRow)"
```

---

## Phase 4 — Regression & Final Validation

### Task 23: Manual regression checklist

- [ ] **Step 1: Run all backend tests**

```bash
bun run test
```
Expected: all tests pass.

- [ ] **Step 2: Typecheck full project**

```bash
bun run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Manual UI checklist**

In the cmux browser at `/project-artifacts`:

- [ ] Tree renders correctly with 32 projects (or however many you have).
- [ ] All projects without category show at root.
- [ ] Click "Add Category" → input → "personal" → Enter → category appears.
- [ ] Drag a project onto "personal" header → project moves under category.
- [ ] Drag the same project from "personal" to root area (empty space) → project returns to standalone.
- [ ] Drag one category over another → reorder persists.
- [ ] Hover a category → pencil + trash buttons appear.
- [ ] Click pencil → inline rename → Enter → name updates everywhere.
- [ ] Click trash → confirmation modal → confirm → category gone, projects fall to standalone.
- [ ] Hide button on a project → row dimmed (with Show hidden on) or hidden (with it off).
- [ ] Hide-count appears on category header when applicable.
- [ ] Drill-down: click project row → navigates to `/project-artifacts/[name]`.
- [ ] CLI link: hover → click → navigates to `/cli/project/[name]`.
- [ ] "Add Project" modal: still works.
- [ ] Refresh browser → tree state (categories, assignments) persists.
- [ ] Restart dev server (`Ctrl+C`, `bun run dev`) → state persists.
- [ ] `cat ~/.claude/project-categories.json` shows expected structure.

- [ ] **Step 4: If anything fails, file an issue task and fix before final commit.**

- [ ] **Step 5: Final push to fork**

```bash
git push origin master
```
Expected: push succeeds.

---

## Implementation notes

**Concurrent-write race**: The mutator helpers (`createProjectCategory`, `renameProjectCategory`, etc.) do load → modify → save without an explicit mutex. Two simultaneous requests can result in the second overwriting the first. For a single-user local tool this is acceptable; the spec calls it out as a known risk. If two-tab concurrent edits become an issue in practice, wrap each mutator with a simple in-module promise queue.

## Out of Scope (deferred to future work)

The following are intentionally out of scope for this plan, per the spec:

- Category color, icon, description fields
- Nested subcategories
- Bulk multi-select drag
- Tree search / filter input
- Sync of `project-categories.json` to dotfiles
- Mobile / touch drag support
- Animated tree transitions beyond the simple drop pulse (already inline)
- Hardened in-process mutex on file writes (see Implementation notes)
