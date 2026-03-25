import type { AvatarProfile, VoxelArmorPieceId } from '../../core/types'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'

/** Get voxel piece IDs unlocked by the child's current XP. */
function getUnlockedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const xp = profile.totalXp
  return VOXEL_ARMOR_PIECES
    .filter((p) => xp >= XP_THRESHOLDS[p.id])
    .map((p) => p.id)
}

export interface ArmorGateStatus {
  /** True when every unlocked piece is equipped */
  complete: boolean
  /** Number of currently equipped pieces */
  equipped: number
  /** Total unlocked pieces that must be equipped */
  total: number
  /** Voxel IDs of pieces not yet equipped */
  missing: VoxelArmorPieceId[]
}

/** Check whether a child has equipped all unlocked armor pieces. */
export function isArmorComplete(profile: AvatarProfile): boolean {
  const unlocked = getUnlockedVoxelPieces(profile)
  const equipped = profile.equippedPieces ?? []
  return unlocked.length > 0 && unlocked.every((id) => equipped.includes(id))
}

/** Get detailed armor gate status for the UI. */
export function getArmorGateStatus(profile: AvatarProfile): ArmorGateStatus {
  const unlocked = getUnlockedVoxelPieces(profile)
  const equipped = profile.equippedPieces ?? []
  const missing = unlocked.filter((id) => !equipped.includes(id))

  return {
    complete: unlocked.length > 0 && missing.length === 0,
    equipped: unlocked.filter((id) => equipped.includes(id)).length,
    total: unlocked.length,
    missing,
  }
}
