import { doc, getDoc } from 'firebase/firestore'

import { avatarProfilesCollection } from '../firebase/firestore'
import type { AvatarProfile, ForgedPieceEntry, VoxelArmorPieceId } from '../types'
import { normalizeAvatarProfile } from '../../features/avatar/normalizeProfile'
import { safeUpdateProfile } from '../../features/avatar/safeProfileWrite'
import { spendDiamonds } from './getDiamondBalance'
import { getForgeCost } from './forgeCosts'
import { XP_THRESHOLDS } from '../../features/avatar/voxel/buildArmorPiece'
import { ALL_ARMOR_VOXEL_PIECES, deriveUnlockedTiersFromForged, getActiveForgeTierFromProgress } from '../../features/avatar/armorTierProgress'

export interface ForgeResult {
  success: boolean
  error?: 'tier_locked' | 'already_forged' | 'insufficient_diamonds' | 'invalid_input' | 'xp_locked'
  newBalance?: number
}

/**
 * Forge an armor piece for a child. Checks tier unlock, piece status, and diamond balance.
 * Creates a negative diamond ledger entry and updates avatarProfile.forgedPieces.
 */
export async function forgeArmorPiece(
  familyId: string,
  childId: string,
  tier: string,
  piece: VoxelArmorPieceId,
  verseResponse?: string,
  verseResponseAudio?: string,
): Promise<ForgeResult> {
  if (!familyId || !childId || !tier || !piece) {
    return { success: false, error: 'invalid_input' }
  }

  // Load profile
  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)
  const profile: AvatarProfile = profileSnap.exists()
    ? normalizeAvatarProfile(profileSnap.data())
    : normalizeAvatarProfile({ childId })

  // Check tier is unlocked
  const unlockedTiers = deriveUnlockedTiersFromForged(profile)
  if (!unlockedTiers.includes(tier as typeof unlockedTiers[number])) {
    return { success: false, error: 'tier_locked' }
  }

  // Check piece not already forged
  const forgedPieces = profile.forgedPieces ?? {}
  if (forgedPieces[tier]?.[piece]) {
    return { success: false, error: 'already_forged' }
  }

  // Enforce XP lock server-side (single source of truth for unlock eligibility)
  if (profile.totalXp < XP_THRESHOLDS[piece]) {
    return { success: false, error: 'xp_locked' }
  }

  // Check diamond cost
  const cost = getForgeCost(tier, piece)
  if (cost <= 0) {
    return { success: false, error: 'invalid_input' }
  }

  // Attempt to spend diamonds
  const dedupKey = `forge_${tier}_${piece}_${childId}`
  const spent = await spendDiamonds(familyId, childId, cost, dedupKey, 'forge', `${tier}_${piece}`)
  if (!spent) {
    return { success: false, error: 'insufficient_diamonds' }
  }

  // Update forgedPieces on avatar profile
  const entry: ForgedPieceEntry = {
    forgedAt: new Date().toISOString(),
    ...(verseResponse ? { verseResponse } : {}),
    ...(verseResponseAudio ? { verseResponseAudio } : {}),
  }

  const updatedForged = { ...forgedPieces }
  if (!updatedForged[tier]) updatedForged[tier] = {}
  updatedForged[tier] = { ...updatedForged[tier], [piece]: entry }
  const progressionProfile = { ...profile, forgedPieces: updatedForged } as AvatarProfile
  const updatedUnlockedTiers = deriveUnlockedTiersFromForged(progressionProfile)
  const nextActiveTier = getActiveForgeTierFromProgress(progressionProfile)

  // Also update equippedPieces and unlockedPieces for compatibility
  const equippedPieces = [...(profile.equippedPieces ?? [])]
  if (!equippedPieces.includes(piece)) {
    equippedPieces.push(piece)
  }
  const unlockedPieces = [...(profile.unlockedPieces ?? [])]
  if (!unlockedPieces.includes(piece)) {
    unlockedPieces.push(piece)
  }

  await safeUpdateProfile(profileRef, {
    forgedPieces: updatedForged,
    equippedPieces,
    unlockedPieces,
    unlockedTiers: updatedUnlockedTiers,
    currentTier: nextActiveTier,
  } as Partial<AvatarProfile> & Record<string, unknown>)

  const refreshedProfile = await getDoc(profileRef)
  const newBalance = refreshedProfile.exists()
    ? normalizeAvatarProfile(refreshedProfile.data()).diamondBalance ?? 0
    : 0

  return { success: true, newBalance }
}

/** Check if a specific piece is forged at a given tier. */
export function isPieceForged(
  profile: AvatarProfile,
  tier: string,
  piece: VoxelArmorPieceId,
): boolean {
  return Boolean(profile.forgedPieces?.[tier]?.[piece])
}

/** Get all forged pieces for a tier. */
export function getForgedPiecesForTier(
  profile: AvatarProfile,
  tier: string,
): VoxelArmorPieceId[] {
  const tierPieces = profile.forgedPieces?.[tier]
  if (!tierPieces) return []
  return Object.keys(tierPieces) as VoxelArmorPieceId[]
}

/** Check if all 6 pieces are forged for a tier. */
export function isTierComplete(
  profile: AvatarProfile,
  tier: string,
): boolean {
  return getForgedPiecesForTier(profile, tier).length >= ALL_ARMOR_VOXEL_PIECES.length
}
