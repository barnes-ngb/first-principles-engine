// ── Who may write a child's own record from Ask AI (UX-188) ─────────────────
//
// The capability gate the seven record-write kinds never had. `/chat` is
// **nav-gated, not route-gated** — `AppShell` marks the nav entry `parentOnly`
// and `router.tsx` mounts `ShellyChatPage` outside `RequireParent` — so a child
// profile reaches the page by URL, and the system prompt is not profile-aware.
// FEAT-133 records the owner declining to route-gate `/planner/chat` for the
// same reason a route gate is wrong here: it would change behaviour for any
// deep link. So the gate lives at the layer that WRITES, which is where
// FEAT-135 put the equivalent one for `setActivityMinutes`.
//
// **The asymmetry this closes is the tell.** `canEditActivityConfigs` gated the
// *lowest*-stakes kind in the portal — one activity's default minutes — at three
// separate layers, while the two sight-word kinds, `editProfileField` and all
// four `skillSnapshots` kinds were checked at none. A child on his own tab who
// typed *"I'm really good at fractions"* got a card labelled "Updates Lincoln's
// skill snapshot", and his tap wrote the authoritative what-to-teach-next
// record — stamped `"parent directive via chat — <date>"`, which says a parent
// did it. Tiers A/B/C predate FEAT-133's capability lesson; the kinds built
// after it were gated and these were not.
//
// **Capability, never a name**, and **fail closed**: the caller's flag defaults
// to `false` upstream, so a surface that forgets to thread it refuses rather
// than permits.
//
// Note what this is and is not. The family shares one Firestore identity, so
// `firestore.rules` cannot tell a child profile from a parent one and is
// deliberately untouched: this is a PRODUCT gate, and the client fix is the
// whole of the available fix.
//
// Pure, like its siblings `curriculumActions` / `dayItemActions` / `watchActions`,
// so "a kid's proposal never becomes a card" is testable without Firestore.

import type { ChatAction } from '../../core/types'

/**
 * The seven kinds that write a child's OWN record — the two sight-word kinds,
 * the soft-profile replace, and the four additive `skillSnapshots` kinds.
 *
 * Deliberately not "every kind that writes": the curriculum, live-day, watch,
 * Dad Lab and next-week kinds carry their own resolvers, each of which already
 * takes `canEdit` and speaks its own refusal. This names the ones that had none.
 */
export type RecordWriteAction = Extract<
  ChatAction,
  {
    kind:
      | 'addSightWord'
      | 'removeSightWord'
      | 'editProfileField'
      | 'addPrioritySkill'
      | 'addSupport'
      | 'addStopRule'
      | 'markSkillProgress'
  }
>

export const isRecordWriteAction = (action: ChatAction): action is RecordWriteAction =>
  action.kind === 'addSightWord' ||
  action.kind === 'removeSightWord' ||
  action.kind === 'editProfileField' ||
  action.kind === 'addPrioritySkill' ||
  action.kind === 'addSupport' ||
  action.kind === 'addStopRule' ||
  action.kind === 'markSkillProgress'

/**
 * Plain-language refusals, in the register the portal already speaks
 * (`CURRICULUM_NOTICES.notPermitted`: *"… is something a grown-up does — nothing
 * was changed."*).
 *
 * A refusal is never silent. The model's prose signs off with "confirm with a
 * tap", so a dropped proposal that says nothing leaves the app promising a card
 * that never appears — the same "tells you something untrue" failure the whole
 * confirm-card feature exists to prevent. These are shown in the card's place,
 * via the existing `generalTabDropNotice` mechanism.
 *
 * One sentence per FAMILY of record, not one per kind: a child does not need to
 * learn that the app has seven action kinds, only that this class of change is a
 * grown-up's.
 */
export const RECORD_WRITE_NOTICES = {
  sightWord:
    'Changing a sight-word list is something a grown-up does — nothing was changed.',
  profile: "Changing a child's profile is something a grown-up does — nothing was changed.",
  snapshot:
    'Changing a skill snapshot is something a grown-up does — nothing was changed.',
} as const

/** Which refusal a kind gets. Exhaustive over {@link RecordWriteAction}. */
export function recordWriteNotice(action: RecordWriteAction): string {
  switch (action.kind) {
    case 'addSightWord':
    case 'removeSightWord':
      return RECORD_WRITE_NOTICES.sightWord
    case 'editProfileField':
      return RECORD_WRITE_NOTICES.profile
    case 'addPrioritySkill':
    case 'addSupport':
    case 'addStopRule':
    case 'markSkillProgress':
      return RECORD_WRITE_NOTICES.snapshot
  }
}

export type RecordWriteResolution =
  | { ok: true }
  | { ok: false; notice: string }

/**
 * May this proposal be offered, and written?
 *
 * `canEdit` is a required argument rather than an ambient assumption, for the
 * same reason `resolveCurriculumAction` makes it one: a gate that a new call
 * site can forget is not a gate. Called at stage time (so a kid's proposal never
 * becomes a card) and again in `rejectReason` (so a card staged while a parent
 * was signed in cannot reach a write on a later tap from a kid profile) — this
 * is the gate, that is the backstop, the house pattern.
 */
export function resolveRecordWriteAction(
  action: RecordWriteAction,
  canEdit: boolean,
): RecordWriteResolution {
  if (!canEdit) return { ok: false, notice: recordWriteNotice(action) }
  return { ok: true }
}
