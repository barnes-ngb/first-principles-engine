// ── Shared soft-profile writer ──────────────────────────────────
//
// The single validated write path for the three human-owned freeform
// soft-profile fields on `children/{childId}` — `motivators`, `interests`,
// `strengths`. Both callers share it: the Settings editor
// (`SoftProfileSection`) and the Shelly portal's `editProfileField` chat
// action (`useShellyChatActions`). Keeping it as one writer means the
// allowlist + validation live in exactly one place.
//
// `supports` is deliberately NOT here — it lives on `skillSnapshots` (Tier C).
// See docs/SHELLY_PORTAL_CONTEXT.md §3 and §5.

import { doc, updateDoc } from 'firebase/firestore'

import { childrenCollection } from '../firebase/firestore'
import type { Child } from '../types'

/** The three freeform soft-profile fields this writer is permitted to touch. */
export const SOFT_PROFILE_FIELDS = ['motivators', 'interests', 'strengths'] as const
export type SoftProfileField = (typeof SOFT_PROFILE_FIELDS)[number]

export type SoftProfilePatch = Partial<Pick<Child, SoftProfileField>>

/** Defense in depth behind the typed union: is every key in the allowlist? */
export function isAllowedSoftProfilePatch(patch: SoftProfilePatch): boolean {
  return Object.keys(patch).every((k) =>
    (SOFT_PROFILE_FIELDS as readonly string[]).includes(k),
  )
}

/**
 * Write a soft-profile patch to `children/{childId}`. Validates that every key
 * in `patch` is in the allowlist (`motivators | interests | strengths`) and
 * throws otherwise, so a stray key can never reach Firestore even if the typed
 * union is bypassed. A replace-write: each provided field overwrites wholesale.
 */
export async function updateChildSoftProfile(
  familyId: string,
  childId: string,
  patch: SoftProfilePatch,
): Promise<void> {
  if (!isAllowedSoftProfilePatch(patch)) {
    throw new Error(
      `updateChildSoftProfile: disallowed field in patch (${Object.keys(patch).join(', ')})`,
    )
  }
  await updateDoc(doc(childrenCollection(familyId), childId), patch)
}
