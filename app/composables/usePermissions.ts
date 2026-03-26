/**
 * Permission management composable for Chat v2.
 * Handles pending permissions, permission mode, and auto-expiry.
 */

import type { PendingPermission, PermissionMode } from '~/types'

const EXPIRY_CHECK_INTERVAL = 10_000 // Check every 10 seconds
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

export function usePermissions() {
  // Pending permissions map: permissionId -> PendingPermission
  const pendingPermissions = ref<Map<string, PendingPermission>>(new Map())

  // Current permission mode
  const permissionMode = ref<PermissionMode>('default')

  // Remembered decisions (tool name -> allow/deny)
  const rememberedDecisions = ref<Map<string, 'allow' | 'deny'>>(new Map())

  // Expiry check interval
  let expiryInterval: NodeJS.Timeout | null = null

  /**
   * Add a pending permission
   */
  function addPending(permission: PendingPermission) {
    pendingPermissions.value.set(permission.id, permission)

    // Ensure expiry check is running
    startExpiryCheck()
  }

  /**
   * Remove a pending permission
   */
  function removePending(permissionId: string) {
    pendingPermissions.value.delete(permissionId)

    // Stop expiry check if no more pending
    if (pendingPermissions.value.size === 0) {
      stopExpiryCheck()
    }
  }

  /**
   * Get a pending permission by ID
   */
  function getPending(permissionId: string): PendingPermission | undefined {
    return pendingPermissions.value.get(permissionId)
  }

  /**
   * Get all pending permissions as array
   */
  function getAllPending(): PendingPermission[] {
    return Array.from(pendingPermissions.value.values())
  }

  /**
   * Get all pending permissions for a session
   */
  function getPendingForSession(sessionId: string): PendingPermission[] {
    return getAllPending().filter(p => p.sessionId === sessionId)
  }

  /**
   * Check if there are any pending permissions
   */
  const hasPending = computed(() => pendingPermissions.value.size > 0)

  /**
   * Respond to a permission request
   */
  async function respond(
    permissionId: string,
    decision: 'allow' | 'deny',
    remember = false
  ): Promise<boolean> {
    const permission = pendingPermissions.value.get(permissionId)

    if (!permission) {
      console.warn(`[Permissions] Permission ${permissionId} not found`)
      return false
    }

    // Remember decision if requested
    if (remember) {
      rememberedDecisions.value.set(permission.toolName, decision)
    }

    // Remove from pending
    removePending(permissionId)

    // Send response to server
    try {
      await $fetch('/api/v2/permissions/respond', {
        method: 'POST',
        body: {
          permissionId,
          decision,
          remember,
        },
      })
      return true
    } catch (error: any) {
      console.error('[Permissions] Failed to respond:', error)
      return false
    }
  }

  /**
   * Check if we have a remembered decision for a tool
   */
  function getRememberedDecision(toolName: string): 'allow' | 'deny' | null {
    return rememberedDecisions.value.get(toolName) || null
  }

  /**
   * Clear remembered decisions
   */
  function clearRemembered() {
    rememberedDecisions.value.clear()
  }

  /**
   * Set permission mode
   */
  function setMode(mode: PermissionMode) {
    permissionMode.value = mode
  }

  /**
   * Check and remove expired permissions
   */
  function checkExpired() {
    const now = Date.now()
    const expired: string[] = []

    for (const [id, permission] of pendingPermissions.value) {
      if (new Date(permission.expiresAt).getTime() < now) {
        expired.push(id)
      }
    }

    for (const id of expired) {
      console.log(`[Permissions] Permission ${id} expired`)
      removePending(id)
    }
  }

  /**
   * Start the expiry check interval
   */
  function startExpiryCheck() {
    if (expiryInterval) return

    expiryInterval = setInterval(() => {
      checkExpired()
    }, EXPIRY_CHECK_INTERVAL)
  }

  /**
   * Stop the expiry check interval
   */
  function stopExpiryCheck() {
    if (expiryInterval) {
      clearInterval(expiryInterval)
      expiryInterval = null
    }
  }

  /**
   * Clear all permissions
   */
  function clearAll() {
    pendingPermissions.value.clear()
    stopExpiryCheck()
  }

  /**
   * Create a permission from a message
   */
  function createFromMessage(message: any): PendingPermission {
    return {
      id: message.requestId || message.id,
      toolName: message.toolName || 'Unknown',
      toolInput: message.toolInput,
      sessionId: message.sessionId,
      receivedAt: message.timestamp || new Date().toISOString(),
      expiresAt: new Date(Date.now() + DEFAULT_EXPIRY_MS).toISOString(),
      message: message.content,
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopExpiryCheck()
  })

  return {
    // State
    pendingPermissions: readonly(pendingPermissions),
    permissionMode,
    hasPending,

    // Actions
    addPending,
    removePending,
    getPending,
    getAllPending,
    getPendingForSession,
    respond,
    getRememberedDecision,
    clearRemembered,
    setMode,
    clearAll,
    createFromMessage,
  }
}
