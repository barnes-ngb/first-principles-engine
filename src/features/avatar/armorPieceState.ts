import { ARMOR_PIECE_TO_VOXEL } from '../../core/types'
import type { ArmorPiece, AvatarProfile, VoxelArmorPieceId } from '../../core/types'
import { XP_THRESHOLDS } from './voxel/buildArmorPiece'

export type ArmorPieceState =
  | 'locked_by_xp'
  | 'forgeable'
  | 'forged_not_equipped_today'
  | 'equipped_today'

const ALL_PIECE_IDS: VoxelArmorPieceId[] = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

/** Get the tier the child is currently forging in (lowest unlocked tier with unforged pieces). */
export function getActiveForgeTier(profile: AvatarProfile): string {
  const tiers = profile.unlockedTiers ?? ['wood']
  const forged = profile.forgedPieces ?? {}

  for (const tier of tiers) {
    const tierForged = forged[tier] ?? {}
    const allForgedInTier = ALL_PIECE_IDS.every((id) => tierForged[id])
    if (!allForgedInTier) return tier
  }

  return tiers[tiers.length - 1] ?? 'wood'
}

function isLegacyForgedEquivalent(profile: AvatarProfile, tier: string, pieceId: VoxelArmorPieceId): boolean {
  if (tier !== 'wood') return false
  if (profile.forgedPieces) return false

  return (profile.unlockedPieces ?? []).includes(pieceId) || (profile.equippedPieces ?? []).includes(pieceId)
}

export function getForgedPiecesForTier(profile: AvatarProfile, tier: string): VoxelArmorPieceId[] {
  const tierPieces = profile.forgedPieces?.[tier] ?? {}
  const forgedFromTier = Object.keys(tierPieces) as VoxelArmorPieceId[]
  if (forgedFromTier.length > 0) return forgedFromTier

  if (!profile.forgedPieces && tier === 'wood') {
    return ALL_PIECE_IDS.filter((pieceId) => isLegacyForgedEquivalent(profile, tier, pieceId))
  }

  return []
}

export function getVisiblePieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const xp = profile.totalXp
  return ALL_PIECE_IDS.filter((pieceId) => xp >= XP_THRESHOLDS[pieceId])
}

export function getEquippablePieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const activeTier = getActiveForgeTier(profile)
  return getForgedPiecesForTier(profile, activeTier)
}

export function getAppliedVoxelPieces(appliedPieces: ArmorPiece[]): VoxelArmorPieceId[] {
  return (appliedPieces ?? []).map((p) => ARMOR_PIECE_TO_VOXEL[p])
}

export function getArmorPieceState(params: {
  profile: AvatarProfile
  pieceId: VoxelArmorPieceId
  activeForgeTier?: string
  appliedTodayVoxel?: VoxelArmorPieceId[]
}): ArmorPieceState {
  const { profile, pieceId, appliedTodayVoxel = [] } = params
  const activeForgeTier = params.activeForgeTier ?? getActiveForgeTier(profile)

  if (profile.totalXp < XP_THRESHOLDS[pieceId]) {
    return 'locked_by_xp'
  }

  const isForged = Boolean(profile.forgedPieces?.[activeForgeTier]?.[pieceId])
    || isLegacyForgedEquivalent(profile, activeForgeTier, pieceId)

  if (!isForged) return 'forgeable'
  if (appliedTodayVoxel.includes(pieceId)) return 'equipped_today'
  return 'forged_not_equipped_today'
}
