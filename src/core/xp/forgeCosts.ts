import type { VoxelArmorPieceId } from '../types'

/**
 * Diamond cost to forge each armor piece per tier.
 * See docs/GAME_WORLD_ECONOMY.md for full design context.
 */
export const FORGE_COSTS: Record<string, Record<VoxelArmorPieceId, number>> = {
  wood:      { belt: 5,  shoes: 5,  breastplate: 8,  shield: 8,   helmet: 8,   sword: 10  },
  stone:     { belt: 15, shoes: 15, breastplate: 20, shield: 25,  helmet: 25,  sword: 30  },
  iron:      { belt: 30, shoes: 30, breastplate: 40, shield: 45,  helmet: 45,  sword: 50  },
  gold:      { belt: 50, shoes: 50, breastplate: 65, shield: 70,  helmet: 70,  sword: 80  },
  diamond:   { belt: 80, shoes: 80, breastplate: 100, shield: 110, helmet: 110, sword: 130 },
  netherite: { belt: 120, shoes: 120, breastplate: 150, shield: 160, helmet: 160, sword: 200 },
} as const

/** Get the diamond cost to forge a piece at a tier, or 0 if not found. */
export function getForgeCost(tier: string, piece: VoxelArmorPieceId): number {
  return FORGE_COSTS[tier]?.[piece] ?? 0
}

/** Get total diamond cost for an entire tier. */
export function getTierTotalCost(tier: string): number {
  const tierCosts = FORGE_COSTS[tier]
  if (!tierCosts) return 0
  return Object.values(tierCosts).reduce((sum, cost) => sum + cost, 0)
}
