import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

import { app } from '../firebase/firebase'
import { avatarProfilesCollection } from '../firebase/firestore'
import { ARMOR_PIECES } from '../types/domain'
import type { ArmorPiece, AvatarProfile } from '../types/domain'

interface AvatarImageRequest {
  familyId: string
  childId: string
  pieceId: ArmorPiece
  themeStyle: 'minecraft' | 'platformer'
  pieceDescription: string
}

interface AvatarImageResponse {
  url: string
  storagePath: string
}

const functions = getFunctions(app)
const generateAvatarImageFn = httpsCallable<AvatarImageRequest, AvatarImageResponse>(
  functions,
  'generateAvatarPiece',
)

/**
 * Reads the child's current totalXp (or uses the provided value),
 * checks ARMOR_PIECES thresholds, and unlocks any newly eligible pieces.
 * For each newly unlocked piece, triggers DALL-E generation and saves the URL.
 *
 * Returns the array of newly unlocked pieces (empty if none).
 */
export async function checkAndUnlockArmor(
  familyId: string,
  childId: string,
  totalXp?: number,
): Promise<ArmorPiece[]> {
  if (!familyId || !childId) return []

  // ── Read avatar profile ──────────────────────────────────────
  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)

  let profile: AvatarProfile
  if (profileSnap.exists()) {
    profile = profileSnap.data()
  } else {
    // No profile yet — nothing to unlock
    return []
  }

  const xp = totalXp ?? profile.totalXp ?? 0
  const alreadyUnlocked = new Set(profile.unlockedPieces ?? [])

  // ── Find newly eligible pieces ───────────────────────────────
  const newlyUnlocked: ArmorPiece[] = []
  for (const piece of ARMOR_PIECES) {
    if (xp >= piece.xpRequired && !alreadyUnlocked.has(piece.id)) {
      newlyUnlocked.push(piece.id)
    }
  }

  if (newlyUnlocked.length === 0) return []

  // ── Update unlockedPieces immediately (before image gen) ─────
  const updatedPieces = [...profile.unlockedPieces, ...newlyUnlocked]
  await setDoc(profileRef, {
    ...profile,
    unlockedPieces: updatedPieces,
    totalXp: xp,
    updatedAt: new Date().toISOString(),
  })

  // ── Generate images for newly unlocked pieces ────────────────
  for (const pieceId of newlyUnlocked) {
    const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
    if (!pieceDef) continue

    const pieceDescription =
      profile.themeStyle === 'minecraft'
        ? pieceDef.lincolnDescription
        : pieceDef.londonDescription

    try {
      const result = await generateAvatarImageFn({
        familyId,
        childId,
        pieceId,
        themeStyle: profile.themeStyle,
        pieceDescription,
      })

      // Write image URL back to avatarProfile
      const refreshedSnap = await getDoc(profileRef)
      const refreshed = refreshedSnap.exists() ? refreshedSnap.data() : profile
      await setDoc(profileRef, {
        ...refreshed,
        generatedImageUrls: {
          ...(refreshed.generatedImageUrls ?? {}),
          [pieceId]: result.data.url,
        },
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.warn(`Avatar image generation failed for ${pieceId}:`, err)
      // Continue — piece is still unlocked, image can be regenerated later
    }
  }

  return newlyUnlocked
}
