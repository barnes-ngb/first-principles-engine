/**
 * Coverage precedence + completion-evidence reading — ONE definition for both
 * projects (FEAT-242, the `functions/src/shared/` rule / ARCH-47).
 *
 * Three different writers land *coverage* evidence on a concept — a bridged
 * workbook position (`applyBridgeCoverageToModel`), a Review-Chat `covered`
 * action (`applyReviewActionToModel`), and now a confirmed whole-program
 * completion (`applyCompletionCoverage`) — and four different readers have to
 * agree on what a coverage claim is worth. Before this module each of them
 * carried its own copy of the rank table and its own `clampCovered`, so "covered
 * ≠ mastered" was stated three times and the newer question — *may a coverage
 * claim raise a concept that a parent or a diagnostic has already spoken
 * about?* — had no single answer at all.
 *
 * It lives in `functions/src/shared/` because the server reads it too: the
 * synthesis beat and the `learnerModel` prompt slice must not quote a withdrawn
 * coverage ref, or rank a concept whose basis is under review as though it were
 * settled. Editing the rule without updating a reader fails to COMPILE on
 * whichever side broke.
 *
 * ── The rules, stated once ──────────────────────────────────────────────────
 *
 * 1. **Coverage caps at `forming`.** It never reaches `solid` and never
 *    downgrades — the §13 "covered ≠ mastered" clamp, now in one place. A claim
 *    that asserts LESS than the cap (the Review Chat may propose `frontier`, or
 *    `not-yet`) is worth only what it asserted: `coverageCeiling` records that
 *    on the ref, so releasing a stronger claim from above it leaves the concept
 *    on support somebody actually gave rather than on the cap.
 * 2. **Direct evidence governs.** An active `attestation` / `eval` / `quest` ref
 *    is a direct observation *of the child*; coverage is a statement about
 *    *material*. So a coverage claim appends its evidence but does **not** move
 *    a concept that already carries direct evidence — in either direction, and
 *    whatever that evidence said. It is the calibration guard the eval writer
 *    has (`FEAT-76` attestation-freeze) extended to the writer that cannot
 *    measure anything.
 * 3. **A broad concept takes `partial` coverage.** Where a program teaches part
 *    of what a graph concept means, the claim is recorded as evidence and
 *    promotes nothing (`coverageQualifier: 'partial'`).
 * 4. **A withdrawn ref is not evidence.** `status: 'superseded'` refs are kept
 *    for the record and read by nothing that forms a judgment.
 * 5. **An unreconstructable basis reads conservatively.** When a withdrawal
 *    cannot prove what a concept's state was before a completion raised it, the
 *    stored state is left alone (history is not rewritten) and the entry is
 *    flagged `completionReviewNeeded`; every advice consumer then reads the
 *    concept through {@link effectiveConceptState}, which caps it at the working
 *    edge until a parent or a diagnostic settles it. **This is the only honest
 *    way to keep the record and stop serving an unsupported `forming`.**
 *
 * Pure, dependency-free and structurally typed on purpose: the client's
 * `ConceptStateEntry` / `EvidenceRef` and the server's `StoredConceptState` /
 * `StoredEvidenceRef` both satisfy these shapes without either project having to
 * import the other's types.
 */

/** The evidence kind a confirmed whole-program completion writes. */
export const PROGRAM_COMPLETION_COVERAGE = "programCompletionCoverage";

/**
 * The evidence kind a workbook position (`applyBridgeCoverageToModel`) and a
 * Review-Chat `covered` action (`applyReviewActionToModel`) both write.
 *
 * Named here because this module now has to ASK the question — "is this ref a
 * coverage claim about material?" — in the one place that reads what surviving
 * coverage is worth.
 */
export const CURRICULUM_POSITION_COVERAGE = "curriculumPosition";

/** An evidence ref's lifecycle. Absent is read as `active` (every pre-FEAT-242 ref). */
export const EvidenceRefStatus = {
  Active: "active",
  Superseded: "superseded",
} as const;
export type EvidenceRefStatus =
  (typeof EvidenceRefStatus)[keyof typeof EvidenceRefStatus];

/**
 * How much of a graph concept a coverage claim speaks to.
 *
 * `direct` — the program's unit and the concept are the same material.
 * `partial` — the program teaches *part* of what the concept means, so the claim
 * is evidence and nothing more (rule 3).
 */
export const CoverageQualifier = {
  Direct: "direct",
  Partial: "partial",
} as const;
export type CoverageQualifier =
  (typeof CoverageQualifier)[keyof typeof CoverageQualifier];

/** The four concept states, as both projects spell them. */
export type CoverageState = "solid" | "forming" | "frontier" | "not-yet";

/** Rank for every never-downgrade / cap comparison in this module. */
export const COVERAGE_STATE_RANK: Record<CoverageState, number> = {
  "not-yet": 0,
  frontier: 1,
  forming: 2,
  solid: 3,
};

/** The ceiling a coverage claim may reach, alone (rule 1). */
export const COVERAGE_CAP: CoverageState = "forming";

/**
 * The ceiling an entry whose completion basis is under review reads at (rule 5).
 *
 * `frontier` — "the edge we're working at" — because that is what an unverified
 * concept honestly is, and because it is the one word in the vocabulary that
 * directs attention *toward* a concept without claiming anything about it.
 */
export const COVERAGE_REVIEW_CEILING: CoverageState = "frontier";

/** The evidence kinds that are a direct observation of the child (rule 2). */
export const GOVERNING_DIRECT_KINDS: readonly string[] = [
  "attestation",
  "eval",
  "quest",
];

/** The subset of an evidence ref this module reads. */
export interface CoverageEvidenceLike {
  kind: string;
  /** Absent ⇒ active. Only `'superseded'` takes a ref out of the reckoning. */
  status?: string;
  observedAt?: string;
  /** What the ref itself asserted, where its writer stamped it. */
  readState?: string;
  /** Set by the completion writer: which confirmation owns this ref. */
  completionId?: string;
  /** Set by the completion writer: did THIS ref move the concept? */
  promoted?: boolean;
  /** Set by the completion writer: the state the concept held before it did. */
  priorState?: string;
  /**
   * The ORIGINAL completion-owned baseline, carried forward across an
   * idempotent re-apply and a mapping-version upgrade.
   *
   * `priorState` describes the write that produced *this* ref; once a
   * confirmation has promoted a concept, a later ref of the same confirmation
   * sees the already-raised state and would record `forming` as its "prior".
   * The baseline is the state before the confirmation touched the concept at
   * all, so a withdrawal after any number of re-applies still knows where to
   * return to.
   */
  baselineState?: string;
  /**
   * True when the owning confirmation currently holds the concept's promotion —
   * carried across re-applies even when the individual ref moved nothing.
   */
  ownsPromotion?: boolean;
  /** The reviewed mapping version behind this ref. */
  mappingVersion?: number;
  coverageQualifier?: string;
  /**
   * The highest state THIS coverage claim asserts it can support, before any
   * precedence rule is applied — stamped by the coverage writers whose claim can
   * be weaker than {@link COVERAGE_CAP}.
   *
   * Deliberately NOT `readState`, and deliberately not the state the concept
   * landed at. A Review-Chat `covered` action may propose `frontier` or
   * `not-yet` (its LLM does, and the parser honours it); the same claim may also
   * be withheld, so the entry's state belongs to whatever else was speaking. The
   * ceiling is the only thing that says what the CLAIM is worth, which is the
   * one question {@link survivingSupportedState} has to answer when something
   * else is released from under it.
   */
  coverageCeiling?: string;
  /**
   * True on the workbook position sync's OWN writes (`applyBridgeCoverageToModel`).
   *
   * Read here for ONE legacy question: a `curriculumPosition` ref written before
   * `coverageCeiling` existed carries no record of what it claimed, and the
   * position sync is the one producer that could never have claimed anything but
   * the cap. See {@link coverageSupportedState}.
   */
  positionSync?: boolean;
  /**
   * Why a coverage claim moved nothing, where its writer stamped one
   * ({@link CoverageWithheldReason}).
   *
   * Read by {@link survivingSupportedState} for one question: a `direct` claim
   * withheld only because the concept was ALREADY at or above the coverage cap
   * still covers the material, so releasing whatever had raised it must not drop
   * the concept below what this claim continues to support.
   */
  withheldReason?: string;
}

/** The subset of a concept-state entry this module reads. */
export interface CoverageEntryLike {
  state: CoverageState;
  evidence?: CoverageEvidenceLike[];
  /**
   * Set when a completion contribution was withdrawn and its prior basis could
   * not be reconstructed (rule 5). Deliberately **not** `needsReconcile`, which
   * means one specific other thing — an eval that disagrees with a parent's word
   * — and is resolved by one specific act. Overloading it would make the
   * Foundations tab offer "keep my word" for a question nobody was asked.
   */
  completionReviewNeeded?: boolean;
}

/** True unless the ref has been explicitly superseded (rule 4). */
export function isActiveEvidence(ref: CoverageEvidenceLike | undefined | null): boolean {
  return Boolean(ref) && ref!.status !== EvidenceRefStatus.Superseded;
}

/**
 * Only the refs that still count. Order preserved (evidence is appended).
 *
 * Generic on purpose: callers pass their OWN richer ref type (the client's
 * `EvidenceRef`, the server's `StoredEvidenceRef`) and must get that same type
 * back, so filtering cannot quietly narrow a ref to this module's structural
 * subset and strip `note` / `source` / `sourceId` from a reader.
 */
export function activeEvidence<T extends CoverageEvidenceLike>(
  refs: readonly T[] | undefined,
): T[] {
  return (refs ?? []).filter((ref) => isActiveEvidence(ref));
}

/** True for an evidence kind that is a direct observation of the child. */
export function isGoverningDirectKind(kind: string | undefined): boolean {
  return Boolean(kind) && GOVERNING_DIRECT_KINDS.includes(kind!);
}

/**
 * The most recent ACTIVE direct observation on an entry, or undefined.
 *
 * `sinceIso`, when given, restricts the answer to direct evidence observed
 * strictly AFTER that stamp — which is how a withdrawal asks "has anything
 * actually measured this child since the completion claimed it?". ISO stamps
 * compare lexicographically; a ref with no `observedAt` is treated as older than
 * any stamp, because an undated ref cannot be shown to be later.
 */
export function governingDirectEvidence<T extends CoverageEvidenceLike>(
  entry: { evidence?: T[] } | undefined,
  sinceIso?: string,
): T | undefined {
  let best: T | undefined;
  for (const ref of activeEvidence(entry?.evidence)) {
    if (!isGoverningDirectKind(ref.kind)) continue;
    if (sinceIso) {
      if (!ref.observedAt || ref.observedAt <= sinceIso) continue;
    }
    if (!best || (ref.observedAt ?? "") >= (best.observedAt ?? "")) best = ref;
  }
  return best;
}

/** Why a coverage claim did not move a concept. */
export const CoverageWithheldReason = {
  /** A broad concept taking partial coverage (rule 3). */
  PartialQualifier: "partial-qualifier",
  /** The concept already carries a direct observation of the child (rule 2). */
  GoverningDirectEvidence: "governing-direct-evidence",
  /** Already at or above whatever this claim could have set (rule 1). */
  AlreadyAtOrAbove: "already-at-or-above",
} as const;
export type CoverageWithheldReason =
  (typeof CoverageWithheldReason)[keyof typeof CoverageWithheldReason];

/** What one coverage claim does to one concept's state. */
export interface CoveragePromotion {
  /** The state to store. Never below `priorState`, never above {@link COVERAGE_CAP}. */
  state: CoverageState;
  /** True only when `state` is actually higher than `priorState`. */
  promoted: boolean;
  /** The state the concept held before this claim — the withdrawal baseline. */
  priorState: CoverageState;
  withheldReason?: CoverageWithheldReason;
}

/**
 * The ONE coverage precedence decision, applied by all three coverage writers.
 *
 * Pure, and it decides nothing about evidence: a withheld promotion still
 * records its ref. That split is the point — a program covering material is a
 * fact worth storing whether or not it is allowed to move a state.
 *
 * `proposed` is what the caller would set if nothing stopped it, clamped down to
 * {@link COVERAGE_CAP} — the Review Chat's LLM may propose `frontier` (below the
 * cap) and that proposal is honoured, while a proposal of `solid` is capped, as
 * §13 has always required.
 */
export function coveragePromotion(
  entry: CoverageEntryLike | undefined,
  qualifier: CoverageQualifier = CoverageQualifier.Direct,
  proposed: CoverageState = COVERAGE_CAP,
): CoveragePromotion {
  const priorState: CoverageState = entry?.state ?? "not-yet";
  const ceiling: CoverageState =
    COVERAGE_STATE_RANK[proposed] > COVERAGE_STATE_RANK[COVERAGE_CAP]
      ? COVERAGE_CAP
      : proposed;

  if (qualifier === CoverageQualifier.Partial) {
    return {
      state: priorState,
      promoted: false,
      priorState,
      withheldReason: CoverageWithheldReason.PartialQualifier,
    };
  }
  if (COVERAGE_STATE_RANK[priorState] >= COVERAGE_STATE_RANK[ceiling]) {
    return {
      state: priorState,
      promoted: false,
      priorState,
      withheldReason: CoverageWithheldReason.AlreadyAtOrAbove,
    };
  }
  if (governingDirectEvidence(entry)) {
    return {
      state: priorState,
      promoted: false,
      priorState,
      withheldReason: CoverageWithheldReason.GoverningDirectEvidence,
    };
  }
  return { state: ceiling, promoted: true, priorState };
}

/** True when this entry's completion basis is awaiting a parent or a diagnostic. */
export function completionReviewNeeded(
  entry: CoverageEntryLike | undefined,
): boolean {
  return Boolean(entry?.completionReviewNeeded);
}

/**
 * The state every ADVICE consumer must read — ranking, prompting, prioritising
 * (rule 5). Identical to the stored state except on an entry under completion
 * review, where it is capped at the working edge.
 *
 * Writers do NOT use this: a writer acts on what is stored, because its job is
 * to change it. Readers that form a judgment do, so a concept whose basis was
 * withdrawn can never be served, ranked or quoted as settled while the record of
 * what happened stays exactly as it was.
 */
export function effectiveConceptState(
  entry: CoverageEntryLike | undefined,
): CoverageState {
  if (!entry) return "not-yet";
  if (!entry.completionReviewNeeded) return entry.state;
  return COVERAGE_STATE_RANK[entry.state] >
    COVERAGE_STATE_RANK[COVERAGE_REVIEW_CEILING]
    ? COVERAGE_REVIEW_CEILING
    : entry.state;
}

/** The same projection over a whole `conceptStates` map. */
export function effectiveConceptStates<T extends CoverageEntryLike>(
  states: Record<string, T | undefined> | undefined,
): Record<string, CoverageState> {
  const out: Record<string, CoverageState> = {};
  for (const [id, entry] of Object.entries(states ?? {})) {
    out[id] = effectiveConceptState(entry);
  }
  return out;
}

/** True for a ref written by a confirmed program completion. */
export function isCompletionCoverageRef(
  ref: CoverageEvidenceLike | undefined,
): boolean {
  return ref?.kind === PROGRAM_COMPLETION_COVERAGE;
}

/**
 * The ACTIVE completion refs one confirmation owns on one entry.
 *
 * Ownership is the `completionId`, never the source string: two confirmations of
 * the same program are two facts, and a withdrawal of one may not touch the
 * other's refs.
 */
export function activeCompletionRefsFor<T extends CoverageEvidenceLike>(
  entry: { evidence?: T[] } | undefined,
  completionId: string,
): T[] {
  return activeEvidence(entry?.evidence).filter(
    (ref) => isCompletionCoverageRef(ref) && ref.completionId === completionId,
  );
}

/**
 * Every ref this confirmation owns on an entry, ACTIVE OR SUPERSEDED, newest
 * last — how a re-apply recovers the baseline it recorded the first time.
 */
export function completionRefsFor<T extends CoverageEvidenceLike>(
  entry: { evidence?: T[] } | undefined,
  completionId: string,
): T[] {
  return (entry?.evidence ?? []).filter(
    (ref) => isCompletionCoverageRef(ref) && ref.completionId === completionId,
  );
}

/** Rule 1 in one expression: nothing a coverage claim says may exceed the cap. */
function clampToCoverageCap(state: CoverageState): CoverageState {
  return COVERAGE_STATE_RANK[state] > COVERAGE_STATE_RANK[COVERAGE_CAP]
    ? COVERAGE_CAP
    : state;
}

/**
 * What ONE surviving coverage ref still supports on its own — `undefined` when
 * it supports nothing.
 *
 * The question is "what does this CLAIM assert?", never "where did the concept
 * end up?". A claim that was withheld still covers its material: the workbook
 * position written while a completion already held the concept at the cap is the
 * whole reason surviving coverage is read at all (it is stamped
 * `already-at-or-above`, and dropping it would discard a position that still
 * stands). Equally, a claim that asserted only `frontier` supports only
 * `frontier`, whatever the entry says today — reading every `curriculumPosition`
 * ref as cap-strength support is what left a withdrawal standing on an
 * unsupported `forming`.
 *
 * ── Refs written before `coverageCeiling` existed ───────────────────────────
 * The position sync (`applyBridgeCoverageToModel`) proposes the cap and nothing
 * else — it has no parameter for anything weaker — so its own writes
 * (`positionSync: true`) are read at the cap, which is a fact about that producer
 * and not a guess about that record. A manual `covered` ref carries no such
 * guarantee: it may have claimed `forming`, `frontier` or `not-yet` and nothing
 * on the ref says which, so it supports nothing here and the caller falls back to
 * the recorded baseline — the state the concept actually held while that very ref
 * was already on the entry. Inventing cap-strength support for it would be
 * inventing history; inventing `frontier` would be inventing a claim nobody made.
 */
export function coverageSupportedState(
  ref: CoverageEvidenceLike | undefined,
): CoverageState | undefined {
  if (!ref) return undefined;
  // `partial` was recorded as evidence precisely because it does not stand for
  // the whole concept (rule 3).
  if (ref.coverageQualifier === CoverageQualifier.Partial) return undefined;

  if (isCompletionCoverageRef(ref)) {
    // A SECOND confirmation of the same material is an independent claim, and it
    // is normally withheld for one uninteresting reason: the first confirmation
    // had already raised the concept to the cap. Reading only `ownsPromotion`
    // there dropped the concept to `not-yet` the moment the first was withdrawn,
    // discarding a claim that still stood.
    const stillClaims =
      ref.ownsPromotion === true ||
      ref.promoted === true ||
      ref.withheldReason === CoverageWithheldReason.AlreadyAtOrAbove;
    if (!stillClaims) return undefined;
    // `applyCompletionCoverage` proposes the cap for every `direct` target and
    // has no way to propose less, so an unstamped completion ref is a cap claim.
    // Its `readState` is NOT consulted: that field records where the concept
    // landed, which a governing eval can hold below what the program covered.
    return clampToCoverageCap(
      asCoverageState(ref.coverageCeiling) ?? COVERAGE_CAP,
    );
  }

  if (ref.kind !== CURRICULUM_POSITION_COVERAGE) return undefined;
  const asserted = asCoverageState(ref.coverageCeiling);
  if (asserted) return clampToCoverageCap(asserted);
  return ref.positionSync === true ? COVERAGE_CAP : undefined;
}

/**
 * The state SURVIVING evidence justifies on an entry, once a confirmation's own
 * refs are out of the reckoning — or `undefined` when nothing active justifies
 * any state.
 *
 * **Not a maximum over history.** A direct observation of the child decides
 * outright, and the LATEST one decides — so a stale `solid` attestation can
 * never outrank a later, lower, calibrated evaluation. Only when no direct ref
 * survives does coverage speak, and then at **the strength each claim actually
 * asserted**, never higher than {@link COVERAGE_CAP}: an independent workbook
 * position or another program's completion still covers the material, so
 * releasing one claim must not drop the concept below what the others continue
 * to support — and must not hold it above that either. The strongest surviving
 * claim wins; they are concurrent claims, not a history
 * ({@link coverageSupportedState} decides each one).
 */
export function survivingSupportedState<T extends CoverageEvidenceLike>(
  entry: { evidence?: T[] } | undefined,
  releasedCompletionId: string,
): CoverageState | undefined {
  const live = activeEvidence(entry?.evidence).filter(
    (ref) => !(isCompletionCoverageRef(ref) && ref.completionId === releasedCompletionId),
  );

  let latestDirect: T | undefined;
  for (const ref of live) {
    if (!isGoverningDirectKind(ref.kind)) continue;
    if (!latestDirect || (ref.observedAt ?? "") >= (latestDirect.observedAt ?? "")) {
      latestDirect = ref;
    }
  }
  if (latestDirect) {
    // A direct ref with no recorded read cannot justify a state — the caller
    // falls through to its review-needed path rather than inventing one.
    return asCoverageState(latestDirect.readState);
  }

  let supported: CoverageState | undefined;
  for (const ref of live) {
    const claim = coverageSupportedState(ref);
    if (claim === undefined) continue;
    if (
      supported === undefined ||
      COVERAGE_STATE_RANK[claim] > COVERAGE_STATE_RANK[supported]
    ) {
      supported = claim;
    }
  }
  return supported;
}

/** Narrow an arbitrary string to a concept state, or undefined. */
export function asCoverageState(
  value: string | undefined,
): CoverageState | undefined {
  return value && value in COVERAGE_STATE_RANK
    ? (value as CoverageState)
    : undefined;
}
