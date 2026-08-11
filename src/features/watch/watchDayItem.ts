import type {
  ChecklistItem,
  DayLog,
  DraftPlanItem,
  SkillTag,
  WatchVideo,
} from '../../core/types'

/**
 * Watch Vehicle — the ONE definition of a watch row's shape (FEAT-132).
 *
 * FEAT-104 created watch rows in exactly one place: the planner draft, which
 * `handleApplyPlan` later mapped into a day's `checklist`. FEAT-132 adds two
 * more ways to create one — the planner *after* Apply, and Today's parent edit
 * mode on a live day — and both write the checklist row directly rather than
 * going through Apply. Three call sites re-deriving "what a watch row looks
 * like" is how `watchVideoId` goes missing, and a watch row without it is a lie:
 * the player has no video to resolve, so the row can never be played or
 * completed. So the shape lives here, once, and every caller builds from it.
 *
 * Pure and side-effect-free: no Firestore, no hours math, no XP, no
 * learner-model write. Watching is not a calibrated assessment (C2/§6), so a
 * watch row carries **no** `skillTags` and never reaches the concept graph.
 */

/**
 * Kid-facing title for a watch row: the parent-authored library title (D4),
 * prefixed so the checklist reads as a video at a glance. Never the raw YouTube
 * title, and never parsed back out — the player resolves the real `WatchVideo`
 * by `watchVideoId`.
 */
export function watchItemTitle(video: WatchVideo): string {
  return `Watch: ${video.title}`
}

/**
 * The fields every watch row shares, whichever surface creates it. `'choose'`
 * (and therefore `mvdEssential: false`) is what FEAT-104 shipped — a curated
 * video is not part of the Minimum Viable Day floor.
 */
function watchRowFields(video: WatchVideo) {
  return {
    title: watchItemTitle(video),
    subjectBucket: video.subjectBucket,
    // Planned = actual (D3): a vetted video's runtime is its planned minutes.
    estimatedMinutes: video.plannedMinutes,
    // Non-curriculum — never a concept-graph input (C2/§6).
    skillTags: [] as SkillTag[],
    category: 'choose' as const,
    itemType: 'watch' as const,
    watchVideoId: video.id,
  }
}

/**
 * The planner-draft shape (FEAT-104). Used before Apply, where the draft is the
 * thing being edited and Apply does the checklist mapping.
 */
export function buildWatchDraftItem(video: WatchVideo, id: string): DraftPlanItem {
  return {
    id,
    accepted: true,
    ...watchRowFields(video),
  }
}

/**
 * The saved-day `ChecklistItem` shape — deliberately byte-identical to what
 * `handleApplyPlan` writes for a watch draft item (same label with the `(Nm)`
 * suffix, same category/minutes/subject, same `itemType` + `watchVideoId`), so a
 * row added to a live day is indistinguishable from a planned one to the player,
 * the completion path, and the hours math.
 *
 * ONE deliberate difference: `source: 'manual'`, not `'planner'`. A row added to
 * a day that is already live is a user addition, not planner output — and
 * `retainChecklistForApply` keeps manual items but drops incomplete planner
 * residue, so `'planner'` here would let a later re-apply silently delete the
 * video the parent just added. Hours are unaffected: `estimatedMinutes` is what
 * `checklistItemCountedMinutes` reads, and `source` is not part of that math.
 */
export function buildWatchChecklistItem(video: WatchVideo): ChecklistItem {
  const fields = watchRowFields(video)
  return {
    label: `${fields.title} (${fields.estimatedMinutes}m)`,
    completed: false,
    skillTags: fields.skillTags,
    source: 'manual',
    mvdEssential: false,
    category: fields.category,
    estimatedMinutes: fields.estimatedMinutes,
    subjectBucket: fields.subjectBucket,
    itemType: fields.itemType,
    watchVideoId: fields.watchVideoId,
  }
}

/**
 * Point an existing watch row at a DIFFERENT video, in place (FEAT-138).
 *
 * "I decide I need a new one" is a swap, not a delete-and-re-add: the row keeps
 * its identity as a row — its day, its position in the checklist, and its
 * incomplete state — and only the video changes. So exactly the fields that
 * describe the video are replaced, from the same `watchRowFields` every other
 * builder here uses, and nothing else on the row is touched (`source`,
 * `category`, `mvdEssential`, and any parent notes on it survive).
 *
 * Deliberately does NOT clear completion: the write layer refuses a swap on a
 * completed row outright (`liveDayEdit`), because a watched video is credited
 * work. Silently un-completing it here would be the quiet version of the thing
 * that refusal exists to prevent.
 */
export function swapWatchVideoOnItem(
  item: ChecklistItem,
  video: WatchVideo,
): ChecklistItem {
  const fields = watchRowFields(video)
  return {
    ...item,
    label: `${fields.title} (${fields.estimatedMinutes}m)`,
    estimatedMinutes: fields.estimatedMinutes,
    subjectBucket: fields.subjectBucket,
    itemType: fields.itemType,
    watchVideoId: fields.watchVideoId,
  }
}

/**
 * Append a watch row to a day log's checklist. Purely additive — nothing
 * existing is touched, so no completion, logged minute, or evidence link can be
 * disturbed by adding a video to a live day. Returns a new `DayLog`; never
 * mutates the input.
 */
export function appendWatchItemToDayLog(dayLog: DayLog, video: WatchVideo): DayLog {
  return {
    ...dayLog,
    checklist: [...(dayLog.checklist ?? []), buildWatchChecklistItem(video)],
  }
}
