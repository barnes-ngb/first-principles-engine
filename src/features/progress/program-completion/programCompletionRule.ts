/**
 * What a parent may confirm about a finished program, and what we say about it
 * (FEAT-242).
 *
 * Pure: no React, no Firestore, no clock of its own — the caller passes today's
 * date key in. It answers four questions and nothing else:
 *
 *   1. is this draft a recordable confirmation, and if not, which field is wrong;
 *   2. which existing native-progress rows may be CITED as its evidence;
 *   3. what the coverage summary says, in plain words a parent can check; and
 *   4. what the surface says about a record that is pending, withdrawn, or
 *      resting on an entry that has since been corrected.
 *
 * ── The honesty rules that live here ────────────────────────────────────────
 *
 * **Completion is confirmed, not computed.** Nothing in this module derives a
 * completion from a number. A citation is optional supporting evidence, and the
 * only row that can serve as one is the program's last unit recorded as
 * finished — "around peak 20" and "peak 24" are both refused, for the same
 * reason: neither is a parent saying the program is done.
 *
 * **It is not a skill claim.** Every sentence about coverage says *covered* or
 * *covered in part*, never mastered, never "knows". There is no sentence here
 * that says the child has finished reading, that the basics are behind him, or
 * that anything comes next.
 *
 * **Nothing is invented.** The program version is reported as unknown because
 * the app cannot know it; assistance is unknown unless the parent says; and no
 * activity count or quiz score appears anywhere, because none is known.
 */

import {
  FAST_PHONICS_COMPLETION_SCOPE_NOTE,
  FAST_PHONICS_IE_DISCREPANCY_NOTE,
  completionMappingFor,
  type CompletionCoverageTarget,
  type ProgramCompletionMapping,
} from '../../../core/foundations/fastPhonicsCompletion'
import { FOUNDATION_NODE_MAP } from '../../../core/foundations'
import { formatDateShort } from '../../../core/utils/dateKey'
import { parseDateYmd } from '../../../core/utils/format'
import {
  CompletionAssistance,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  ProgramCompletionProgram,
  type ProgramCompletionAssertion,
  type ProgramCompletionEvent,
  type ProgramCompletionState,
} from '../../../core/types/programCompletion'
import {
  NOTE_MAX_LENGTH,
  NativeProgressMeaning,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'
import {
  NATIVE_SOURCE_LABEL,
  NATIVE_SOURCE_SHORT,
  numberPhrase,
} from '../native-progress/nativeProgressRule'

/** The programs this surface offers. One, because one has a reviewed mapping. */
export const COMPLETION_PROGRAMS: readonly ProgramCompletionProgram[] = Object.values(
  ProgramCompletionProgram,
)

/** The parent's words for each assistance answer. `unknown` is first and default. */
export const ASSISTANCE_LABEL: Record<CompletionAssistance, string> = {
  [CompletionAssistance.Unknown]: "I'd rather not say / can't remember",
  [CompletionAssistance.Independent]: 'He did it on his own',
  [CompletionAssistance.SomeHelp]: 'He had some help',
}

export const ASSISTANCE_CHOICES: readonly CompletionAssistance[] = [
  CompletionAssistance.Unknown,
  CompletionAssistance.Independent,
  CompletionAssistance.SomeHelp,
]

/** The parent's words for each correction reason. */
export const WITHDRAW_REASON_LABEL: Record<CompletionWithdrawReason, string> = {
  [CompletionWithdrawReason.NotComplete]: "He hasn't finished it after all",
  [CompletionWithdrawReason.Partial]: "He's partway through, not finished",
  [CompletionWithdrawReason.Mistake]: 'I recorded this by mistake',
  [CompletionWithdrawReason.SourceCorrected]:
    'The entry it rested on was corrected',
}

/** The reasons a parent may pick. `sourceCorrected` is written by the app only. */
export const WITHDRAW_REASON_CHOICES: readonly CompletionWithdrawReason[] = [
  CompletionWithdrawReason.NotComplete,
  CompletionWithdrawReason.Partial,
  CompletionWithdrawReason.Mistake,
]

/** The one notice above the form. Said once, short, and it is the whole claim. */
export const COMPLETION_SCOPE_NOTICE =
  'This records that the program is finished and marks what it covered. It is not a test, it does not say he has mastered those things, and it changes no hours, no rewards and no lesson numbers.'

/** ...and the matching line about where the number came from. */
export const COMPLETION_SOURCE_NOTICE =
  'Saved as you report it — not checked against the program.'

/**
 * What the surface says while it does not yet know what is recorded.
 *
 * Load-bearing: *"nothing is recorded as finished"* is a claim, and making it
 * before the read has answered invites a confirmation that could duplicate one
 * already stored. So an unsettled read says it is unsettled and the primary
 * action stays closed until it settles.
 */
export const COMPLETION_STATE_UNKNOWN =
  'Checking what is recorded here. You can confirm a finished program once this has loaded.'

/** ...and when the read FAILED, which is not the same as empty. */
export const COMPLETION_STATE_UNREADABLE =
  'We couldn’t read what is recorded here, so this cannot be confirmed or corrected right now. Nothing has been changed, and anything already recorded is still there.'

/** The disclosure about the map itself, shown at the confirm step. */
export const COMPLETION_MAP_NOTICE = FAST_PHONICS_COMPLETION_SCOPE_NOTE

/** The publisher wrinkle, available to a parent who wants the detail. */
export const COMPLETION_MAP_FOOTNOTE = FAST_PHONICS_IE_DISCREPANCY_NOTE

/** Earliest day a confirmation may be dated — the FEAT-241 typo guard, reused. */
export const OBSERVED_ON_FLOOR = '2000-01-01'

/** The note bound, imported rather than restated so the two cannot drift. */
export { NOTE_MAX_LENGTH }

export interface CompletionDraft {
  program: ProgramCompletionProgram
  /** Raw text from the date field (`YYYY-MM-DD`). */
  observedOn: string
  source: NativeProgressSource
  assistance: CompletionAssistance
  note: string
  /** The cited row's id, or `''` for "no entry to point at". */
  reportObservationId: string
}

/** A draft with nothing chosen. The date is seeded by the caller. */
export function emptyCompletionDraft(observedOn: string): CompletionDraft {
  return {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn,
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
    note: '',
    reportObservationId: '',
  }
}

/** True when nothing a person chose would be lost by clearing this draft. */
export function completionDraftIsEmpty(
  draft: CompletionDraft,
  seededDate: string,
): boolean {
  return (
    draft.observedOn === seededDate &&
    draft.note.trim() === '' &&
    draft.reportObservationId === '' &&
    draft.program === ProgramCompletionProgram.FastPhonics &&
    draft.source === NativeProgressSource.ParentReport &&
    draft.assistance === CompletionAssistance.Unknown
  )
}

export interface CompletionDraftErrors {
  program?: string
  observedOn?: string
  source?: string
  assistance?: string
  note?: string
  reportObservationId?: string
}

/** The reviewed content of a draft — everything but who and when it was typed. */
export interface ReviewedCompletionDraft {
  program: ProgramCompletionProgram
  observedOn: string
  source: NativeProgressSource
  assistance: CompletionAssistance
  note?: string
  reportObservationId?: string
}

export type CompletionDraftReview =
  | { ok: true; reviewed: ReviewedCompletionDraft }
  | { ok: false; errors: CompletionDraftErrors }

/**
 * Which of a child's recorded rows may be cited as the evidence for a finished
 * program.
 *
 * Three conditions, and the third is the one that matters: the row must say the
 * program was finished **through its last unit**. A `workingOn` or `uncertain`
 * row is not a completion claim whatever its number, and a number past the last
 * unit is not a stronger claim — it is an unexplained one. Rows that have
 * themselves been corrected are excluded, because pointing at a superseded
 * reading would make the citation read as current.
 */
export function eligibleCitations(
  rows: readonly NativeProgressObservation[],
  program: ProgramCompletionProgram,
): NativeProgressObservation[] {
  const mapping = completionMappingFor(program)
  if (!mapping) return []
  const corrected = new Set(
    rows.map((r) => r.correctsObservationId).filter((id): id is string => Boolean(id)),
  )
  return rows
    .filter(
      (row) =>
        row.program === program &&
        row.meaning === NativeProgressMeaning.CompletedThrough &&
        row.nativeNumber === mapping.citableFinalPosition &&
        !corrected.has(row.id),
    )
    .sort((a, b) => (a.observedOn < b.observedOn ? 1 : -1))
}

/** One citation's line in the picker. Says what it says, and when it was seen. */
export function citationLabel(row: NativeProgressObservation): string {
  return `${numberPhrase(row)}, seen ${formatDateShort(row.observedOn)} (${
    NATIVE_SOURCE_SHORT[row.source]
  })`
}

/**
 * Is this draft recordable, and if not, which fields are wrong?
 *
 * Returns ALL the bad fields at once rather than the first — the FEAT-241 rule,
 * for the same reason: a phone form that reports one error per tap is a form a
 * person fills in four times. The citation is validated against the rows the
 * surface was showing; the writer re-checks it inside its transaction, because
 * the row can be corrected between the two.
 */
export function reviewCompletionDraft(
  draft: CompletionDraft,
  todayKey: string,
  rows: readonly NativeProgressObservation[],
): CompletionDraftReview {
  const errors: CompletionDraftErrors = {}

  if (!COMPLETION_PROGRAMS.includes(draft.program)) {
    errors.program = 'Pick which program is finished.'
  }
  if (!Object.values(NativeProgressSource).includes(draft.source)) {
    errors.source = 'Pick where you got this from.'
  }
  if (!Object.values(CompletionAssistance).includes(draft.assistance)) {
    errors.assistance = 'Pick one, or leave it as "rather not say".'
  }

  const observedOn = draft.observedOn.trim()
  if (observedOn.length === 0) {
    errors.observedOn = 'Pick the day you knew it was finished.'
  } else if (!parseDateYmd(observedOn)) {
    errors.observedOn = 'Use a real date, like 2026-10-12.'
  } else if (observedOn > todayKey) {
    errors.observedOn = "That day hasn't happened yet."
  } else if (observedOn < OBSERVED_ON_FLOOR) {
    errors.observedOn = 'That year looks like a typo.'
  }

  const note = draft.note.trim()
  if (note.length > NOTE_MAX_LENGTH) {
    errors.note = `Keep the note under ${NOTE_MAX_LENGTH} characters.`
  }

  const citationId = draft.reportObservationId.trim()
  if (citationId) {
    const eligible = eligibleCitations(rows, draft.program)
    if (!eligible.some((row) => row.id === citationId)) {
      errors.reportObservationId =
        'That entry does not say this program was finished, so it cannot be the evidence for it.'
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    reviewed: {
      program: draft.program,
      observedOn,
      source: draft.source,
      assistance: draft.assistance,
      ...(note ? { note } : {}),
      ...(citationId ? { reportObservationId: citationId } : {}),
    },
  }
}

/** One line of the coverage summary: a concept, its reach, and its grounding. */
export interface CoverageSummaryLine {
  conceptId: string
  kidName: string
  /** `Covered` / `Covered in part` — never "mastered". */
  reach: string
  /** The peak that teaches it. */
  unit: string
  /** Why the reach is partial, when it is. */
  partialReason?: string
}

/** The short coverage summary, in climb order. Pure projection of the mapping. */
export function coverageSummary(
  program: ProgramCompletionProgram,
): CoverageSummaryLine[] {
  const mapping = completionMappingFor(program)
  if (!mapping) return []
  return mapping.targets.map((target: CompletionCoverageTarget) => ({
    conceptId: target.conceptId,
    kidName: FOUNDATION_NODE_MAP[target.conceptId]?.kidName ?? target.conceptId,
    reach: target.qualifier === 'partial' ? 'Covered in part' : 'Covered',
    unit: target.attributedPeakLabel,
    ...(target.partialReason ? { partialReason: target.partialReason } : {}),
  }))
}

/** The one-line headline for a coverage summary. Counts concepts, nothing else. */
export function coverageSummaryHeadline(
  program: ProgramCompletionProgram,
): string {
  const lines = coverageSummary(program)
  const partial = lines.filter((l) => l.reach === 'Covered in part').length
  const full = lines.length - partial
  const mapping = completionMappingFor(program)
  const label = mapping?.label ?? 'this program'
  return `Finishing ${label} covers ${full} reading building block${
    full === 1 ? '' : 's'
  }, and part of ${partial} more. Covered means the material was taught — not that it has been checked.`
}

/** The confirm-step sentence. Names the child, because this is his record. */
export function completionPreview(
  reviewed: ReviewedCompletionDraft,
  childName: string,
  citation: NativeProgressObservation | null,
): string {
  const mapping = completionMappingFor(reviewed.program)
  const label = mapping?.label ?? reviewed.program
  const cited = citation ? ` Evidence: ${citationLabel(citation)}.` : ''
  return `${childName}: ${label} finished, as of ${formatDateShort(
    reviewed.observedOn,
  )} (${NATIVE_SOURCE_SHORT[reviewed.source]}).${cited}`
}

/** The receipt. Says what landed and, again, what did not move. */
export function completionSavedNotice(
  reviewed: ReviewedCompletionDraft,
  childName: string,
  applied: boolean,
): string {
  const mapping = completionMappingFor(reviewed.program)
  const label = mapping?.label ?? reviewed.program
  const tail = applied
    ? 'What it covered is marked on his learning picture as covered — not as mastered.'
    : 'What it covered has NOT been marked yet — use “Update the learning picture” to finish that.'
  return `Recorded for ${childName}: ${label} finished, as of ${formatDateShort(
    reviewed.observedOn,
  )}. ${tail} No hours, rewards or lesson numbers changed.`
}

/** The receipt for a retry whose first attempt had already landed. */
export function completionAlreadyRecordedNotice(childName: string): string {
  return `Already recorded for ${childName}. Nothing was saved twice.`
}

/**
 * What a parent reads when the app did not get an answer back.
 *
 * It does **not** say nothing was saved: a generic transport failure is
 * indeterminate — the transaction may have committed with the answer lost on the
 * way home — and the retry is what settles it. Same rule, same words, as the
 * FEAT-241 surface next to it.
 */
export function completionFailureNotice(): string {
  return 'This was not confirmed as saved. Your entry is still here — trying again checks the same entry, so it cannot be recorded twice.'
}

/** ...and what she reads when nothing was attempted at all. */
export function completionNotSentNotice(reason: string): string {
  return `This was not sent — ${reason}. Nothing was written, and your entry is still here.`
}

/** The heading for a confirmed save whose answer never came back. */
export function completionStrandedTitle(childName: string): string {
  return `Not confirmed for ${childName}`
}

/** ...and its body: whose it was, what is unknown, and what a retry does. */
export function completionStrandedNotice(childName: string): string {
  return `You confirmed this for ${childName}, and the app has no confirmation that it reached ${childName}'s record. Trying again checks that same entry rather than adding another, so it cannot be recorded twice — and if it did land, you will be told it was already recorded.`
}

/** What the act was, in the words the parent used for it. */
function strandedActLabel(kind: 'confirm' | 'withdraw'): string {
  return kind === 'confirm' ? 'confirmation' : 'correction'
}

/**
 * The heading for a stranded entry whose retry was REFUSED for good.
 *
 * It is about the TRY, not about the record: the refusal answers the request
 * just sent, and the attempt that stranded this entry in the first place is
 * still unknown either way. A heading that said "not saved" would settle that
 * unknown in the wrong direction — the writer checks the stored record and the
 * cited entry BEFORE its idempotent branch, so a confirmation that did land can
 * be refused on a retry (a corrected citation is exactly that case).
 */
export function completionStrandedRefusedTitle(childName: string): string {
  return `Trying again was refused for ${childName}`
}

/**
 * ...and its body: the writer's own reason, what the reason is NOT about, and
 * the one next step that cannot make things worse — reading the record.
 *
 * Deliberately not "nothing left to retry": what the refusal rests on is
 * stored data, and stored data changes. It says the same REQUEST will keep
 * getting this answer, which is why the button is withdrawn, and sends her to
 * the record rather than to a second confirmation.
 */
export function completionStrandedRefusedNotice(
  childName: string,
  kind: 'confirm' | 'withdraw',
  reason: string,
): string {
  const label = strandedActLabel(kind)
  const why = reason.trim() ? reason.trim() : 'It was refused, with no reason given.'
  return `${why} That is the answer to the try just now: it does not say whether the ${label} you sent before reached ${childName}'s record, which is still unknown. Check what is recorded for ${childName} before sending anything again — the same ${label} will keep getting this answer until what is recorded changes.`
}

/**
 * The extra line for a refusal that ASKED to be tried again.
 *
 * A lookup the writer could not complete is refused before it decided
 * anything, and its sentence ends "nothing was saved. Try again in a moment."
 * That "nothing was saved" is about the attempt just now; the earlier one is
 * still unconfirmed either way, and a parent who reads the writer's words as a
 * verdict on her record would either stop trying or confirm a second time. So
 * the reason is shown with the scope it actually has, and the retry stays.
 */
export function completionStrandedReasonLine(
  childName: string,
  kind: 'confirm' | 'withdraw',
  reason: string,
): string {
  const label = strandedActLabel(kind)
  const why = reason.trim() ? reason.trim() : 'A check could not be completed just now.'
  return `${why} That answer — including anything in it about nothing being saved — is about the try just now: whether the ${label} you sent before reached ${childName}'s record is still unknown.`
}

/**
 * The line that says WHY nothing new can be sent while one entry is unanswered.
 *
 * The surface keeps one unanswered request, and that request is the only copy
 * of its idempotency key: a second one would have to write over it, and the key
 * is what makes trying again a retry of the same entry rather than a second
 * entry. So the hold is explained where the entry is, by name, rather than
 * leaving a greyed-out button to be guessed at.
 */
export function completionUnresolvedHoldLine(childName: string): string {
  return `Until this is settled, nothing new can be recorded or corrected here: holding on to ${childName}'s entry is what lets trying again check that same entry instead of adding another.`
}

/**
 * ...and the reason given to a parent who asks for a save anyway.
 *
 * Fed to `completionNotSentNotice`, so it ends by saying nothing was written
 * and her entry is still here — the hold must never read as a failure of what
 * she has just filled in, and it must point at the one act that settles the
 * earlier entry.
 */
export function completionUnresolvedHoldReason(
  childName: string,
  kind: 'confirm' | 'withdraw',
): string {
  const label = strandedActLabel(kind)
  return `the ${label} for ${childName} above is still waiting for an answer, and settling that one comes first: “Try that entry again” on it sends that same entry, so it cannot be recorded twice`
}

/** What the surface says when the child under it changed with a draft open. */
export function completionChildSwitchNotice(
  previousChildName: string,
  hadDraft: boolean,
  saveConfirmed: boolean,
): string | null {
  if (!hadDraft && !saveConfirmed) return null
  const parts: string[] = []
  if (hadDraft) {
    parts.push(
      `Switched child — the finished-program entry you were filling in for ${previousChildName} was cleared and not saved.`,
    )
  }
  if (saveConfirmed) {
    parts.push(
      `Anything you had already confirmed for ${previousChildName} goes to ${previousChildName}'s record, not this one — and anything the app cannot confirm is shown here so you can try again.`,
    )
  }
  return parts.join(' ')
}

/** The sentence describing what is currently on the record, or null for nothing. */
export function activeCompletionSentence(
  state: ProgramCompletionState | null,
  childName: string,
): string | null {
  if (!state?.activeEntryKey || !state.activeAssertion) return null
  const mapping = completionMappingFor(state.program)
  const label = mapping?.label ?? state.program
  const a: ProgramCompletionAssertion = state.activeAssertion
  const assistance =
    a.assistance === CompletionAssistance.Unknown
      ? 'whether he had help is not recorded'
      : a.assistance === CompletionAssistance.Independent
        ? 'he did it on his own'
        : 'he had some help'
  return `${childName}: ${label} finished, as of ${formatDateShort(a.observedOn)} — ${
    NATIVE_SOURCE_LABEL[a.source].toLowerCase()
  }; ${assistance}; program version not recorded.`
}

/** The plain-language status line for the active projection. */
export function projectionStatusLine(
  state: ProgramCompletionState | null,
): string | null {
  if (!state) return null
  switch (state.projection.status) {
    case CompletionProjectionStatus.Applied:
      return 'Marked on his learning picture as covered. Advice and plans refresh on their own schedule, not instantly.'
    case CompletionProjectionStatus.Pending:
      return (
        state.projection.detail ??
        'Recorded. The learning picture has not been updated yet.'
      )
    case CompletionProjectionStatus.WithdrawalPending:
      return (
        state.projection.detail ??
        'Withdrawn here, but the learning picture still has to be updated.'
      )
    default:
      return state.projection.detail ?? null
  }
}

/** True when the surface should offer the explicit apply/retry button. */
export function needsApplyRetry(state: ProgramCompletionState | null): boolean {
  if (!state) return false
  return (
    state.projection.status === CompletionProjectionStatus.Pending ||
    state.projection.status === CompletionProjectionStatus.WithdrawalPending
  )
}

/**
 * True when a reviewed mapping upgrade is available for the active record.
 *
 * Offered as an explicit action and never applied on a view load: a re-curation
 * changes what the app claims a finished program covered, and that has to be a
 * visible act with a date on it.
 */
export function mappingUpgradeAvailable(
  state: ProgramCompletionState | null,
  mapping: ProgramCompletionMapping | null,
): boolean {
  if (!state?.activeEntryKey || !mapping) return false
  if (state.projection.status !== CompletionProjectionStatus.Applied) return false
  const applied = state.projection.appliedMappingVersion
  return applied != null && applied < mapping.mappingVersion
}

/** The line offering that upgrade, naming both versions. */
export function mappingUpgradeLine(
  state: ProgramCompletionState | null,
  mapping: ProgramCompletionMapping | null,
): string | null {
  if (!mappingUpgradeAvailable(state, mapping)) return null
  return `The coverage map has been reviewed since this was recorded (version ${
    state?.projection.appliedMappingVersion
  } → ${mapping?.mappingVersion}). Applying it updates what this record marks as covered.`
}

/** The notice when the entry a record rested on has since been corrected. */
export function sourceConflictNotice(
  state: ProgramCompletionState | null,
): string | null {
  const conflict = state?.sourceConflict
  if (!conflict) return null
  return conflict.detail
}

/** The last correction, in the parent's own words, or null. */
export function lastWithdrawSentence(
  state: ProgramCompletionState | null,
): string | null {
  const w = state?.lastWithdraw
  if (!w || state?.activeEntryKey) return null
  return `Withdrawn ${formatDateShort(w.at.slice(0, 10))} — ${WITHDRAW_REASON_LABEL[
    w.reason
  ].toLowerCase()}.`
}

/** One history line for the immutable event log. */
export function eventSentence(event: ProgramCompletionEvent): string {
  const mapping = completionMappingFor(event.program)
  const label = mapping?.label ?? event.program
  const day = formatDateShort(event.recordedAt.slice(0, 10))
  switch (event.kind) {
    case 'confirm':
      return `${day} — you confirmed ${label} is finished${
        event.assertion?.observedOn
          ? `, as of ${formatDateShort(event.assertion.observedOn)}`
          : ''
      }.`
    case 'withdraw':
      return `${day} — withdrawn: ${
        WITHDRAW_REASON_LABEL[event.withdrawReason ?? CompletionWithdrawReason.Mistake]
      }.`
    default:
      return `${day} — the reviewed coverage map was applied (version ${event.mappingVersion}).`
  }
}

/** Newest act first; ties broken by id so the order is stable. */
export function sortEvents(
  events: readonly ProgramCompletionEvent[],
): ProgramCompletionEvent[] {
  return [...events].sort((a, b) => {
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? 1 : -1
    return a.id.localeCompare(b.id)
  })
}

/** A new draft identity. The id a retry of the same save reuses. */
export function newCompletionEntryKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
