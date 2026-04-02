# Chat Session URL Routing — Design Spec

**Date:** 2026-04-02
**Branch:** feat/chat-session-resume
**Status:** Approved

---

## Goal

Give each chat session its own shareable URL so users can deep-link, use the browser back/forward buttons, and reload without losing their place.

**Target URL format:**
```
/cli/project/<projectName>/session/<sessionId>
```

---

## Constraints

- No change to chat loading behavior (the 1000ms minimum loading delay stays)
- No change to streaming or message display behavior
- `ChatV2Interface` must not remount when navigating between sessions
- Deep linking: navigating directly to a session URL must load the correct session

---

## Architecture

### Route Structure

Nuxt 3 nested routes. `cli.vue` is the **parent** — it persists across all child routes and never remounts.

```
/cli                                           → cli.vue (parent only)
/cli/project/:projectName/session/:sessionId   → cli.vue (parent) + empty child
```

The child page exists only to register the route and populate `useRoute().params`. It has no template content.

### File Changes

| File | Change |
|---|---|
| `app/pages/cli.vue` | Add hidden `<NuxtPage />` |
| `app/pages/cli/project/[projectName]/session/[sessionId].vue` | New empty child page |
| `app/components/cli/chatv2/ChatV2Interface.vue` | Add route sync logic |

---

## Sync Logic

### Incoming URL → Internal State (deep link + browser nav)

`ChatV2Interface` watches `useRoute().params`:

```
watch(route.params.projectName + route.params.sessionId):
  if both present AND different from current urlProjectName/urlSessionId:
    → call handleClaudeCodeSessionSelected({ projectName, sessionId, ... })
```

For deep links on fresh page load, projects must be loaded first before the session can be resolved. The watch fires once projects are available (already handled by `useClaudeCodeHistory` mounting).

To get `sessionSummary` and `projectDisplayName` when deep-linking:
- After projects load, find the project by `projectName` from `history.projects`
- Find the session by `sessionId` from `history.sessions` (may require fetching sessions for that project first)
- Fall back to empty strings if not yet available (summary loads with messages anyway)

### Internal State → URL (sidebar clicks, new chat, clear)

| Action | URL change |
|---|---|
| User clicks a session in sidebar | `navigateTo('/cli/project/${projectName}/session/${sessionId}')` |
| User starts a new chat | `navigateTo('/cli')` |
| User clears selection (back to projects) | `navigateTo('/cli')` |
| New session created by SDK | `navigateTo('/cli/project/${projectName}/session/${newSessionId}')` |

### Guard: Avoid Feedback Loops

The route watcher must not re-trigger navigation if the URL already matches the current internal state:

```
if (params.sessionId === urlSessionId.value && params.projectName === urlProjectName.value) return
```

---

## Edge Cases

| Case | Handling |
|---|---|
| Deep link to unknown session | Session selection proceeds; history fetch may return empty messages — same as clicking a deleted session |
| Deep link before projects load | Watch fires when projects become available; no special loading state needed |
| New session created mid-chat | After `currentSessionId` watcher sets `urlSessionId`, also call `navigateTo` to update URL |
| User navigates browser Back to `/cli` | Route watcher fires with no params → `handleSelectionCleared()` |

---

## What Does Not Change

- `handleClaudeCodeSessionSelected()` — called identically to sidebar clicks
- The 1000ms minimum loading delay
- Streaming, message display, permission banners
- All internal refs (`viewMode`, `urlProjectName`, `urlSessionId`, etc.) — remain source of truth, URL is kept in sync

---

## Reference

Pattern sourced from `claudecodeui-logic-reference`:
- `src/App.tsx` — two routes rendering the same `AppContent` component
- `src/hooks/useProjectsState.ts` — `sessionId` from URL, watch projects to auto-select session, `navigate('/session/${id}')` on session click
