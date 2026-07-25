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

/** The last ref of a kind on an entry (evidence is appended, so last = most recent). */
export function latestEvidenceOfKind(
  entry: ConceptStateEntry | undefined,
  kind: EvidenceRef['kind'],
): EvidenceRef | undefined {
  const refs = entry?.evidence ?? []
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    if (refs[i].kind === kind) return refs[i]
  }
  return undefined
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
  const attestation = latestEvidenceOfKind(entry, 'attestation')
  const evalRef = latestEvidenceOfKind(entry, 'eval')

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
