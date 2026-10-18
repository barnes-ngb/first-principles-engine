import { describe, it, expect } from "vitest";

import {
  PROGRAM_COMPLETION_COVERAGE,
  CURRICULUM_POSITION_COVERAGE,
  EvidenceRefStatus,
  CoverageQualifier,
  COVERAGE_STATE_RANK,
  COVERAGE_CAP,
  COVERAGE_REVIEW_CEILING,
  GOVERNING_DIRECT_KINDS,
  CoverageWithheldReason,
  isActiveEvidence,
  activeEvidence,
  isGoverningDirectKind,
  governingDirectEvidence,
  governingDirectRead,
  coveragePromotion,
  completionReviewNeeded,
  completionReviewCeiling,
  effectiveConceptState,
  completionReviewSupported,
  effectiveConceptStates,
  isCompletionCoverageRef,
  activeCompletionRefsFor,
  completionRefsFor,
  coverageSupportedState,
  survivingSupportedState,
  asCoverageState,
} from "./completionCoverage.js";

import type {
  CoverageEvidenceLike,
  CoverageEntryLike,
  CoverageState,
} from "./completionCoverage.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ref(overrides: Partial<CoverageEvidenceLike> = {}): CoverageEvidenceLike {
  return { kind: "other", ...overrides };
}

function entry(overrides: Partial<CoverageEntryLike> = {}): CoverageEntryLike {
  return { state: "not-yet", ...overrides };
}

// ── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("COVERAGE_CAP is forming", () => {
    expect(COVERAGE_CAP).toBe("forming");
  });

  it("COVERAGE_REVIEW_CEILING is frontier", () => {
    expect(COVERAGE_REVIEW_CEILING).toBe("frontier");
  });

  it("GOVERNING_DIRECT_KINDS includes attestation, eval, quest", () => {
    expect(GOVERNING_DIRECT_KINDS).toContain("attestation");
    expect(GOVERNING_DIRECT_KINDS).toContain("eval");
    expect(GOVERNING_DIRECT_KINDS).toContain("quest");
    expect(GOVERNING_DIRECT_KINDS).toHaveLength(3);
  });

  it("COVERAGE_STATE_RANK orders not-yet < frontier < forming < solid", () => {
    expect(COVERAGE_STATE_RANK["not-yet"]).toBeLessThan(COVERAGE_STATE_RANK["frontier"]);
    expect(COVERAGE_STATE_RANK["frontier"]).toBeLessThan(COVERAGE_STATE_RANK["forming"]);
    expect(COVERAGE_STATE_RANK["forming"]).toBeLessThan(COVERAGE_STATE_RANK["solid"]);
  });
});

// ── asCoverageState ──────────────────────────────────────────────────────────

describe("asCoverageState", () => {
  it("returns the state for valid values", () => {
    expect(asCoverageState("solid")).toBe("solid");
    expect(asCoverageState("forming")).toBe("forming");
    expect(asCoverageState("frontier")).toBe("frontier");
    expect(asCoverageState("not-yet")).toBe("not-yet");
  });

  it("returns undefined for invalid or missing values", () => {
    expect(asCoverageState(undefined)).toBeUndefined();
    expect(asCoverageState("")).toBeUndefined();
    expect(asCoverageState("mastered")).toBeUndefined();
    expect(asCoverageState("bogus")).toBeUndefined();
  });
});

// ── isActiveEvidence ─────────────────────────────────────────────────────────

describe("isActiveEvidence", () => {
  it("returns true for a ref with no status (pre-FEAT-242 default)", () => {
    expect(isActiveEvidence(ref())).toBe(true);
  });

  it("returns true for an explicitly active ref", () => {
    expect(isActiveEvidence(ref({ status: EvidenceRefStatus.Active }))).toBe(true);
  });

  it("returns false for a superseded ref", () => {
    expect(isActiveEvidence(ref({ status: EvidenceRefStatus.Superseded }))).toBe(false);
  });

  it("returns false for undefined or null", () => {
    expect(isActiveEvidence(undefined)).toBe(false);
    expect(isActiveEvidence(null)).toBe(false);
  });
});

// ── activeEvidence ───────────────────────────────────────────────────────────

describe("activeEvidence", () => {
  it("returns empty for undefined", () => {
    expect(activeEvidence(undefined)).toEqual([]);
  });

  it("returns empty for an empty array", () => {
    expect(activeEvidence([])).toEqual([]);
  });

  it("filters out superseded refs", () => {
    const active1 = ref({ kind: "a" });
    const superseded = ref({ kind: "b", status: EvidenceRefStatus.Superseded });
    const active2 = ref({ kind: "c", status: EvidenceRefStatus.Active });
    expect(activeEvidence([active1, superseded, active2])).toEqual([active1, active2]);
  });

  it("preserves order", () => {
    const refs = [ref({ kind: "first" }), ref({ kind: "second" })];
    const result = activeEvidence(refs);
    expect(result[0].kind).toBe("first");
    expect(result[1].kind).toBe("second");
  });
});

// ── isGoverningDirectKind ────────────────────────────────────────────────────

describe("isGoverningDirectKind", () => {
  it("returns true for the three direct kinds", () => {
    expect(isGoverningDirectKind("attestation")).toBe(true);
    expect(isGoverningDirectKind("eval")).toBe(true);
    expect(isGoverningDirectKind("quest")).toBe(true);
  });

  it("returns false for coverage kinds and others", () => {
    expect(isGoverningDirectKind(PROGRAM_COMPLETION_COVERAGE)).toBe(false);
    expect(isGoverningDirectKind(CURRICULUM_POSITION_COVERAGE)).toBe(false);
    expect(isGoverningDirectKind("workingLevel")).toBe(false);
    expect(isGoverningDirectKind("")).toBe(false);
    expect(isGoverningDirectKind(undefined)).toBe(false);
  });
});

// ── governingDirectEvidence ──────────────────────────────────────────────────

describe("governingDirectEvidence", () => {
  it("returns undefined for an entry with no evidence", () => {
    expect(governingDirectEvidence(entry())).toBeUndefined();
    expect(governingDirectEvidence(undefined)).toBeUndefined();
  });

  it("returns undefined when only coverage refs are present", () => {
    const e = entry({
      evidence: [
        ref({ kind: PROGRAM_COMPLETION_COVERAGE }),
        ref({ kind: CURRICULUM_POSITION_COVERAGE }),
      ],
    });
    expect(governingDirectEvidence(e)).toBeUndefined();
  });

  it("returns the direct ref even without readState", () => {
    const questRef = ref({ kind: "quest", observedAt: "2026-01-01" });
    expect(governingDirectEvidence({ evidence: [questRef] })).toBe(questRef);
  });

  it("returns the latest active direct ref by observedAt", () => {
    const older = ref({ kind: "eval", observedAt: "2026-01-01" });
    const newer = ref({ kind: "quest", observedAt: "2026-02-01" });
    expect(governingDirectEvidence({ evidence: [older, newer] })).toBe(newer);
  });

  it("skips superseded direct refs", () => {
    const superseded = ref({
      kind: "eval",
      observedAt: "2026-03-01",
      status: EvidenceRefStatus.Superseded,
    });
    const active = ref({ kind: "quest", observedAt: "2026-01-01" });
    expect(governingDirectEvidence({ evidence: [superseded, active] })).toBe(active);
  });

  it("respects sinceIso filter — strictly after", () => {
    const before = ref({ kind: "eval", observedAt: "2026-01-01" });
    const exact = ref({ kind: "quest", observedAt: "2026-06-01" });
    const after = ref({ kind: "attestation", observedAt: "2026-09-01" });
    const e = { evidence: [before, exact, after] };
    expect(governingDirectEvidence(e, "2026-06-01")).toBe(after);
  });

  it("excludes refs with no observedAt when sinceIso is given", () => {
    const noDate = ref({ kind: "eval" });
    expect(governingDirectEvidence({ evidence: [noDate] }, "2026-01-01")).toBeUndefined();
  });

  it("prefers later-appended ref on tie (last appended wins)", () => {
    const first = ref({ kind: "eval", observedAt: "2026-01-01" });
    const second = ref({ kind: "quest", observedAt: "2026-01-01" });
    expect(governingDirectEvidence({ evidence: [first, second] })).toBe(second);
  });
});

// ── governingDirectRead ──────────────────────────────────────────────────────

describe("governingDirectRead", () => {
  it("returns undefined for no evidence", () => {
    expect(governingDirectRead(undefined)).toBeUndefined();
    expect(governingDirectRead({ evidence: [] })).toBeUndefined();
  });

  it("skips a direct ref that has no readState (failed quest)", () => {
    const failedQuest = ref({ kind: "quest", observedAt: "2026-05-01" });
    expect(governingDirectRead({ evidence: [failedQuest] })).toBeUndefined();
  });

  it("returns a direct ref that has a valid readState", () => {
    const evalRef = ref({
      kind: "eval",
      observedAt: "2026-05-01",
      readState: "forming",
    });
    expect(governingDirectRead({ evidence: [evalRef] })).toBe(evalRef);
  });

  it("skips direct refs with invalid readState", () => {
    const bad = ref({ kind: "eval", observedAt: "2026-05-01", readState: "bogus" });
    expect(governingDirectRead({ evidence: [bad] })).toBeUndefined();
  });

  it("a failed quest after an eval leaves the eval as the governing read", () => {
    const evalRef = ref({
      kind: "eval",
      observedAt: "2026-01-01",
      readState: "solid",
    });
    const failedQuest = ref({ kind: "quest", observedAt: "2026-06-01" });
    expect(governingDirectRead({ evidence: [evalRef, failedQuest] })).toBe(evalRef);
  });

  it("a later eval with readState overrides an earlier one", () => {
    const older = ref({
      kind: "eval",
      observedAt: "2026-01-01",
      readState: "solid",
    });
    const newer = ref({
      kind: "eval",
      observedAt: "2026-06-01",
      readState: "frontier",
    });
    expect(governingDirectRead({ evidence: [older, newer] })).toBe(newer);
  });

  it("respects sinceIso", () => {
    const before = ref({
      kind: "eval",
      observedAt: "2026-01-01",
      readState: "solid",
    });
    expect(governingDirectRead({ evidence: [before] }, "2026-03-01")).toBeUndefined();
  });
});

// ── coveragePromotion ────────────────────────────────────────────────────────

describe("coveragePromotion", () => {
  it("promotes a not-yet entry to forming (the default cap)", () => {
    const result = coveragePromotion(entry({ state: "not-yet" }));
    expect(result).toEqual({
      state: "forming",
      promoted: true,
      priorState: "not-yet",
    });
  });

  it("promotes undefined entry (treats as not-yet) to forming", () => {
    const result = coveragePromotion(undefined);
    expect(result).toEqual({
      state: "forming",
      promoted: true,
      priorState: "not-yet",
    });
  });

  it("promotes a frontier entry to forming", () => {
    const result = coveragePromotion(entry({ state: "frontier" }));
    expect(result).toEqual({
      state: "forming",
      promoted: true,
      priorState: "frontier",
    });
  });

  it("withholds when entry is already at the cap (forming)", () => {
    const result = coveragePromotion(entry({ state: "forming" }));
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("forming");
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("withholds when entry is above the cap (solid)", () => {
    const result = coveragePromotion(entry({ state: "solid" }));
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("solid");
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("withholds for partial qualifier regardless of state", () => {
    const result = coveragePromotion(
      entry({ state: "not-yet" }),
      CoverageQualifier.Partial,
    );
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("not-yet");
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier);
  });

  it("withholds for partial even on undefined entry", () => {
    const result = coveragePromotion(undefined, CoverageQualifier.Partial);
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier);
  });

  it("withholds when governing direct evidence exists", () => {
    const e = entry({
      state: "not-yet",
      evidence: [ref({ kind: "quest", observedAt: "2026-01-01" })],
    });
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("not-yet");
    expect(result.withheldReason).toBe(CoverageWithheldReason.GoverningDirectEvidence);
  });

  it("does not withhold for superseded direct evidence", () => {
    const e = entry({
      state: "not-yet",
      evidence: [
        ref({
          kind: "eval",
          observedAt: "2026-01-01",
          status: EvidenceRefStatus.Superseded,
        }),
      ],
    });
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(true);
    expect(result.state).toBe("forming");
  });

  it("honours a proposed state below the cap (frontier)", () => {
    const result = coveragePromotion(entry({ state: "not-yet" }), CoverageQualifier.Direct, "frontier");
    expect(result.promoted).toBe(true);
    expect(result.state).toBe("frontier");
  });

  it("clamps a proposed state above the cap (solid → forming)", () => {
    const result = coveragePromotion(entry({ state: "not-yet" }), CoverageQualifier.Direct, "solid");
    expect(result.promoted).toBe(true);
    expect(result.state).toBe("forming");
  });

  it("withholds when frontier is proposed but entry is already frontier", () => {
    const result = coveragePromotion(entry({ state: "frontier" }), CoverageQualifier.Direct, "frontier");
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("priority order: partial checked before already-at-or-above", () => {
    const result = coveragePromotion(
      entry({ state: "solid" }),
      CoverageQualifier.Partial,
    );
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier);
  });

  it("priority order: already-at-or-above checked before governing evidence", () => {
    const e = entry({
      state: "forming",
      evidence: [ref({ kind: "eval", observedAt: "2026-01-01" })],
    });
    const result = coveragePromotion(e);
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });
});

// ── completionReviewNeeded ───────────────────────────────────────────────────

describe("completionReviewNeeded", () => {
  it("returns false for undefined", () => {
    expect(completionReviewNeeded(undefined)).toBe(false);
  });

  it("returns false when flag is absent", () => {
    expect(completionReviewNeeded(entry())).toBe(false);
  });

  it("returns false when flag is false", () => {
    expect(completionReviewNeeded(entry({ completionReviewNeeded: false }))).toBe(false);
  });

  it("returns true when flag is true", () => {
    expect(completionReviewNeeded(entry({ completionReviewNeeded: true }))).toBe(true);
  });
});

// ── isCompletionCoverageRef ──────────────────────────────────────────────────

describe("isCompletionCoverageRef", () => {
  it("returns true for programCompletionCoverage kind", () => {
    expect(isCompletionCoverageRef(ref({ kind: PROGRAM_COMPLETION_COVERAGE }))).toBe(true);
  });

  it("returns false for other kinds", () => {
    expect(isCompletionCoverageRef(ref({ kind: CURRICULUM_POSITION_COVERAGE }))).toBe(false);
    expect(isCompletionCoverageRef(ref({ kind: "eval" }))).toBe(false);
    expect(isCompletionCoverageRef(undefined)).toBe(false);
  });
});

// ── activeCompletionRefsFor ──────────────────────────────────────────────────

describe("activeCompletionRefsFor", () => {
  it("returns empty for undefined entry", () => {
    expect(activeCompletionRefsFor(undefined, "c1")).toEqual([]);
  });

  it("filters by completionId and active status", () => {
    const mine = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c1",
    });
    const other = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c2",
    });
    const superseded = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c1",
      status: EvidenceRefStatus.Superseded,
    });
    const nonCompletion = ref({ kind: "eval", completionId: "c1" });

    const result = activeCompletionRefsFor(
      { evidence: [mine, other, superseded, nonCompletion] },
      "c1",
    );
    expect(result).toEqual([mine]);
  });
});

// ── completionRefsFor ────────────────────────────────────────────────────────

describe("completionRefsFor", () => {
  it("includes superseded refs unlike activeCompletionRefsFor", () => {
    const active = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c1",
    });
    const superseded = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c1",
      status: EvidenceRefStatus.Superseded,
    });
    const other = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      completionId: "c2",
    });

    const result = completionRefsFor(
      { evidence: [active, superseded, other] },
      "c1",
    );
    expect(result).toEqual([active, superseded]);
  });

  it("returns empty for undefined entry", () => {
    expect(completionRefsFor(undefined, "c1")).toEqual([]);
  });
});

// ── coverageSupportedState ───────────────────────────────────────────────────

describe("coverageSupportedState", () => {
  it("returns undefined for undefined ref", () => {
    expect(coverageSupportedState(undefined)).toBeUndefined();
  });

  it("returns undefined for a partial-qualified ref", () => {
    expect(
      coverageSupportedState(
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, coverageQualifier: "partial" }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for non-coverage ref kinds", () => {
    expect(coverageSupportedState(ref({ kind: "eval" }))).toBeUndefined();
    expect(coverageSupportedState(ref({ kind: "quest" }))).toBeUndefined();
    expect(coverageSupportedState(ref({ kind: "attestation" }))).toBeUndefined();
    expect(coverageSupportedState(ref({ kind: "other" }))).toBeUndefined();
  });

  describe("completion refs (programCompletionCoverage)", () => {
    it("returns cap when promoted is true", () => {
      expect(
        coverageSupportedState(
          ref({ kind: PROGRAM_COMPLETION_COVERAGE, promoted: true }),
        ),
      ).toBe("forming");
    });

    it("returns cap when ownsPromotion is true", () => {
      expect(
        coverageSupportedState(
          ref({ kind: PROGRAM_COMPLETION_COVERAGE, ownsPromotion: true }),
        ),
      ).toBe("forming");
    });

    it("returns cap when withheld for already-at-or-above", () => {
      expect(
        coverageSupportedState(
          ref({
            kind: PROGRAM_COMPLETION_COVERAGE,
            withheldReason: CoverageWithheldReason.AlreadyAtOrAbove,
          }),
        ),
      ).toBe("forming");
    });

    it("returns undefined for a completion ref that did not promote or own promotion", () => {
      expect(
        coverageSupportedState(ref({ kind: PROGRAM_COMPLETION_COVERAGE })),
      ).toBeUndefined();
    });

    it("honours coverageCeiling on a completion ref", () => {
      expect(
        coverageSupportedState(
          ref({
            kind: PROGRAM_COMPLETION_COVERAGE,
            promoted: true,
            coverageCeiling: "frontier",
          }),
        ),
      ).toBe("frontier");
    });

    it("clamps coverageCeiling at the cap (solid → forming)", () => {
      expect(
        coverageSupportedState(
          ref({
            kind: PROGRAM_COMPLETION_COVERAGE,
            promoted: true,
            coverageCeiling: "solid",
          }),
        ),
      ).toBe("forming");
    });
  });

  describe("curriculum position refs", () => {
    it("returns cap for positionSync with no coverageCeiling (legacy)", () => {
      expect(
        coverageSupportedState(
          ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
        ),
      ).toBe("forming");
    });

    it("returns undefined for non-positionSync with no coverageCeiling", () => {
      expect(
        coverageSupportedState(ref({ kind: CURRICULUM_POSITION_COVERAGE })),
      ).toBeUndefined();
    });

    it("honours coverageCeiling on position ref", () => {
      expect(
        coverageSupportedState(
          ref({ kind: CURRICULUM_POSITION_COVERAGE, coverageCeiling: "frontier" }),
        ),
      ).toBe("frontier");
    });

    it("clamps coverageCeiling at the cap", () => {
      expect(
        coverageSupportedState(
          ref({ kind: CURRICULUM_POSITION_COVERAGE, coverageCeiling: "solid" }),
        ),
      ).toBe("forming");
    });

    it("coverageCeiling takes priority over positionSync", () => {
      expect(
        coverageSupportedState(
          ref({
            kind: CURRICULUM_POSITION_COVERAGE,
            positionSync: true,
            coverageCeiling: "frontier",
          }),
        ),
      ).toBe("frontier");
    });
  });
});

// ── survivingSupportedState ──────────────────────────────────────────────────

describe("survivingSupportedState", () => {
  it("returns undefined with no evidence", () => {
    expect(survivingSupportedState(undefined)).toBeUndefined();
    expect(survivingSupportedState({ evidence: [] })).toBeUndefined();
  });

  it("returns the direct read state when a direct ref read a state", () => {
    const e = {
      evidence: [
        ref({ kind: "eval", observedAt: "2026-01-01", readState: "solid" }),
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          positionSync: true,
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("solid");
  });

  it("a failed quest (no readState) does not override earlier eval read", () => {
    const e = {
      evidence: [
        ref({ kind: "eval", observedAt: "2026-01-01", readState: "forming" }),
        ref({ kind: "quest", observedAt: "2026-06-01" }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("forming");
  });

  it("falls back to coverage when no direct ref has readState", () => {
    const e = {
      evidence: [
        ref({ kind: "quest", observedAt: "2026-01-01" }),
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          positionSync: true,
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("forming");
  });

  it("returns the strongest coverage claim among multiple", () => {
    const e = {
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, coverageCeiling: "frontier" }),
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          promoted: true,
          coverageCeiling: "forming",
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("forming");
  });

  it("excludes released completionId refs", () => {
    const e = {
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          completionId: "c1",
          promoted: true,
        }),
      ],
    };
    expect(survivingSupportedState(e, "c1")).toBeUndefined();
  });

  it("keeps non-released completion refs", () => {
    const e = {
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          completionId: "c1",
          promoted: true,
        }),
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          completionId: "c2",
          promoted: true,
        }),
      ],
    };
    expect(survivingSupportedState(e, "c1")).toBe("forming");
  });

  it("skips superseded refs", () => {
    const e = {
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          promoted: true,
          status: EvidenceRefStatus.Superseded,
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBeUndefined();
  });

  it("ignores non-coverage non-direct refs", () => {
    const e = {
      evidence: [ref({ kind: "workingLevel" }), ref({ kind: "other" })],
    };
    expect(survivingSupportedState(e)).toBeUndefined();
  });
});

// ── completionReviewCeiling ──────────────────────────────────────────────────

describe("completionReviewCeiling", () => {
  it("returns frontier when nothing supports more", () => {
    expect(completionReviewCeiling(entry())).toBe("frontier");
    expect(completionReviewCeiling(undefined)).toBe("frontier");
  });

  it("returns frontier when only partial coverage exists", () => {
    const e = entry({
      evidence: [
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          coverageQualifier: "partial",
        }),
      ],
    });
    expect(completionReviewCeiling(e)).toBe("frontier");
  });

  it("returns forming when a cap-strength claim supports it", () => {
    const e = entry({
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          promoted: true,
        }),
      ],
    });
    expect(completionReviewCeiling(e)).toBe("forming");
  });

  it("returns frontier when only frontier-strength claim exists", () => {
    const e = entry({
      evidence: [
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          coverageCeiling: "frontier",
        }),
      ],
    });
    expect(completionReviewCeiling(e)).toBe("frontier");
  });

  it("a direct read above the floor raises the ceiling", () => {
    const e = entry({
      evidence: [
        ref({ kind: "eval", observedAt: "2026-01-01", readState: "solid" }),
      ],
    });
    expect(completionReviewCeiling(e)).toBe("solid");
  });
});

// ── effectiveConceptState ────────────────────────────────────────────────────

describe("effectiveConceptState", () => {
  it("returns not-yet for undefined", () => {
    expect(effectiveConceptState(undefined)).toBe("not-yet");
  });

  it("returns stored state when completionReviewNeeded is false", () => {
    expect(effectiveConceptState(entry({ state: "solid" }))).toBe("solid");
    expect(effectiveConceptState(entry({ state: "forming" }))).toBe("forming");
  });

  it("caps to review ceiling when completionReviewNeeded and nothing supports", () => {
    expect(
      effectiveConceptState(entry({ state: "forming", completionReviewNeeded: true })),
    ).toBe("frontier");
  });

  it("returns stored state when completionReviewNeeded but live claim supports", () => {
    const e = entry({
      state: "forming",
      completionReviewNeeded: true,
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          promoted: true,
        }),
      ],
    });
    expect(effectiveConceptState(e)).toBe("forming");
  });

  it("if stored state is below or equal to ceiling, returns stored state", () => {
    expect(
      effectiveConceptState(entry({ state: "frontier", completionReviewNeeded: true })),
    ).toBe("frontier");
    expect(
      effectiveConceptState(entry({ state: "not-yet", completionReviewNeeded: true })),
    ).toBe("not-yet");
  });
});

// ── completionReviewSupported ────────────────────────────────────────────────

describe("completionReviewSupported", () => {
  it("returns false when completionReviewNeeded is false", () => {
    expect(completionReviewSupported(entry({ state: "forming" }))).toBe(false);
  });

  it("returns false when under review but nothing supports", () => {
    expect(
      completionReviewSupported(entry({ state: "forming", completionReviewNeeded: true })),
    ).toBe(false);
  });

  it("returns true when under review and a claim supports ≥ stored state", () => {
    const e = entry({
      state: "forming",
      completionReviewNeeded: true,
      evidence: [
        ref({
          kind: PROGRAM_COMPLETION_COVERAGE,
          promoted: true,
        }),
      ],
    });
    expect(completionReviewSupported(e)).toBe(true);
  });

  it("returns false when support is below stored state", () => {
    const e = entry({
      state: "forming",
      completionReviewNeeded: true,
      evidence: [
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          coverageCeiling: "frontier",
        }),
      ],
    });
    expect(completionReviewSupported(e)).toBe(false);
  });

  it("returns false for undefined entry", () => {
    expect(completionReviewSupported(undefined)).toBe(false);
  });
});

// ── effectiveConceptStates ───────────────────────────────────────────────────

describe("effectiveConceptStates", () => {
  it("maps each concept through effectiveConceptState", () => {
    const states: Record<string, CoverageEntryLike> = {
      c1: entry({ state: "forming", completionReviewNeeded: true }),
      c2: entry({ state: "solid" }),
      c3: entry({ state: "frontier" }),
    };
    const result = effectiveConceptStates(states);
    expect(result.c1).toBe("frontier");
    expect(result.c2).toBe("solid");
    expect(result.c3).toBe("frontier");
  });

  it("returns empty for undefined", () => {
    expect(effectiveConceptStates(undefined)).toEqual({});
  });
});

// ── Integration: rule 5 end-to-end ──────────────────────────────────────────

describe("rule 5 end-to-end: withdrawal leaves entry capped until resolved", () => {
  it("forming entry under review with no support → reads as frontier", () => {
    const e = entry({ state: "forming", completionReviewNeeded: true });
    expect(effectiveConceptState(e)).toBe("frontier");
  });

  it("forming entry under review + independent position sync → reads as forming", () => {
    const e = entry({
      state: "forming",
      completionReviewNeeded: true,
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    });
    expect(effectiveConceptState(e)).toBe("forming");
    expect(completionReviewSupported(e)).toBe(true);
  });

  it("superseding the supporting claim drops back to frontier", () => {
    const e = entry({
      state: "forming",
      completionReviewNeeded: true,
      evidence: [
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          positionSync: true,
          status: EvidenceRefStatus.Superseded,
        }),
      ],
    });
    expect(effectiveConceptState(e)).toBe("frontier");
    expect(completionReviewSupported(e)).toBe(false);
  });

  it("a direct eval with readState can raise the ceiling above forming", () => {
    const e = entry({
      state: "solid",
      completionReviewNeeded: true,
      evidence: [
        ref({ kind: "eval", observedAt: "2026-09-01", readState: "solid" }),
      ],
    });
    expect(effectiveConceptState(e)).toBe("solid");
    expect(completionReviewSupported(e)).toBe(true);
  });
});
