/**
 * Is the child's skill map settled enough to write — UX-344 (GATE).
 *
 * `useSkillMap.updateNodeStatus` builds its payload as
 * `{ childId, skills: { ...skillMap?.skills, [nodeId]: entry } }` and `setDoc`s
 * it, merge, onto `childSkillMaps/{childId}`. The document **reference** is
 * rebuilt from the live `childId`; the **payload** is the map that was loaded
 * for whoever was on screen when the read landed. Two ways that diverge:
 *
 * 1. **A child change.** `skillMap` was not cleared, so between the change and
 *    the new read resolving, a tap in the Learning Map's skill drawer wrote one
 *    boy's entire sixty-node map onto his brother's document.
 * 2. **A failed read.** The load's only `catch` covered the initialise-from-
 *    history branch, so a rejected `getDoc` propagated out of `load()` while the
 *    `finally` still cleared `isLoading` — leaving the previous child's map in
 *    state, presented as settled. A failed read is **not** an affirmative empty
 *    result (`useBusinessGoal`, Codex round 5 on PR #1817).
 *
 * The census filed both this hook and `LearningMap` as SAFE: I checked
 * `updateSkillMap`, which genuinely has no caller, and missed `updateNodeStatus`,
 * which `LearningMap` calls on every status tap. Codex round 4 on PR #1820
 * overturned it, and the correction is the most important line in that document
 * — a registry whose SAFE rows are wrong is worse than no registry.
 *
 * The decision itself lives in `core/hooks/childScopedGate`, shared with
 * `useDailyPlan` (UX-345), the same verdict on the same run. What stays here is
 * the copy — "the learning map" is what a parent is looking at.
 *
 * **Nothing about the map's content changes**: not the curriculum graph, not
 * the re-derivation pass, not what a status entry contains, not the merge. Only
 * whether the write may happen, and therefore only *whose* map it lands on.
 *
 * Pure: no React, no Firestore, never throws.
 */
import {
  childScopedGateNote,
  childScopedReadIsSettled,
  type ChildScopedReadState,
} from '../hooks/childScopedGate'

export type SkillMapGateState = ChildScopedReadState

/** A node's status may be written only once THIS child's map has loaded. */
export function skillMapIsEditable(state: SkillMapGateState): boolean {
  return childScopedReadIsSettled(state)
}

/**
 * What the Learning Map says when its statuses cannot be tapped.
 *
 * The failed-read sentence never says the map is empty. A parent told "no
 * skills recorded yet" over a dropped read learns something false about their
 * child, on the screen whose whole job is to report what that child knows.
 */
export function skillMapGateNote(state: SkillMapGateState): string | null {
  return childScopedGateNote(state, {
    failed: "Couldn't read this learning map — reload before marking progress.",
    waiting: 'Loading this learning map…',
  })
}
