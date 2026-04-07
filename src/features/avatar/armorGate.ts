import type { ArmorPiece, AvatarProfile, DailyArmorSession, VoxelArmorPieceId } from '../../core/types'
import { getAppliedVoxelPieces, getEquippablePieces } from './armorPieceState'

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

function getAppliedTodayVoxel(appliedPieces: ArmorPiece[] | undefined): VoxelArmorPieceId[] {
  return getAppliedVoxelPieces(Array.isArray(appliedPieces) ? appliedPieces : [])
}

/**
 * Shared gate computation based on forged pieces + today's daily armor session.
 * Profile equippedPieces can still be used for rendering, but not for readiness.
 */
export function getArmorGateStatus(
  profile: AvatarProfile,
  appliedPiecesToday?: ArmorPiece[],
): ArmorGateStatus {
  const equippable = getEquippablePieces(profile)
  const appliedTodayVoxel = getAppliedTodayVoxel(appliedPiecesToday)
  const missing = equippable.filter((id) => !appliedTodayVoxel.includes(id))

  return {
    complete: equippable.length === 0 || missing.length === 0,
    equipped: equippable.filter((id) => appliedTodayVoxel.includes(id)).length,
    total: equippable.length,
    missing,
    hasForgedPieces: equippable.length > 0,
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
