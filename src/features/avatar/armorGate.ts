import type { AvatarProfile, VoxelArmorPieceId } from '../../core/types'
import { getEquippablePieces } from './armorPieceState'

export interface ArmorGateStatus {
  /** True when every forged piece is equipped */
  complete: boolean
  /** Number of currently equipped pieces */
  equipped: number
  /** Total forged pieces that must be equipped */
  total: number
  /** Voxel IDs of pieces not yet equipped */
  missing: VoxelArmorPieceId[]
}

/** Check whether a child has equipped all forged armor pieces. */
export function isArmorComplete(profile: AvatarProfile): boolean {
  const equippable = getEquippablePieces(profile)
  const equipped = profile.equippedPieces ?? []
  return equippable.length > 0 && equippable.every((id) => equipped.includes(id))
}

/** Get detailed armor gate status for the UI. */
export function getArmorGateStatus(profile: AvatarProfile): ArmorGateStatus {
  const equippable = getEquippablePieces(profile)
  const equipped = profile.equippedPieces ?? []
  const missing = equippable.filter((id) => !equipped.includes(id))

  return {
    complete: equippable.length > 0 && missing.length === 0,
    equipped: equippable.filter((id) => equipped.includes(id)).length,
    total: equippable.length,
    missing,
  }
}
