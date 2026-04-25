# Project Tree (조감도) — Design Spec

**Date**: 2026-04-25
**Author**: brainstorm session (powpoww + Claude)
**Status**: Approved → ready for implementation plan
**Scope**: Replace the card-grid layout on `/project-artifacts` with a user-categorized indented tree view.

---

## 1. Problem & Goal

The current `/project-artifacts` page lists all Claude Code project directories as a flat card grid. With 32+ projects spanning `personal/`, `workspace/`, `dotfiles/`, and one-off cwd locations, the page provides no spatial sense of where each project belongs. The user wants a "조감도 (bird's-eye view)" that surfaces the natural hierarchy: a global root with manually grouped categories (e.g., `personal`, `workspace`) plus uncategorized standalone projects (e.g., `dotfiles`).

**Success criteria**
- Replace card grid with indented tree on `/project-artifacts`.
- User creates categories on demand; assigns each project via drag-and-drop.
- Standalone projects (no category) appear at root alongside category headers.
- Existing functionality (hide, drill-down, CLI link, Add Project) preserved without regression.
- Categories minimal: name only (no color/icon in v1).

---

## 2. Decisions Locked During Brainstorm

| Question | Decision |
|---|---|
| Where does this view live? | Replace existing `/project-artifacts` page |
| Grouping logic | User-defined categories with manual project tagging |
| Visual layout | Indented tree (like the user's text example) |
| Assign mechanism | Drag-and-drop |
| Category metadata | Name only (extensible object schema, no UI fields) |
| Order: categories | User-defined via drag (persisted) |
| Order: projects within category | `lastActivity` desc (auto) |
| Order: standalone projects | `lastActivity` desc (auto), placed at tree root |

---

## 3. Architecture

### File-level change inventory

| Layer | Change | File |
|---|---|---|
| Storage | New | `~/.claude/project-categories.json` |
| Server util | Modify | `server/utils/claudeCodeHistory.ts` — add load/save/rename/delete helpers, attach `category` field on `getClaudeCodeProjects` |
| Server type | Modify | `ClaudeCodeProject` adds `category?: string` |
| API | New | `server/api/project-categories/index.get.ts` |
| API | New | `server/api/project-categories/index.post.ts` |
| API | New | `server/api/project-categories/[name].put.ts` (rename) |
| API | New | `server/api/project-categories/[name].delete.ts` |
| API | New | `server/api/project-categories/order.put.ts` |
| API | New | `server/api/projects/[projectName]/category.put.ts` |
| Composable | Modify | `app/composables/useClaudeCodeHistory.ts` — add `categories`, `setProjectCategory`, `createCategory`, `renameCategory`, `deleteCategory`, `reorderCategories` |
| Component | New | `app/components/ProjectTree.vue` — root tree container + drag orchestration |
| Component | New | `app/components/ProjectTreeRow.vue` — single project row |
| Component | New | `app/components/CategoryHeader.vue` — category header + drop target |
| Page | Modify | `app/pages/project-artifacts/index.vue` — swap card grid for `<ProjectTree>` |
| Component | Remove | `app/components/ProjectCard.vue` (actions migrated to `ProjectTreeRow.vue`) |

### Preserved features (regression risks)
- `hidden-projects.json` flow + Show-hidden toggle
- `Add Project` button + manual project modal
- Click-through to `/project-artifacts/[name]` drill-down
- `CLI` link per project (now hover-revealed in row)

---

## 4. Data Model

### Storage: `~/.claude/project-categories.json`

```json
{
  "categories": [
    { "name": "personal" },
    { "name": "workspace" }
  ],
  "assignments": {
    "-home-miso-personal-payment": "personal",
    "-home-miso-personal-사업계획서": "personal",
    "-home-miso-workspace-claude-code-agents-ui": "workspace",
    "-home-miso-workspace-cmtx_demo": "workspace"
  }
}
```

- `categories[]` — user-ordered. Object form (not bare strings) so future fields (color, icon) can be added without migration.
- `assignments{}` — `projectSlug → categoryName`. Slugs absent from this map are **standalone**.
- Server attaches `category?: string` to each project in the existing `GET /api/projects` response.

### Type extensions

```ts
// server/utils/claudeCodeHistory.ts
export interface ClaudeCodeProject {
  // ...existing fields
  hidden?: boolean        // already present
  category?: string       // new
}

export interface ProjectCategory {
  name: string
  // future: color?, icon?
}
```

### Integrity rules
- Disk-orphaned `assignments` entries are filtered out at read time (no automatic file rewrite — kept idempotent).
- Rename: update `categories[].name` AND walk `assignments` to swap value, atomically (single file write).
- Delete: remove from `categories[]` AND prune all `assignments` entries pointing to that name. Affected projects become standalone.
- Duplicate names (post-trim, case-sensitive exact match) rejected with 400/409.

---

## 5. API

### New endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/project-categories` | — | `{ categories: [{ name, projectCount }] }` |
| `POST` | `/api/project-categories` | `{ name }` | `201 { name }` · 400 if duplicate/empty |
| `PUT` | `/api/project-categories/[name]` | `{ name: newName }` | `200 { name }` (rename) · 409 on conflict |
| `DELETE` | `/api/project-categories/[name]` | — | `{ success, orphanedCount }` |
| `PUT` | `/api/project-categories/order` | `{ names: [...] }` | `{ success }` (full array replace) |
| `PUT` | `/api/projects/[projectName]/category` | `{ category: string \| null }` | `{ success, category }` (null clears) |

### Reused endpoints
- `GET /api/projects` — **response shape extended**: each project now also includes `category?: string` (alongside existing `hidden?: boolean`). No new query params.
- `PUT /api/projects/[name]/hide` — unchanged
- `PUT /api/projects/[name]/rename` — unchanged
- `POST /api/projects` — unchanged (manual add)
- `DELETE /api/projects/[name]` — unchanged (destructive disk delete; orthogonal to category)

### Validation
- Category `name`: trim → 1–50 chars; reject empty; reject case-sensitive duplicate.
- `name` cannot equal reserved path segment `"order"` (would clash with `PUT /api/project-categories/order`). Reject with 400 message "Reserved name".
- `assignments` value must exist in `categories[]` else 400.
- `order` PUT: `names[]` must be exact set-equal to current `categories[]` (no add/remove via this endpoint).

### Decoding
All dynamic params (`[name]`, `[projectName]`) use `getRouterParam(event, '<n>', { decode: true })` so Korean/special characters in category and project names work.

---

## 6. UI Behavior

### Page layout

```
┌─ PageHeader ─────────────────────────────────────────────────┐
│ Project Artifacts   N(+M hidden)    [Show hidden] [+Cat] [+Proj] │
├──────────────────────────────────────────────────────────────┤
│ <ProjectTree>                                                │
│   📄 dotfiles                          (standalone)          │
│   📄 (other root project)                                    │
│   ▾ 📁 personal · 2                                          │
│      📄 payment                                              │
│      📄 사업계획서                                            │
│   ▾ 📁 workspace · 20                                        │
│      📄 claude-code-agents-ui                                │
│      📄 cmtx_demo  …                                         │
└──────────────────────────────────────────────────────────────┘
```

### Project row anatomy
- Left: drag handle (`grip-vertical`, hover-reveal)
- Center: `displayName` (medium) + truncated mono path (dimmed)
- Right (hover): `CLI` link, `Hide` button (eye-off icon)
- Click → navigates to `/project-artifacts/[name]` (existing drill-down)
- Drag start → opacity 0.4 + ghost follows cursor

### Category header anatomy
- Expand/collapse chevron + folder icon
- Category name (bold) + project count
- Right (hover): pencil (rename) + trash (delete)
- Header is itself a drop target
- Header click (outside buttons) → toggles expansion

### Drag-and-drop matrix

| Source | Target | Outcome |
|---|---|---|
| Project | Category header / body | `assignments[name] = category` |
| Project | Tree-root empty area | `assignments[name] = null` (standalone) |
| Category | Between two categories | `categories[]` order updated |
| (anything) | Invalid target | `not-allowed` cursor; drop ignored |

Visual feedback: 2px accent border on hovered drop target + inline hint "Drop to assign to **{category}**". Successful drop → 250ms highlight pulse.

### Category management
- **Add**: "+ Cat" button → inline input row at top. Enter saves / Esc cancels. Empty/duplicate → toast error.
- **Rename**: hover pencil → inline editable input replaces label. Enter / Esc.
- **Delete**: hover trash → modal "Delete '{name}'? N projects will become standalone." Confirm → DELETE → toast.

### Edge cases
- Empty category: dashed-border placeholder "Drop projects here".
- Hidden + Show-hidden on: dimmed row + eye-off icon. Category count format `personal · 2 (1 hidden)`.
- Concurrent renames in two tabs: server reload-then-validate before file write (in-process lock).

### State persistence
- Server: categories, assignments, order
- Client `useState`: per-session category expanded set (`Set<categoryName>`); not persisted to disk
- Optimistic updates with rollback on API failure

### Performance
~32 projects × few categories → trivial. No virtualization. Plain `v-for`.

---

## 7. Testing & Rollout

### Test matrix

| Level | Target | Priority |
|---|---|---|
| Unit (server) | load/save/rename/delete helpers — file absent, duplicate, orphan cleanup | required |
| API integration | All 6 new endpoints — happy + 400/404/409 | required |
| Component | `<ProjectTree>` renders correctly from server response | recommended |
| E2E (manual) | Drag-drop visual feedback, inline rename, delete modal | manual checklist |
| Regression | Hide / Add Project / drill-down / CLI link unchanged | required |

If upstream lacks a test runner, introduce vitest minimally for the server helpers only.

### Migration
- Missing `project-categories.json` → server returns empty `{categories:[], assignments:{}}` → all projects render as standalone. No migration script needed.
- `hidden-projects.json` is independent. No interference.

### Rollout
- Single-user fork; no feature flag.
- Branch: optionally `feat/project-tree`; otherwise commit on `master`.
- Deployment: `bun run dev` HMR auto-reload; for production preview re-run `bun run build`.

### Risks & mitigations
- **Touch-only environments**: out of scope (desktop-only app).
- **Concurrent-tab conflicts**: in-process lock around file writes; reload+validate before persist.
- **Corrupted JSON**: parse failure → return empty struct + console warn. No auto-backup; user manages via dotfiles git.

### Done criteria
1. All 6 new endpoints respond correctly to curl probes.
2. Tree page supports add/rename/delete categories, drag-drop assign, drag-drop reorder.
3. Hide / Show-hidden / Add Project / drill-down / CLI link still work.
4. `~/.claude/project-categories.json` persists across server restarts.
5. TypeScript `bun run typecheck` passes with zero errors.

---

## 8. Out of Scope (v1)

- Category color, icon, description
- Nested subcategories
- Bulk re-tag (multi-select drag)
- Search / filter input on the tree
- Sync of category metadata to dotfiles repo
- Mobile / touch drag support
- Animated tree transitions beyond drop highlight pulse
