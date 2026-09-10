/**
 * GATE, once — the rule behind two of FIX-223's five surfaces (UX-344, UX-345).
 *
 * The child-switch census names five verdicts, and **GATE** is the one whose
 * rule is genuinely the same wherever it lands: *"the read has not settled or
 * has FAILED, so the surface is not editable at all — a failed read is not an
 * affirmative empty result"* (`CHILD_SWITCH_SURFACE_CENSUS_2026-09.md` §3).
 *
 * `useDailyPlan` and `useSkillMap` are both instances of it, both fixed in the
 * same run, and both write a payload built from a document loaded for a child
 * that may no longer be the one on screen. Writing the predicate twice is how a
 * rule drifts, and this repo has the `nameKey` / `itemBlockMatch` / `sanitizeJson`
 * precedent for what to do instead: one definition, both callers.
 *
 * What stays per-surface is the **copy** — what a parent is told, in the words
 * of the thing they are looking at. Only the decision lives here.
 *
 * The distinction the third field encodes is the whole point, and it is the
 * `useBusinessGoal` finding (Codex round 5 on PR #1817): a read that RESOLVED to
 * nothing and a read that FAILED look identical from the outside, and treating
 * the second as the first is how an empty payload gets written over real data.
 *
 * Pure: no React, no Firestore, never throws.
 */

export interface ChildScopedReadState {
  /** The read for the CURRENT child is still open. */
  isLoading: boolean
  /** The read REJECTED — not "resolved to nothing". See the header. */
  loadFailed: boolean
  /** There is a family and a child to read and write at all. */
  hasTarget: boolean
}

/**
 * May a child-scoped surface be edited right now?
 *
 * Only when a read for the child currently on screen has resolved, and resolved
 * successfully. Every other state answers `false`, including the one nobody
 * thinks about — a surface mounted before any child is selected.
 */
export function childScopedReadIsSettled(state: ChildScopedReadState): boolean {
  if (!state.hasTarget) return false
  if (state.isLoading) return false
  if (state.loadFailed) return false
  return true
}

/**
 * The one line a gated surface shows, given its own two sentences.
 *
 * Kept as a shape rather than a string table because the words belong to the
 * surface: "today's plan" and "the learning map" are different things to a
 * parent, and a generic "not ready" would be the app declining to say what it
 * is doing. The ORDER is what is shared — a failed read outranks a slow one,
 * because a failure does not resolve on its own and a parent who is told to
 * wait for it waits forever.
 */
export function childScopedGateNote(
  state: ChildScopedReadState,
  copy: { failed: string; waiting: string },
): string | null {
  if (!state.hasTarget) return null
  if (state.loadFailed) return copy.failed
  if (state.isLoading) return copy.waiting
  return null
}
