import { TIERS } from '../features/avatar/voxel/tierMaterials'

/** Compute next tier label and XP needed. Returns null at max tier. */
export function getNextTier(
  totalXp: number,
): { label: string; xpNeeded: number; progress: number } | null {
  const tierEntries = Object.values(TIERS).sort((a, b) => a.minXp - b.minXp)
  for (let i = 0; i < tierEntries.length; i++) {
    if (totalXp < tierEntries[i].minXp) {
      const prev = i > 0 ? tierEntries[i - 1] : { minXp: 0, label: 'Start' }
      const range = tierEntries[i].minXp - prev.minXp
      const earned = totalXp - prev.minXp
      return {
        label: tierEntries[i].label,
        xpNeeded: tierEntries[i].minXp - totalXp,
        progress: range > 0 ? Math.min(earned / range, 1) : 1,
      }
    }
  }
  return null // Max tier reached
}

/** Label of the highest tier reached at `totalXp` (Wood → Netherite). */
export function getCurrentTierLabel(totalXp: number): string {
  const tierEntries = Object.values(TIERS).sort((a, b) => b.minXp - a.minXp)
  for (const tier of tierEntries) {
    if (totalXp >= tier.minXp) return tier.label
  }
  return TIERS.WOOD.label
}
