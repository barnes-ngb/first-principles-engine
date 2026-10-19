// ── Confirmed program completion → learner-model coverage (FEAT-242) ──────
//
// The PURE projector: one confirmed completion in, one folded model out. No
// Firestore, no clock of its own (the caller passes both stamps), no AI, and no
// graph traversal — the concepts it touches are exactly the reviewed mapping's
// targets, never their prerequisites or their descendants.
//
// It is the third coverage writer, and it obeys the SAME precedence as the other
// two (`coveragePromotion`, shared module): capped at `forming`, never
// downgrading, withheld entirely where a concept already carries a direct
// observation of the child, and evidence-only on the three broad concepts.
//
// ── What it deliberately does NOT do ───────────────────────────────────────
//
//   • no `openQuestion` / quest is queued, for any concept. The workbook sync
//     queues one verify-ask per covered concept; doing that here would turn one
//     confirmation into a dozen compulsory checks, which is the "no mandatory
//     quest queue" rail.
//   • no `attestation` is created. The parent confirmed a PROGRAM is finished,
//     which is not her word that the child can do each concept.
//   • no `needsReconcile` is ever WRITTEN or cleared. A completion has no
//     opinion about an eval-vs-parent disagreement: it cannot create one, it
//     cannot settle one, and a parent who owes an answer still owes it
//     afterwards. A RELEASE does read the flag, for the one question a release
//     has to ask — "which direct read of this child may I recompute from?" —
//     because an eval the freeze held back is a read nobody accepted (rule 6 of
//     the shared module, finding 4305276208).
//   • nothing is deleted. A withdrawal supersedes this confirmation's own refs
//     and leaves every other ref, and every other field, exactly as it was.
//
// ── The withdrawal baseline (the whole reason refs carry provenance) ────────
//
// A retraction has to answer "what was this concept before the completion raised
// it?" — and the only safe answer is the one recorded at the time. Taking the
// highest state any historical ref ever asserted would let a stale `solid` beat
// a later, calibrated, lower eval read, so this module never does that. The
// order of precedence on withdrawal is:
//
//   1. a direct observation made AFTER the completion's own observation that
//      READ a state, and that the writers ACCEPTED, controls outright — the
//      state stays where that evidence put it. A later look that established
//      nothing (a failed quest) is not that observation and does not displace
//      the last one that was; neither is an eval the parent-attestation freeze
//      held back while the parent has yet to answer it, because no writer has
//      acted on that read and a release may not be the first to;
//   2. otherwise the higher of (a) what any surviving independent coverage claim
//      actually asserted — `coverageCeiling`, not the cap by assumption — and
//      (b) the recorded `priorState` is restored (clamped so it can only ever
//      lower, never raise);
//   3. otherwise — no provenance, which only a pre-FEAT-242 or hand-edited ref
//      can be — the state is KEPT and the entry is flagged
//      `completionReviewNeeded`, which makes every advice consumer read it
//      conservatively until a parent or a diagnostic settles it. That read is
//      `effectiveConceptState`, whose ceiling is DERIVED from the live refs
//      (`completionReviewCeiling`), so a confirmation applied later to the same
//      concept is read at the strength it claimed without this module storing
//      anything new — and its own withdrawal restores the uncertainty, because
//      superseding its refs is what removes the support.

// The flat node lookup is imported from the SHARED graph module rather than from
// the `./index` barrel (which re-exports this file) — the same cycle-avoidance
// `workbookBridge.ts` documents for its own node map.
import { FOUNDATION_NODE_MAP } from '../../../functions/src/shared/foundations/graph'
import {
  ATTESTATION_EVIDENCE,
  COVERAGE_STATE_RANK,
  CoverageQualifier,
  EvidenceRefStatus,
  PROGRAM_COMPLETION_COVERAGE,
  acceptedDirectRead,
  activeCompletionRefsFor,
  asCoverageState,
  completionRefsFor,
  coveragePromotion,
  pendingAttestationFreeze,
  survivingSupportedState,
} from '../../../functions/src/shared/foundations/completionCoverage'
import type { CompletionCoverageTarget } from './fastPhonicsCompletion'
import { EvidenceKind } from '../types/learnerModel'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
} from '../types/learnerModel'

/** Everything one application of a completion mapping needs. */
export interface CompletionCoverageWrite {
  /** `{program}:{entryKey}` — the ownership key stamped on every ref. */
  completionId: string
  /** The canonical source id (the bridge's own), e.g. `fastPhonics`. */
  program: string
  /** Parent-facing program name for the evidence note. */
  programLabel: string
  /** The reviewed mapping version these refs carry. */
  mappingVersion: number
  /**
   * The day the parent OBSERVED the program was finished, as an ISO stamp.
   *
   * **Not the save clock.** A completion typed in three weeks late is still a
   * claim about the day it was observed, and stamping it "now" would make it
   * sort after an evaluation that genuinely came later — which is exactly how a
   * backdated confirmation would come to outrank a fresh diagnostic.
   */
  observedAtIso: string
  /** The mapping's applicability disclosure. Never a score. */
  detail: string
  targets: readonly CompletionCoverageTarget[]
}

export interface AppliedCompletionCoverage {
  model: LearnerModel
  /** Every concept this application touched — claimed or released. */
  conceptIds: string[]
  /** The concepts whose promotion this confirmation holds after the write. */
  promotedConceptIds: string[]
  /** Concepts a reviewed revision stopped claiming (dropped or downgraded). */
  releasedConceptIds: string[]
}

export interface WithdrawnCompletionCoverage {
  model: LearnerModel
  /** Concepts whose refs were superseded. */
  conceptIds: string[]
  /** Concepts whose state was returned to its recorded prior basis. */
  revertedConceptIds: string[]
  /** Concepts kept as-is and flagged for completion review (no provenance). */
  reviewNeededConceptIds: string[]
  /** Concepts left alone because later direct evidence controls them. */
  directlyGovernedConceptIds: string[]
  /** Concepts still held up by surviving INDEPENDENT coverage. */
  supportedConceptIds: string[]
}

/**
 * Release one confirmation's hold on ONE concept: supersede its refs and
 * recompute the state from what survives.
 *
 * The single definition used by a withdrawal, by a mapping revision that drops a
 * target, and by a revision that downgrades one to `partial` — three paths that
 * must not disagree. Precedence, in order:
 *
 *   1. a direct observation of the child made AFTER this confirmation's own
 *      observation controls outright, whatever it READ and however often this is
 *      replayed — but it has to have read something: a failed or short quest
 *      observed later measured nothing, and a release cannot follow an
 *      observation that established no state. It also has to be a read the
 *      writers ACCEPTED: an eval frozen against a parent's attestation and
 *      still awaiting their answer (`needsReconcile`) is not one, so the
 *      parent's standing word decides and this release leaves the state and the
 *      open question alone (rule 6, finding 4305276208). Once the parent
 *      answers, their new word IS the latest read and ordinary precedence
 *      resumes — including when they went with the model's read;
 *   2. otherwise, whatever SURVIVING evidence justifies — the latest direct
 *      read, or, when an independent coverage claim (a workbook position,
 *      another program's completion) still stands, the state THAT CLAIM
 *      asserted. Never the cap by default, and never a maximum over history;
 *   3. the recorded completion-owned baseline is the other floor: the higher of
 *      it and (2) is restored, clamped so a release can only ever lower a state.
 *      A claim weaker than the baseline cannot erase what the concept already
 *      stood on, and a baseline cannot cancel a claim that outlives it;
 *   4. and where none of those can justify the stored state — a legacy ref with
 *      no provenance — the state is KEPT and the entry flagged
 *      `completionReviewNeeded`, which every advice consumer reads
 *      conservatively.
 *
 * An ALREADY flagged entry keeps its flag through (2) and (3): only a direct
 * observation of the child answers the question the flag asks, and a release
 * that recomputes a state from a claim or a baseline has not measured anybody.
 * The read loses nothing by it, because `effectiveConceptState` takes its
 * ceiling from what is live rather than from the flag alone.
 *
 * It keeps it through (1) in the one place where the read that decided is not a
 * fresh look at the child: a pending reconciliation whose accepted read is the
 * parent's standing word, the very word the frozen eval disputes.
 * `completionReviewNeeded` and `needsReconcile` therefore CAN stand together on
 * one entry — an imported or legacy record may carry both, and this release will
 * not resolve either by acting on the other. A freeze alone is not that case
 * though: where the accepted read is a later QUEST, a fresh look did establish a
 * basis and the flag clears while `needsReconcile` stands untouched. Everywhere
 * else (1) clears the flag exactly as it always has.
 */
function releaseCompletionOnConcept(
  prev: ConceptStateEntry,
  completionId: string,
  nowIso: string,
  reason: string,
): {
  entry: ConceptStateEntry
  outcome: 'evidence-only' | 'governed' | 'supported' | 'reverted' | 'review-needed'
  from: ConceptStateKind
  to: ConceptStateKind
} {
  const owned = activeCompletionRefsFor(prev, completionId)
  const evidence = (prev.evidence ?? []).map((e) =>
    e.kind === PROGRAM_COMPLETION_COVERAGE &&
    e.completionId === completionId &&
    e.status !== EvidenceRefStatus.Superseded
      ? {
          ...e,
          status: EvidenceRefStatus.Superseded,
          supersededAt: nowIso,
          supersededReason: reason,
        }
      : e,
  )
  const released: ConceptStateEntry = { ...prev, evidence }
  const from: ConceptStateKind = prev.state

  // Did this confirmation hold the promotion at all? `ownsPromotion` is carried
  // across re-applies, so a ref that moved nothing itself still answers yes.
  const holder = owned.find((e) => e.ownsPromotion || e.promoted)
  if (!holder) {
    return { entry: released, outcome: 'evidence-only', from, to: from }
  }

  // The latest direct observation since this confirmation that actually READ a
  // state. A failed quest observed later still measured nothing, so it neither
  // governs the release nor cancels the eval that read the concept in between —
  // asking for the latest direct ref and taking its missing `readState` as "no
  // later direct evidence" is what dropped a measured concept back to a
  // completion baseline (finding 4304869773). Where nothing since the
  // confirmation has read a state, this is undefined and the release falls
  // through to surviving support and the recorded baseline exactly as before,
  // which is why a failed quest alone cannot keep a completion-only promotion.
  //
  // `acceptedDirectRead`, not `governingDirectRead` (rule 6, finding
  // 4305276208): where the entry carries an eval the FEAT-76 attestation freeze
  // held back — the parent's `solid` standing, the eval's lower read appended
  // beside it, `needsReconcile` open and unanswered — that ref is the one read
  // no writer has acted on. Recomputing the state from it here would apply the
  // very eval the freeze refused and lower a parent's word through the back
  // door, on a release whose own reason is that a PROGRAM was not finished. The
  // parent's word answers instead, which on this path means the state does not
  // move, and `needsReconcile` is left exactly as it is, because the
  // disagreement is still standing and is still theirs to settle.
  const frozenAttestation = pendingAttestationFreeze(released)
  const governing = acceptedDirectRead(released, holder.observedAt)
  // WHICH accepted read is deciding, when a freeze is standing? The helper can
  // answer with either the parent's own word or a later qualifying quest, and the
  // two differ for `completionReviewNeeded` only: the parent's word is the basis
  // the flag is open about, while a quest IS the fresh look the flag was waiting
  // for (finding 4310061221). Identity first — the frozen attestation itself —
  // then the kind, for the orderings where the freeze's pick and the accepted
  // read's pick are two different attestation refs (an unread later word, or two
  // sharing a stamp): both are a parent's word, neither is a look at the child.
  const governedByFrozenParent =
    frozenAttestation != null &&
    (governing === frozenAttestation || governing?.kind === ATTESTATION_EVIDENCE)
  const directState = asCoverageState(governing?.readState)
  if (directState) {
    const to = COVERAGE_STATE_RANK[directState] < COVERAGE_STATE_RANK[from] ? directState : from
    return {
      entry: {
        ...released,
        state: to,
        // `completionReviewNeeded` is cleared only where a read SETTLED the
        // concept, which is the ordinary case: a direct observation of the child
        // made since the confirmation is exactly the thing the flag was waiting
        // for. Where the deciding read is the frozen parent's word instead it is
        // not that — on a legacy or imported entry that word may be the very
        // state the flag is open about — so both flags stand together and this
        // release preserves BOTH, answering "which read may I recompute from?"
        // without claiming anybody's basis has been established. Advice
        // consumers go on reading the concept conservatively through
        // `effectiveConceptState` until a parent or a diagnostic settles it.
        // `needsReconcile` is not touched either way: clearing the fresh-look
        // uncertainty does not settle the parent's open question.
        ...(prev.completionReviewNeeded && !governedByFrozenParent
          ? { completionReviewNeeded: false }
          : {}),
      },
      outcome: 'governed', from, to,
    }
  }
  if (frozenAttestation) {
    // The parent's word is in force and postdates nothing we can read: a
    // pre-FEAT-66 attestation ref stamped no `readState` (and only a hand-edited
    // or very old record can be in this shape, since `readState` predates
    // completion coverage entirely). What we DO know is that a parent spoke
    // about this concept and is being asked to speak again, so the state is KEPT
    // rather than recomputed from a baseline their word has already stood over.
    // Falling through here is the defect in its quietest form, and through a
    // third door: `survivingSupportedState` asks the live refs what they justify
    // and would find the frozen eval's read waiting there, so the concept would
    // land on the very read no writer accepted — this time reported as
    // `supported`. Naming the case stops it at the step that understands it.
    //
    // `completionReviewNeeded` is untouched here for the same reason the branch
    // above leaves it standing when the frozen word is what decided, and with
    // one more: this branch kept the stored state on the strength of a word it
    // cannot even read, so there is nothing here that could have settled
    // anything.
    return { entry: released, outcome: 'governed', from, to: from }
  }

  const supported = survivingSupportedState(released, completionId)
  const baseline = asCoverageState(holder.baselineState ?? holder.priorState)
  // Surviving support and the recorded baseline are both FLOORS, and the higher
  // one is the answer. Neither can raise anything — the clamp below only ever
  // lowers — but a surviving claim that asserted only `frontier` must not cancel
  // the state the concept already stood at before this confirmation, and a
  // baseline of `not-yet` must not cancel a claim that outlives it. Taking
  // `supported` alone would have let the weaker of two recorded facts decide.
  //
  // The claim is only said to be holding the concept up when it is STRICTLY
  // stronger than the baseline: where the two agree, the baseline alone gives
  // the same answer, and the parent's line should say the concept went back to
  // what it was rather than that something else is carrying it.
  const claimDecides =
    supported !== undefined &&
    (baseline === undefined ||
      COVERAGE_STATE_RANK[supported] > COVERAGE_STATE_RANK[baseline])
  const candidate = claimDecides ? supported : baseline
  if (!candidate) {
    return {
      entry: { ...released, completionReviewNeeded: true },
      outcome: 'review-needed',
      from,
      to: from,
    }
  }

  // Clamped: releasing a claim can lower a state or leave it, never raise it.
  const to: ConceptStateKind =
    COVERAGE_STATE_RANK[candidate] < COVERAGE_STATE_RANK[from] ? candidate : from
  return {
    entry: {
      ...released,
      state: to,
      // `completionReviewNeeded` is NOT cleared here, and the spread above keeps
      // whatever it was. Only the branch above clears it, because only a direct
      // observation of the child settles the question the flag asks — the same
      // rule `evalModelSync`, `questTargeting` and an `attest` action already
      // follow. A surviving coverage claim and a recorded baseline are enough to
      // RECOMPUTE a state; neither tells us what the unreconstructable basis
      // was, and where this release reverts a flagged entry to the baseline it
      // raised the concept FROM, that baseline is the very state the flag is
      // open about. Clearing it there dropped the uncertainty silently — and
      // keeping it costs the read nothing, because `effectiveConceptState`
      // derives its ceiling from what is live (`completionReviewCeiling`) and a
      // state returned to its own baseline is at or under that ceiling already.
    },
    outcome: claimDecides ? 'supported' : 'reverted',
    from,
    to,
  }
}

/** The evidence note for one covered concept. Plain words, no score, no level. */
function coverageNote(
  write: CompletionCoverageWrite,
  target: CompletionCoverageTarget,
): string {
  const kidName = FOUNDATION_NODE_MAP[target.conceptId]?.kidName ?? target.conceptId
  const reach =
    target.qualifier === CoverageQualifier.Partial
      ? 'covered in part'
      : 'covered'
  return `${write.programLabel} finished — "${kidName}" ${reach} by ${target.attributedPeakLabel}`
}

/**
 * Fold one confirmed completion's reviewed coverage into a stored model.
 *
 * Idempotent on `(completionId, mappingVersion)`: re-applying the same
 * confirmation at the same mapping version replaces this confirmation's own ref
 * on each concept rather than appending a second one, so a retry cannot inflate
 * the evidence trail. Applying a NEWER mapping version supersedes the older refs
 * (kept, marked) and appends the new ones, so a reviewed re-curation is visible
 * in the record rather than overwriting it.
 *
 * One confirmation is ONE source across every concept it touches — all its refs
 * share a `completionId` and a `sourceId` — so nothing downstream can read a
 * twelve-concept mapping as twelve agreeing sources.
 */
export function applyCompletionCoverage(
  model: LearnerModel,
  write: CompletionCoverageWrite,
  nowIso: string,
): AppliedCompletionCoverage {
  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...model.changeFeed]
  const conceptIds: string[] = []
  const promotedConceptIds: string[] = []
  const releasedConceptIds: string[] = []

  const targetById = new Map(write.targets.map((t) => [t.conceptId, t]))

  // ── Step 1: the UNION. A revision that drops a target, or downgrades one to
  // `partial`, must release that concept — walking only the new targets would
  // leave a v1 claim active and its completion-only promotion standing forever.
  for (const [conceptId, prev] of Object.entries(model.conceptStates ?? {})) {
    const owned = activeCompletionRefsFor(prev, write.completionId)
    if (owned.length === 0) continue
    const target = targetById.get(conceptId)
    const downgraded =
      target != null &&
      target.qualifier === CoverageQualifier.Partial &&
      owned.some((e) => e.ownsPromotion || e.promoted)
    if (target && !downgraded) continue

    const released = releaseCompletionOnConcept(
      prev,
      write.completionId,
      nowIso,
      target
        ? `reviewed coverage map v${write.mappingVersion}: now partial`
        : `reviewed coverage map v${write.mappingVersion}: no longer claimed`,
    )
    conceptStates[conceptId] = released.entry
    releasedConceptIds.push(conceptId)
    if (!conceptIds.includes(conceptId)) conceptIds.push(conceptId)
    if (released.to !== released.from) {
      changeFeed.push({
        conceptId,
        from: released.from,
        to: released.to,
        cause: `completion: the reviewed coverage map no longer claims "${
          FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
        }" the same way`,
        at: nowIso,
      })
    }
  }

  // ── Step 2: the targets this mapping version claims.
  for (const target of write.targets) {
    // Never write a node the graph does not define.
    if (!FOUNDATION_NODE_MAP[target.conceptId]) continue

    const prev: ConceptStateEntry | undefined = conceptStates[target.conceptId]

    // Has this confirmation already promoted this concept? Then the promotion is
    // STILL ITS OWN, and the baseline it recorded the first time is carried
    // forward: the stored state is already `forming`, so recomputing from it
    // would record "prior: forming" and lose the ownership a later withdrawal
    // needs to undo.
    const history = completionRefsFor(prev, write.completionId)
    const ownerRef = [...history].reverse().find((e) => e.ownsPromotion || e.promoted)
    const carriedBaseline =
      target.qualifier === CoverageQualifier.Direct && ownerRef
        ? asCoverageState(ownerRef.baselineState ?? ownerRef.priorState)
        : undefined

    const promotion = coveragePromotion(prev, target.qualifier)
    const ownsPromotion = carriedBaseline != null || promotion.promoted
    const baselineState = carriedBaseline ?? promotion.priorState
    const state: ConceptStateKind = promotion.state

    const ref: EvidenceRef = {
      kind: EvidenceKind.ProgramCompletionCoverage,
      sourceId: write.completionId,
      note: coverageNote(write, target),
      observedAt: write.observedAtIso,
      recordedAt: nowIso,
      source: write.program,
      unit: target.attributedPeakLabel,
      detail: write.detail,
      status: EvidenceRefStatus.Active,
      completionId: write.completionId,
      mappingVersion: write.mappingVersion,
      coverageQualifier: target.qualifier,
      promoted: promotion.promoted,
      ownsPromotion,
      priorState: promotion.priorState,
      baselineState,
      ...(promotion.withheldReason ? { withheldReason: promotion.withheldReason } : {}),
      // What this ref itself asserted — stamped only when the confirmation holds
      // the promotion, so a withheld or partial claim never reads as a state
      // anybody took.
      ...(ownsPromotion ? { readState: state } : {}),
    }

    // This confirmation's own refs only. Same version ⇒ replaced (idempotent
    // retry); older version ⇒ superseded and kept (a visible re-curation).
    // Every other ref — another confirmation's, a witness's, a parent's — is
    // untouched.
    const priorEvidence = (prev?.evidence ?? []).flatMap((e) => {
      if (e.kind !== PROGRAM_COMPLETION_COVERAGE) return [e]
      if (e.completionId !== write.completionId) return [e]
      if (e.mappingVersion === write.mappingVersion) return [] // replaced
      if (e.status === EvidenceRefStatus.Superseded) return [e]
      return [
        {
          ...e,
          status: EvidenceRefStatus.Superseded,
          supersededAt: nowIso,
          supersededReason: `replaced by mapping version ${write.mappingVersion}`,
        },
      ]
    })

    conceptStates[target.conceptId] = {
      // Spread first: `needsReconcile` and every other standing field survive.
      ...(prev ?? {}),
      state,
      evidence: [...priorEvidence, ref],
      seededAt: prev?.seededAt ?? nowIso,
    }

    if (!conceptIds.includes(target.conceptId)) conceptIds.push(target.conceptId)
    if (ownsPromotion) promotedConceptIds.push(target.conceptId)
    if (promotion.promoted) {
      changeFeed.push({
        conceptId: target.conceptId,
        from: promotion.priorState,
        to: state,
        cause: `completion: you confirmed ${write.programLabel} is finished — covered by ${target.attributedPeakLabel} (capped at ${state})`,
        at: nowIso,
      })
    }
  }

  return {
    model: { ...model, conceptStates, changeFeed, updatedAt: nowIso },
    conceptIds,
    promotedConceptIds,
    releasedConceptIds,
  }
}

/**
 * Withdraw one confirmation's contribution.
 *
 * Supersedes exactly the refs this `completionId` owns and recomputes only the
 * concepts it had promoted, by the three-step precedence in the module header.
 * Every unrelated ref, every other confirmation's refs, `needsReconcile`, and
 * every other field are left byte-identical.
 */
export function withdrawCompletionCoverage(
  model: LearnerModel,
  completionId: string,
  nowIso: string,
  reason: string,
): WithdrawnCompletionCoverage {
  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...model.changeFeed]
  const conceptIds: string[] = []
  const revertedConceptIds: string[] = []
  const reviewNeededConceptIds: string[] = []
  const directlyGovernedConceptIds: string[] = []
  const supportedConceptIds: string[] = []

  for (const [conceptId, prev] of Object.entries(model.conceptStates ?? {})) {
    if (activeCompletionRefsFor(prev, completionId).length === 0) continue

    const released = releaseCompletionOnConcept(prev, completionId, nowIso, reason)
    conceptStates[conceptId] = released.entry
    conceptIds.push(conceptId)

    const kidName = FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
    if (released.outcome === 'governed') {
      directlyGovernedConceptIds.push(conceptId)
    }
    if (released.outcome === 'review-needed') {
      reviewNeededConceptIds.push(conceptId)
      changeFeed.push({
        conceptId,
        from: released.from,
        to: released.to,
        cause: `completion withdrawn — "${kidName}" needs a fresh look before we count it`,
        at: nowIso,
      })
      continue
    }
    if (released.outcome === 'supported') supportedConceptIds.push(conceptId)
    if (released.outcome === 'reverted') revertedConceptIds.push(conceptId)
    if (released.to !== released.from) {
      changeFeed.push({
        conceptId,
        from: released.from,
        to: released.to,
        cause:
          released.outcome === 'governed'
            ? `completion withdrawn — "${kidName}" follows the later direct observation`
            : released.outcome === 'supported'
            ? `completion withdrawn — "${kidName}" still rests on what else we have`
            : `completion withdrawn — "${kidName}" is back to what it was before that confirmation`,
        at: nowIso,
      })
    }
  }

  return {
    model: { ...model, conceptStates, changeFeed, updatedAt: nowIso },
    conceptIds,
    revertedConceptIds,
    reviewNeededConceptIds,
    directlyGovernedConceptIds,
    supportedConceptIds,
  }
}

/**
 * True when the model already carries this confirmation's coverage at this
 * mapping version — the dedup an apply-retry checks before writing anything.
 */
export function completionCoverageIsApplied(
  model: LearnerModel,
  completionId: string,
  mappingVersion: number,
  expectedConceptIds: readonly string[],
): boolean {
  if (expectedConceptIds.length === 0) return false
  return expectedConceptIds.every((conceptId) =>
    activeCompletionRefsFor(model.conceptStates?.[conceptId], completionId).some(
      (ref) => ref.mappingVersion === mappingVersion,
    ),
  )
}

/** True when any concept still carries an ACTIVE ref owned by this confirmation. */
export function completionCoverageHasActiveRefs(
  model: LearnerModel,
  completionId: string,
): boolean {
  for (const entry of Object.values(model.conceptStates ?? {})) {
    if (activeCompletionRefsFor(entry, completionId).length > 0) return true
  }
  return false
}
