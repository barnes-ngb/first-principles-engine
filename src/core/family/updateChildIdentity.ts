// ── Shared child-identity writer (ARCH-15) ──────────────────────
//
// The single validated write path for the real identity fields on
// `children/{childId}` — `birthdate` and `grade`. Parallels
// `updateChildSoftProfile` (motivators/interests/strengths) and keeps the
// allowlist + validation in one place.
//
// These are identity DATA, never gates: they feed records/display and seed
// sensible defaults, but no feature is gated on them. Writes are confirmed by
// the parent in the Settings editor (propose → confirm → write); this writer
// never auto-fires.

import { doc, updateDoc } from 'firebase/firestore'

import { childrenCollection } from '../firebase/firestore'
import type { Child } from '../types'

/** The identity fields this writer is permitted to touch. */
export const IDENTITY_FIELDS = ['birthdate', 'grade'] as const
export type IdentityField = (typeof IDENTITY_FIELDS)[number]

export type IdentityPatch = Partial<Pick<Child, IdentityField>>

/** Defense in depth behind the typed union: is every key in the allowlist? */
export function isAllowedIdentityPatch(patch: IdentityPatch): boolean {
  return Object.keys(patch).every((k) =>
    (IDENTITY_FIELDS as readonly string[]).includes(k),
  )
}

/**
 * Write an identity patch to `children/{childId}`. Validates that every key in
 * `patch` is in the allowlist (`birthdate | grade`) and throws otherwise, so a
 * stray key can never reach Firestore even if the typed union is bypassed.
 * Each provided field overwrites wholesale. Additive by construction — callers
 * pass only the fields the parent edited.
 */
export async function updateChildIdentity(
  familyId: string,
  childId: string,
  patch: IdentityPatch,
): Promise<void> {
  if (!isAllowedIdentityPatch(patch)) {
    throw new Error(
      `updateChildIdentity: disallowed field in patch (${Object.keys(patch).join(', ')})`,
    )
  }
  await updateDoc(doc(childrenCollection(familyId), childId), patch)
}
