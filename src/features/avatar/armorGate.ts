import type { ArmorPiece, AvatarProfile, DailyArmorSession, VoxelArmorPieceId } from '../../core/types'
import { getAppliedVoxelPieces, getEquippablePieces } from './armorPieceState'
import { ALL_ARMOR_VOXEL_PIECES, MINECRAFT_TIER_ORDER, getActiveForgeTierFromProgress } from './armorTierProgress'

export interface ArmorGateStatus {
  /** True when every forged piece is equipped for the current day */
  complete: boolean
  /** Number of currently equipped forged pieces (for today) */
  equipped: number
  /** Total forged pieces that should be equipped today */
  total: number
  /** Voxel IDs of pieces not yet equipped today */
  missing: VoxelArmorPieceId[]
  /** Whether the child has any forged pieces at all */
  hasForgedPieces: boolean
}


export function getForgedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const forgedByTier = profile.forgedPieces
  if (forgedByTier) {
    // Count pieces from tiers up to and including the active forge tier.
    // Tiers above the active one shouldn't have forged pieces (the active
    // tier is the lowest with unforged slots). If they do — e.g. from
    // legacy data — ignore them so phantom pieces don't inflate the gate
    // total beyond what suitUpAll / gallery can actually equip.
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

  // Legacy fallback where forgedPieces may be absent and unlock/equip state implies forged wood pieces.
  return getEquippablePieces(profile)
}

function getAppliedTodayVoxel(profile: AvatarProfile, appliedPieces: ArmorPiece[] | undefined): VoxelArmorPieceId[] {
  if (Array.isArray(appliedPieces)) {
    return getAppliedVoxelPieces(appliedPieces)
  }
  return Array.isArray(profile.equippedPieces) ? profile.equippedPieces as VoxelArmorPieceId[] : []
}

/**
 * Shared gate computation based on forged pieces + today's daily armor session.
 * Profile equippedPieces can still be used for rendering, but not for readiness.
 */
export function getArmorGateStatus(
  profile: AvatarProfile,
  appliedPiecesToday?: ArmorPiece[],
): ArmorGateStatus {
  const equippable = getForgedVoxelPieces(profile)
  const appliedTodayVoxel = getAppliedTodayVoxel(profile, appliedPiecesToday)
  const missing = equippable.filter((id) => !appliedTodayVoxel.includes(id))
  const hasForgedPieces = equippable.length > 0

  return {
    complete: hasForgedPieces && missing.length === 0,
    equipped: equippable.filter((id) => appliedTodayVoxel.includes(id)).length,
    total: equippable.length,
    missing,
    hasForgedPieces,
  }
}

/** Backward-compatible boolean check used by existing callers. */
export function isArmorComplete(profile: AvatarProfile, appliedPiecesToday?: ArmorPiece[]): boolean {
  return getArmorGateStatus(profile, appliedPiecesToday).complete
}

/** Convenience helper when a DailyArmorSession object is available. */
export function getArmorGateStatusFromSession(
  profile: AvatarProfile,
  session: Pick<DailyArmorSession, 'appliedPieces'> | null | undefined,
): ArmorGateStatus {
  return getArmorGateStatus(profile, session?.appliedPieces)
}
