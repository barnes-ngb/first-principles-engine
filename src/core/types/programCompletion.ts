/**
 * A parent's explicit confirmation that a whole external program is FINISHED,
 * and what that confirmation currently contributes (FEAT-242).
 *
 * ── Two shapes, because they are two different things ───────────────────────
 *
 * FEAT-241 records *what a program said on a day* and never changes a row. This
 * feature needs both halves of a stronger claim, and they have different rules,
 * so they are stored separately rather than pretending one document can be
 * honestly described as append-only while its fields are rewritten:
 *
 *   • {@link ProgramCompletionEvent} — the IMMUTABLE history. One document per
 *     act (confirm / withdraw / re-apply), written once, never updated. This is
 *     the record of what the parent did and when.
 *   • {@link ProgramCompletionState} — the MUTABLE active projection. One
 *     document per child+program holding *which* confirmation is in force and
 *     what has actually been written to the learner model. It is updated in
 *     place, and it says so.
 *
 * Reading them together answers both questions a correction raises: *what does
 * the app currently believe* (state) and *how did it come to believe it*
 * (events). Collapsing them would have meant either losing the history or
 * claiming an "append-only" document whose status fields move.
 *
 * ── What a confirmation is, and is not ─────────────────────────────────────
 *
 * It **is** one parent asserting, explicitly, that the child finished this
 * program — with the day she observed that, where she got it from, and
 * optionally whether help was involved.
 *
 * It is **not** a skill attestation (she is not saying the child can do each
 * concept), **not** a score (no activity or quiz result is known to this app),
 * **not** a program version claim (the edition the child used is recorded as
 * unknown, never guessed), and **not** derived from a number: reaching the last
 * peak is not finishing the program, so no numeric threshold ever creates one of
 * these.
 */

import type {
  NativeProgressMeaning,
  NativeProgressSource,
} from './nativeProgress'

/**
 * The programs a completion can be confirmed for.
 *
 * One entry, because a completion needs a REVIEWED coverage mapping and Fast
 * Phonics is the one program that has one. A second program is a new mapping
 * module plus an entry here — a deliberate change, not an open field.
 */
export const ProgramCompletionProgram = {
  FastPhonics: 'fastPhonics',
} as const
export type ProgramCompletionProgram =
  (typeof ProgramCompletionProgram)[keyof typeof ProgramCompletionProgram]

/** What one event in the history is. */
export const CompletionEventKind = {
  /** The parent confirmed the program is finished. */
  Confirm: 'confirm',
  /** The parent (or a corrected source report) withdrew that confirmation. */
  Withdraw: 'withdraw',
  /** A reviewed mapping version was applied to a standing confirmation. */
  Reapply: 'reapply',
} as const
export type CompletionEventKind =
  (typeof CompletionEventKind)[keyof typeof CompletionEventKind]

/**
 * Why a confirmation was withdrawn — the parent's own words, in her vocabulary.
 *
 * `SourceCorrected` is the only machine-originated one: it is written when she
 * corrects the native-progress report a confirmation cited into something that
 * no longer supports it. Even then the correction does not re-point the claim at
 * the new row — a fresh confirmation is required (see
 * `programCompletionWrites`).
 */
export const CompletionWithdrawReason = {
  /** "He hasn't finished it after all." */
  NotComplete: 'notComplete',
  /** "He's partway through, not finished." */
  Partial: 'partial',
  /** "I confirmed this by mistake." */
  Mistake: 'mistake',
  /** The cited report was corrected into something that does not support it. */
  SourceCorrected: 'sourceCorrected',
} as const
export type CompletionWithdrawReason =
  (typeof CompletionWithdrawReason)[keyof typeof CompletionWithdrawReason]

/**
 * Whether the child had help — OPTIONAL, and `Unknown` by default.
 *
 * Offered because a parent who knows will want it on the record, and defaulted
 * to unknown because most of the time nobody remembers and a forced answer is a
 * worse record than an honest blank. Nothing reads it to change a state; it
 * rides along on the evidence so the claim can be read in context later.
 */
export const CompletionAssistance = {
  Unknown: 'unknown',
  Independent: 'independent',
  SomeHelp: 'someHelp',
} as const
export type CompletionAssistance =
  (typeof CompletionAssistance)[keyof typeof CompletionAssistance]

/** Where the active contribution currently stands against the learner model. */
export const CompletionProjectionStatus = {
  /** Confirmed, but no learner model existed to apply it to yet. */
  Pending: 'pending',
  /** Applied — the model carries this confirmation's active coverage refs. */
  Applied: 'applied',
  /** Withdrawn, but the model still carries refs that must be superseded. */
  WithdrawalPending: 'withdrawalPending',
  /** Withdrawn and settled — no active refs remain (or none were ever written). */
  Withdrawn: 'withdrawn',
} as const
export type CompletionProjectionStatus =
  (typeof CompletionProjectionStatus)[keyof typeof CompletionProjectionStatus]

/**
 * The parent's assertion itself — the completion fact, independent of any
 * native-progress row.
 *
 * A citation (`reportObservationId` and the fields copied beside it) is
 * OPTIONAL: a parent who already recorded "finished through peak 20" can point
 * at it, and a parent who never typed a number can still confirm the program is
 * done. The copied fields are a snapshot taken inside the writing transaction,
 * so the confirmation can still be read honestly if the row is later corrected.
 */
export interface ProgramCompletionAssertion {
  /** `YYYY-MM-DD` — the day the parent OBSERVED the program was finished. */
  observedOn: string
  /** Where she got that from — asserted, never checked (the FEAT-241 vocabulary). */
  source: NativeProgressSource
  /** Optional, `unknown` by default. Never a required question. */
  assistance: CompletionAssistance
  /**
   * The program version/edition as REPORTED. Always `'unknown'` today: this app
   * has no way to learn it and will not fabricate one. A literal rather than an
   * optional field so the unknown is visible in the stored document.
   */
  reportedProgramVersion: 'unknown'
  /** Optional free note, the parent's own words. */
  note?: string
  /** The native-progress row cited, when one was. */
  reportObservationId?: string
  reportObservedOn?: string
  reportNativeNumber?: number
  reportMeaning?: NativeProgressMeaning
}

/**
 * One act, written once and never updated.
 *
 * Path: `families/{familyId}/programCompletionEvents/{childId}__{program}__{entryKey}`
 * — the child and program in the id so a mis-filed row is visible in a console
 * listing, and the draft's `entryKey` so a retry of the same confirmed save
 * lands on the same document instead of adding a second act.
 */
export interface ProgramCompletionEvent {
  id: string
  childId: string
  program: ProgramCompletionProgram
  /** The draft identity; the idempotency key the document id is built from. */
  entryKey: string
  kind: CompletionEventKind
  /** When this act was recorded (ISO). Entry time, never observation time. */
  recordedAt: string
  /** The reviewed mapping version in force when the act happened. */
  mappingVersion: number
  /** Present on `confirm`. */
  assertion?: ProgramCompletionAssertion
  /** Present on `withdraw` — which confirmation it ends. */
  withdrawsEntryKey?: string
  withdrawReason?: CompletionWithdrawReason
  /** Present on `withdraw` when a corrected report triggered it. */
  correctedByObservationId?: string
  /** Present on `reapply` — the version the model carried before. */
  previousMappingVersion?: number
  /** A short machine-readable note about what the act did. Never a score. */
  detail?: string
}

/**
 * Which confirmation is in force, and what the model actually carries.
 *
 * Path: `families/{familyId}/programCompletionState/{childId}__{program}` — one
 * document, read and written inside every completion transaction, which is what
 * makes "at most one active confirmation per child and program" an invariant a
 * concurrent second tap cannot break (a Firestore transaction cannot run a
 * query, so the single-active rule needs a single contended document).
 */
export interface ProgramCompletionState {
  id: string
  childId: string
  program: ProgramCompletionProgram
  /** The `entryKey` of the confirmation in force, or null when none is. */
  activeEntryKey: string | null
  /** Its assertion, copied so a reader needs one document. */
  activeAssertion: ProgramCompletionAssertion | null
  /** When it was confirmed (entry time). */
  activeConfirmedAt: string | null
  /** The mapping version the active confirmation was confirmed under. */
  activeMappingVersion: number | null
  projection: {
    status: CompletionProjectionStatus
    /** When coverage was last written to the model. */
    appliedAt?: string
    /** The mapping version those refs carry — the re-apply comparison. */
    appliedMappingVersion?: number
    /** The concepts the last application touched. */
    conceptIds?: string[]
    /** Of those, the ones whose state it actually moved. */
    promotedConceptIds?: string[]
    /** Plain-language detail for the surface — e.g. why it is pending. */
    detail?: string
  }
  /** How many events this child+program has recorded — the bounded-growth guard. */
  eventCount: number
  lastEventAt: string
  /** The last withdrawal, kept so the surface can explain the current absence. */
  lastWithdraw?: {
    entryKey: string
    reason: CompletionWithdrawReason
    at: string
  }
  /**
   * Set when the native-progress row a confirmation cited was corrected into
   * something that does not support it. The claim is withdrawn in the SAME
   * transaction as that correction; this field is what lets the surface say
   * *why* it is gone and invite a fresh confirmation, rather than silently
   * transferring the old claim onto the corrected row.
   */
  sourceConflict?: {
    reportObservationId: string
    correctedByObservationId: string
    noticedAt: string
    detail: string
  } | null
  updatedAt: string
}

/**
 * The most events one child+program may record.
 *
 * A bound, not a guess about a family: each act is a confirm or a correction a
 * person deliberately made, so fifty of them is far past any real use and far
 * short of anything that could strain a document or a listing. Reaching it is
 * REFUSED in words (`PROGRAM_COMPLETION_TOO_MANY_EVENTS`) rather than silently
 * absorbed — a surface that keeps accepting writes it cannot keep is the failure
 * mode this bound exists to make visible.
 */
export const MAX_COMPLETION_EVENTS = 50

/**
 * The slot held back for the act that ENDS a claim.
 *
 * The bound was spent first-come-first-served, so the last slot could go to a
 * confirmation — leaving a claim standing on the learner model with no capacity
 * left to withdraw it. A bound that can trap a parent inside an assertion she
 * wants to take back is worse than no bound: the record she cannot correct is
 * the one the app keeps showing. One slot per active claim is all this needs,
 * because a withdrawal can only follow a confirmation and a confirmation cannot
 * be recorded without reserving the slot the withdrawal will use.
 */
export const COMPLETION_WITHDRAWAL_RESERVE = 1

/**
 * The count at or above which an act that CREATES or KEEPS a claim — a
 * confirmation, or a re-apply that records a mapping upgrade — is refused.
 *
 * Forty-nine: a confirmation at forty-eight writes act forty-nine and leaves
 * the fiftieth for its withdrawal. The refusal is in words and before any write,
 * so a parent is told the record is full while it is still correctable, instead
 * of discovering it when the undo refuses.
 *
 * It is a bound on NEW acts, which is what keeps it from trapping anyone the
 * other way: finishing an act already recorded — applying a `Pending`
 * confirmation's coverage at the version it was confirmed under, restoring refs
 * a stored re-apply already accounts for, or completing an outstanding
 * withdrawal — writes no event and is never refused here.
 */
export const MAX_CLAIMING_COMPLETION_EVENTS =
  MAX_COMPLETION_EVENTS - COMPLETION_WITHDRAWAL_RESERVE

/**
 * The hard ceiling a withdrawal itself may not cross — the recovery headroom.
 *
 * New writes cannot reach it: the reserve above keeps the normal chain at or
 * under {@link MAX_COMPLETION_EVENTS}. It exists for documents written BEFORE
 * the reserve existed, which could already be sitting active at fifty, and for
 * the automatic source-correction revocation, which is never refused (refusing
 * it would fail the parent's native-progress correction around it). Those states
 * get the one slot they need to be undone, and no more: still a bound, still
 * refused in words beyond it, and no history is rewritten to make room.
 */
export const COMPLETION_WITHDRAWAL_CEILING =
  MAX_COMPLETION_EVENTS + COMPLETION_WITHDRAWAL_RESERVE

/** The document id for one completion event. */
export const programCompletionEventId = (
  childId: string,
  program: ProgramCompletionProgram,
  entryKey: string,
): string => `${childId}__${program}__${entryKey}`

/** The document id for one child+program's active projection. */
export const programCompletionStateId = (
  childId: string,
  program: ProgramCompletionProgram,
): string => `${childId}__${program}`

/** The evidence ownership key: which confirmation a coverage ref belongs to. */
export const completionIdFor = (
  program: ProgramCompletionProgram,
  entryKey: string,
): string => `${program}:${entryKey}`

/**
 * "This native-progress row has been corrected" — one deterministic marker per
 * corrected row (FEAT-242).
 *
 * The problem it solves: a completion may CITE a native-progress row, and that
 * row is immutable, so a correction of it is a *new* row pointing back. Nothing
 * the citation check can read on the cited row itself says "this has since been
 * corrected", and a Firestore transaction cannot run the query that would find
 * the correction. Without a marker, a confirmation could cite a row that was
 * corrected a minute (or a month) earlier and still pass every check.
 *
 * So the marker's id is derived from the corrected row's own id — which makes it
 * readable by id inside any transaction, with no query and no truncation — and it
 * is written by the native-progress writer for EVERY correction, whether or not
 * a completion exists today. A completion written tomorrow can then see it.
 *
 * Path: `families/{familyId}/nativeProgressCorrectionMarkers/{observationId}`
 */
export interface NativeProgressCorrectionMarker {
  /** The corrected row's document id — this document's id as well. */
  id: string
  childId: string
  /** The row that corrects it (the newest one, if there have been several). */
  correctionObservationId: string
  /** That correction's own draft key, for a collision-free event identity. */
  correctionEntryKey: string
  correctedAt: string
}

/** The marker's document id: the corrected row's id, verbatim. */
export const correctionMarkerId = (observationId: string): string => observationId
