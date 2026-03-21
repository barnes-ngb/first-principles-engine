import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

import { app } from '../firebase/firebase'
import { avatarProfilesCollection, xpLedgerCollection } from '../firebase/firestore'
import { ARMOR_PIECES } from '../types'
import type {
  ArmorPiece,
  ArmorPieceProgress,
  ArmorTier,
  AvatarProfile,
  PlatformerTier,
} from '../types'

// ── Cloud Function types ─────────────────────────────────────────

interface ArmorPieceGenRequest {
  familyId: string
  childId: string
  pieceId: string
  tier: string
  themeStyle: 'minecraft' | 'platformer'
  prompt: string
}

interface ArmorPieceGenResponse {
  url: string
  storagePath: string
}

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

/** Check if a piece has been unlocked at the diamond/powerup level. */
function hasDiamondTier(
  progress: ArmorPieceProgress | undefined,
  themeStyle: 'minecraft' | 'platformer',
): boolean {
  if (!progress) return false
  if (themeStyle === 'minecraft') return progress.unlockedTiers.includes('diamond')
  return (progress.unlockedTiersPlatformer ?? []).includes('powerup')
}

/** Get the prompt for a piece at a specific tier. */
function getPromptForTier(
  pieceId: ArmorPiece,
  tier: ArmorTier | PlatformerTier,
): string {
  const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
  if (!pieceDef) return ''
  switch (tier) {
    case 'stone':    return pieceDef.lincolnStonePrompt
    case 'diamond':  return pieceDef.lincolnDiamondPrompt
    case 'netherite': return pieceDef.lincolnNetheritePrompt
    case 'basic':    return pieceDef.londonBasicPrompt
    case 'powerup':  return pieceDef.londonPowerupPrompt
    case 'champion': return pieceDef.londonChampionPrompt
  }
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
  /** Set if a full-set tier upgrade happened */
  tierUpgrade?: {
    from: ArmorTier | PlatformerTier
    to: ArmorTier | PlatformerTier
  }
}

/**
 * Checks whether new armor pieces should unlock based on the child's totalXp,
 * and whether all 6 stone/basic pieces trigger a full-set tier upgrade.
 *
 * - Unlocks stone/basic pieces individually as XP accumulates.
 * - When all 6 have stone/basic: upgrades currentTier → diamond/powerup,
 *   generates all 6 next-tier images.
 * - When all 6 have diamond/powerup: upgrades → netherite/champion.
 */
export async function checkAndUnlockArmor(
  familyId: string,
  childId: string,
  totalXp?: number,
): Promise<ArmorUnlockResult> {
  if (!familyId || !childId) return { newlyUnlockedPieces: [] }

  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)

  if (!profileSnap.exists()) return { newlyUnlockedPieces: [] }

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
        // Add stone tier to existing entry
        if (themeStyle === 'minecraft') {
          existing.unlockedTiers = [...existing.unlockedTiers, 'stone']
        } else {
          existing.unlockedTiersPlatformer = [
            ...(existing.unlockedTiersPlatformer ?? []),
            'basic',
          ]
        }
      } else {
        // Create new entry
        pieces.push({
          pieceId: pieceDef.id,
          unlockedTiers: themeStyle === 'minecraft' ? ['stone'] : [],
          unlockedTiersPlatformer: themeStyle === 'platformer' ? ['basic'] : undefined,
          generatedImageUrls: {},
        })
      }
    }
  }

  if (newlyUnlocked.length === 0 && !shouldUpgradeTier(pieces, themeStyle, profile.currentTier)) {
    // No changes — update totalXp if needed
    if (xp !== profile.totalXp) {
      await setDoc(profileRef, { ...profile, pieces, totalXp: xp, updatedAt: new Date().toISOString() })
    }
    return { newlyUnlockedPieces: [] }
  }

  // ── Save immediately before async image gen ──────────────────
  await setDoc(profileRef, {
    ...profile,
    pieces,
    totalXp: xp,
    updatedAt: new Date().toISOString(),
  })

  // ── Generate stone images for newly unlocked pieces ──────────
  const fns = getFunctions(app)
  const generateArmorPieceFn = httpsCallable<ArmorPieceGenRequest, ArmorPieceGenResponse>(
    fns,
    'generateArmorPiece',
  )

  const stoneTier: ArmorTier | PlatformerTier = themeStyle === 'minecraft' ? 'stone' : 'basic'
  for (const pieceId of newlyUnlocked) {
    const prompt = getPromptForTier(pieceId, stoneTier)
    try {
      const result = await generateArmorPieceFn({
        familyId,
        childId,
        pieceId,
        tier: stoneTier,
        themeStyle,
        prompt,
      })
      const refreshed = await getDoc(profileRef)
      const refreshedProfile = refreshed.exists()
        ? ensureNewProfileStructure(refreshed.data() as unknown as Record<string, unknown>)
        : profile
      const updatedPieces = refreshedProfile.pieces.map((p) =>
        p.pieceId === pieceId
          ? {
              ...p,
              generatedImageUrls: {
                ...p.generatedImageUrls,
                [stoneTier]: result.data.url,
              },
            }
          : p,
      )
      await setDoc(profileRef, {
        ...refreshedProfile,
        pieces: updatedPieces,
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.warn(`Armor image generation failed for ${pieceId} (${stoneTier}):`, err)
    }
  }

  // ── Check for tier upgrade ───────────────────────────────────
  const latestSnap = await getDoc(profileRef)
  const latestProfile = latestSnap.exists()
    ? ensureNewProfileStructure(latestSnap.data() as unknown as Record<string, unknown>)
    : { ...profile, pieces }

  const upgradeResult = await performTierUpgradeIfEligible(
    familyId,
    childId,
    latestProfile,
    profileRef,
    generateArmorPieceFn,
  )

  return { newlyUnlockedPieces: newlyUnlocked, tierUpgrade: upgradeResult }
}

// ── Tier upgrade helpers ─────────────────────────────────────────

function shouldUpgradeTier(
  pieces: ArmorPieceProgress[],
  themeStyle: 'minecraft' | 'platformer',
  currentTier: ArmorTier | PlatformerTier,
): boolean {
  if (pieces.length < ARMOR_PIECES.length) return false

  if (currentTier === 'stone' || currentTier === 'basic') {
    // All 6 have stone/basic → upgrade to diamond/powerup
    return pieces.every((p) => hasStoneTier(p, themeStyle))
  }
  if (currentTier === 'diamond' || currentTier === 'powerup') {
    // All 6 have diamond/powerup → upgrade to netherite/champion
    return pieces.every((p) => hasDiamondTier(p, themeStyle))
  }
  return false
}

function getNextTier(
  current: ArmorTier | PlatformerTier,
): (ArmorTier | PlatformerTier) | null {
  if (current === 'stone')    return 'diamond'
  if (current === 'diamond')  return 'netherite'
  if (current === 'basic')    return 'powerup'
  if (current === 'powerup')  return 'champion'
  return null
}

async function performTierUpgradeIfEligible(
  familyId: string,
  childId: string,
  profile: AvatarProfile,
  profileRef: ReturnType<typeof doc>,
  generateFn: ReturnType<typeof httpsCallable<ArmorPieceGenRequest, ArmorPieceGenResponse>>,
): Promise<ArmorUnlockResult['tierUpgrade']> {
  if (!shouldUpgradeTier(profile.pieces, profile.themeStyle, profile.currentTier)) {
    return undefined
  }

  const nextTier = getNextTier(profile.currentTier)
  if (!nextTier) return undefined

  // Update currentTier immediately
  const updatedProfile = { ...profile, currentTier: nextTier, updatedAt: new Date().toISOString() }
  await setDoc(profileRef, updatedProfile)

  // Generate all 6 next-tier images in parallel
  const generatePromises = ARMOR_PIECES.map(async (pieceDef) => {
    const prompt = getPromptForTier(pieceDef.id, nextTier)
    try {
      const result = await generateFn({
        familyId,
        childId,
        pieceId: pieceDef.id,
        tier: nextTier,
        themeStyle: profile.themeStyle,
        prompt,
      })
      return { pieceId: pieceDef.id, url: result.data.url }
    } catch (err) {
      console.warn(`Tier upgrade image gen failed for ${pieceDef.id} (${nextTier}):`, err)
      return null
    }
  })

  const results = await Promise.all(generatePromises)

  // Write all new image URLs
  const finalSnap = await getDoc(profileRef)
  const finalProfile = finalSnap.exists()
    ? ensureNewProfileStructure(finalSnap.data() as unknown as Record<string, unknown>)
    : updatedProfile

  const updatedPieces = finalProfile.pieces.map((p) => {
    const result = results.find((r) => r?.pieceId === p.pieceId)
    if (!result) return p
    return {
      ...p,
      unlockedTiers:
        profile.themeStyle === 'minecraft'
          ? [...p.unlockedTiers, nextTier as ArmorTier].filter(
              (t, i, arr) => arr.indexOf(t) === i,
            )
          : p.unlockedTiers,
      unlockedTiersPlatformer:
        profile.themeStyle === 'platformer'
          ? [...(p.unlockedTiersPlatformer ?? []), nextTier as PlatformerTier].filter(
              (t, i, arr) => arr.indexOf(t) === i,
            )
          : p.unlockedTiersPlatformer,
      generatedImageUrls: {
        ...p.generatedImageUrls,
        [nextTier]: result.url,
      },
    }
  })

  await setDoc(profileRef, {
    ...finalProfile,
    pieces: updatedPieces,
    currentTier: nextTier,
    updatedAt: new Date().toISOString(),
  })

  return { from: profile.currentTier, to: nextTier }
}
