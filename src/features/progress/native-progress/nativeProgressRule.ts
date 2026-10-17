/**
 * What counts as an observation, and what we say about one (FEAT-241).
 *
 * Pure: no React, no Firestore, no clock of its own — the caller passes today's
 * date key in. It answers three questions and nothing else:
 *
 *   1. is this draft a recordable observation, and if not, which field is wrong;
 *   2. what sentence describes a stored row to a parent; and
 *   3. what can honestly be said about a LIST of rows that may disagree.
 *
 * ── The honesty rules that live here ────────────────────────────────────────
 *
 * **No invented ceiling.** This repo does not know how many lessons Mathseeds has
 * or how many peaks Fast Phonics has, so there is no upper bound on the program at
 * all: the only refusals are of values that cannot be a reading of a screen (a
 * zero, a negative, a fraction) or cannot be stored exactly (see
 * {@link nativeNumberIsStorableExactly}). `manualPosition.ts` can say *"this book
 * has 60 lessons"* because a workbook's total is a number a parent typed in;
 * nothing here has an equivalent, and inventing one would reject a true reading.
 *
 * **No derived position.** Nothing in this module computes a "current lesson"
 * from a list. The strongest claim it will make is *the most recent observation
 * by observed date*, named that way in the type, in the sentence and on screen —
 * and it reports disagreement and out-of-order entry rather than resolving them.
 * Two rows dated the same day with different numbers is a thing that happens when
 * two people read a screen, and picking a winner would be the app asserting
 * something no one told it.
 *
 * **No inferred completion.** "Working on lesson 42" says exactly that. It does
 * not mean 41 are finished, and this module never writes, derives or renders such
 * a claim.
 */

import { formatDateShort } from '../../../core/utils/dateKey'
import { formatDateYmd, parseDateYmd } from '../../../core/utils/format'
import {
  NOTE_MAX_LENGTH,
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'

/** Display name per program. */
export const NATIVE_PROGRAM_LABEL: Record<NativeProgressProgram, string> = {
  [NativeProgressProgram.Mathseeds]: 'Mathseeds',
  [NativeProgressProgram.FastPhonics]: 'Fast Phonics',
}

/**
 * What the program calls the thing it counts.
 *
 * Mathseeds counts lessons; Fast Phonics counts peaks. The unit is the program's
 * own word, never a guess and never a house word like "position" — a parent
 * reading the record back should see the noun she saw in the app.
 */
export const NATIVE_PROGRAM_UNIT: Record<NativeProgressProgram, string> = {
  [NativeProgressProgram.Mathseeds]: 'lesson',
  [NativeProgressProgram.FastPhonics]: 'peak',
}

/** The choice a parent picks, in her words. */
export const NATIVE_MEANING_LABEL: Record<NativeProgressMeaning, string> = {
  [NativeProgressMeaning.WorkingOn]: 'Working on it now',
  [NativeProgressMeaning.CompletedThrough]: 'Finished through it',
  [NativeProgressMeaning.Uncertain]: "Not sure which — it's roughly here",
}

/** ...and in her words, where the number came from. Asserted, never checked. */
export const NATIVE_SOURCE_LABEL: Record<NativeProgressSource, string> = {
  [NativeProgressSource.ParentReport]: 'What I saw or was told',
  [NativeProgressSource.ProgramReport]: "The program's own report",
  [NativeProgressSource.Certificate]: 'A certificate from the program',
}

/** The short form used inside a history line. */
export const NATIVE_SOURCE_SHORT: Record<NativeProgressSource, string> = {
  [NativeProgressSource.ParentReport]: 'parent report',
  [NativeProgressSource.ProgramReport]: 'program report',
  [NativeProgressSource.Certificate]: 'certificate',
}

export const NATIVE_PROGRAMS: readonly NativeProgressProgram[] = Object.values(
  NativeProgressProgram,
)
export const NATIVE_MEANINGS: readonly NativeProgressMeaning[] = Object.values(
  NOTE_MAX_LENGTH,
  NativeProgressMeaning,
)
export const NATIVE_SOURCES: readonly NativeProgressSource[] = Object.values(
  NativeProgressSource,
)

/**
 * The only upper bound: what a number can be stored as EXACTLY.
 *
 * An earlier draft of this module guessed a four-digit ceiling and called it a
 * typo guard. Independent review was right to refuse it: a bound nobody can
 * derive is an invented program range however it is labelled, and a parent
 * reading a real number off a real screen would have been told it was a typo.
 *
 * So the rule is the one fact this repo actually knows — a JavaScript number
 * holds integers exactly up to `Number.MAX_SAFE_INTEGER`, and past that the
 * value stored is not the value typed. That is a property of the field, not of
 * Mathseeds, and the message says so.
 */
export function nativeNumberIsStorableExactly(value: number, digits: string): boolean {
  return Number.isSafeInteger(value) && String(value) === digits
}

/**
 * The earliest day an observation may be dated.
 *
 * Also a typo guard: a four-digit year is easy to fat-finger on a phone
 * (`0226-10-12`), and a record dated in the third century is noise. It is
 * deliberately far below any plausible real entry rather than tuned to this
 * family's history, which this module does not know.
 */
export const OBSERVED_ON_FLOOR = '2000-01-01'

/** Longest note kept. Long enough for a sentence or two about what she saw. */
export { NOTE_MAX_LENGTH } from '../../../core/types/nativeProgress'

/**
 * The one thing this feature must say, said once and short.
 *
 * The failure mode worth preventing is a parent reasonably assuming that telling
 * the app where her son is changes what the app plans for him. A paragraph
 * explaining that is a paragraph nobody reads twice, so it is one line, and it
 * appears once above the form rather than beside every field.
 */
export const NATIVE_PROGRESS_NO_PLANNING_NOTICE =
  'Saved for reference. This does not update plans, hours or skills.'

/** ...and the matching line about the source. */
export const NATIVE_PROGRESS_SOURCE_NOTICE =
  'Saved as you report it — not checked against the program.'

export interface NativeProgressDraft {
  program: NativeProgressProgram
  /** Raw text from the number field, exactly as typed. */
  numberInput: string
  meaning: NativeProgressMeaning
  /** Raw text from the date field (`YYYY-MM-DD` from a date input). */
  observedOn: string
  source: NativeProgressSource
  note: string
}

/** A draft with nothing typed into it. The date is seeded by the caller. */
export function emptyNativeProgressDraft(observedOn: string): NativeProgressDraft {
  return {
    program: NativeProgressProgram.Mathseeds,
    numberInput: '',
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn,
    source: NativeProgressSource.ParentReport,
    note: '',
  }
}

/** True when nothing a person typed would be lost by clearing this draft. */
export function draftIsEmpty(draft: NativeProgressDraft, seededDate: string): boolean {
  return (
    draft.numberInput.trim() === '' &&
    draft.note.trim() === '' &&
    draft.observedOn === seededDate &&
    draft.program === NativeProgressProgram.Mathseeds &&
    draft.meaning === NativeProgressMeaning.WorkingOn &&
    draft.source === NativeProgressSource.ParentReport
  )
}

/** The reviewed, typed content of a draft — everything but who and when. */
export interface ReviewedObservation {
  program: NativeProgressProgram
  nativeNumber: number
  meaning: NativeProgressMeaning
  observedOn: string
  source: NativeProgressSource
  note?: string
}

export interface NativeProgressDraftErrors {
  program?: string
  numberInput?: string
  meaning?: string
  observedOn?: string
  source?: string
  note?: string
}

export type DraftReview =
  | { ok: true; reviewed: ReviewedObservation }
  | { ok: false; errors: NativeProgressDraftErrors }

export type ParsedNativeNumber =
  | { ok: true; value: number }
  | { ok: false; error: string }

/**
 * Read a typed native number.
 *
 * Strict about what a number IS (a whole number, at least 1, storable exactly)
 * and silent about what it MEANS — the meaning is its own field, and a parser
 * that guessed would be the inference this feature exists to avoid. It has no
 * opinion about how high the number may go, because nothing here knows.
 */
export function parseNativeNumber(
  raw: string,
  program: NativeProgressProgram,
): ParsedNativeNumber {
  const unit = NATIVE_PROGRAM_UNIT[program] ?? 'number'
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: `Type the ${unit} number the app showed.` }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'Use a whole number, like 42.' }
  }
  // Leading zeros are a keypad artefact, not a different number: `007` is 7.
  const digits = trimmed.replace(/^0+(?=\d)/, '')
  const value = Number(digits)
  if (value < 1) {
    return { ok: false, error: `${NATIVE_PROGRAM_LABEL[program]} numbers start at 1.` }
  }
  if (!nativeNumberIsStorableExactly(value, digits)) {
    return {
      ok: false,
      // The honest sentence: this is what the FIELD can hold exactly, and it is
      // not a claim about how far the program counts.
      error: 'That number is too long to store exactly — check it and type the number the app showed.',
    }
  }
  return { ok: true, value }
}

export type ParsedObservedOn =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Read the day the progress was observed.
 *
 * Backdating is the normal case and is accepted without comment — a report read
 * three weeks ago is still a record worth keeping. A FUTURE date is refused: it
 * is the one value that cannot be a reading of something that happened.
 */
export function parseObservedOn(raw: string, todayKey: string): ParsedObservedOn {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Pick the day you saw this.' }
  }
  if (!parseDateYmd(trimmed)) {
    // Covers both a wrong shape and an impossible calendar day (2026-02-30),
    // which `parseDateYmd` rejects by round-tripping through a real Date.
    return { ok: false, error: 'Use a real date, like 2026-10-12.' }
  }
  if (trimmed > todayKey) {
    return { ok: false, error: "That day hasn't happened yet." }
  }
  if (trimmed < OBSERVED_ON_FLOOR) {
    return { ok: false, error: 'That year looks like a typo.' }
  }
  return { ok: true, value: trimmed }
}

/**
 * Is this draft recordable, and if not, which fields are wrong?
 *
 * Returns ALL the bad fields at once rather than the first — a phone form that
 * reports one error per tap is a form a person fills in four times. The three
 * choice fields are validated too: they come from selects today, and a check
 * that only guards the free-text fields is a check that trusts the UI.
 */
export function reviewNativeProgressDraft(
  draft: NativeProgressDraft,
  todayKey: string,
): DraftReview {
  const errors: NativeProgressDraftErrors = {}

  if (!NATIVE_PROGRAMS.includes(draft.program)) {
    errors.program = 'Pick which program this number came from.'
  }
  if (!NATIVE_MEANINGS.includes(draft.meaning)) {
    errors.meaning = 'Pick what the number means.'
  }
  if (!NATIVE_SOURCES.includes(draft.source)) {
    errors.source = 'Pick where the number came from.'
  }

  const number = parseNativeNumber(draft.numberInput, draft.program)
  if (!number.ok) errors.numberInput = number.error

  const observedOn = parseObservedOn(draft.observedOn, todayKey)
  if (!observedOn.ok) errors.observedOn = observedOn.error

  const note = draft.note.trim()
  if (note.length > NOTE_MAX_LENGTH) {
    errors.note = `Keep the note under ${NOTE_MAX_LENGTH} characters.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (!number.ok || !observedOn.ok) return { ok: false, errors }

  return {
    ok: true,
    reviewed: {
      program: draft.program,
      nativeNumber: number.value,
      meaning: draft.meaning,
      observedOn: observedOn.value,
      source: draft.source,
      // Absent rather than empty: `stripUndefined` drops it, so a note-less row
      // has no `note` field at all instead of an empty string to render around.
      note: note.length > 0 ? note : undefined,
    },
  }
}

/** A new draft identity. The id a retry of the same save reuses. */
export function newEntryKey(): string {
  // `typeof`, not truthiness: the DOM lib types `randomUUID` as always present,
  // so `if (crypto?.randomUUID)` is a condition TypeScript knows cannot be false
  // (TS2774) while the older WebViews this runs on genuinely lack it.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // Still unique enough for a per-draft key, and the writer validates the shape
  // either way.
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The number and its meaning in one phrase — *"working on lesson 42"*.
 *
 * The meaning is never dropped. A phrase that reads "lesson 42" alone is the
 * ambiguity this feature was built to remove, so every rendering of a number in
 * this feature goes through here.
 */
export function numberPhrase(
  observation: Pick<NativeProgressObservation, 'program' | 'nativeNumber' | 'meaning'>,
): string {
  const unit = NATIVE_PROGRAM_UNIT[observation.program] ?? 'number'
  const n = observation.nativeNumber
  switch (observation.meaning) {
    case NativeProgressMeaning.CompletedThrough:
      return `finished through ${unit} ${n}`
    case NativeProgressMeaning.Uncertain:
      return `around ${unit} ${n} (not sure which)`
    default:
      return `working on ${unit} ${n}`
  }
}

/** One history line: what, when, and on whose word. */
export function observationSentence(
  observation: Pick<
    NativeProgressObservation,
    'program' | 'nativeNumber' | 'meaning' | 'observedOn' | 'source'
  >,
): string {
  return `${NATIVE_PROGRAM_LABEL[observation.program]} — ${numberPhrase(observation)}, seen ${formatDateShort(
    observation.observedOn,
  )} (${NATIVE_SOURCE_SHORT[observation.source]})`
}

/**
 * The day a row was ENTERED, for display beside the day it describes.
 *
 * Converted through the local calendar rather than sliced off the ISO string: a
 * row written at 9pm Central carries a UTC date of the following day, and a
 * history that showed an entry as made "tomorrow" would undermine the one
 * distinction this feature is built on. An unparseable stamp returns the raw
 * value rather than inventing a day.
 */
export function enteredOnLabel(recordedAt: string): string {
  const at = new Date(recordedAt)
  if (Number.isNaN(at.getTime())) return recordedAt
  return formatDateShort(formatDateYmd(at))
}

/** The confirm-step sentence. Names the child, because this is her record. */
export function previewSentence(
  reviewed: ReviewedObservation,
  childName: string,
): string {
  return `${childName}: ${NATIVE_PROGRAM_LABEL[reviewed.program]} — ${numberPhrase(
    reviewed,
  )}, seen ${formatDateShort(reviewed.observedOn)}.`
}

/** The receipt. Says what landed and, again, that nothing else moved. */
export function savedNotice(
  reviewed: Pick<ReviewedObservation, 'program' | 'nativeNumber' | 'meaning' | 'observedOn'>,
  childName: string,
): string {
  return `Recorded for ${childName}: ${NATIVE_PROGRAM_LABEL[reviewed.program]} ${numberPhrase(
    reviewed,
  )}, seen ${formatDateShort(reviewed.observedOn)}. Nothing else changed.`
}

/** The receipt for a retry whose first attempt had already landed. */
export function alreadyRecordedNotice(
  reviewed: Pick<ReviewedObservation, 'program' | 'nativeNumber' | 'meaning' | 'observedOn'>,
  childName: string,
): string {
  return `Already recorded for ${childName}: ${numberPhrase(
    reviewed,
  )}, seen ${formatDateShort(reviewed.observedOn)}. Nothing was saved twice.`
}

/**
 * What a parent reads when the app did not get an answer back.
 *
 * It does **not** say the entry was not saved. A generic transport failure is
 * *indeterminate*: the transaction may have committed and the answer been lost on
 * the way home, which is the ordinary phone case — so claiming absence is as much
 * a guess as claiming a save, and the earlier wording made that guess (PR-1897
 * review, round 2). What is true is that nothing is confirmed, her entry is still
 * here, and trying again **checks** the same entry rather than adding another:
 * the document id is built from the entry key and the write is create-or-nothing,
 * so a retry of a save that did land comes back *already recorded*.
 *
 * A refusal the writer can NAME (`NativeProgressRefused`) carries its own
 * sentence instead, because that one is determinate and says why.
 */
export function failureNotice(detail?: string): string {
  const base =
    'This was not confirmed as saved. Your entry is still here — trying again checks the same entry, so it cannot be recorded twice.'
  return detail ? `${base} (${detail})` : base
}

/**
 * ...and what she reads when nothing was attempted at all.
 *
 * The one failure that may state absence, because it is refused on this device
 * before anything leaves it. "Not confirmed" here would invent a doubt that does
 * not exist.
 */
export function notSentNotice(reason: string): string {
  return `This was not sent — ${reason}. Nothing was written, and your entry is still here.`
}

/**
 * The heading of the panel for a confirmed save whose answer never came back
 * after the surface had already moved to another child.
 *
 * **Not confirmed**, not "not saved": the panel's own body explains why those are
 * different things. It names the child it was confirmed for, because the one on
 * screen is somebody else and a heading without a name would read as a failure of
 * the entry being typed now.
 */
export function strandedSaveTitle(childName: string): string {
  return `Not confirmed for ${childName}`
}

/**
 * ...and the body: what is true, and what the one button does.
 *
 * Three facts, in the order they matter: whose entry this was, that the app has
 * no confirmation it reached that child's record — asserting neither absence nor
 * presence, because a lost answer leaves both open — and that trying again checks
 * that same entry rather than adding another. The last clause is the promise the
 * entry key keeps, and the sentence a landed save comes back with.
 */
export function strandedSaveNotice(childName: string): string {
  return `You confirmed this entry for ${childName}, and the app has no confirmation that it reached ${childName}'s record. Trying again checks that same entry rather than adding another, so it cannot be recorded twice — and if it did land, you will be told it was already recorded.`
}

/** The extra line when the stranded entry was a correction, not a new one. */
export function strandedCorrectionNote(childName: string): string {
  return `Whether it landed already or lands on a retry, it is filed as a correction of ${childName}'s earlier entry, exactly as you confirmed it.`
}

/** The correction's own confirm line. Names what is kept, not what is replaced. */
export function correctionPreamble(original: NativeProgressObservation): string {
  return `This is saved as a correction of the entry seen ${formatDateShort(
    original.observedOn,
  )} (${numberPhrase(original)}). That entry stays on the record.`
}

/**
 * What the surface says when the child under it changed with a draft open.
 *
 * RESET, and the loss is named: the fields are cheap to retype (a number, a
 * date, two choices), so re-seeding is kinder than binding a half-typed entry to
 * a child who is no longer on screen. A save already CONFIRMED is a different
 * thing — it is bound to the child it was confirmed for — so the sentence says
 * that too rather than letting a receipt go missing.
 *
 * **Both sentences are timeless**, because the notice outlives the moment it was
 * written: an in-flight save finishes a second later, and *"is still finishing"*
 * would then be a sentence on screen that is no longer true (review item 9). What
 * stays true is where the confirmed entry goes, so that is what it says.
 *
 * What it must NOT say is that the other child's record *received* the entry: the
 * answer can still be lost or refused, and a notice promising a landing the
 * surface has not seen is the claim PR-1897's review refused (P1). So the
 * destination sentence carries its own exception — an unconfirmed write comes back
 * as its own panel on this surface, with the entry intact and a retry bound to the
 * child it names. It says *cannot confirm* rather than *did not save*, which the
 * surface does not know either (round 2).
 */
export function childSwitchNotice(
  previousChildName: string,
  hadDraft: boolean,
  saveConfirmed: boolean,
): string | null {
  if (!hadDraft && !saveConfirmed) return null
  const parts: string[] = []
  if (hadDraft) {
    parts.push(
      `Switched child — the entry you were typing for ${previousChildName} was cleared and not saved.`,
    )
  }
  if (saveConfirmed) {
    parts.push(
      `Anything you had already confirmed for ${previousChildName} goes to ${previousChildName}'s record, not this one — and anything the app cannot confirm is shown here so you can try again.`,
    )
  }
  return parts.join(' ')
}

/**
 * Newest observation first, by the day it describes.
 *
 * `observedOn` leads because that is the question a parent asks of this list
 * ("what was the latest reading?"). `recordedAt` breaks a tie, so two rows about
 * the same day read in the order they were entered — and a row that is a
 * correction therefore sorts above the row it corrects. Sorted in memory rather
 * than by Firestore, which would need a composite index for a filter on one field
 * and an order on another.
 */
export function sortObservations(
  observations: readonly NativeProgressObservation[],
): NativeProgressObservation[] {
  return [...observations].sort((a, b) => {
    if (a.observedOn !== b.observedOn) return a.observedOn < b.observedOn ? 1 : -1
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? 1 : -1
    return a.id.localeCompare(b.id)
  })
}

export interface HistoryRow {
  observation: NativeProgressObservation
  /** The row this one corrects, when it is still present. */
  corrects: NativeProgressObservation | null
  /** Rows that correct this one. Kept visible — nothing is hidden by a fix. */
  correctedBy: NativeProgressObservation[]
}

/**
 * The history, in display order, with each row's corrections attached.
 *
 * A corrected row is NOT removed or struck through into illegibility: it is shown
 * with the correction beside it. The record is what she believed on each day, and
 * a later correction is another entry in it rather than a retraction of history.
 */
export function buildHistoryRows(
  observations: readonly NativeProgressObservation[],
): HistoryRow[] {
  const byId = new Map(observations.map((o) => [o.id, o]))
  const correctionsFor = new Map<string, NativeProgressObservation[]>()
  for (const o of observations) {
    const target = o.correctsObservationId
    if (!target) continue
    const list = correctionsFor.get(target)
    if (list) list.push(o)
    else correctionsFor.set(target, [o])
  }
  return sortObservations(observations).map((observation) => ({
    observation,
    corrects: observation.correctsObservationId
      ? byId.get(observation.correctsObservationId) ?? null
      : null,
    correctedBy: sortObservations(correctionsFor.get(observation.id) ?? []),
  }))
}

export interface ProgramSummary {
  program: NativeProgressProgram
  count: number
  /**
   * The row with the latest `observedOn`.
   *
   * Named for what it is. It is **not** a current position, not a derived state
   * and not a winner — it is the most recent dated reading, and the two flags
   * below exist so the surface can say when even that is murky.
   */
  mostRecentlyObserved: NativeProgressObservation | null
  /** Another row shares that date with a DIFFERENT number. Nothing picks one. */
  sameDateDisagreement: boolean
  /** The most recently entered row describes an earlier day than an older entry. */
  enteredOutOfOrder: boolean
}

/**
 * What can honestly be said about a child's rows, per program.
 *
 * The two flags are the whole reason this returns a structure instead of a
 * number. Backdated and out-of-order entry is expected here — a parent catches up
 * on three weeks of reports in one sitting — and a surface that showed only "the
 * latest" would quietly present one of those as the newest news.
 */
export function summarizeProgram(
  program: NativeProgressProgram,
  observations: readonly NativeProgressObservation[],
): ProgramSummary {
  const mine = sortObservations(observations.filter((o) => o.program === program))
  const mostRecentlyObserved = mine[0] ?? null
  const sameDateDisagreement = mostRecentlyObserved
    ? mine.some(
        (o) =>
          o.id !== mostRecentlyObserved.id &&
          o.observedOn === mostRecentlyObserved.observedOn &&
          (o.nativeNumber !== mostRecentlyObserved.nativeNumber ||
            o.meaning !== mostRecentlyObserved.meaning),
      )
    : false
  // "Entered out of order" is a fact about entry time vs observed time, so it is
  // computed over `recordedAt` rather than over the display order.
  const byEntry = [...mine].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
  const newestEntry = byEntry[0]
  const enteredOutOfOrder = newestEntry
    ? byEntry.some((o) => o.id !== newestEntry.id && o.observedOn > newestEntry.observedOn)
    : false
  return {
    program,
    count: mine.length,
    mostRecentlyObserved,
    sameDateDisagreement,
    enteredOutOfOrder,
  }
}

/** Every program that has at least one row, with its summary. */
export function summarizeObservations(
  observations: readonly NativeProgressObservation[],
): ProgramSummary[] {
  return NATIVE_PROGRAMS.map((program) => summarizeProgram(program, observations)).filter(
    (s) => s.count > 0,
  )
}

/**
 * The summary line for one program — and the caveats, if any.
 *
 * Deliberately phrased as a reading on a date rather than as a state. "Latest
 * record" and "as of" are doing load-bearing work: the app is reporting what it
 * was told, not what is true now.
 */
export function summarySentence(summary: ProgramSummary): string {
  const latest = summary.mostRecentlyObserved
  if (!latest) return `${NATIVE_PROGRAM_LABEL[summary.program]} — nothing recorded yet.`
  const lines = [
    `Latest record: ${numberPhrase(latest)}, as of ${formatDateShort(latest.observedOn)}.`,
  ]
  if (summary.sameDateDisagreement) {
    lines.push('Another entry for that same day says something different — both are kept.')
  }
  if (summary.enteredOutOfOrder) {
    lines.push('Some entries were added out of order, so the newest entry is not the latest day.')
  }
  return lines.join(' ')
}
