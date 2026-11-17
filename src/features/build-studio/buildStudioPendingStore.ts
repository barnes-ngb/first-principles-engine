/**
 * The one place a Save that did not land is kept across a remount
 * (LOCAL-BUILD-001).
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 *
 * Verification found a real loss: two failed commits, a visible *Try again*,
 * then a tap on *Today* — and on coming back there was no retry, because the
 * editor had unmounted and the exact payload lived in its React state. The
 * departure guard now holds that navigation and makes the choice explicit, but
 * a parent or child may still choose to leave, a profile may change, and React
 * may remount. So the payload is kept HERE, in memory, for its owner.
 *
 * ── What it is, and what it deliberately is not ─────────────────────────
 *
 * A module-level map, so it lives for the page session and nothing longer. It
 * is **not** a new store: nothing is persisted, no collection, no Storage, no
 * `localStorage`. A reload loses it, which is honest and is exactly why
 * `beforeunload` still warns.
 *
 * ── Strictly owner-bound ────────────────────────────────────────────────
 *
 * Keyed by family + child + project — the owner the work was created under,
 * never the live active child. So:
 *
 *   • a sibling's editor cannot see it, because its key is a different key;
 *   • returning to the SAME child offers it back;
 *   • it holds the exact bytes and the exact `versionId`, so the retry is the
 *     same action and the immutable writer's create-or-same-payload rule makes
 *     it idempotent rather than a second version.
 */

import type { PendingSave } from './buildStudioScope'

/** The owner a held payload belongs to. Not the live child — the work's own. */
export interface PendingOwner {
  familyId: string
  childId: string
  projectId: string
}

const ownerKey = (owner: PendingOwner): string =>
  [owner.familyId, owner.childId, owner.projectId].join('\u0000')

/** One payload per owner. A newer unfinished Save replaces an older one. */
const held = new Map<string, PendingSave>()

/** Keep this owner's unfinished Save. */
export function holdPendingSave(owner: PendingOwner, payload: PendingSave): void {
  // The payload carries its own scope, and that scope's owner must be the key
  // it is filed under — otherwise a retry could be offered to the wrong child.
  if (
    payload.scope.familyId !== owner.familyId ||
    payload.scope.childId !== owner.childId ||
    payload.scope.projectId !== owner.projectId
  ) {
    return
  }
  held.set(ownerKey(owner), payload)
}

/** This owner's unfinished Save, if there is one. */
export function readPendingSave(owner: PendingOwner): PendingSave | null {
  return held.get(ownerKey(owner)) ?? null
}

/** Forget it — called once it has landed, or once a person discards it. */
export function clearPendingSave(owner: PendingOwner): void {
  held.delete(ownerKey(owner))
}

/** Test seam: drop everything. Never called by the app. */
export function resetPendingSaveStore(): void {
  held.clear()
}
