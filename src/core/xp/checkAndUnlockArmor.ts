import { doc, getDoc, setDoc } from 'firebase/firestore'

import { avatarProfilesCollection, xpLedgerCollection } from '../firebase/firestore'
import { ARMOR_PIECES } from '../types'
import type {
  ArmorPiece,
  ArmorPieceProgress,
  ArmorTier,
  AvatarProfile,
  PlatformerTier,
  VoxelArmorPieceId,
} from '../types'
import { ARMOR_PIECE_TO_VOXEL } from '../types'
import { XP_THRESHOLDS } from '../../features/avatar/voxel/buildArmorPiece'

// ── Helpers ──────────────────────────────────────────────────────

/** Get the ArmorPieceProgress entry for a piece, or undefined. */
function getPieceProgress(
  pieces: ArmorPieceProgress[],
  pieceId: ArmorPiece,
): ArmorPieceProgress | undefined {
  return pieces.find((p) => p.pieceId === pieceId)
}

/** Check if a piece has been unlocked at the stone/basic level. */
function hasStoneTier(
  progress: ArmorPieceProgress | undefined,
  themeStyle: 'minecraft' | 'platformer',
): boolean {
  if (!progress) return false
  if (themeStyle === 'minecraft') return progress.unlockedTiers.includes('stone')
  return (progress.unlockedTiersPlatformer ?? []).includes('basic')
}

/** Migrate a profile from the old unlockedPieces/generatedImageUrls shape if needed. */
export function ensureNewProfileStructure(raw: Record<string, unknown>): AvatarProfile {
  if (Array.isArray(raw.pieces)) return raw as unknown as AvatarProfile

  // Legacy migration: convert unlockedPieces + generatedImageUrls → pieces
  const unlockedPieces = (raw.unlockedPieces as ArmorPiece[] | undefined) ?? []
  const generatedImageUrls = (raw.generatedImageUrls as Record<string, string> | undefined) ?? {}
  const themeStyle = (raw.themeStyle as 'minecraft' | 'platformer') ?? 'minecraft'

  const pieces: ArmorPieceProgress[] = unlockedPieces.map((id) => ({
    pieceId: id,
    unlockedTiers: themeStyle === 'minecraft' ? (['stone'] as ArmorTier[]) : [],
    unlockedTiersPlatformer: themeStyle === 'platformer' ? (['basic'] as PlatformerTier[]) : undefined,
    generatedImageUrls: {
      [themeStyle === 'minecraft' ? 'stone' : 'basic']: generatedImageUrls[id],
    },
  }))

  return {
    childId: raw.childId as string,
    themeStyle,
    pieces,
    currentTier: themeStyle === 'minecraft' ? 'stone' : 'basic',
    baseCharacterUrl: (raw.starterImageUrl as string | undefined),
    photoTransformUrl: (raw.photoTransformUrl as string | undefined),
    totalXp: (raw.totalXp as number) ?? 0,
    updatedAt: (raw.updatedAt as string) ?? new Date().toISOString(),
  }
}

// ── Main export ──────────────────────────────────────────────────

export interface ArmorUnlockResult {
  /** Pieces newly unlocked at stone/basic tier */
  newlyUnlockedPieces: ArmorPiece[]
  /** Voxel piece IDs newly unlocked */
  newlyUnlockedVoxelPieces: VoxelArmorPieceId[]
  /** Set if a full-set tier upgrade happened */
  tierUpgrade?: {
    from: ArmorTier | PlatformerTier
    to: ArmorTier | PlatformerTier
  }
}

/**
 * Checks whether new armor pieces should unlock based on the child's totalXp.
 *
 * In the new 3D voxel system, armor pieces are geometry — no image generation needed.
 * This function just updates the profile's unlocked pieces based on XP thresholds.
 */
export async function checkAndUnlockArmor(
  familyId: string,
  childId: string,
  totalXp?: number,
): Promise<ArmorUnlockResult> {
  if (!familyId || !childId) return { newlyUnlockedPieces: [], newlyUnlockedVoxelPieces: [] }

  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)

  if (!profileSnap.exists()) return { newlyUnlockedPieces: [], newlyUnlockedVoxelPieces: [] }

  const profile = ensureNewProfileStructure(
    profileSnap.data() as unknown as Record<string, unknown>,
  )

  // Read XP from xpLedger (source of truth) when not passed explicitly
  let xp = totalXp ?? 0
  if (totalXp === undefined) {
    const ledgerRef = doc(xpLedgerCollection(familyId), childId)
    const ledgerSnap = await getDoc(ledgerRef)
    xp = ledgerSnap.exists() ? (ledgerSnap.data().totalXp as number) ?? 0 : profile.totalXp ?? 0
  }

  const { themeStyle } = profile
  const pieces = [...profile.pieces]

  // ── Find newly eligible stone/basic pieces ───────────────────
  const newlyUnlocked: ArmorPiece[] = []
  for (const pieceDef of ARMOR_PIECES) {
    const existing = getPieceProgress(pieces, pieceDef.id)
    if (!hasStoneTier(existing, themeStyle) && xp >= pieceDef.xpToUnlockStone) {
      newlyUnlocked.push(pieceDef.id)
      if (existing) {
        if (themeStyle === 'minecraft') {
          existing.unlockedTiers = [...existing.unlockedTiers, 'stone']
        } else {
          existing.unlockedTiersPlatformer = [
            ...(existing.unlockedTiersPlatformer ?? []),
            'basic',
          ]
        }
      } else {
        pieces.push({
          pieceId: pieceDef.id,
          unlockedTiers: themeStyle === 'minecraft' ? ['stone'] : [],
          unlockedTiersPlatformer: themeStyle === 'platformer' ? ['basic'] : undefined,
          generatedImageUrls: {},
        })
      }
    }
  }

  // ── Compute unlocked voxel pieces from XP thresholds ──────────
  const unlockedVoxelPieces: VoxelArmorPieceId[] = []
  const equippedPieces: string[] = profile.equippedPieces ?? []
  for (const [voxelId, threshold] of Object.entries(XP_THRESHOLDS)) {
    if (xp >= threshold) {
      unlockedVoxelPieces.push(voxelId as VoxelArmorPieceId)
      // Auto-equip newly unlocked pieces
      if (!equippedPieces.includes(voxelId)) {
        equippedPieces.push(voxelId)
      }
    }
  }

  const newlyUnlockedVoxel = newlyUnlocked.map((id) => ARMOR_PIECE_TO_VOXEL[id])

  // ── Save updated profile (no image generation needed!) ────────
  await setDoc(profileRef, {
    ...profile,
    pieces,
    totalXp: xp,
    unlockedPieces: unlockedVoxelPieces,
    equippedPieces,
    updatedAt: new Date().toISOString(),
  })

  return {
    newlyUnlockedPieces: newlyUnlocked,
    newlyUnlockedVoxelPieces: newlyUnlockedVoxel,
  }
}
