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
