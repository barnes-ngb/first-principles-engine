/**
 * *Log work* — what one parent draft WOULD save, said in words before the tap
 * (FIX-267).
 *
 * ── Why it exists ──────────────────────────────────────────────────────────
 *
 * The parent capture card had three mutually exclusive tabs and four ways to
 * start a save, and none of them said what the save would produce. A typed note
 * was dropped the moment a photo or an audio file committed (that pathway wrote
 * its own artifact and never read `noteText`), the panel's top button opened a
 * SECOND photo surface in a modal that inherited none of the form's fields, and
 * choosing an audio file committed it with no confirmation step at all. So the
 * card could save three different things and a parent could not predict which.
 *
 * This module is the one answer to *what is in this draft* and *what will be
 * written*, as a person reads it. It is the G1/G2 bar made checkable: a parent
 * can predict and confirm exactly what evidence and time are saved.
 *
 * ── What it is not ─────────────────────────────────────────────────────────
 *
 * **It computes no minutes.** The parsed minutes arrive as a number, the same
 * number the `hours` row carries, and the only arithmetic here is `> 0` — the
 * rule every pathway on this card has always gated its `hours` write on. No
 * rounding, no bucketing, no inference from an image or a recording's own
 * length; a recording is evidence, not a clock.
 *
 * **It writes nothing and reads nothing.** Pure: no React, no Firestore, no
 * clock. The card holds the state; `logWorkSave.ts` performs the writes.
 */
import { parseDateYmd } from '../../core/utils/format'
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'

/** The section's own heading, and the word the Today jump uses for it. */
export const LOG_WORK_TITLE = 'Log work'

/**
 * One kind of media at a time (approved scope). A photo batch and a recording
 * in one save would be one artifact holding two kinds of file, or two artifacts
 * for one logical save; both change what a record IS, so the form offers one.
 */
export type LogWorkMediaKind = 'photo' | 'audio'

/** The draft, as the card holds it. */
export interface LogWorkDraft {
  /** Whose work this is, for the summary and the receipt. */
  childName: string
  /** The day it is filed under, `YYYY-MM-DD` — never today's device date. */
  day: string
  activityName: string
  subjectBucket: SubjectBucket
  /** Already parsed and clamped by the card; `0` means no time. */
  minutes: number
  note: string
  mediaKind: LogWorkMediaKind | null
  /** Photos staged in the form and not yet uploaded. */
  photoCount: number
  /** A recording or an audio file staged in the form and not yet uploaded. */
  hasAudio: boolean
}

/** A day a person reads — *"Tue, Oct 20"*, or the key itself if unparseable. */
export function logWorkDayLabel(day: string): string {
  const parsed = parseDateYmd(day)
  if (!parsed) return day
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Does this draft hold a typed note? */
export function hasNote(draft: Pick<LogWorkDraft, 'note'>): boolean {
  return draft.note.trim().length > 0
}

/** Does this draft hold media staged for upload? */
export function hasStagedMedia(
  draft: Pick<LogWorkDraft, 'photoCount' | 'hasAudio'>,
): boolean {
  return draft.photoCount > 0 || draft.hasAudio
}

/**
 * The evidence this draft would file, in a parent's words — or `null` for a
 * draft that files none (a time-only log, which is a first-class case).
 *
 * The note is named FIRST because it is the piece the old card silently
 * dropped: *"your note and 2 photos"* is the sentence whose absence was the
 * reported defect.
 */
export function describeEvidence(draft: LogWorkDraft): string | null {
  const pieces: string[] = []
  if (hasNote(draft)) pieces.push('your note')
  if (draft.photoCount === 1) pieces.push('1 photo')
  else if (draft.photoCount > 1) pieces.push(`${draft.photoCount} photos`)
  if (draft.hasAudio) pieces.push('your recording')
  if (pieces.length === 0) return null
  if (pieces.length === 1) return pieces[0]
  return `${pieces.slice(0, -1).join(', ')} and ${pieces[pieces.length - 1]}`
}

/**
 * Whether time is recorded, stated either way.
 *
 * An empty minutes field is not a promise: every pathway gates the `hours` row
 * on `minutes > 0`, so a draft with none writes none, and the summary says so
 * rather than leaving the question open (FIX-266's line, kept).
 */
export function describeTime(draft: LogWorkDraft): string {
  if (draft.minutes <= 0) return 'No time is recorded.'
  return `Records ${draft.minutes} minutes to ${SubjectBucketLabel[draft.subjectBucket]}.`
}

/**
 * Is there anything to save?
 *
 * **A name on its own is not enough**, and that is the one judgement here: the
 * activity name and the category are FILING for a record, not the record. A
 * draft holding only *"dentist visit"* in the name has nothing to write — no
 * artifact (an empty note is not evidence) and no `hours` row (no minutes) —
 * so the button is disabled and `logWorkBlockedReason` says why, on screen.
 */
export function logWorkSaveable(draft: LogWorkDraft): boolean {
  return hasNote(draft) || hasStagedMedia(draft) || draft.minutes > 0
}

/** The visible reason the save is not available yet, or `null` when it is. */
export function logWorkBlockedReason(draft: LogWorkDraft): string | null {
  if (logWorkSaveable(draft)) return null
  if (draft.activityName.trim()) {
    // Said as a fact about THIS draft rather than as a generic hint: the parent
    // has typed something and is entitled to know why it is not enough.
    return 'A name on its own isn’t saved. Add a note, some minutes, a photo or a recording.'
  }
  return 'Add a note, some minutes, a photo or a recording.'
}

/** The three lines above *Save work*, in the order a person reads them. */
export interface LogWorkSummary {
  /** *"Lincoln · Tue, Oct 20 · Practical Arts"* — whose, when, filed where. */
  scopeLine: string
  /** *"Saves your note and 2 photos."* / *"Saves no evidence."* */
  savesLine: string
  /** *"Records 45 minutes to Practical Arts."* / *"No time is recorded."* */
  timeLine: string
}

export function logWorkSummary(draft: LogWorkDraft): LogWorkSummary {
  const evidence = describeEvidence(draft)
  return {
    scopeLine: `${draft.childName} · ${logWorkDayLabel(draft.day)} · ${
      SubjectBucketLabel[draft.subjectBucket]
    }`,
    // An empty draft is not a "time only" log — it is nothing yet, and saying
    // *time only* over zero minutes was read as a promise to log time.
    savesLine: evidence
      ? `Saves ${evidence}.`
      : draft.minutes > 0
        ? 'Saves no evidence — time only.'
        : 'Nothing to save yet.',
    timeLine: describeTime(draft),
  }
}

/**
 * What a finished save has to say for itself.
 *
 * `base` wording for `captureDraftOwnership`'s receipts, which append WHOSE
 * capture it was whenever the editor has moved on — so nothing here may name a
 * child or a day, and nothing here carries a trailing full stop.
 *
 * Both halves are always stated, including the negative one, because "Saved"
 * alone is what made the old card unpredictable: a parent could not tell
 * whether the minutes went in.
 */
export function logWorkReceiptBase(saved: {
  evidence: string | null
  minutes: number
}): string {
  const timed = saved.minutes > 0
  if (saved.evidence && timed) return `Saved ${saved.evidence} — ${saved.minutes} min logged`
  if (saved.evidence) return `Saved ${saved.evidence} — no time logged`
  if (timed) return `Logged ${saved.minutes} min — no evidence saved`
  // Unreachable from the card (the button is disabled), and still answered
  // honestly rather than with a claim.
  return 'Nothing to save'
}

/** The fields a quick-fill preset writes into, and a parent can edit by hand. */
export const PRESET_FIELDS = ['name', 'category', 'minutes'] as const
export type PresetField = (typeof PRESET_FIELDS)[number]

/** A parent's own words for each, for the overwrite confirmation. */
export const PRESET_FIELD_WORD: Record<PresetField, string> = {
  name: 'what this is',
  category: 'the category',
  minutes: 'the minutes',
}

/**
 * Which hand-edited fields a preset tap would overwrite.
 *
 * A quick fill is a SHORTCUT, never a save, and it must not silently take back
 * something a parent typed. The card tracks which of the three fields have been
 * edited by hand; this answers what a tap would cost, so the card can ask
 * first — one small confirmation, not a second form.
 */
export function presetOverwrites(edited: ReadonlySet<PresetField>): PresetField[] {
  return PRESET_FIELDS.filter((field) => edited.has(field))
}

/** The sentence of that confirmation. */
export function presetOverwriteQuestion(
  presetLabel: string,
  fields: readonly PresetField[],
): string {
  const words = fields.map((f) => PRESET_FIELD_WORD[f])
  const list =
    words.length === 1
      ? words[0]
      : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return `Use “${presetLabel}” and replace ${list} you typed?`
}

/**
 * Replacing — or simply removing — the staged media, asked before it happens.
 *
 * Nothing has been written, so this is not data loss — but a photo of today's
 * work can be gone from the table by the time a parent notices, so the removal
 * is never silent. `next` is the kind being switched TO, or `null` for the
 * parent un-picking the attachment altogether.
 */
export function mediaReplaceQuestion(
  current: LogWorkMediaKind,
  photoCount: number,
  next: LogWorkMediaKind | null,
): string {
  const what =
    current === 'photo'
      ? photoCount === 1
        ? 'the photo'
        : `the ${photoCount} photos`
      : 'the recording'
  const tail = next === null ? '' : next === 'photo' ? ' and add photos instead' : ' and record audio instead'
  return `Remove ${what} you attached${tail}? Nothing has been saved yet.`
}

/**
 * The line that says which day a log is being filed under, when that is not
 * today — in either direction.
 *
 * The first cut asked `day !== todayKey()` and called the answer *a past day*,
 * so a day picked AHEAD of today was described as past. Returns `null` for
 * today itself, where the heading already says it.
 */
export function selectedDayNotice(day: string, todayKey: string): string | null {
  if (day === todayKey) return null
  // `YYYY-MM-DD` sorts as it reads, which is why the app stores dates this way.
  if (day < todayKey) return `This is a past day. The work is filed under ${day}, not today.`
  return `This day hasn’t happened yet. The work is filed under ${day}, not today.`
}

/**
 * What *Stop waiting* will do, said before it is done.
 *
 * Two outcomes, and the difference matters: the submitted draft is cleared so
 * it cannot be filed twice, but a draft the parent has typed since is hers and
 * stays. Neither case deletes or rolls back anything already stored.
 */
export function stopPendingQuestion(ownsDraft: boolean): string {
  const kept = 'Whatever already saved stays saved — nothing is deleted.'
  return ownsDraft
    ? `${kept} This stops waiting on the rest and clears this draft, so the same work can’t be filed twice.`
    : `${kept} This stops waiting on the rest. The draft you have typed since is kept as it is.`
}

/** Said when a child or day change dropped staged media rather than moving it. */
export const MEDIA_CLEARED_ON_SCOPE_CHANGE =
  'The child or day changed, so the media attached here was removed — nothing was saved. Attach it again if it belongs to this day.'

/** The subject bucket a fresh draft starts in — unchanged (`Other`). */
export const DEFAULT_LOG_WORK_BUCKET = SubjectBucket.Other
