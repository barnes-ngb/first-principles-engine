// ── What Today has OPEN, and what a change of child or day does to it (UX-343)
//
// Today is the heaviest write surface in the app, and almost every control on it
// is a dialog that outlives the tap that opened it: a strand session with photos
// and audio in it, a "move this to another day" target, a video swap, a video
// picker, a lesson-video search with an hours logger inside it, a typed grade
// note, a half-filled "add to today" row.
//
// Every one of those writes with the **live** `selectedChildId` and the **live**
// date. So a parent who opens one, switches child in the selector forty lines
// up, and then taps the button has addressed her decision to one boy and landed
// it on the other. That is the owner's own report — *"Shelly added content for
// Lincoln on London's page"* — one surface over, and it is reachable today
// through Today's own `ChildSelector`, with the app-bar switcher still off
// (`UX-330`).
//
// ── The verdict is RESET, and RESET has two halves ──────────────────────────
//
// `CHILD_SWITCH_SURFACE_CENSUS_2026-09.md` classifies `TodayPage` **RESET**: the
// work here is cheap to redo (re-open a dialog, re-pick a day) and expensive to
// get wrong (a session credited to the wrong boy, minutes on the wrong record).
// The census's own wording for RESET is *"re-seed from the new identity, clear
// `dirty`, and **make the loss visible**"* — and the second half is the part that
// is easy to skip. A dialog that vanishes silently on a switch is not a fix; it
// is the same defect with the evidence removed. So the decisions that were open
// are named, in words, in one sentence.
//
// Pure: no React, no Firestore, never throws.

/**
 * A decision Today can have OPEN — a control that has been started but not yet
 * written, and whose write would read the live child and date.
 *
 * A `Record` rather than a list of `if`s, so a **new dialog fails to compile**
 * until it is given a word a parent would recognise (`resolveDailyBudget`'s
 * `PlanType` rule, `SECTION_FOR_TYPE`'s partition — this repo's standing answer
 * to a hand-written member list).
 */
export const TodayDecision = {
  /** The strand-session dialog: a topic, a note, photos, audio. */
  StrandSession: 'strand-session',
  /** "Move to another day" — a row is picked, the day is not. */
  MoveItem: 'move-item',
  /** "Change video" — a row is picked, the replacement is not. */
  SwapVideo: 'swap-video',
  /** The watch-library picker, open to add a video to this day. */
  AddVideo: 'add-video',
  /** The in-context lesson-video search, which carries an hours logger. */
  LessonVideo: 'lesson-video',
  /** A checklist row's "Add photo(s)" dialog. */
  AddPhotos: 'add-photos',
  /** A typed review note on a checklist row. */
  GradeNote: 'grade-note',
  /** A half-filled "add an item to today" row. */
  AddItem: 'add-item',
} as const
export type TodayDecision = (typeof TodayDecision)[keyof typeof TodayDecision]

/**
 * What a parent would call each one. Exhaustive by construction — a new
 * `TodayDecision` member does not compile until it appears here.
 */
export const TODAY_DECISION_WORDS: Record<TodayDecision, string> = {
  [TodayDecision.StrandSession]: 'the session you were recording',
  [TodayDecision.MoveItem]: 'the move to another day',
  [TodayDecision.SwapVideo]: 'the video change',
  [TodayDecision.AddVideo]: 'the video picker',
  [TodayDecision.LessonVideo]: 'the lesson video',
  [TodayDecision.AddPhotos]: 'the photo you were adding',
  [TodayDecision.GradeNote]: 'the review note',
  [TodayDecision.AddItem]: 'the item you were adding',
}

/** The order the words are listed in, so two runs cannot phrase it differently. */
const DECISION_ORDER: TodayDecision[] = [
  TodayDecision.StrandSession,
  TodayDecision.AddPhotos,
  TodayDecision.GradeNote,
  TodayDecision.AddItem,
  TodayDecision.LessonVideo,
  TodayDecision.MoveItem,
  TodayDecision.SwapVideo,
  TodayDecision.AddVideo,
]

export interface TodayScopeResetNotice {
  text: string
  /**
   * A warning, not an error. Nothing was lost that had been saved, and nothing
   * went wrong — the app declined to point a decision at somebody it was not
   * made for. Red would argue against the sentence's own second half.
   */
  severity: 'warning'
}

function joinWords(list: string[]): string {
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * The one sentence Today says when the child or the day changed underneath an
 * open decision.
 *
 * Returns `null` when nothing was open — a switch with no dialog up is an
 * ordinary switch and deserves no message at all.
 *
 * It states three things and no more: **what** was closed, **who** it had been
 * opened for, and that **nothing was saved**. It deliberately does not say
 * *"try again"*: the parent may well have meant to switch, and telling her to
 * redo something she abandoned on purpose is noise.
 *
 * The previous child's name is the point of the sentence, so when it is not
 * known (a child removed from the family mid-session, an unresolved list) the
 * sentence says *the day on screen changed* rather than guessing a name. A
 * wrong name here is worse than none — it is a claim about whose record almost
 * moved.
 */
export function todayScopeResetNotice(
  open: readonly TodayDecision[],
  previousChildName: string | null | undefined,
): TodayScopeResetNotice | null {
  const unique = DECISION_ORDER.filter((d) => open.includes(d))
  if (unique.length === 0) return null
  const list = joinWords(unique.map((d) => TODAY_DECISION_WORDS[d]))
  const who = previousChildName?.trim()
  const closed = `Closed ${list}`
  return {
    text: who
      ? `${closed} — ${who} was selected when you opened ${unique.length === 1 ? 'it' : 'them'}. Nothing was saved.`
      : `${closed} — the day on screen changed. Nothing was saved.`,
    severity: 'warning',
  }
}

/**
 * The identity every decision above is scoped to: one child, one day.
 *
 * Both halves matter and neither is enough on its own. A strand session opened
 * on Tuesday and confirmed after the parent paged to Wednesday increments the
 * same strand but stamps its artifact with the wrong `dayLogId`; a move dialog
 * opened on one day and confirmed on another moves a row out of a day nobody
 * was looking at.
 */
export function todayScopeKey(childId: string, dateKey: string): string {
  return `${childId}|${dateKey}`
}

/** The child half of a scope key, for naming who a closed decision belonged to. */
export function childIdFromScopeKey(key: string): string {
  return key.split('|')[0] ?? ''
}
