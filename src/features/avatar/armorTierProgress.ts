import type { AvatarProfile, ArmorTier, VoxelArmorPieceId } from '../../core/types'
import { ARMOR_TIERS } from '../../core/xp/armorTiers'

export const MINECRAFT_TIER_ORDER: ArmorTier[] = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
export const ALL_ARMOR_VOXEL_PIECES: VoxelArmorPieceId[] = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

/**
 * The tier to render a given piece at — the highest tier it has been forged at.
 * Falls back to `fallbackTier` (then 'wood') for pieces without a forge record,
 * which covers legacy profiles where unlockedPieces preceded the per-tier forge map.
 */
export function getPieceForgedTier(
  forgedPieces: AvatarProfile['forgedPieces'] | undefined,
  pieceId: string,
  fallbackTier: string = 'wood',
): string {
  if (forgedPieces) {
    for (let i = MINECRAFT_TIER_ORDER.length - 1; i >= 0; i--) {
      const tier = MINECRAFT_TIER_ORDER[i]
      if (forgedPieces[tier]?.[pieceId]) return tier
    }
  }
  return fallbackTier
}

/**
 * Preview tier for a piece when a gallery tab is selected: the highest forged
 * tier at or below the selected tab. Pieces not yet forged at the selected
 * tier fall back to their current best (or wood). This is what drives the
 * "Iron belt + Stone everything else" aspirational preview on the Iron tab.
 */
export function getPreviewTierForPiece(
  forgedPieces: AvatarProfile['forgedPieces'] | undefined,
  pieceId: string,
  selectedTab: string,
): string {
  const tabKey = selectedTab.toLowerCase() as ArmorTier
  const maxIndex = MINECRAFT_TIER_ORDER.indexOf(tabKey)
  const startIndex = maxIndex >= 0 ? maxIndex : MINECRAFT_TIER_ORDER.length - 1
  if (forgedPieces) {
    for (let i = startIndex; i >= 0; i--) {
      const tier = MINECRAFT_TIER_ORDER[i]
      if (forgedPieces[tier]?.[pieceId]) return tier
    }
  }
  return 'wood'
}

export function getTierForgedCount(profile: AvatarProfile, tier: string): number {
  return ALL_ARMOR_VOXEL_PIECES.filter((pieceId) => Boolean(profile.forgedPieces?.[tier]?.[pieceId])).length
}

export function isTierComplete(profile: AvatarProfile, tier: string): boolean {
  return getTierForgedCount(profile, tier) >= ALL_ARMOR_VOXEL_PIECES.length
}

/** Get the minimum XP required for a tier. */
export function getTierMinXp(tier: string): number {
  const info = ARMOR_TIERS.find((t) => t.tier === tier)
  return info?.minXp ?? 0
}

/**
 * Progression rule (dual requirement):
 * - Wood is always unlocked.
 * - The next tier unlocks when BOTH:
 *   (a) current tier is fully forged (all 6 pieces), AND
 *   (b) profile XP meets the next tier's minimum threshold.
 * - If legacy data already contains forged pieces in a higher tier, preserve access.
 */
export function deriveUnlockedTiersFromForged(profile: AvatarProfile): ArmorTier[] {
  const unlocked: ArmorTier[] = ['wood']

  for (let idx = 0; idx < MINECRAFT_TIER_ORDER.length - 1; idx++) {
    const current = MINECRAFT_TIER_ORDER[idx]
    const next = MINECRAFT_TIER_ORDER[idx + 1]
    const hasForgedInNext = getTierForgedCount(profile, next) > 0
    const nextMinXp = getTierMinXp(next)
    const xpMet = profile.totalXp >= nextMinXp

    if ((isTierComplete(profile, current) && xpMet) || hasForgedInNext) {
      unlocked.push(next)
      continue
    }
    break
  }

  return unlocked
}

/**
 * The tier to display in the forge gallery.
 * Returns the lowest unlocked tier with unforged pieces, OR the next tier
 * (even if locked) when all unlocked tiers are complete — so the UI can
 * show locked pieces with a clear requirement message.
 */
export function getActiveForgeTierFromProgress(profile: AvatarProfile): ArmorTier {
  const unlocked = deriveUnlockedTiersFromForged(profile)

  // Return lowest unlocked tier with unforged pieces
  for (const tier of unlocked) {
    if (!isTierComplete(profile, tier)) return tier
  }

  // All unlocked tiers are complete — show the next tier (even if locked)
  const highest = unlocked[unlocked.length - 1] ?? 'wood'
  const idx = MINECRAFT_TIER_ORDER.indexOf(highest)
  if (idx < MINECRAFT_TIER_ORDER.length - 1) {
    return MINECRAFT_TIER_ORDER[idx + 1]
  }

  return highest
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

/**
 * Returns a human-readable reason why a tier is locked, or empty string if unlocked.
 */
export function getTierLockReason(profile: AvatarProfile, tier: string): string {
  const unlocked = deriveUnlockedTiersFromForged(profile)
  if (unlocked.includes(tier as ArmorTier)) return ''

  const tierIdx = MINECRAFT_TIER_ORDER.indexOf(tier as ArmorTier)
  if (tierIdx <= 0) return '' // Wood is always unlocked

  const priorTier = MINECRAFT_TIER_ORDER[tierIdx - 1]
  const priorComplete = isTierComplete(profile, priorTier)
  const tierMinXp = getTierMinXp(tier)
  const xpMet = profile.totalXp >= tierMinXp

  if (!priorComplete && !xpMet) {
    const forgedCount = getTierForgedCount(profile, priorTier)
    const capTier = priorTier.charAt(0).toUpperCase() + priorTier.slice(1)
    return `Complete ${capTier} (${forgedCount}/6) & earn ${tierMinXp} XP`
  }
  if (!priorComplete) {
    const forgedCount = getTierForgedCount(profile, priorTier)
    const capTier = priorTier.charAt(0).toUpperCase() + priorTier.slice(1)
    return `Complete ${capTier} first (${forgedCount}/6)`
  }
  if (!xpMet) {
    return `Need ${tierMinXp} XP (have ${profile.totalXp})`
  }
  return ''
}
