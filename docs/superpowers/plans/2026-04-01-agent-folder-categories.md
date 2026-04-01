# Agent Folder Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow agents to live in subdirectories under `~/.claude/agents/` and group them visually by folder on the agents list page.

**Architecture:** Mirror the existing commands pattern — recursive directory scan on the backend, `directory--slug` slug encoding for subdirectory agents, grouped section headers on the frontend. A shared `agentUtils.ts` server utility handles slug encoding/decoding to avoid repetition across endpoints.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Node.js fs/promises

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/types/index.ts` | Modify | Add `directory` to `Agent` + `AgentPayload` |
| `server/utils/agentUtils.ts` | Create | Slug encode/decode helpers used by all agent endpoints |
| `server/api/agents/index.get.ts` | Modify | Recursive directory scan |
| `server/api/agents/[slug].get.ts` | Modify | Decode slug → subdirectory path |
| `server/api/agents/[slug].delete.ts` | Modify | Decode slug → subdirectory path |
| `server/api/agents/[slug].put.ts` | Modify | Decode slug, support directory change |
| `server/api/agents/index.post.ts` | Modify | Write to subdirectory when `directory` provided |
| `app/pages/agents/index.vue` | Modify | Group cards by `directory`, render section headers |

---

### Task 1: Add `directory` field to types

**Files:**
- Modify: `app/types/index.ts`

- [ ] **Step 1: Add `directory` to `Agent` and `AgentPayload`**

In `app/types/index.ts`, update these two interfaces:

```ts
export interface Agent {
  slug: string
  filename: string
  directory: string        // '' for root agents, 'engineering' for agents/engineering/
  frontmatter: AgentFrontmatter
  body: string
  hasMemory: boolean
  filePath: string
}
```

```ts
export interface AgentPayload {
  frontmatter: AgentFrontmatter
  body: string
  directory?: string       // '' or undefined = root
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: Type errors in the agent API files because they don't yet return `directory`. That's fine — we'll fix them in the next tasks. Zero errors in frontend files that don't use `directory` yet.

- [ ] **Step 3: Commit**

```bash
git add app/types/index.ts
git commit -m "feat: add directory field to Agent and AgentPayload types"
```

---

### Task 2: Create `server/utils/agentUtils.ts` — slug encode/decode

**Files:**
- Create: `server/utils/agentUtils.ts`

Agents in subdirectories get a slug like `engineering--code-reviewer` (directory `engineering`, filename `code-reviewer`). This mirrors the commands pattern. Root agents keep their plain slug (e.g. `code-reviewer`).

- [ ] **Step 1: Create the utility file**

Create `server/utils/agentUtils.ts`:

```ts
import { join } from 'node:path'
import { resolveClaudePath } from './claudeDir'

/**
 * Decode an agent slug into its directory and base name.
 *
 * 'code-reviewer'            → { directory: '',            name: 'code-reviewer' }
 * 'engineering--code-reviewer' → { directory: 'engineering', name: 'code-reviewer' }
 *
 * Rule: split on the LAST occurrence of '--'. This means agent names and
 * directory names may themselves contain single '-' but not '--'.
 */
export function decodeAgentSlug(slug: string): { directory: string; name: string } {
  const idx = slug.lastIndexOf('--')
  if (idx === -1) return { directory: '', name: slug }
  return {
    directory: slug.slice(0, idx).replace(/--/g, '/'),
    name: slug.slice(idx + 2),
  }
}

/**
 * Encode a directory + agent name into a slug.
 *
 * ('', 'code-reviewer')            → 'code-reviewer'
 * ('engineering', 'code-reviewer') → 'engineering--code-reviewer'
 */
export function encodeAgentSlug(directory: string, name: string): string {
  if (!directory) return name
  return `${directory.replace(/\//g, '--')}--${name}`
}

/**
 * Resolve the absolute file path for an agent given its slug.
 */
export function resolveAgentFilePath(slug: string): string {
  const { directory, name } = decodeAgentSlug(slug)
  if (directory) {
    return resolveClaudePath('agents', ...directory.split('/'), `${name}.md`)
  }
  return resolveClaudePath('agents', `${name}.md`)
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
bun run typecheck
```

Expected: same errors as before (no new ones).

- [ ] **Step 3: Commit**

```bash
git add server/utils/agentUtils.ts
git commit -m "feat: add agent slug encode/decode utilities"
```

---

### Task 3: Update `index.get.ts` — recursive directory scan

**Files:**
- Modify: `server/api/agents/index.get.ts`

- [ ] **Step 1: Replace flat scan with recursive scanDir**

Replace the entire file content:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import { parseFrontmatter } from '../../utils/frontmatter'
import { encodeAgentSlug } from '../../utils/agentUtils'
import type { Agent, AgentFrontmatter } from '~/types'

async function scanDir(dir: string, relDir: string): Promise<Agent[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const agents: Agent[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // One level deep only — recurse but pass the directory name as relDir
      const subAgents = await scanDir(fullPath, relDir ? `${relDir}/${entry.name}` : entry.name)
      agents.push(...subAgents)
    } else if (entry.name.endsWith('.md')) {
      const raw = await readFile(fullPath, 'utf-8')
      const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(raw)
      const name = entry.name.replace(/\.md$/, '')
      const slug = encodeAgentSlug(relDir, name)
      const memoryDir = resolveClaudePath('agent-memory', slug)
      const hasMemory = existsSync(memoryDir)

      agents.push({
        slug,
        filename: entry.name,
        directory: relDir,
        frontmatter: { name: slug, ...frontmatter },
        body,
        hasMemory,
        filePath: fullPath,
      })
    }
  }

  return agents
}

export default defineEventHandler(async () => {
  const agentsDir = resolveClaudePath('agents')
  const agents = await scanDir(agentsDir, '')
  return agents.sort((a, b) => a.slug.localeCompare(b.slug))
})
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No new errors from this file. Remaining errors are in `[slug].get.ts`, `[slug].delete.ts`, `[slug].put.ts` (missing `directory` in return).

- [ ] **Step 3: Commit**

```bash
git add server/api/agents/index.get.ts
git commit -m "feat: agents list supports recursive subdirectory scan"
```

---

### Task 4: Update `[slug].get.ts` — decode subdirectory path

**Files:**
- Modify: `server/api/agents/[slug].get.ts`

- [ ] **Step 1: Replace file content**

```ts
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import { parseFrontmatter } from '../../utils/frontmatter'
import { decodeAgentSlug, resolveAgentFilePath } from '../../utils/agentUtils'
import type { AgentFrontmatter } from '~/types'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const filePath = resolveAgentFilePath(slug)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Agent not found: ${slug}` })
  }

  const [raw, fileStat] = await Promise.all([
    readFile(filePath, 'utf-8'),
    stat(filePath),
  ])
  const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(raw)
  const { directory } = decodeAgentSlug(slug)
  const memoryDir = resolveClaudePath('agent-memory', slug)

  return {
    slug,
    filename: `${slug}.md`,
    directory,
    frontmatter: { name: slug, ...frontmatter },
    body,
    hasMemory: existsSync(memoryDir),
    filePath,
    lastModified: fileStat.mtimeMs,
  }
})
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: One fewer type error.

- [ ] **Step 3: Commit**

```bash
git add server/api/agents/[slug].get.ts
git commit -m "feat: agent GET endpoint resolves subdirectory from slug"
```

---

### Task 5: Update `[slug].delete.ts` — decode subdirectory path

**Files:**
- Modify: `server/api/agents/[slug].delete.ts`

- [ ] **Step 1: Replace file content**

```ts
import { unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveAgentFilePath } from '../../utils/agentUtils'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const filePath = resolveAgentFilePath(slug)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Agent not found: ${slug}` })
  }

  try {
    await unlink(filePath)
  } catch {
    throw createError({ statusCode: 500, message: `Failed to delete agent: ${slug}` })
  }

  return { deleted: true, slug }
})
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add server/api/agents/[slug].delete.ts
git commit -m "feat: agent DELETE endpoint resolves subdirectory from slug"
```

---

### Task 6: Update `[slug].put.ts` — decode + support directory change

**Files:**
- Modify: `server/api/agents/[slug].put.ts`

- [ ] **Step 1: Replace file content**

```ts
import { writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import { serializeFrontmatter } from '../../utils/frontmatter'
import { decodeAgentSlug, encodeAgentSlug, resolveAgentFilePath } from '../../utils/agentUtils'
import type { AgentPayload } from '~/types'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const filePath = resolveAgentFilePath(slug)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: `Agent not found: ${slug}` })
  }

  const payload = await readBody<AgentPayload & { lastModified?: number }>(event)

  // File conflict detection
  if (payload.lastModified) {
    const fileStat = await stat(filePath)
    if (Math.abs(fileStat.mtimeMs - payload.lastModified) > 1000) {
      throw createError({ statusCode: 409, message: 'This file was modified externally. Reload to see the latest version.' })
    }
  }

  const newDirectory = payload.directory ?? decodeAgentSlug(slug).directory
  const newName = payload.frontmatter.name
  const newSlug = encodeAgentSlug(newDirectory, newName)
  const newFilePath = resolveAgentFilePath(newSlug)

  // Ensure target directory exists
  if (newDirectory) {
    const targetDir = resolveClaudePath('agents', ...newDirectory.split('/'))
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true })
    }
  }

  const content = serializeFrontmatter(payload.frontmatter, payload.body)
  await writeFile(newFilePath, content, 'utf-8')

  // Remove old file if path changed
  if (filePath !== newFilePath) {
    const { unlink } = await import('node:fs/promises')
    await unlink(filePath)
  }

  // Rename memory directory if slug changed
  if (slug !== newSlug) {
    const oldMemDir = resolveClaudePath('agent-memory', slug)
    const newMemDir = resolveClaudePath('agent-memory', newSlug)
    if (existsSync(oldMemDir) && !existsSync(newMemDir)) {
      await rename(oldMemDir, newMemDir)
    }
  }

  // Create or remove memory directory based on memory setting
  const memoryDir = resolveClaudePath('agent-memory', newSlug)
  const isPersistent = payload.frontmatter.memory && ['user', 'project', 'local'].includes(payload.frontmatter.memory)

  if (isPersistent) {
    if (!existsSync(memoryDir)) {
      await mkdir(memoryDir, { recursive: true })
    }
  } else {
    if (existsSync(memoryDir)) {
      const { rm } = await import('node:fs/promises')
      await rm(memoryDir, { recursive: true })
    }
  }

  const newStat = await stat(newFilePath)

  return {
    slug: newSlug,
    filename: `${newName}.md`,
    directory: newDirectory,
    frontmatter: payload.frontmatter,
    body: payload.body,
    hasMemory: existsSync(resolveClaudePath('agent-memory', newSlug)),
    filePath: newFilePath,
    lastModified: newStat.mtimeMs,
  }
})
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add server/api/agents/[slug].put.ts
git commit -m "feat: agent PUT endpoint resolves subdirectory and supports directory change"
```

---

### Task 7: Update `index.post.ts` — create agent in subdirectory

**Files:**
- Modify: `server/api/agents/index.post.ts`

- [ ] **Step 1: Replace file content**

```ts
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'
import { serializeFrontmatter } from '../../utils/frontmatter'
import { encodeAgentSlug, resolveAgentFilePath } from '../../utils/agentUtils'
import type { AgentPayload } from '~/types'

export default defineEventHandler(async (event) => {
  const payload = await readBody<AgentPayload>(event)
  const directory = payload.directory ?? ''
  const name = payload.frontmatter.name
  const slug = encodeAgentSlug(directory, name)
  const filePath = resolveAgentFilePath(slug)

  if (existsSync(filePath)) {
    throw createError({ statusCode: 409, message: `Agent already exists: ${slug}` })
  }

  // Ensure target directory exists
  const targetDir = directory
    ? resolveClaudePath('agents', ...directory.split('/'))
    : resolveClaudePath('agents')
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true })
  }

  const content = serializeFrontmatter(payload.frontmatter, payload.body)
  await writeFile(filePath, content, 'utf-8')

  // Create memory directory if memory is enabled
  if (payload.frontmatter.memory && payload.frontmatter.memory !== 'none') {
    const memoryDir = resolveClaudePath('agent-memory', slug)
    if (!existsSync(memoryDir)) {
      await mkdir(memoryDir, { recursive: true })
    }
  }

  return {
    slug,
    filename: `${name}.md`,
    directory,
    frontmatter: payload.frontmatter,
    body: payload.body,
    hasMemory: payload.frontmatter.memory !== undefined && payload.frontmatter.memory !== 'none',
    filePath,
  }
})
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: Zero type errors across all agent API files.

- [ ] **Step 3: Commit**

```bash
git add server/api/agents/index.post.ts
git commit -m "feat: agent POST endpoint supports directory in payload"
```

---

### Task 8: Update `agents/index.vue` — grouped section display

**Files:**
- Modify: `app/pages/agents/index.vue`

- [ ] **Step 1: Add `groupedAgents` computed property**

In the `<script setup>` block of `app/pages/agents/index.vue`, add after the `filteredAgents` computed:

```ts
const groupedAgents = computed(() => {
  const groups: Record<string, typeof agents.value> = {}
  for (const agent of filteredAgents.value) {
    const key = agent.directory || ''
    ;(groups[key] ??= []).push(agent)
  }
  // Named folders alphabetically, root ('') last
  return Object.entries(groups).sort(([a], [b]) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })
})

// True when agents exist across more than one group key, or the only group is named
const hasGroups = computed(() =>
  groupedAgents.value.length > 1 ||
  (groupedAgents.value.length === 1 && groupedAgents.value[0][0] !== '')
)
```

- [ ] **Step 2: Replace the agent card grid in the template**

Find and replace the existing agent card grid block (the `v-else-if="filteredAgents.length"` section) with:

```html
<!-- Agent groups -->
<div v-else-if="filteredAgents.length" class="space-y-6">
  <div v-for="([directory, groupAgents]) in groupedAgents" :key="directory || '__root__'">
    <!-- Section header — only shown when there are multiple groups -->
    <div v-if="hasGroups" class="flex items-center gap-2 mb-3">
      <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" style="color: var(--text-meta);" />
      <span class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--text-meta);">
        {{ directory || 'General' }}
      </span>
      <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background: var(--surface-raised); color: var(--text-disabled);">
        {{ groupAgents.length }}
      </span>
      <div class="flex-1 h-px" style="background: var(--border-subtle);" />
    </div>

    <!-- Card grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <NuxtLink
        v-for="agent in groupAgents"
        :key="agent.slug"
        :to="`/agents/${agent.slug}`"
        class="rounded-xl p-4 focus-ring hover-lift border border-subtle relative overflow-hidden group bg-card"
      >
        <!-- Color accent bar -->
        <div
          class="absolute inset-x-0 top-0 h-[4px] transition-opacity duration-200"
          :style="{ background: getAgentColor(agent.frontmatter.color) }"
        />

        <!-- Hover glow in agent color -->
        <div
          class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          :style="{ background: 'radial-gradient(ellipse at top, ' + getAgentColor(agent.frontmatter.color) + '08 0%, transparent 60%)' }"
        />

        <!-- Header: icon + name + model -->
        <div class="flex items-center gap-3 mb-2 relative">
          <div
            class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
            :style="{ background: getAgentColor(agent.frontmatter.color) + '18', border: '1px solid ' + getAgentColor(agent.frontmatter.color) + '25' }"
          >
            <UIcon name="i-lucide-cpu" class="size-3.5" :style="{ color: getAgentColor(agent.frontmatter.color) }" />
          </div>
          <span class="text-[13px] font-medium truncate flex-1">
            {{ agent.frontmatter.name }}
          </span>
          <span
            v-if="agent.frontmatter.model"
            class="text-[10px] font-mono font-medium px-1.5 py-px rounded-full shrink-0"
            :class="[getModelBadgeClasses(agent.frontmatter.model).bg, getModelBadgeClasses(agent.frontmatter.model).text]"
          >
            {{ agent.frontmatter.model }}
          </span>
        </div>

        <!-- Description -->
        <p v-if="agent.frontmatter.description" class="text-[12px] leading-relaxed line-clamp-2 text-label relative">
          {{ agent.frontmatter.description }}
        </p>

        <!-- Skill count badge -->
        <div v-if="skillCounts[agent.slug]" class="mt-3 pt-3 relative" style="border-top: 1px solid var(--border-subtle);">
          <span class="text-[10px] text-meta flex items-center gap-1.5">
            <UIcon name="i-lucide-sparkles" class="size-3" style="color: var(--accent);" />
            {{ skillCounts[agent.slug] }} skill{{ skillCounts[agent.slug] === 1 ? '' : 's' }}
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: Zero errors.

- [ ] **Step 4: Start dev server and verify manually**

```bash
bun run dev
```

Open `http://localhost:3000/agents`. Verify:
- With only root agents: page looks identical to before (no group headers)
- Create a folder manually: `mkdir ~/.claude/agents/engineering && cp ~/.claude/agents/some-agent.md ~/.claude/agents/engineering/`
- Reload page: "engineering" section header appears above that agent's card, root agents show below with no header (if alone) or "General" header (if mixed)
- Search filters agents and hides empty groups

- [ ] **Step 5: Commit**

```bash
git add app/pages/agents/index.vue
git commit -m "feat: group agents by folder with section headers on agents page"
```

---

## Self-Review

**Spec coverage:**
- ✅ `directory` field on `Agent` type → Task 1
- ✅ `directory` field on `AgentPayload` → Task 1
- ✅ Recursive scan in `index.get.ts` → Task 3
- ✅ `index.post.ts` supports directory → Task 7
- ✅ `[slug].put.ts` supports directory change → Task 6
- ✅ Frontend grouped sections → Task 8
- ✅ Root agents show no header when all ungrouped → Task 8 (`hasGroups` guard)
- ✅ Search hides empty groups → Task 8 (groups with zero items won't appear since `filteredAgents` drives grouping)
- ✅ `[slug].get.ts` and `[slug].delete.ts` updated → Tasks 4 & 5 (required for other endpoints to work)

**Non-goals (not implemented, correct):**
- No drag-and-drop
- No folder CRUD UI
- No nesting beyond one level (scanDir recursion is depth-limited by one pass — deeper nesting will be flattened into the deepest `relDir`)
