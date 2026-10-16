/**
 * A parent's record of what a NATIVE program says (FEAT-241).
 *
 * ── Why this is its own shape ────────────────────────────────────────────────
 *
 * Mathseeds and Fast Phonics keep their own position inside their own apps, and
 * the app has never been able to hold the number a parent reads there. The two
 * places that look like they could — `activityConfigs.currentPosition` and the
 * learner model — are both *load-bearing for planning*: a position written there
 * moves what gets planned and what the Foundations projection believes (it does
 * **not** move the compliance figures — `hoursContributions` folds day logs,
 * `hours` and `hoursAdjustments`, and reads no curriculum position). So a parent
 * who simply wants to write down *"the app said lesson 42 on Sunday"* had the
 * choice of changing the plan or keeping it on paper.
 *
 * This collection is the third answer: a **plain observation**, isolated from
 * every one of those rails. Its readers are the report surface and the existing
 * child-reference safety survey, which prevents orphaning a child's reports.
 * That isolation is the feature, not a limitation — it is what makes it safe to
 * record a number a parent is only *fairly* sure of, out of order, weeks late.
 *
 * ── What a row is, and is not ───────────────────────────────────────────────
 *
 * It **is** one sentence a parent asserted on one day: this program, this exact
 * number, meaning this much, observed on this date, from this kind of source.
 *
 * It is **not** verified (nobody checked the program), **not** authoritative
 * (two rows may disagree and neither wins), and **not** a position (nothing
 * derives a "current lesson" from it). Rows are kept forever and never edited —
 * a correction is a NEW row pointing at the one it corrects, because a number a
 * parent believed on a Tuesday is a fact about that Tuesday even once she knows
 * better.
 */

/**
 * The native programs this records, and the only two.
 *
 * Deliberately a closed pair rather than a free-text field: the number means a
 * different thing in each ("lesson" vs "peak"), and a surface that cannot name
 * the unit cannot show the number honestly. A third program is a new entry here
 * plus its unit label — a small, deliberate change, not an open door.
 */
export const NativeProgressProgram = {
  Mathseeds: 'mathseeds',
  FastPhonics: 'fastPhonics',
} as const
export type NativeProgressProgram =
  (typeof NativeProgressProgram)[keyof typeof NativeProgressProgram]

/**
 * What the number MEANS — the field this feature exists for.
 *
 * "Lesson 42" is ambiguous in the way that matters: it can mean the lesson being
 * worked on now (42 is unfinished) or the last one finished (42 is done). The app
 * has no way to tell, and a record that silently assumes one of them is a record
 * that can misrepresent what the parent observed.
 *
 * `Uncertain` is a first-class answer, not a failure to answer. A parent reading
 * a progress screen a week later often genuinely does not know which it was, and
 * forcing a guess would make the stored row less true than the honest shrug.
 */
export const NativeProgressMeaning = {
  /** Working on this number now — it is not finished. */
  WorkingOn: 'workingOn',
  /** Finished through this number — it is done. */
  CompletedThrough: 'completedThrough',
  /** Around this number; which of the two above is unknown. */
  Uncertain: 'uncertain',
} as const
export type NativeProgressMeaning =
  (typeof NativeProgressMeaning)[keyof typeof NativeProgressMeaning]

/**
 * Where the parent got the number — **as she asserts it**.
 *
 * Every one of these is a parent's claim about her own evidence. None of them is
 * checked by anything: `Certificate` does not mean a certificate was uploaded or
 * read, and `ProgramReport` does not mean the app talked to the program. The
 * field exists so that she can tell her own records apart later, and every
 * surface that shows it says so in words.
 */
export const NativeProgressSource = {
  /** What a parent saw on screen, or was told. */
  ParentReport: 'parentReport',
  /** The program's own progress report / summary email. */
  ProgramReport: 'programReport',
  /** A certificate the program issued. */
  Certificate: 'certificate',
} as const
export type NativeProgressSource =
  (typeof NativeProgressSource)[keyof typeof NativeProgressSource]

/**
 * One observation. Written once, never updated.
 *
 * Path: `families/{familyId}/nativeProgressObservations/{childId}__{entryKey}`.
 * The document id carries the child so a mis-filed row is visible in a console
 * listing, and carries the draft's own `entryKey` so a retry of the same save
 * lands on the same document instead of adding a second row
 * (`nativeProgressObservationDocId`).
 */
export interface NativeProgressObservation {
  id: string
  /** The child this is about. One child per row; never `'both'`. */
  childId: string
  program: NativeProgressProgram
  /**
   * The exact number the program showed, as a positive integer.
   *
   * Stored verbatim. Nothing normalises it, nothing infers that lessons 1–41
   * are therefore complete, and nothing turns "working on 42" into 41.
   */
  nativeNumber: number
  meaning: NativeProgressMeaning
  /**
   * `YYYY-MM-DD` — the day the progress was OBSERVED.
   *
   * Separate from `recordedAt` on purpose: a report read on Sunday and typed in
   * on Thursday is a Sunday observation, and collapsing the two is how a backdated
   * record silently becomes a claim about today.
   */
  observedOn: string
  source: NativeProgressSource
  /** Optional free note, the parent's own words. */
  note?: string
  /** When this row was written (ISO). Entry time, not observation time. */
  recordedAt: string
  /**
   * The draft this row came from — the idempotency key the document id is built
   * from. Stored as well as encoded in the id so a row can be audited without
   * parsing its path.
   */
  entryKey: string
  /**
   * The id of the observation this one corrects, when it is a correction.
   *
   * The corrected row is **kept** and still rendered; this field is what lets a
   * surface show the pair together rather than pretending the first was never
   * believed.
   */
  correctsObservationId?: string
}
