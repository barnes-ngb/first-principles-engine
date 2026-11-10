/**
 * Pure view logic for the Foundations tab's parent concept override (FEAT-66) —
 * the parent-authority half of the loop FEAT-76 closed the evidence half of.
 *
 * Two things live here, both pure so they are unit-testable without a drawer:
 *   1. **The override choices** — the three states a parent may attest, labelled
 *      with the *same* `STATE_PHRASE` words the confirm card previews with.
 *   2. **The reconcile read** (§B) — when a guided eval disagreed with a parent
 *      attestation, `applyEvalFindingsToModel` keeps the parent's state, appends
 *      the `eval` evidence and flags `needsReconcile`. This turns that flagged
 *      entry into the two reads a parent needs to see before deciding, and into
 *      the two `attest` actions that resolve it.
 *
 * Nothing here writes. Every resolution is an ordinary `attest` action, staged
 * for the same confirm card and persisted by the same single writer
 * (`writeReviewAction`) the Review Chat uses.
 *
 * §14 rails: plain four-state vocabulary only — no band numbers, no percentages,
 * no scores; no "regressed" / "dropped" / "failed" anywhere. A disagreement is
 * described as "a new take", never as the parent having been wrong.
 */
import { isActiveEvidence } from '../../core/foundations'
import { STATE_PHRASE } from '../foundations-review/statePhrase'
import type {
  FoundationsReviewAction,
  ReviewProposedState,
} from '../foundations-review/foundationsReviewActions'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
} from '../../core/types/learnerModel'
import { scrubDisplayJargon } from './foundationsView'

/**
 * The one line that names a standing eval-vs-parent disagreement. Neutral by
 * construction: the model has a *new take*, the parent is never "wrong", and
 * nothing about the concept has "regressed" — the attested state is still in force
 * until the parent themselves changes it.
 */
export const RECONCILE_NOTICE =
  'The model has a new take on this — view & reconcile.'

/** The short form of {@link RECONCILE_NOTICE} for the terrain chip's marker. */
export const RECONCILE_CHIP_TITLE = 'The model has a new take on this'

/**
 * The line for a concept whose withdrawn completion left no earlier reading to
 * return to (FEAT-242, `completionReviewNeeded`).
 *
 * Nobody disagreed with anybody here, so it is deliberately not worded like
 * {@link RECONCILE_NOTICE} and offers no "keep my word" choice: what happened is
 * that the support for a reading was withdrawn, the reading was left alone
 * rather than guessed at, and it is being treated cautiously until something
 * direct — a parent's word below, or an evaluation — settles it.
 */
export const COMPLETION_REVIEW_NOTICE =
  'A finished-program record this rested on was withdrawn, and there was no earlier reading to go back to. Nothing was changed here, and it is treated cautiously in plans and advice until you record what you have seen or an evaluation covers it.'

/**
 * The same concept once something CURRENT stands behind the reading again — a
 * newly confirmed finished program, or a workbook position (FEAT-242,
 * `completionReviewSupported`).
 *
 * The flag is still set, because a covered program is a statement about
 * material and only a parent's word or an evaluation settles the basis. But the
 * reading is no longer being held down, so this must not repeat
 * {@link COMPLETION_REVIEW_NOTICE}'s "treated cautiously in plans and advice":
 * that would describe a cap that is not being applied. Every clause here is true
 * whenever that predicate holds — something supports it, advice uses it as it
 * stands, and the withdrawn basis is still unsettled.
 */
export const COMPLETION_REVIEW_SUPPORTED_NOTICE =
  'A finished-program record this rested on was withdrawn, and there was no earlier reading to go back to. Something current supports this reading again, so plans and advice use it as it stands — and the withdrawn basis stays unsettled until you record what you have seen or an evaluation covers it.'

/** The three states a parent may attest, in strongest-first order (§ReviewProposedState). */
export const PARENT_STATE_CHOICES: readonly ReviewProposedState[] = [
  'solid',
  'forming',
  'frontier',
]

/**
 * The label for one override choice — `{name} has this solid`, built from the
 * shared `STATE_PHRASE` so a choice reads exactly like the line the parent will
 * confirm. `not-yet` is deliberately unreachable: attesting *downward to nothing*
 * is not a thing the vocabulary supports (that is "we haven't seen it", which is
 * an absence of evidence, not a parent's word).
 */
export function stateChoiceLabel(state: ReviewProposedState, childName: string): string {
  return `${childName || 'This child'} ${STATE_PHRASE[state]}`
}

/**
 * The last **active** ref of a kind (evidence is appended, so last = most
 * recent). A withdrawn ref is history — it still renders in the evidence trail,
 * and it is never a read a parent is asked to decide about.
 */
export function latestActiveEvidenceOfKind(
  entry: ConceptStateEntry | undefined,
  kind: EvidenceRef['kind'],
): EvidenceRef | undefined {
  const refs = entry?.evidence ?? []
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    if (refs[i].kind === kind && isActiveEvidence(refs[i])) return refs[i]
  }
  return undefined
}

/**
 * The two reads every route in this drawer is about. ONE definition, used by
 * the view the parent sees and by the basis that validates what they chose, so
 * the display and the check can never read different refs.
 */
export function decisionRefs(entry: ConceptStateEntry | undefined): {
  attestation: EvidenceRef | undefined
  eval: EvidenceRef | undefined
} {
  return {
    attestation: latestActiveEvidenceOfKind(entry, 'attestation'),
    eval: latestActiveEvidenceOfKind(entry, 'eval'),
  }
}

/**
 * The parent-choosable form of a state, or null. Guards the "take the model's
 * read" button: a `not-yet` read is not something a parent can attest to, so the
 * button simply isn't offered rather than the state being silently translated
 * into something the eval never said. (In practice unreachable — the eval's
 * finding-status bridge never yields concept-`not-yet` — so this is a rail, not
 * a code path with a UI cost.)
 */
export function proposableState(state: ConceptStateKind): ReviewProposedState | null {
  return state === 'not-yet' ? null : state
}

/** One side of the reconcile view: a heading line plus optional supporting detail. */
export interface ReconcileRead {
  line: string
  detail?: string
}

export interface ReconcileView {
  /** What the parent recorded — the standing, still-in-force state. */
  yours: ReconcileRead
  /**
   * The state the parent **actually attested**, read off the attestation ref
   * (`readState`) rather than off `entry.state` — a derived writer (a quest
   * upgrade, a coverage claim) can move the entry while a disagreement stands, and
   * "keep my word" must re-attest the parent's word, not that later drift. Falls
   * back to `entry.state` for pre-FEAT-66 refs.
   */
  yourState: ConceptStateKind
  /** What the evaluation saw. */
  theirs: ReconcileRead
  /**
   * The eval's read, when it was stamped on the ref (FEAT-66) and a parent could
   * attest to it. Undefined for pre-FEAT-66 refs — then only "keep my word" is
   * offered, and the plain three-state override covers the rest.
   */
  evalState?: ReviewProposedState
}

const dateSuffix = (iso: string | undefined): string =>
  iso ? ` · ${iso.slice(0, 10)}` : ''

/**
 * Build the two-reads view for a concept flagged `needsReconcile`, or null when
 * there is nothing to reconcile. Neutral framing throughout: both reads are
 * presented as reads, and the parent's is presented first because it is the one
 * currently in force.
 */
export function buildReconcileView(
  entry: ConceptStateEntry | undefined,
  childName: string,
): ReconcileView | null {
  if (!entry?.needsReconcile) return null
  const name = childName || 'This child'
  const { attestation, eval: evalRef } = decisionRefs(entry)

  // The parent's own word, not wherever the entry has since drifted to.
  const yourState: ConceptStateKind = attestation?.readState ?? entry.state
  const yours: ReconcileRead = {
    line: `You recorded: ${name} ${STATE_PHRASE[yourState] ?? 'can do this'}${dateSuffix(attestation?.observedAt)}`,
    ...(attestation?.note ? { detail: scrubDisplayJargon(attestation.note) } : {}),
  }

  const evalState = evalRef?.readState ? proposableState(evalRef.readState) : null
  const theirs: ReconcileRead = {
    line: evalState
      ? `The evaluation saw: ${name} ${STATE_PHRASE[evalState]}${dateSuffix(evalRef?.observedAt)}`
      : `The evaluation saw something different${dateSuffix(evalRef?.observedAt)}`,
    ...(evalRef?.note ? { detail: scrubDisplayJargon(evalRef.note) } : {}),
  }

  return { yours, yourState, theirs, ...(evalState ? { evalState } : {}) }
}

// ── The scoped decision contract (the drawer's one basis definition) ──────
//
// A staged intent is only meaningful against the evidence the parent was LOOKING
// AT when they chose, so the child, the exact concept and a fingerprint of that
// evidence travel together from the tap to the commit.
//
// It reads `decisionRefs` — the same active refs the reconcile view above
// displays. `writeReviewAction` imports it to make the same check against the
// STORED document inside its transaction; that is the only cross-feature use,
// and it is one-way (nothing here imports the writer).

/**
 * The evidence one drawer decision rests on, as it stood when it was made.
 *
 * Deliberately narrow: the standing-disagreement flag, the parent's own latest
 * word, the evaluation's latest read, and the entry's state — which the legacy
 * "keep my word" choice falls back to when an attestation predates `readState`.
 * An unrelated concept moving, or a synthesis re-run, leaves it untouched.
 */
export interface ConceptDecisionBasis {
  /** Whether an eval-vs-parent disagreement was standing on the entry. */
  needsReconcile: boolean
  /** The state the entry held — what a legacy keep-my-word re-attests. */
  state: ConceptStateKind | null
  /** The parent's latest active word (provenance + status + content), or null. */
  attestation: string | null
  /** The evaluation's latest active read (provenance + status + content), or null. */
  eval: string | null
}

/**
 * One ref flattened to the fields a decision rests on: where it came from,
 * whether it still stands, what it asserted, and what it says. A replacement
 * eval that happens to assert the SAME state is a different ref and reads as
 * one; a withdrawn ref drops out of {@link decisionRefs} entirely.
 */
function basisPrint(ref: EvidenceRef | undefined): string | null {
  if (!ref) return null
  return JSON.stringify([
    ref.kind,
    ref.sourceId ?? '',
    ref.observedAt ?? '',
    ref.status ?? 'active',
    ref.readState ?? '',
    ref.note ?? '',
  ])
}

/** The basis for one concept entry. The only way this fingerprint is computed. */
export function conceptDecisionBasis(
  entry: ConceptStateEntry | undefined,
): ConceptDecisionBasis {
  const refs = decisionRefs(entry)
  return {
    needsReconcile: Boolean(entry?.needsReconcile),
    state: entry?.state ?? null,
    attestation: basisPrint(refs.attestation),
    eval: basisPrint(refs.eval),
  }
}

/** True when a staged decision still describes the evidence in front of it. */
export function sameConceptDecisionBasis(
  a: ConceptDecisionBasis,
  b: ConceptDecisionBasis,
): boolean {
  return (
    a.needsReconcile === b.needsReconcile &&
    a.state === b.state &&
    a.attestation === b.attestation &&
    a.eval === b.eval
  )
}

/** Which way out of the drawer the parent chose. */
export type DecisionRoute = 'override' | 'reconcileKeep' | 'reconcileTake'

/**
 * One staged intent, bound to its scope. Built when the parent picks, carried to
 * Confirm unchanged, and checked against the live model (in the drawer) and the
 * stored model (in the transaction) before anything is written.
 */
export interface StagedDecision {
  /** The drawer opening this belongs to — feedback never crosses lifetimes. */
  lifetimeId: number
  /** The child captured at open, never the live active one. */
  childId: string
  /** The exact concept id captured at open. */
  conceptId: string
  route: DecisionRoute
  state: ReviewProposedState
  /** The evidence this decision describes. */
  basis: ConceptDecisionBasis
}

/** Why a write was refused against the stored model. Diagnostic, never shown. */
export type ReviewActionRefusal =
  | 'model-missing'
  | 'child-mismatch'
  | 'concept-missing'
  | 'concept-mismatch'
  | 'basis-stale'

/**
 * A refusal raised INSIDE the transaction, before any merge is computed, when
 * the stored model is not the one the parent decided against. Distinguished from
 * an ordinary write error because retrying the same tap cannot help: the parent
 * is asked to look again instead.
 */
export class ReviewActionBasisError extends Error {
  reason: ReviewActionRefusal

  constructor(reason: ReviewActionRefusal) {
    super(`review action refused: ${reason}`)
    this.name = 'ReviewActionBasisError'
    this.reason = reason
  }
}

/** Shown when the drawer's scope went away under it. No evidence, no note. */
export const SCOPE_LOST_NOTICE =
  'That closed because the child or the map changed. Open it again to see where things stand.'

/** Shown when the thing a staged choice described moved before it was written. */
export const DECISION_STALE_NOTICE =
  'This has moved on since you chose — have another look and choose again.'

/** Shown when a save that had already started could not be recorded. */
export const SAVE_RETRY_LINE = 'Could not save that — try again.'

/** The note recorded when a parent reads the new take and stands by what they saw. */
export const KEEP_MY_WORD_NOTE =
  'You looked at the new take from the evaluation and stood by what you have seen.'

/** The note recorded when a parent reads the new take and chooses it. */
export const TAKE_MODEL_READ_NOTE =
  'You looked at the new take from the evaluation and chose to go with it.'

/**
 * Build the `attest` action for one confirmed override. Every path in the tab —
 * plain override, keep-my-word, take-the-model's-read — produces this same
 * action, so there is one write semantic: the parent gave their word.
 */
export function buildOverrideAction(args: {
  childId: string
  conceptId: string
  state: ReviewProposedState
  note?: string
  origin: 'foundationsTab' | 'reconcileKeep' | 'reconcileTake'
}): FoundationsReviewAction {
  const note = args.note?.trim()
  return {
    kind: 'attest',
    childId: args.childId,
    conceptId: args.conceptId,
    state: args.state,
    origin: args.origin,
    ...(note ? { note } : {}),
  }
}

/**
 * The action for a staged decision — one write semantic for all three routes,
 * through the same {@link buildOverrideAction} above. The child and the concept
 * come from the decision's captured scope, never from whatever is active now,
 * and the note is read at build time so editing it after choosing still reaches
 * the durable evidence.
 */
export function stagedDecisionAction(
  decision: StagedDecision,
  note: string,
): FoundationsReviewAction {
  return buildOverrideAction({
    childId: decision.childId,
    conceptId: decision.conceptId,
    state: decision.state,
    note:
      decision.route === 'override'
        ? note
        : decision.route === 'reconcileKeep'
          ? KEEP_MY_WORD_NOTE
          : TAKE_MODEL_READ_NOTE,
    origin: decision.route === 'override' ? 'foundationsTab' : decision.route,
  })
}
