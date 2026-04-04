import { doc, getDoc } from 'firebase/firestore'

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
import { TIERS } from '../../features/avatar/voxel/tierMaterials'
import { normalizeAvatarProfile } from '../../features/avatar/normalizeProfile'
import { safeSetProfile } from '../../features/avatar/safeProfileWrite'

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
  if (themeStyle === 'minecraft') return (progress.unlockedTiers ?? []).includes('stone')
  return (progress.unlockedTiersPlatformer ?? []).includes('basic')
}

/** Migrate a profile from the old unlockedPieces/generatedImageUrls shape if needed. */
export function ensureNewProfileStructure(raw: Record<string, unknown>): AvatarProfile {
  if (Array.isArray(raw.pieces)) {
    const profile = raw as unknown as AvatarProfile
    // Ensure ALL array fields are never null/undefined from Firestore
    if (!Array.isArray(profile.equippedPieces)) profile.equippedPieces = []
    if (!Array.isArray(profile.pieces)) profile.pieces = []
    // Guard sub-arrays inside each piece
    profile.pieces = profile.pieces.map((p) => {
      if (!p) return { pieceId: 'unknown' as ArmorPiece, unlockedTiers: [] as ArmorTier[], generatedImageUrls: {} }
      return {
        ...p,
        unlockedTiers: Array.isArray(p.unlockedTiers) ? p.unlockedTiers : [],
        unlockedTiersPlatformer: p.unlockedTiersPlatformer != null
          ? (Array.isArray(p.unlockedTiersPlatformer) ? p.unlockedTiersPlatformer : [])
          : undefined,
      }
    })
    return profile
  }

  // pieces exists but is not an array (e.g. Firestore map) — treat as missing
  if (raw.pieces != null && !Array.isArray(raw.pieces)) {
    raw.pieces = undefined
  }

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
    ...(raw.starterImageUrl ? { baseCharacterUrl: raw.starterImageUrl as string } : {}),
    ...(raw.photoTransformUrl ? { photoTransformUrl: raw.photoTransformUrl as string } : {}),
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
  /** Tiers newly unlocked by XP threshold */
  newlyUnlockedTiers?: string[]
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

  const profile: AvatarProfile = profileSnap.exists()
    ? normalizeAvatarProfile(profileSnap.data())
    : normalizeAvatarProfile({ childId })

  // Read XP from xpLedger cumulative doc (source of truth) when not passed explicitly.
  // The cumulative doc only includes XP entries (diamond entries are event-only),
  // so this correctly excludes diamonds from tier/armor calculations.
  let xp = totalXp ?? 0
  if (totalXp === undefined) {
    const ledgerRef = doc(xpLedgerCollection(familyId), childId)
    const ledgerSnap = await getDoc(ledgerRef)
    xp = ledgerSnap.exists() ? (ledgerSnap.data().totalXp as number) ?? 0 : profile.totalXp ?? 0
  }

  const { themeStyle } = profile
  const pieces = [...(profile.pieces ?? [])]

  // ── Find newly eligible stone/basic pieces ───────────────────
  const newlyUnlocked: ArmorPiece[] = []
  for (const pieceDef of ARMOR_PIECES) {
    const existing = getPieceProgress(pieces, pieceDef.id)
    if (!hasStoneTier(existing, themeStyle) && xp >= pieceDef.xpToUnlockStone) {
      newlyUnlocked.push(pieceDef.id)
      if (existing) {
        if (themeStyle === 'minecraft') {
          existing.unlockedTiers = [...(existing.unlockedTiers ?? []), 'stone']
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
          ...(themeStyle === 'platformer' ? { unlockedTiersPlatformer: ['basic'] as PlatformerTier[] } : {}),
          generatedImageUrls: {},
        })
      }
    }
  }

  // ── Compute unlocked tiers from XP thresholds ──────────────────
  const prevUnlockedTiers = profile.unlockedTiers ?? ['wood']
  const unlockedTiers: string[] = []
  for (const [tierKey, tierDef] of Object.entries(TIERS)) {
    if (xp >= tierDef.minXp) {
      unlockedTiers.push(tierKey.toLowerCase())
    }
  }
  // Ensure wood is always unlocked
  if (!unlockedTiers.includes('wood')) unlockedTiers.unshift('wood')

  // ── Compute unlocked voxel pieces from XP thresholds ──────────
  // Legacy: still track unlockedPieces for backward compat
  const unlockedVoxelPieces: VoxelArmorPieceId[] = []
  const equippedPieces: string[] = profile.equippedPieces ?? []
  for (const [voxelId, threshold] of Object.entries(XP_THRESHOLDS)) {
    if (xp >= threshold) {
      unlockedVoxelPieces.push(voxelId as VoxelArmorPieceId)
      // Auto-equip newly unlocked pieces (only if already forged or legacy)
      const isForged = Boolean(profile.forgedPieces?.[profile.currentTier ?? 'wood']?.[voxelId])
      const isLegacyUnlocked = (profile.unlockedPieces ?? []).includes(voxelId) && !profile.forgedPieces
      if ((isForged || isLegacyUnlocked) && !equippedPieces.includes(voxelId)) {
        equippedPieces.push(voxelId)
      }
    }
  }

  // ── Migrate existing unlocked pieces to forgedPieces if needed ─
  let forgedPieces = profile.forgedPieces ?? {}
  if (!profile.forgedPieces && (profile.unlockedPieces ?? []).length > 0) {
    // Legacy migration: treat already-unlocked pieces as forged at wood tier
    const woodForged: Record<string, { forgedAt: string }> = {}
    for (const pieceId of profile.unlockedPieces ?? []) {
      woodForged[pieceId] = { forgedAt: profile.updatedAt || new Date().toISOString() }
    }
    forgedPieces = { wood: woodForged }
  }

  const newlyUnlockedVoxel = newlyUnlocked.map((id) => ARMOR_PIECE_TO_VOXEL[id])
  const newlyUnlockedTiers = unlockedTiers.filter((t) => !prevUnlockedTiers.includes(t))

  // ── Save updated profile (no image generation needed!) ────────
  await safeSetProfile(profileRef, {
    ...profile,
    pieces,
    totalXp: xp,
    unlockedPieces: unlockedVoxelPieces,
    unlockedTiers,
    forgedPieces,
    equippedPieces,
  } as unknown as Record<string, unknown>)

  return {
    newlyUnlockedPieces: newlyUnlocked,
    newlyUnlockedVoxelPieces: newlyUnlockedVoxel,
    ...(newlyUnlockedTiers.length > 0 ? { newlyUnlockedTiers } : {}),
  }
}
