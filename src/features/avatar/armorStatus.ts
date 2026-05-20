/**
 * SINGLE SOURCE OF TRUTH for daily armor status.
 *
 * Every component that needs to know "is the kid suited up" MUST use
 * `getDailyArmorStatus()`. No component does its own forged-vs-equipped math.
 *
 * Key semantic decision:
 * - "Suited up" means all pieces forged **in the active forge tier** are
 *   equipped today. Lower-tier pieces that don't exist in the active tier
 *   are bonus visual pieces, not gate requirements.
 * - This matches what the gallery shows: only the active forge tier's pieces.
 *   A kid can't be blocked by a piece they can't see or interact with.
 */
import type { ArmorPiece, AvatarProfile, DailyArmorSession, VoxelArmorPieceId } from '../../core/types'
import { getAppliedVoxelPieces, getForgedPiecesForTier } from './armorPieceState'
import { ALL_ARMOR_VOXEL_PIECES, MINECRAFT_TIER_ORDER, getActiveForgeTierFromProgress } from './armorTierProgress'

export interface DailyArmorStatus {
  /** True when every gate-required piece is equipped today */
  isSuitedUp: boolean
  /** Pieces forged in the active forge tier (the gate requirement) */
  gateRequired: VoxelArmorPieceId[]
  /** How many gate-required pieces are equipped today */
  equippedCount: number
  /** Total gate-required pieces (forged in active tier) */
  gateTotal: number
  /** Gate-required pieces not yet equipped today */
  missing: VoxelArmorPieceId[]
  /** Whether the child has any forged pieces at all */
  hasForgedPieces: boolean
  /** The active forge tier (displayed in gallery) */
  activeForgeTier: string
  /**
   * All forged pieces across tiers ≤ active (union of unique slots).
   * Used for visual equip (suitUpAll applies these to the 3D model) but
   * NOT for gate readiness.
   */
  allForgedSlots: VoxelArmorPieceId[]
}

/**
 * Compute gate-required pieces: pieces forged in the active forge tier.
 * This matches what ArmorPieceGallery displays, so the gate and gallery agree.
 *
 * Edge case: if the active forge tier has 0 forged pieces (kid just moved up
 * and hasn't started forging yet), fall back to the highest completed tier.
 * The kid shouldn't be blocked just because they haven't started the next tier.
 */
function getGateRequiredPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const activeTier = getActiveForgeTierFromProgress(profile)
  const activeTierPieces = getForgedPiecesForTier(profile, activeTier)
  if (activeTierPieces.length > 0) return activeTierPieces

  // Active tier has 0 pieces — use the highest completed tier instead.
  // Walk backward from the tier before activeTier.
  const activeIdx = MINECRAFT_TIER_ORDER.indexOf(activeTier)
  for (let i = activeIdx - 1; i >= 0; i--) {
    const pieces = getForgedPiecesForTier(profile, MINECRAFT_TIER_ORDER[i])
    if (pieces.length > 0) return pieces
  }
  return []
}

/**
 * All forged piece slots across tiers up to and including the active forge tier.
 * Used for visual equip (suitUpAll, 3D character display) — NOT for gate status.
 */
export function getAllForgedSlots(profile: AvatarProfile): VoxelArmorPieceId[] {
  const forgedByTier = profile.forgedPieces
  if (!forgedByTier) {
    // Legacy fallback: treat equipped/unlocked as wood-forged
    return getForgedPiecesForTier(profile, 'wood')
  }

  const activeTier = getActiveForgeTierFromProgress(profile)
  const activeTierIdx = MINECRAFT_TIER_ORDER.indexOf(activeTier)
  const forged = new Set<VoxelArmorPieceId>()

  for (let i = 0; i <= activeTierIdx; i++) {
    const tierPieces = forgedByTier[MINECRAFT_TIER_ORDER[i]]
    if (!tierPieces) continue
    for (const pieceId of ALL_ARMOR_VOXEL_PIECES) {
      if (tierPieces[pieceId]) forged.add(pieceId)
    }
  }

  return [...forged]
}

/**
 * Returns one entry per armor slot: the highest-tier forged version of each piece.
 * Used by suitUpAll to ensure the best version of each piece is equipped.
 */
export function getBestOfSlotForgedPieces(profile: AvatarProfile): Array<{ pieceId: VoxelArmorPieceId; tier: string }> {
  const forgedByTier = profile.forgedPieces
  if (!forgedByTier) {
    // Legacy: treat equipped/unlocked as wood-forged
    return getForgedPiecesForTier(profile, 'wood').map((id) => ({ pieceId: id, tier: 'wood' }))
  }

  const activeTier = getActiveForgeTierFromProgress(profile)
  const activeTierIdx = MINECRAFT_TIER_ORDER.indexOf(activeTier)
  const bestBySlot = new Map<VoxelArmorPieceId, string>()

  // Walk from lowest to highest tier; later tiers overwrite earlier ones.
  for (let i = 0; i <= activeTierIdx; i++) {
    const tier = MINECRAFT_TIER_ORDER[i]
    const tierPieces = forgedByTier[tier]
    if (!tierPieces) continue
    for (const pieceId of ALL_ARMOR_VOXEL_PIECES) {
      if (tierPieces[pieceId]) bestBySlot.set(pieceId, tier)
    }
  }

  return [...bestBySlot.entries()].map(([pieceId, tier]) => ({ pieceId, tier }))
}

function getAppliedTodayVoxel(profile: AvatarProfile, appliedPieces: ArmorPiece[] | undefined): VoxelArmorPieceId[] {
  if (Array.isArray(appliedPieces)) {
    return getAppliedVoxelPieces(appliedPieces)
  }
  // Fallback when no daily session is available — use profile.equippedPieces.
  // This is stale (from the last session) but better than nothing for callers
  // that don't have a session (e.g. AppShell nav indicator).
  return Array.isArray(profile.equippedPieces) ? profile.equippedPieces as VoxelArmorPieceId[] : []
}

/**
 * SINGLE SOURCE OF TRUTH for daily armor status.
 *
 * @param profile - The child's avatar profile
 * @param appliedPiecesToday - Today's applied pieces from DailyArmorSession.
 *   Pass `undefined` for callers without a session (falls back to profile.equippedPieces).
 */
export function getDailyArmorStatus(
  profile: AvatarProfile,
  appliedPiecesToday?: ArmorPiece[],
): DailyArmorStatus {
  const activeForgeTier = getActiveForgeTierFromProgress(profile)
  const gateRequired = getGateRequiredPieces(profile)
  const allForgedSlots = getAllForgedSlots(profile)
  const appliedTodayVoxel = getAppliedTodayVoxel(profile, appliedPiecesToday)
  const missing = gateRequired.filter((id) => !appliedTodayVoxel.includes(id))
  const hasForgedPieces = gateRequired.length > 0

  return {
    isSuitedUp: hasForgedPieces && missing.length === 0,
    gateRequired,
    equippedCount: gateRequired.filter((id) => appliedTodayVoxel.includes(id)).length,
    gateTotal: gateRequired.length,
    missing,
    hasForgedPieces,
    activeForgeTier,
    allForgedSlots,
  }
}

/** Convenience helper when a DailyArmorSession object is available. */
export function getDailyArmorStatusFromSession(
  profile: AvatarProfile,
  session: Pick<DailyArmorSession, 'appliedPieces'> | null | undefined,
): DailyArmorStatus {
  return getDailyArmorStatus(profile, session?.appliedPieces)
}

/** Simple boolean check — backward-compatible with old isArmorComplete callers. */
export function isSuitedUp(profile: AvatarProfile, appliedPiecesToday?: ArmorPiece[]): boolean {
  return getDailyArmorStatus(profile, appliedPiecesToday).isSuitedUp
}
