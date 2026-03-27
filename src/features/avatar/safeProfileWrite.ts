import type { DocumentReference } from 'firebase/firestore'
import { setDoc, updateDoc } from 'firebase/firestore'

import type { AvatarProfile } from '../../core/types'

/**
 * Strip undefined values from an object — Firestore rejects them.
 */
function stripUndefinedValues(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  )
}

/**
 * Safe partial update for an avatar profile document.
 * - Strips undefined values (Firestore rejects them)
 * - Ensures array fields are never null
 * - Adds updatedAt timestamp
 */
export async function safeUpdateProfile(
  profileRef: DocumentReference,
  data: Partial<AvatarProfile> & Record<string, unknown>,
): Promise<void> {
  const cleaned = stripUndefinedValues(data as Record<string, unknown>)

  // Ensure arrays are never null
  if ('equippedPieces' in cleaned) {
    cleaned.equippedPieces = Array.isArray(cleaned.equippedPieces) ? cleaned.equippedPieces : []
  }
  if ('pieces' in cleaned) {
    cleaned.pieces = Array.isArray(cleaned.pieces) ? cleaned.pieces : []
  }
  if ('unlockedPieces' in cleaned) {
    cleaned.unlockedPieces = Array.isArray(cleaned.unlockedPieces) ? cleaned.unlockedPieces : []
  }

  cleaned.updatedAt = new Date().toISOString()

  try {
    await updateDoc(profileRef, cleaned)
  } catch (err) {
    console.error('Failed to update avatar profile:', err, 'Data:', cleaned)
    throw err
  }
}

/**
 * Safe full write (setDoc) for an avatar profile document.
 * - Strips undefined values
 * - Ensures array fields are never null
 * - Adds updatedAt timestamp
 */
export async function safeSetProfile(
  profileRef: DocumentReference,
  data: AvatarProfile | Record<string, unknown>,
): Promise<void> {
  const cleaned = stripUndefinedValues(data as Record<string, unknown>)

  // Ensure arrays are never null
  cleaned.equippedPieces = Array.isArray(cleaned.equippedPieces) ? cleaned.equippedPieces : []
  cleaned.pieces = Array.isArray(cleaned.pieces) ? cleaned.pieces : []
  if ('unlockedPieces' in cleaned) {
    cleaned.unlockedPieces = Array.isArray(cleaned.unlockedPieces) ? cleaned.unlockedPieces : []
  }

  cleaned.updatedAt = new Date().toISOString()

  try {
    await setDoc(profileRef, cleaned)
  } catch (err) {
    console.error('Failed to set avatar profile:', err, 'Data:', cleaned)
    throw err
  }
}
