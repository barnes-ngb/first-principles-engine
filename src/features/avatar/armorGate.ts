import type { AvatarProfile, VoxelArmorPieceId } from '../../core/types'

/** Get the tier the child is currently forging in (lowest unlocked tier with unforged pieces). */
function getActiveForgeTier(profile: AvatarProfile): string {
  const tiers = profile.unlockedTiers ?? ['wood']
  const forged = profile.forgedPieces ?? {}
  const allPieceIds: VoxelArmorPieceId[] = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

  for (const tier of tiers) {
    const tierForged = forged[tier] ?? {}
    const allForgedInTier = allPieceIds.every(id => tierForged[id])
    if (!allForgedInTier) return tier
  }

  return tiers[tiers.length - 1] ?? 'wood'
}

/** Pieces that can be equipped (forged in active tier). */
function getEquippablePieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const activeTier = getActiveForgeTier(profile)
  const forged = profile.forgedPieces?.[activeTier] ?? {}
  return Object.keys(forged) as VoxelArmorPieceId[]
}

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
