// ── Watch chat actions: resolution + plain-language previews (FEAT-149) ──────
//
// The pure half of "find me videos for next week and add them". The chat could
// already SEARCH the web for a teaching video — `buildWebSearchAddendum` plus
// the child-scoped TEACHING VIDEOS block have been live since FEAT-12/FEAT-20 —
// but there was no way to get one INTO the app, so the parent re-typed the link
// into the vet-in form by hand. These two actions close that gap in the order
// she actually works: vet one in, then plan it onto a day.
//
// `parseChatActions` validates the SHAPE of a `vetInVideo` / `planVideoOnDay`
// proposal (including the rail that a `youtubeId` must be extractable from the
// URL the search surfaced); this module decides whether that shape names
// anything real — is it already in the library, is it retired, is that a day we
// may plan onto — and, when it doesn't, says why in a sentence a parent can read.
//
// It is the direct sibling of `dayItemActions` (FEAT-142) and `curriculumActions`
// (FEAT-143). Nothing here writes: vet-in lands through `useWatchLibrary`'s
// `addWatchVideo`, the same writer the vet-in form calls, and a planned video
// lands through `writeWatchItemToDay`, the FEAT-132 lane. The chat opens no new
// write path to either the library or a day document.
//
// Pure by design, so "a retired video can never be planned" and "the week window
// is this week or next" are testable without Firestore and without a clock.

import type { ChatAction, WatchVideo } from '../../core/types'
import { isActive, isRetired } from '../watch/watchLibraryStatus'

/**
 * The slice of a `WatchVideo` the chat needs to resolve and preview a watch
 * action. Structurally satisfied by a full `WatchVideo`; kept narrow so this
 * module doesn't depend on the whole library type surface.
 */
export type ChatWatchVideo = Pick<
  WatchVideo,
  'id' | 'youtubeId' | 'title' | 'plannedMinutes' | 'subjectBucket' | 'childId' | 'status'
>

/** One weekday a video may be planned onto — this week's or next week's. */
export interface PlannableDay {
  /** `YYYY-MM-DD`. */
  dateKey: string
  /** How a card says it out loud: "Tuesday" or "next Tuesday". Never a date. */
  label: string
}

/** The watch kinds, narrowed off the `ChatAction` union. */
export type WatchAction = Extract<ChatAction, { kind: 'vetInVideo' | 'planVideoOnDay' }>

export const isWatchAction = (action: ChatAction): action is WatchAction =>
  action.kind === 'vetInVideo' || action.kind === 'planVideoOnDay'

/**
 * A resolved proposal — everything the confirm card needs, with no ids in it.
 * `video` and `day` are absent for a vet-in, which names no existing entry and
 * lands on no day.
 */
export interface ResolvedWatchAction {
  action: WatchAction
  /** The library entry being planned. Absent for a vet-in. */
  video?: ChatWatchVideo
  /** The weekday it lands on. Absent for a vet-in. */
  day?: PlannableDay
}

export type WatchResolution =
  | { ok: true; resolved: ResolvedWatchAction }
  | { ok: false; notice: string }

/**
 * Plain-language refusals. Every one of these is shown to the parent in the
 * card's place — FEAT-135's lesson, and the one this feature is most exposed to:
 * the model's prose signs off with "confirm with a tap", so a SILENTLY dropped
 * proposal leaves the app promising a card that never appears. A duplicate video
 * is the common case here, not an edge case, so it gets a sentence that also
 * says what to do next.
 */
export const WATCH_NOTICES = {
  notPermitted:
    'Adding and planning videos is something a grown-up does — nothing was changed.',
  notPlannableDay:
    "That day isn't in this week or next week, so nothing was planned. I can only put a video on a weekday (Monday–Friday) of the current week or the next one.",
  videoNotFound:
    "That didn't match a video in the Watch Library, so nothing was planned. Try naming it as it appears there.",
} as const

/**
 * The refusal for a video that is already vetted in and live.
 *
 * Names the next useful move rather than stopping at "no": the parent asked for
 * this video, and it being present already means planning it is one tap away.
 */
export function alreadyInLibraryNotice(title: string): string {
  return `"${title}" is already in the Watch Library, so nothing was added. I can plan it onto a day instead — just say which day.`
}

/**
 * The refusal for a video that is in the library but RETIRED.
 *
 * Points at the Archive by name. The chat deliberately has no un-retire action:
 * retiring is a curation decision a parent made on the Watch Library surface, so
 * undoing it belongs there too — and quietly adding a second copy of a video she
 * retired would be the same decision reversed without her noticing.
 */
export function retiredVideoNotice(title: string): string {
  return `"${title}" was retired, so nothing was added. It's in the Archive tab of Watch Library — put it back from there if you want it again.`
}

/**
 * The refusal for a SECOND vet-in of the same video inside one reply (Codex P2,
 * PR #1676).
 *
 * Not a library duplicate — nothing is written yet — so it must not say "already
 * in the Watch Library", which would be false and would send the parent looking
 * for something that isn't there. It is a repeat in the proposal itself, and the
 * honest sentence says so and points at the card that IS on screen.
 */
export function repeatedVetInNotice(title: string): string {
  return `I proposed "${title}" twice in one message — only the first card is shown, so you don't add it twice.`
}

/** The plan-side refusal for a retired entry — same rule, different sentence. */
export function retiredPlanNotice(title: string): string {
  return `"${title}" has been retired, so it can't be planned. Put it back from the Archive tab of Watch Library first.`
}

/**
 * Resolve a proposed watch action against the live library and the plannable
 * week window.
 *
 * Returns the resolved action or a single plain-language reason it was dropped.
 * The order of the checks is the order a parent would ask them in: am I allowed
 * to do this, is that video already here (or retired), and is that a day I can
 * plan onto.
 *
 * `videos` is the acting child's visible library — the child's own entries plus
 * shared `'both'` ones — which is deliberately the same list the planner picker
 * offers. A sibling's private entry is therefore neither a duplicate nor
 * plannable here, exactly as it is neither in the picker.
 *
 * `canEdit` is a required argument, not an ambient assumption — `/chat` sits
 * outside `RequireParent`, so a kid profile can reach it by URL. The write layer
 * states the gate too; neither layer trusts the other (FEAT-133's lesson).
 */
export function resolveWatchAction(
  action: WatchAction,
  videos: ChatWatchVideo[],
  plannableDays: PlannableDay[],
  canEdit: boolean,
): WatchResolution {
  if (!canEdit) return { ok: false, notice: WATCH_NOTICES.notPermitted }

  if (action.kind === 'vetInVideo') {
    // Identity is the YouTube id, not the title: the same video vetted in twice
    // under two different parent-authored titles is still the same video, and
    // the title is the half the model made up.
    const existing = videos.find((v) => v.youtubeId === action.youtubeId)
    if (existing) {
      return {
        ok: false,
        notice: isRetired(existing)
          ? retiredVideoNotice(existing.title)
          : alreadyInLibraryNotice(existing.title),
      }
    }
    return { ok: true, resolved: { action } }
  }

  const video = videos.find((v) => v.id === action.watchVideoId)
  if (!video) return { ok: false, notice: WATCH_NOTICES.videoNotFound }
  // The `activeVideos` rule FEAT-138/139 hold on the picker and the swap, stated
  // here as the same rule rather than a second one: a retired video is refused
  // BY NAME, so the parent reads the true reason instead of "no such video".
  if (!isActive(video)) return { ok: false, notice: retiredPlanNotice(video.title) }

  const day = plannableDays.find((d) => d.dateKey === action.dateKey)
  if (!day) return { ok: false, notice: WATCH_NOTICES.notPlannableDay }

  return { ok: true, resolved: { action, video, day } }
}

/**
 * Resolve for DISPLAY, ignoring the gates that decide whether an action may be
 * OFFERED (the FEAT-144 split, applied here for the same reason).
 *
 * A confirmed write changes the state its own card resolves against, and the
 * subscription delivers that change at once. `vetInVideo` is the sharp case: the
 * instant it succeeds the video IS in the library, so
 * {@link resolveWatchAction} correctly refuses it as a duplicate — and the card
 * vanishes, taking with it the "Done ✓" that is the parent's only confirmation
 * that the video landed at all.
 *
 * So an already-decided card renders through here instead: same shape, but the
 * duplicate / retired / week-window gates are not applied, because they answer
 * "may this be proposed?" and that question is settled once she has tapped. A
 * plan is still resolved by id and date — a card that can name nothing still
 * renders nothing.
 *
 * **Never** use this to decide whether to OFFER a card; that is
 * {@link resolveWatchAction}'s job and it stays gated on the live state, so a
 * video retired in another tab stops offering a card here.
 */
export function resolveWatchActionForDisplay(
  action: WatchAction,
  videos: ChatWatchVideo[],
  plannableDays: PlannableDay[],
): ResolvedWatchAction | null {
  if (action.kind === 'vetInVideo') return { action }
  const video = videos.find((v) => v.id === action.watchVideoId)
  const day = plannableDays.find((d) => d.dateKey === action.dateKey)
  return video && day ? { action, video, day } : null
}

// ── Card wording ─────────────────────────────────────────────────────────────

/**
 * The one-line preview a parent reads before tapping Confirm. Names the child,
 * the video by its title, and — for a plan — the weekday **in words**, never an
 * id and never a raw date. An id on a confirm card is not something a parent can
 * check the proposal against.
 */
export function describeWatchAction(
  resolved: ResolvedWatchAction,
  childName: string,
): string {
  const { action, video, day } = resolved
  if (action.kind === 'vetInVideo') {
    return `Add "${action.title}" to ${childName}'s Watch Library`
  }
  return `Add "${video?.title ?? 'that video'}" to ${childName}'s ${day?.label ?? 'day'}`
}

/**
 * The shape line for a vet-in card — subject and length.
 *
 * A vet-in is the one watch action that creates something from nothing, so the
 * card has to show the whole thing being created. The parent cannot check it
 * against anything already on screen the way she can check a plan.
 */
export function describeVetInShape(
  action: Extract<WatchAction, { kind: 'vetInVideo' }>,
): string {
  return `${action.subjectBucket} · ${action.plannedMinutes}m`
}

/**
 * The line under the preview. Says what the write does NOT do, because the thing
 * a parent most needs to know about a video the assistant found is that
 * confirming it commits her to nothing more than the row in front of her.
 *
 * The vet-in footnote is the load-bearing one: the model is a scout, she is the
 * curator, and the card carries the source link precisely so she can watch it
 * first. Adding it to the library plans nothing and schedules nothing.
 */
export function watchActionFootnote(action: WatchAction): string {
  if (action.kind === 'vetInVideo') {
    return 'Adds it to the library only — nothing lands on a day until you plan it. Tap the link above to watch it first.'
  }
  return 'Adds one row to that day. Nothing already on it changes, and a video is always optional for the boys.'
}
