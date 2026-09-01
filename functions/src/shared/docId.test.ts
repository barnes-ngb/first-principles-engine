import { describe, it, expect } from "vitest";

import { deriveChildIdFromDocId, parseDateFromDocId } from "./docId.js";

/**
 * The rule's own tests, next to its one definition (ARCH-47 slice 2).
 *
 * These are the UNION of the two suites the duplication left behind:
 * `src/core/utils/docId.test.ts` (which covered both readers) and the
 * `"deriveChildIdFromDocId — the port of src/core/utils/docId.ts"` block in
 * `functions/src/ai/tasks/monthlyHours.test.ts` (which covered only the ported
 * one). Nothing was dropped in the merge — a case only one side thought to
 * write is exactly the coverage a duplication hides, so both sides' literals
 * are kept even where they exercise the same branch.
 *
 * This file runs in BOTH vitest projects (the root run executes
 * `functions/src/**` — ARCH-45), and a change that breaks either caller now
 * fails to COMPILE rather than waiting for a test author to notice.
 */

// ─── parseDateFromDocId ─────────────────────────────────────────────────────

describe("parseDateFromDocId", () => {
  it("extracts date from date_childId format (new convention)", () => {
    expect(parseDateFromDocId("2026-01-10_child123")).toBe("2026-01-10");
  });

  it("extracts date from childId_date format (legacy convention)", () => {
    expect(parseDateFromDocId("child123_2026-01-10")).toBe("2026-01-10");
  });

  it("returns the full string for a bare date (no underscore)", () => {
    expect(parseDateFromDocId("2026-01-10")).toBe("2026-01-10");
  });

  it("handles doc ID with long childId", () => {
    expect(parseDateFromDocId("2026-03-15_some-very-long-child-id-abc123")).toBe("2026-03-15");
  });

  it("handles legacy format with long childId prefix", () => {
    expect(parseDateFromDocId("some-very-long-child-id_2026-03-15")).toBe("2026-03-15");
  });

  it("returns full string when no valid date is found", () => {
    expect(parseDateFromDocId("abc_def")).toBe("abc_def");
  });

  it("returns full string for empty input", () => {
    expect(parseDateFromDocId("")).toBe("");
  });

  it("handles month/year boundaries (Dec 31)", () => {
    expect(parseDateFromDocId("2025-12-31_lincoln")).toBe("2025-12-31");
  });

  it("handles month/year boundaries (Jan 01)", () => {
    expect(parseDateFromDocId("lincoln_2026-01-01")).toBe("2026-01-01");
  });

  it("handles leap year dates", () => {
    expect(parseDateFromDocId("2028-02-29_child1")).toBe("2028-02-29");
  });
});

// ─── deriveChildIdFromDocId ─────────────────────────────────────────────────

describe("deriveChildIdFromDocId", () => {
  it("extracts childId from date_childId format", () => {
    expect(deriveChildIdFromDocId("2026-01-10_child123")).toBe("child123");
  });

  it("extracts childId from childId_date format", () => {
    expect(deriveChildIdFromDocId("child123_2026-01-10")).toBe("child123");
  });

  it("returns undefined for plain date (no underscore)", () => {
    expect(deriveChildIdFromDocId("2026-01-10")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(deriveChildIdFromDocId("")).toBeUndefined();
  });

  it("returns undefined when neither segment is a valid date", () => {
    expect(deriveChildIdFromDocId("abc_def")).toBeUndefined();
  });

  it("handles childId containing hyphens", () => {
    expect(deriveChildIdFromDocId("2026-01-10_child-abc-123")).toBe("child-abc-123");
  });

  it("handles childId with multiple underscores (first underscore is the split point)", () => {
    const result = deriveChildIdFromDocId("2026-01-10_child_with_underscores");
    expect(result).toBe("child_with_underscores");
  });
});

// ─── Cases the functions-side port's suite carried ──────────────────────────

/**
 * Kept from `monthlyHours.test.ts`. The branches overlap with the block above,
 * but the literals are the ones the FEAT-164 bug was reasoned about with, and
 * "it is already covered" is the argument that lets a case quietly disappear in
 * a merge.
 */
describe("deriveChildIdFromDocId — cases from the retired monthlyHours port", () => {
  it("reads both composite orders", () => {
    expect(deriveChildIdFromDocId("2026-01-10_child123")).toBe("child123");
    expect(deriveChildIdFromDocId("child123_2026-01-10")).toBe("child123");
  });

  it("returns undefined when no child id is encoded", () => {
    expect(deriveChildIdFromDocId("2026-01-10")).toBeUndefined();
    expect(deriveChildIdFromDocId("")).toBeUndefined();
    expect(deriveChildIdFromDocId("abc_def")).toBeUndefined();
  });

  it("keeps a child id that itself contains underscores", () => {
    expect(deriveChildIdFromDocId("2026-01-10_child_123")).toBe("child_123");
  });
});
