import type { VoxelArmorPieceId } from '../types'

/**
 * Diamond cost to forge each armor piece per tier.
 * See docs/GAME_WORLD_ECONOMY.md for full design context.
 */
/**
 * Rebalanced for ~96 diamonds/week earning rate.
 * Effective pace (accounting for tier completion bonuses):
 *   Wood: ~85  (~0.9 weeks)   Stone: ~115 (~1.2 weeks)   Iron: ~180 (~1.9 weeks)
 *   Gold: ~280 (~2.9 weeks)   Diamond: ~430 (~4.5 weeks) Netherite: ~650 (~6.8 weeks)
 */
export const FORGE_COSTS: Record<string, Record<VoxelArmorPieceId, number>> = {
  wood:      { belt: 10,  shoes: 10,  breastplate: 14, shield: 15,  helmet: 16,  sword: 20  },  // 85
  stone:     { belt: 16,  shoes: 16,  breastplate: 22, shield: 25,  helmet: 26,  sword: 30  },  // 135
  iron:      { belt: 25,  shoes: 25,  breastplate: 35, shield: 40,  helmet: 40,  sword: 45  },  // 210
  gold:      { belt: 40,  shoes: 40,  breastplate: 55, shield: 60,  helmet: 60,  sword: 75  },  // 330
  diamond:   { belt: 60,  shoes: 60,  breastplate: 85, shield: 95,  helmet: 95,  sword: 110 },  // 505
  netherite: { belt: 95,  shoes: 95,  breastplate: 130, shield: 140, helmet: 140, sword: 170 },  // 770
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

/**
 * Diamond bonus awarded when a child completes all 6 pieces of a tier.
 * Deduped per child per tier — can only be earned once.
 */
export const TIER_COMPLETION_BONUSES: Record<string, number> = {
  wood: 20,
  stone: 30,
  iron: 50,
  gold: 75,
  diamond: 120,
  netherite: 200,
} as const
