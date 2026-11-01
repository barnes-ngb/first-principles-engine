import { describe, it, expect } from "vitest";

import {
  isActiveEvidence,
  activeEvidence,
  isGoverningDirectKind,
  governingDirectEvidence,
  governingDirectRead,
  pendingAttestationFreeze,
  acceptedDirectRead,
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
  PROGRAM_COMPLETION_COVERAGE,
  CURRICULUM_POSITION_COVERAGE,
  ATTESTATION_EVIDENCE,
  EVAL_EVIDENCE,
  EvidenceRefStatus,
  CoverageQualifier,
  CoverageWithheldReason,
  COVERAGE_CAP,
  COVERAGE_REVIEW_CEILING,
  COVERAGE_STATE_RANK,
  type CoverageEvidenceLike,
  type CoverageEntryLike,
} from "./completionCoverage.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function ref(
  kind: string,
  overrides: Partial<CoverageEvidenceLike> = {},
): CoverageEvidenceLike {
  return { kind, ...overrides };
}

function entry(
  state: CoverageEntryLike["state"],
  evidence: CoverageEvidenceLike[] = [],
  flags: Partial<Pick<CoverageEntryLike, "completionReviewNeeded" | "needsReconcile">> = {},
): CoverageEntryLike {
  return { state, evidence, ...flags };
}

// ── asCoverageState ──────────────────────────────────────────────────────────

describe("asCoverageState", () => {
  it("returns valid states unchanged", () => {
    expect(asCoverageState("solid")).toBe("solid");
    expect(asCoverageState("forming")).toBe("forming");
    expect(asCoverageState("frontier")).toBe("frontier");
    expect(asCoverageState("not-yet")).toBe("not-yet");
  });

  it("returns undefined for invalid strings", () => {
    expect(asCoverageState("unknown")).toBeUndefined();
    expect(asCoverageState("mastered")).toBeUndefined();
    expect(asCoverageState("")).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(asCoverageState(undefined)).toBeUndefined();
  });
});

// ── isActiveEvidence ─────────────────────────────────────────────────────────

describe("isActiveEvidence", () => {
  it("returns false for null and undefined", () => {
    expect(isActiveEvidence(null)).toBe(false);
    expect(isActiveEvidence(undefined)).toBe(false);
  });

  it("returns true for a ref with no status (default active)", () => {
    expect(isActiveEvidence(ref("quest"))).toBe(true);
  });

  it("returns true for an explicitly active ref", () => {
    expect(isActiveEvidence(ref("quest", { status: "active" }))).toBe(true);
  });

  it("returns false for a superseded ref", () => {
    expect(isActiveEvidence(ref("quest", { status: "superseded" }))).toBe(false);
  });

  it("returns true for a ref with an unrecognised status", () => {
    expect(isActiveEvidence(ref("quest", { status: "pending" }))).toBe(true);
  });
});

// ── activeEvidence ───────────────────────────────────────────────────────────

describe("activeEvidence", () => {
  it("returns empty array for undefined", () => {
    expect(activeEvidence(undefined)).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(activeEvidence([])).toEqual([]);
  });

  it("filters out superseded refs", () => {
    const refs = [
      ref("quest", { observedAt: "2026-01-01" }),
      ref("eval", { status: "superseded", observedAt: "2026-01-02" }),
      ref("attestation", { observedAt: "2026-01-03" }),
    ];
    const result = activeEvidence(refs);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("quest");
    expect(result[1].kind).toBe("attestation");
  });

  it("preserves order", () => {
    const refs = [
      ref("attestation", { observedAt: "2026-01-03" }),
      ref("quest", { observedAt: "2026-01-01" }),
    ];
    const result = activeEvidence(refs);
    expect(result[0].kind).toBe("attestation");
    expect(result[1].kind).toBe("quest");
  });
});

// ── isGoverningDirectKind ────────────────────────────────────────────────────

describe("isGoverningDirectKind", () => {
  it("recognises attestation, eval, quest as direct", () => {
    expect(isGoverningDirectKind("attestation")).toBe(true);
    expect(isGoverningDirectKind("eval")).toBe(true);
    expect(isGoverningDirectKind("quest")).toBe(true);
  });

  it("does not treat coverage kinds as direct", () => {
    expect(isGoverningDirectKind(PROGRAM_COMPLETION_COVERAGE)).toBe(false);
    expect(isGoverningDirectKind(CURRICULUM_POSITION_COVERAGE)).toBe(false);
  });

  it("returns false for undefined and empty", () => {
    expect(isGoverningDirectKind(undefined)).toBe(false);
    expect(isGoverningDirectKind("")).toBe(false);
  });
});

// ── governingDirectEvidence ──────────────────────────────────────────────────

describe("governingDirectEvidence", () => {
  it("returns undefined for undefined entry", () => {
    expect(governingDirectEvidence(undefined)).toBeUndefined();
  });

  it("returns undefined for entry with no evidence", () => {
    expect(governingDirectEvidence({ evidence: [] })).toBeUndefined();
  });

  it("returns undefined when only coverage refs exist", () => {
    const e = {
      evidence: [ref(CURRICULUM_POSITION_COVERAGE, { observedAt: "2026-01-01" })],
    };
    expect(governingDirectEvidence(e)).toBeUndefined();
  });

  it("picks the latest active direct ref", () => {
    const e = {
      evidence: [
        ref("quest", { observedAt: "2026-01-01" }),
        ref("eval", { observedAt: "2026-01-05" }),
        ref("attestation", { observedAt: "2026-01-03" }),
      ],
    };
    expect(governingDirectEvidence(e)!.kind).toBe("eval");
  });

  it("ignores superseded refs", () => {
    const e = {
      evidence: [
        ref("quest", { observedAt: "2026-01-01" }),
        ref("eval", { status: "superseded", observedAt: "2026-01-05" }),
      ],
    };
    expect(governingDirectEvidence(e)!.kind).toBe("quest");
  });

  it("a failed quest (no readState) still counts as governing evidence", () => {
    const e = { evidence: [ref("quest", { observedAt: "2026-01-01" })] };
    expect(governingDirectEvidence(e)).toBeDefined();
  });

  it("respects sinceIso — excludes refs at or before the stamp", () => {
    const e = {
      evidence: [
        ref("quest", { observedAt: "2026-01-01" }),
        ref("eval", { observedAt: "2026-01-05" }),
      ],
    };
    expect(governingDirectEvidence(e, "2026-01-05")).toBeUndefined();
    expect(governingDirectEvidence(e, "2026-01-04")!.kind).toBe("eval");
    expect(governingDirectEvidence(e, "2026-01-01")!.kind).toBe("eval");
  });

  it("sinceIso excludes refs with no observedAt", () => {
    const e = { evidence: [ref("quest")] };
    expect(governingDirectEvidence(e, "2025-01-01")).toBeUndefined();
  });

  it("on ties, later-appended ref wins", () => {
    const e = {
      evidence: [
        ref("quest", { observedAt: "2026-01-01" }),
        ref("eval", { observedAt: "2026-01-01" }),
      ],
    };
    expect(governingDirectEvidence(e)!.kind).toBe("eval");
  });
});

// ── governingDirectRead ──────────────────────────────────────────────────────

describe("governingDirectRead", () => {
  it("returns undefined for undefined entry", () => {
    expect(governingDirectRead(undefined)).toBeUndefined();
  });

  it("requires readState — a failed quest (no readState) is NOT a read", () => {
    const e = { evidence: [ref("quest", { observedAt: "2026-01-05" })] };
    expect(governingDirectRead(e)).toBeUndefined();
  });

  it("returns the ref with a valid readState", () => {
    const e = {
      evidence: [ref("eval", { observedAt: "2026-01-01", readState: "forming" })],
    };
    expect(governingDirectRead(e)!.readState).toBe("forming");
  });

  it("latest ref with readState wins even if a more recent one lacks it", () => {
    const e = {
      evidence: [
        ref("eval", { observedAt: "2026-01-01", readState: "solid" }),
        ref("quest", { observedAt: "2026-01-05" }),
      ],
    };
    const result = governingDirectRead(e)!;
    expect(result.kind).toBe("eval");
    expect(result.readState).toBe("solid");
  });

  it("a later lower read governs over an earlier higher one", () => {
    const e = {
      evidence: [
        ref("attestation", { observedAt: "2026-01-01", readState: "solid" }),
        ref("eval", { observedAt: "2026-01-05", readState: "frontier" }),
      ],
    };
    expect(governingDirectRead(e)!.readState).toBe("frontier");
  });

  it("respects sinceIso", () => {
    const e = {
      evidence: [
        ref("eval", { observedAt: "2026-01-01", readState: "forming" }),
        ref("attestation", { observedAt: "2026-01-05", readState: "solid" }),
      ],
    };
    expect(governingDirectRead(e, "2026-01-05")).toBeUndefined();
    expect(governingDirectRead(e, "2026-01-02")!.readState).toBe("solid");
  });

  it("rejects readState that is not a valid CoverageState", () => {
    const e = {
      evidence: [ref("eval", { observedAt: "2026-01-01", readState: "unknown" })],
    };
    expect(governingDirectRead(e)).toBeUndefined();
  });
});

// ── pendingAttestationFreeze ─────────────────────────────────────────────────

describe("pendingAttestationFreeze", () => {
  it("returns undefined when needsReconcile is false", () => {
    const e = entry("forming", [ref("attestation", { observedAt: "2026-01-01" })]);
    expect(pendingAttestationFreeze(e)).toBeUndefined();
  });

  it("returns undefined for undefined entry", () => {
    expect(pendingAttestationFreeze(undefined)).toBeUndefined();
  });

  it("returns the attestation when needsReconcile and active attestation", () => {
    const att = ref("attestation", { observedAt: "2026-01-01", readState: "solid" });
    const e = entry("forming", [att], { needsReconcile: true });
    expect(pendingAttestationFreeze(e)).toBe(att);
  });

  it("returns undefined when needsReconcile but attestation is superseded", () => {
    const e = entry(
      "forming",
      [ref("attestation", { status: "superseded", observedAt: "2026-01-01" })],
      { needsReconcile: true },
    );
    expect(pendingAttestationFreeze(e)).toBeUndefined();
  });

  it("ignores eval and quest refs — only attestation", () => {
    const e = entry(
      "forming",
      [ref("eval", { observedAt: "2026-01-01", readState: "frontier" })],
      { needsReconcile: true },
    );
    expect(pendingAttestationFreeze(e)).toBeUndefined();
  });
});

// ── acceptedDirectRead ───────────────────────────────────────────────────────

describe("acceptedDirectRead", () => {
  it("delegates to governingDirectRead when no attestation freeze", () => {
    const e = {
      evidence: [ref("eval", { observedAt: "2026-01-01", readState: "forming" })],
    };
    expect(acceptedDirectRead(e)!.readState).toBe("forming");
  });

  it("excludes eval refs when attestation freeze is active", () => {
    const att = ref("attestation", {
      observedAt: "2026-01-01",
      readState: "solid",
    });
    const evalRef = ref("eval", {
      observedAt: "2026-01-05",
      readState: "frontier",
    });
    const e = {
      evidence: [att, evalRef],
      needsReconcile: true,
    };
    const result = acceptedDirectRead(e)!;
    expect(result.kind).toBe("attestation");
    expect(result.readState).toBe("solid");
  });

  it("a quest read still speaks during attestation freeze", () => {
    const att = ref("attestation", {
      observedAt: "2026-01-01",
      readState: "solid",
    });
    const questRef = ref("quest", {
      observedAt: "2026-01-10",
      readState: "frontier",
    });
    const e = {
      evidence: [att, questRef],
      needsReconcile: true,
    };
    expect(acceptedDirectRead(e)!.readState).toBe("frontier");
  });

  it("returns undefined when freeze is active but no ref has readState", () => {
    const att = ref("attestation", { observedAt: "2026-01-01" });
    const e = {
      evidence: [att, ref("eval", { observedAt: "2026-01-05" })],
      needsReconcile: true,
    };
    expect(acceptedDirectRead(e)).toBeUndefined();
  });

  it("respects sinceIso", () => {
    const e = {
      evidence: [ref("eval", { observedAt: "2026-01-01", readState: "forming" })],
    };
    expect(acceptedDirectRead(e, "2026-01-01")).toBeUndefined();
  });
});

// ── coveragePromotion ────────────────────────────────────────────────────────

describe("coveragePromotion", () => {
  it("promotes an empty (not-yet) entry to the cap", () => {
    const result = coveragePromotion(undefined);
    expect(result).toEqual({
      state: "forming",
      promoted: true,
      priorState: "not-yet",
    });
  });

  it("promotes a frontier entry to forming", () => {
    const e = entry("frontier");
    const result = coveragePromotion(e);
    expect(result).toEqual({
      state: "forming",
      promoted: true,
      priorState: "frontier",
    });
  });

  it("clamps a proposed solid down to the cap (forming)", () => {
    const e = entry("not-yet");
    const result = coveragePromotion(e, CoverageQualifier.Direct, "solid");
    expect(result.state).toBe("forming");
    expect(result.promoted).toBe(true);
  });

  it("honours a proposed frontier (below the cap)", () => {
    const e = entry("not-yet");
    const result = coveragePromotion(e, CoverageQualifier.Direct, "frontier");
    expect(result).toEqual({
      state: "frontier",
      promoted: true,
      priorState: "not-yet",
    });
  });

  it("withholds on partial qualifier — state unchanged", () => {
    const e = entry("frontier");
    const result = coveragePromotion(e, CoverageQualifier.Partial);
    expect(result).toEqual({
      state: "frontier",
      promoted: false,
      priorState: "frontier",
      withheldReason: CoverageWithheldReason.PartialQualifier,
    });
  });

  it("withholds when already at the cap (forming)", () => {
    const e = entry("forming");
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("withholds when above the cap (solid)", () => {
    const e = entry("solid");
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("solid");
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("withholds when entry already at a lower proposed ceiling", () => {
    const e = entry("frontier");
    const result = coveragePromotion(e, CoverageQualifier.Direct, "frontier");
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("withholds when governing direct evidence exists", () => {
    const e = entry("not-yet", [ref("quest", { observedAt: "2026-01-01" })]);
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(
      CoverageWithheldReason.GoverningDirectEvidence,
    );
  });

  it("partial takes precedence over direct evidence", () => {
    const e = entry("not-yet", [ref("quest", { observedAt: "2026-01-01" })]);
    const result = coveragePromotion(e, CoverageQualifier.Partial);
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier);
  });

  it("already-at-or-above takes precedence over direct evidence", () => {
    const e = entry("forming", [ref("quest", { observedAt: "2026-01-01" })]);
    const result = coveragePromotion(e);
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove);
  });

  it("superseded direct evidence does NOT block promotion", () => {
    const e = entry("not-yet", [
      ref("quest", { status: "superseded", observedAt: "2026-01-01" }),
    ]);
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(true);
  });
});

// ── completionReviewNeeded ───────────────────────────────────────────────────

describe("completionReviewNeeded", () => {
  it("returns false for undefined entry", () => {
    expect(completionReviewNeeded(undefined)).toBe(false);
  });

  it("returns false when flag is not set", () => {
    expect(completionReviewNeeded(entry("forming"))).toBe(false);
  });

  it("returns true when flag is set", () => {
    expect(
      completionReviewNeeded(entry("forming", [], { completionReviewNeeded: true })),
    ).toBe(true);
  });
});

// ── coverageSupportedState ───────────────────────────────────────────────────

describe("coverageSupportedState", () => {
  it("returns undefined for undefined ref", () => {
    expect(coverageSupportedState(undefined)).toBeUndefined();
  });

  it("returns undefined for partial coverage qualifier", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {
      coverageQualifier: "partial",
      ownsPromotion: true,
    });
    expect(coverageSupportedState(r)).toBeUndefined();
  });

  it("returns undefined for a non-coverage kind", () => {
    const r = ref("quest", { readState: "solid" });
    expect(coverageSupportedState(r)).toBeUndefined();
  });

  // completion refs
  it("completion ref with ownsPromotion → cap", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, { ownsPromotion: true });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("completion ref with promoted → cap", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, { promoted: true });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("completion ref withheld as already-at-or-above → cap", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {
      withheldReason: CoverageWithheldReason.AlreadyAtOrAbove,
    });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("completion ref with coverageCeiling below cap → that ceiling", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {
      ownsPromotion: true,
      coverageCeiling: "frontier",
    });
    expect(coverageSupportedState(r)).toBe("frontier");
  });

  it("completion ref with coverageCeiling above cap → clamped to cap", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {
      ownsPromotion: true,
      coverageCeiling: "solid",
    });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("completion ref with none of the claim markers → undefined", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {});
    expect(coverageSupportedState(r)).toBeUndefined();
  });

  it("completion ref with withheldReason governing-direct-evidence → undefined", () => {
    const r = ref(PROGRAM_COMPLETION_COVERAGE, {
      withheldReason: CoverageWithheldReason.GoverningDirectEvidence,
    });
    expect(coverageSupportedState(r)).toBeUndefined();
  });

  // curriculum position refs
  it("curriculumPosition with coverageCeiling → uses it", () => {
    const r = ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "forming" });
    expect(coverageSupportedState(r)).toBe("forming");
  });

  it("curriculumPosition with coverageCeiling frontier → frontier", () => {
    const r = ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "frontier" });
    expect(coverageSupportedState(r)).toBe("frontier");
  });

  it("curriculumPosition with coverageCeiling solid → clamped to cap", () => {
    const r = ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "solid" });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("curriculumPosition with positionSync but no ceiling → cap", () => {
    const r = ref(CURRICULUM_POSITION_COVERAGE, { positionSync: true });
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP);
  });

  it("curriculumPosition without positionSync or ceiling → undefined (legacy manual)", () => {
    const r = ref(CURRICULUM_POSITION_COVERAGE, {});
    expect(coverageSupportedState(r)).toBeUndefined();
  });
});

// ── isCompletionCoverageRef ──────────────────────────────────────────────────

describe("isCompletionCoverageRef", () => {
  it("true for programCompletionCoverage kind", () => {
    expect(isCompletionCoverageRef(ref(PROGRAM_COMPLETION_COVERAGE))).toBe(true);
  });

  it("false for other kinds", () => {
    expect(isCompletionCoverageRef(ref(CURRICULUM_POSITION_COVERAGE))).toBe(false);
    expect(isCompletionCoverageRef(ref("quest"))).toBe(false);
  });

  it("false for undefined", () => {
    expect(isCompletionCoverageRef(undefined)).toBe(false);
  });
});

// ── activeCompletionRefsFor ──────────────────────────────────────────────────

describe("activeCompletionRefsFor", () => {
  it("returns empty for undefined entry", () => {
    expect(activeCompletionRefsFor(undefined, "c1")).toEqual([]);
  });

  it("filters by completionId and kind", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c1" }),
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c2" }),
        ref(CURRICULUM_POSITION_COVERAGE, { completionId: "c1" }),
      ],
    };
    const result = activeCompletionRefsFor(e, "c1");
    expect(result).toHaveLength(1);
    expect(result[0].completionId).toBe("c1");
  });

  it("excludes superseded refs", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          status: "superseded",
        }),
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c1" }),
      ],
    };
    expect(activeCompletionRefsFor(e, "c1")).toHaveLength(1);
  });
});

// ── completionRefsFor ────────────────────────────────────────────────────────

describe("completionRefsFor", () => {
  it("includes superseded refs", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          status: "superseded",
        }),
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c1" }),
      ],
    };
    expect(completionRefsFor(e, "c1")).toHaveLength(2);
  });

  it("returns empty for undefined entry", () => {
    expect(completionRefsFor(undefined, "c1")).toEqual([]);
  });

  it("does not include refs from other completions", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c1" }),
        ref(PROGRAM_COMPLETION_COVERAGE, { completionId: "c2" }),
      ],
    };
    expect(completionRefsFor(e, "c1")).toHaveLength(1);
  });
});

// ── survivingSupportedState ──────────────────────────────────────────────────

describe("survivingSupportedState", () => {
  it("returns undefined for undefined entry", () => {
    expect(survivingSupportedState(undefined)).toBeUndefined();
  });

  it("returns undefined when no evidence", () => {
    expect(survivingSupportedState({ evidence: [] })).toBeUndefined();
  });

  it("direct read wins over coverage", () => {
    const e = {
      evidence: [
        ref("eval", { observedAt: "2026-01-05", readState: "frontier" }),
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("frontier");
  });

  it("a failed quest (no readState) does not hide coverage", () => {
    const e = {
      evidence: [
        ref("quest", { observedAt: "2026-01-05" }),
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("forming");
  });

  it("strongest coverage claim wins", () => {
    const e = {
      evidence: [
        ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "frontier" }),
        ref(PROGRAM_COMPLETION_COVERAGE, {
          ownsPromotion: true,
          coverageCeiling: "forming",
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBe("forming");
  });

  it("releasedCompletionId excludes that completion's refs", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          ownsPromotion: true,
        }),
        ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "frontier" }),
      ],
    };
    expect(survivingSupportedState(e, "c1")).toBe("frontier");
  });

  it("released completion leaves nothing if no other coverage", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          ownsPromotion: true,
        }),
      ],
    };
    expect(survivingSupportedState(e, "c1")).toBeUndefined();
  });

  it("second confirmation survives when first is released", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          ownsPromotion: true,
        }),
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c2",
          withheldReason: CoverageWithheldReason.AlreadyAtOrAbove,
        }),
      ],
    };
    expect(survivingSupportedState(e, "c1")).toBe(COVERAGE_CAP);
  });

  it("ignores superseded refs", () => {
    const e = {
      evidence: [
        ref(PROGRAM_COMPLETION_COVERAGE, {
          completionId: "c1",
          ownsPromotion: true,
          status: "superseded",
        }),
      ],
    };
    expect(survivingSupportedState(e)).toBeUndefined();
  });
});

// ── completionReviewCeiling ──────────────────────────────────────────────────

describe("completionReviewCeiling", () => {
  it("returns COVERAGE_REVIEW_CEILING when nothing supports", () => {
    const e = entry("forming", [], { completionReviewNeeded: true });
    expect(completionReviewCeiling(e)).toBe(COVERAGE_REVIEW_CEILING);
  });

  it("returns COVERAGE_REVIEW_CEILING for undefined entry", () => {
    expect(completionReviewCeiling(undefined)).toBe(COVERAGE_REVIEW_CEILING);
  });

  it("raises ceiling when a coverage ref supports above the review floor", () => {
    const e = entry(
      "forming",
      [
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
      { completionReviewNeeded: true },
    );
    expect(completionReviewCeiling(e)).toBe("forming");
  });

  it("a direct read raises the ceiling", () => {
    const e = entry(
      "solid",
      [ref("eval", { observedAt: "2026-01-01", readState: "solid" })],
      { completionReviewNeeded: true },
    );
    expect(completionReviewCeiling(e)).toBe("solid");
  });

  it("does not fall below COVERAGE_REVIEW_CEILING even with frontier support", () => {
    const e = entry(
      "forming",
      [ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "frontier" })],
      { completionReviewNeeded: true },
    );
    expect(completionReviewCeiling(e)).toBe(COVERAGE_REVIEW_CEILING);
  });
});

// ── effectiveConceptState ────────────────────────────────────────────────────

describe("effectiveConceptState", () => {
  it("returns not-yet for undefined entry", () => {
    expect(effectiveConceptState(undefined)).toBe("not-yet");
  });

  it("returns stored state when completionReviewNeeded is not set", () => {
    expect(effectiveConceptState(entry("solid"))).toBe("solid");
    expect(effectiveConceptState(entry("frontier"))).toBe("frontier");
  });

  it("caps at review ceiling when under review and nothing supports", () => {
    const e = entry("forming", [], { completionReviewNeeded: true });
    expect(effectiveConceptState(e)).toBe(COVERAGE_REVIEW_CEILING);
  });

  it("uses stored state when supported reaches it under review", () => {
    const e = entry(
      "forming",
      [
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
      { completionReviewNeeded: true },
    );
    expect(effectiveConceptState(e)).toBe("forming");
  });

  it("stored state below ceiling is returned as-is under review", () => {
    const e = entry("not-yet", [], { completionReviewNeeded: true });
    expect(effectiveConceptState(e)).toBe("not-yet");
  });

  it("a frontier entry under review stays at frontier (ceiling = frontier)", () => {
    const e = entry("frontier", [], { completionReviewNeeded: true });
    expect(effectiveConceptState(e)).toBe("frontier");
  });
});

// ── completionReviewSupported ────────────────────────────────────────────────

describe("completionReviewSupported", () => {
  it("returns false when not under review", () => {
    expect(completionReviewSupported(entry("forming"))).toBe(false);
  });

  it("returns false for undefined entry", () => {
    expect(completionReviewSupported(undefined)).toBe(false);
  });

  it("returns true when supported state >= stored state under review", () => {
    const e = entry(
      "forming",
      [
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
      { completionReviewNeeded: true },
    );
    expect(completionReviewSupported(e)).toBe(true);
  });

  it("returns false when nothing supports under review", () => {
    const e = entry("forming", [], { completionReviewNeeded: true });
    expect(completionReviewSupported(e)).toBe(false);
  });

  it("returns false when supported state < stored state", () => {
    const e = entry(
      "forming",
      [ref(CURRICULUM_POSITION_COVERAGE, { coverageCeiling: "frontier" })],
      { completionReviewNeeded: true },
    );
    expect(completionReviewSupported(e)).toBe(false);
  });
});

// ── effectiveConceptStates ───────────────────────────────────────────────────

describe("effectiveConceptStates", () => {
  it("returns empty object for undefined", () => {
    expect(effectiveConceptStates(undefined)).toEqual({});
  });

  it("maps each entry through effectiveConceptState", () => {
    const states = {
      "reading.phonics.cvc": entry("forming"),
      "math.number.counting": entry("forming", [], { completionReviewNeeded: true }),
    };
    const result = effectiveConceptStates(states);
    expect(result["reading.phonics.cvc"]).toBe("forming");
    expect(result["math.number.counting"]).toBe(COVERAGE_REVIEW_CEILING);
  });

  it("handles undefined entries in the map", () => {
    const states: Record<string, CoverageEntryLike | undefined> = {
      a: undefined,
      b: entry("solid"),
    };
    const result = effectiveConceptStates(states);
    expect(result.a).toBe("not-yet");
    expect(result.b).toBe("solid");
  });
});

// ── constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("COVERAGE_CAP is forming", () => {
    expect(COVERAGE_CAP).toBe("forming");
  });

  it("COVERAGE_REVIEW_CEILING is frontier", () => {
    expect(COVERAGE_REVIEW_CEILING).toBe("frontier");
  });

  it("COVERAGE_STATE_RANK orders not-yet < frontier < forming < solid", () => {
    expect(COVERAGE_STATE_RANK["not-yet"]).toBeLessThan(COVERAGE_STATE_RANK["frontier"]);
    expect(COVERAGE_STATE_RANK["frontier"]).toBeLessThan(COVERAGE_STATE_RANK["forming"]);
    expect(COVERAGE_STATE_RANK["forming"]).toBeLessThan(COVERAGE_STATE_RANK["solid"]);
  });

  it("PROGRAM_COMPLETION_COVERAGE and CURRICULUM_POSITION_COVERAGE are distinct", () => {
    expect(PROGRAM_COMPLETION_COVERAGE).not.toBe(CURRICULUM_POSITION_COVERAGE);
  });

  it("ATTESTATION_EVIDENCE and EVAL_EVIDENCE are distinct", () => {
    expect(ATTESTATION_EVIDENCE).not.toBe(EVAL_EVIDENCE);
  });

  it("EvidenceRefStatus has Active and Superseded", () => {
    expect(EvidenceRefStatus.Active).toBe("active");
    expect(EvidenceRefStatus.Superseded).toBe("superseded");
  });

  it("CoverageQualifier has Direct and Partial", () => {
    expect(CoverageQualifier.Direct).toBe("direct");
    expect(CoverageQualifier.Partial).toBe("partial");
  });

  it("CoverageWithheldReason has all three values", () => {
    expect(CoverageWithheldReason.PartialQualifier).toBe("partial-qualifier");
    expect(CoverageWithheldReason.GoverningDirectEvidence).toBe("governing-direct-evidence");
    expect(CoverageWithheldReason.AlreadyAtOrAbove).toBe("already-at-or-above");
  });
});

// ── integration: the six rules together ──────────────────────────────────────

describe("integration: the six rules applied together", () => {
  it("rule 1 + rule 5: withdrawal caps read but new coverage raises it", () => {
    const e = entry(
      "forming",
      [
        ref(CURRICULUM_POSITION_COVERAGE, {
          coverageCeiling: "forming",
          positionSync: true,
        }),
      ],
      { completionReviewNeeded: true },
    );
    expect(effectiveConceptState(e)).toBe("forming");

    const eNoSupport = entry("forming", [], { completionReviewNeeded: true });
    expect(effectiveConceptState(eNoSupport)).toBe("frontier");
  });

  it("rule 2 + rule 1: direct evidence blocks promotion even from not-yet", () => {
    const e = entry("not-yet", [
      ref("quest", { observedAt: "2026-01-01" }),
    ]);
    const result = coveragePromotion(e);
    expect(result.promoted).toBe(false);
    expect(result.withheldReason).toBe(CoverageWithheldReason.GoverningDirectEvidence);
  });

  it("rule 6: frozen attestation prevents eval read from deciding survivingSupportedState indirectly via acceptedDirectRead", () => {
    const att = ref("attestation", {
      observedAt: "2026-01-01",
      readState: "solid",
    });
    const evalRef = ref("eval", {
      observedAt: "2026-01-05",
      readState: "frontier",
    });
    const e = { evidence: [att, evalRef], needsReconcile: true };
    expect(acceptedDirectRead(e)!.readState).toBe("solid");
    expect(governingDirectRead(e)!.readState).toBe("frontier");
  });

  it("rule 4: superseded refs do not participate in any decision", () => {
    const e = entry("not-yet", [
      ref("eval", { status: "superseded", observedAt: "2026-01-05", readState: "solid" }),
      ref(PROGRAM_COMPLETION_COVERAGE, {
        completionId: "c1",
        ownsPromotion: true,
        status: "superseded",
      }),
    ]);
    expect(governingDirectEvidence(e)).toBeUndefined();
    expect(governingDirectRead(e)).toBeUndefined();
    expect(survivingSupportedState(e)).toBeUndefined();
    const promo = coveragePromotion(e);
    expect(promo.promoted).toBe(true);
  });

  it("rule 3: partial coverage still records but does not promote", () => {
    const e = entry("not-yet");
    const promo = coveragePromotion(e, CoverageQualifier.Partial, "forming");
    expect(promo.promoted).toBe(false);
    expect(promo.state).toBe("not-yet");
  });
});
