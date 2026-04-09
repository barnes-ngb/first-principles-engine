import type { AvatarProfile, ArmorTier, VoxelArmorPieceId } from '../../core/types'

export const MINECRAFT_TIER_ORDER: ArmorTier[] = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
export const ALL_ARMOR_VOXEL_PIECES: VoxelArmorPieceId[] = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

export function getTierForgedCount(profile: AvatarProfile, tier: string): number {
  return ALL_ARMOR_VOXEL_PIECES.filter((pieceId) => Boolean(profile.forgedPieces?.[tier]?.[pieceId])).length
}

export function isTierComplete(profile: AvatarProfile, tier: string): boolean {
  return getTierForgedCount(profile, tier) >= ALL_ARMOR_VOXEL_PIECES.length
}

/**
 * Progression rule:
 * - Wood is always unlocked.
 * - The next tier unlocks only after current tier is fully forged.
 * - If legacy data already contains forged pieces in a higher tier, preserve access.
 */
export function deriveUnlockedTiersFromForged(profile: AvatarProfile): ArmorTier[] {
  const unlocked: ArmorTier[] = ['wood']

  for (let idx = 0; idx < MINECRAFT_TIER_ORDER.length - 1; idx++) {
    const current = MINECRAFT_TIER_ORDER[idx]
    const next = MINECRAFT_TIER_ORDER[idx + 1]
    const hasForgedInNext = getTierForgedCount(profile, next) > 0
    if (isTierComplete(profile, current) || hasForgedInNext) {
      unlocked.push(next)
      continue
    }
    break
  }

  return unlocked
}

/** Current material to show in Hero Hub (the tier the child is actively forging). */
export function getActiveForgeTierFromProgress(profile: AvatarProfile): ArmorTier {
  const unlocked = deriveUnlockedTiersFromForged(profile)
  for (const tier of unlocked) {
    if (!isTierComplete(profile, tier)) return tier
  }
  return unlocked[unlocked.length - 1] ?? 'wood'
}

/** Highest fully completed tier (falls back to active forge tier when none complete). */
export function getDisplayArmorTier(profile: AvatarProfile): ArmorTier {
  let highestComplete: ArmorTier | null = null
  for (const tier of MINECRAFT_TIER_ORDER) {
    if (!isTierComplete(profile, tier)) break
    highestComplete = tier
  }
  return highestComplete ?? getActiveForgeTierFromProgress(profile)
}
