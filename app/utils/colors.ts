/**
 * Agent accent color palette.
 * Model colors/badges are in ~/utils/models.ts — import from there.
 */
export const agentColorMap: Record<string, string> = {
  pink: '#ec4899',
  orange: '#f97316',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#22c55e',
  purple: '#a855f7',
  yellow: '#eab308',
  red: '#ef4444',
}

export function getAgentColor(color: string | undefined): string {
  return agentColorMap[color || ''] || '#71717a'
}
