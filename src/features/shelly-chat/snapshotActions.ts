// ── Skill-snapshot chat actions: the narrowing + the card's words ────────────
//
// The pure half of the Tier-C Option-2 additive snapshot kinds (6b). Its
// siblings are `curriculumActions` (FEAT-143) and `dayItemActions` (FEAT-142):
// nothing here writes, and nothing here reads Firestore. The write is the
// central `evaluate/skillSnapshotWrites.ts`, which every snapshot path in the
// app shares.
//
// It exists because the same four-kind narrowing was written out twice — once
// in `useShellyChatActions` and once in `ActionConfirmCard` — so the layer that
// WRITES and the layer that SPEAKS each held their own idea of what a snapshot
// action is. UX-187 was exactly a disagreement between those two layers (the
// card said "progressing", the write said `Secure`), so they now compile
// against one definition.

import type { ChatAction } from '../../core/types'

/** The Tier-C Option-2 additive snapshot kinds (6b). */
export type SnapshotAction = Extract<
  ChatAction,
  { kind: 'addPrioritySkill' | 'addSupport' | 'addStopRule' | 'markSkillProgress' }
>

export const isSnapshotAction = (action: ChatAction): action is SnapshotAction =>
  action.kind === 'addPrioritySkill' ||
  action.kind === 'addSupport' ||
  action.kind === 'addStopRule' ||
  action.kind === 'markSkillProgress'

/** Plain-language preview for a proposed additive snapshot edit (6b). */
export function describeSnapshotAction(action: SnapshotAction, childName: string): string {
  switch (action.kind) {
    case 'addPrioritySkill':
      return `Add to ${childName}'s priority skills: "${action.skill}"`
    case 'addSupport':
      return `Add to ${childName}'s supports: "${action.support}"`
    case 'addStopRule':
      return `Add to ${childName}'s stop rules: "${action.rule}"`
    case 'markSkillProgress':
      return action.mastered
        ? `Mark "${action.skill}" as mastered for ${childName}`
        : `Mark "${action.skill}" as progressing for ${childName}`
  }
}

/**
 * The line under the preview — what the write actually does (UX-187).
 *
 * **Only `markSkillProgress` gets one, and that is the point.** The three `add*`
 * kinds do exactly what their one-liner says: a labelled thing is appended to a
 * list. `markSkillProgress` is the kind whose card carried a word — *progressing*
 * — that appeared nowhere in the write, because `fullyMastered` reached only the
 * conceptual-block branch of the shared reducer and the priority-skill branch
 * wrote `Secure` for anything it matched. The write is fixed
 * (`skipPrioritySkillLevels`); this is the card catching up, so that what she
 * reads before tapping and what lands are the same claim.
 *
 * It names the child rather than a pronoun, and it names the one screen that can
 * do the thing the chat deliberately cannot — set a level directly, or lower one
 * (the portal is additive-only; there is no chat path back).
 */
export function snapshotActionFootnote(action: SnapshotAction, childName: string): string {
  if (action.kind !== 'markSkillProgress') return ''
  return action.mastered
    ? `Records "mastered" on ${childName}'s Skill Snapshot. Everything already logged stays as it is, and the chat cannot lower a level again — that is Progress → Skill Snapshot.`
    : `Records the movement without changing ${childName}'s level — the chat only sets a level for "mastered". You can set one at Progress → Skill Snapshot.`
}

/**
 * What the card says when the confirmed write matched **nothing** (UX-190).
 *
 * `writeSnapshotUpdate` returns `{ changed }` and skips Firestore entirely when
 * nothing matched; the chat discarded that return value, so the card fell
 * through to `status: 'applied'` and showed a green tick over no write at all.
 *
 * Two ways to get here, and the sentence has to be true of both. The match is
 * exact slug equality — `generateBlockId` lowercases, trims and collapses
 * non-alphanumerics, nothing more — so *"th sound"* misses a skill labelled
 * *"th digraph"*; and against a child who has **no snapshot yet**,
 * `markSkillProgress` can never match anything, so London plus *"he's got all
 * his letter sounds now"* wrote nothing every time.
 *
 * **Not an error, and not a retry.** Nothing went wrong and nothing failed —
 * the words simply named nothing on the record, and confirming the identical
 * card again would match nothing again. So the sentence states what happened,
 * and gives her the one thing that would work: the skill named the way the
 * Skill Snapshot spells it. The three `add*` kinds share the swallow but not the
 * harm — a deduped add is a no-op because the state is already what was asked
 * for — so each gets its own true sentence rather than one generic one.
 */
export function snapshotNoMatchNotice(action: SnapshotAction, childName: string): string {
  switch (action.kind) {
    case 'addPrioritySkill':
      return `"${action.skill}" is already on ${childName}'s priority skills, so nothing was changed.`
    case 'addSupport':
      return `"${action.support}" is already one of ${childName}'s supports, so nothing was changed.`
    case 'addStopRule':
      return `"${action.rule}" is already one of ${childName}'s stop rules, so nothing was changed.`
    case 'markSkillProgress':
      return `Nothing on ${childName}'s Skill Snapshot matched "${action.skill}", so nothing was changed. Tell me the skill the way it appears on Progress → Skill Snapshot and I'll propose it again.`
  }
}
