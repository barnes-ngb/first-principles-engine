import type { ArmorPiece, AvatarProfile, DailyArmorSession, VoxelArmorPieceId } from '../../core/types'
import { getAppliedVoxelPieces, getEquippablePieces } from './armorPieceState'
import { ALL_ARMOR_VOXEL_PIECES } from './armorTierProgress'

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


function getForgedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const forgedByTier = profile.forgedPieces
  if (forgedByTier) {
    const forged = new Set<VoxelArmorPieceId>()

    for (const tierPieces of Object.values(forgedByTier)) {
      for (const pieceId of ALL_ARMOR_VOXEL_PIECES) {
        if (tierPieces?.[pieceId]) forged.add(pieceId)
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
