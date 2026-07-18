import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_PAGE_COUNT,
  maxTokensForPageCount,
  reconcileStoryPageCount,
} from "./storyPageBudget.js";

describe("DEFAULT_TARGET_PAGE_COUNT", () => {
  it("is the priced product size (10)", () => {
    expect(DEFAULT_TARGET_PAGE_COUNT).toBe(10);
  });
});

describe("maxTokensForPageCount", () => {
  it("scales the budget with the target page count", () => {
    const short = maxTokensForPageCount(6);
    const normal = maxTokensForPageCount(10);
    const long = maxTokensForPageCount(14);
    expect(short).toBeLessThan(normal);
    expect(normal).toBeLessThan(long);
  });

  it("computes base + per-page for in-range targets", () => {
    // base 2048 + 512/page
    expect(maxTokensForPageCount(6)).toBe(5120);
    expect(maxTokensForPageCount(10)).toBe(7168);
    expect(maxTokensForPageCount(14)).toBe(9216);
  });

  it("gives a 14-page book more budget than the old fixed 6144", () => {
    // The FEAT-77/78 lesson: a long book must not truncate under high effort.
    expect(maxTokensForPageCount(14)).toBeGreaterThan(6144);
  });

  it("clamps a tiny target up to the floor", () => {
    expect(maxTokensForPageCount(1)).toBe(4096);
  });

  it("clamps a runaway target down to the ceiling", () => {
    expect(maxTokensForPageCount(1000)).toBe(16384);
  });

  it("falls back to the default budget when the target is missing/non-finite (characterization)", () => {
    const fallback = maxTokensForPageCount(DEFAULT_TARGET_PAGE_COUNT);
    expect(maxTokensForPageCount(0)).toBe(fallback);
    expect(maxTokensForPageCount(Number.NaN)).toBe(fallback);
  });
});

describe("reconcileStoryPageCount", () => {
  it("reports a zero delta for an exact match", () => {
    const r = reconcileStoryPageCount(10, 10);
    expect(r.delta).toBe(0);
    expect(r.wildlyOff).toBe(false);
  });

  it("accepts an off-by-one without flagging it (never fails a good story)", () => {
    expect(reconcileStoryPageCount(10, 11).wildlyOff).toBe(false);
    expect(reconcileStoryPageCount(10, 9).wildlyOff).toBe(false);
  });

  it("treats exactly ±3 as still acceptable", () => {
    expect(reconcileStoryPageCount(10, 7).wildlyOff).toBe(false);
    expect(reconcileStoryPageCount(10, 13).wildlyOff).toBe(false);
  });

  it("flags a wildly-off count (>±3) for a warn", () => {
    expect(reconcileStoryPageCount(10, 14).wildlyOff).toBe(true);
    expect(reconcileStoryPageCount(6, 2).wildlyOff).toBe(true);
  });

  it("signs the delta by direction (extra pages positive, short negative)", () => {
    expect(reconcileStoryPageCount(10, 12).delta).toBe(2);
    expect(reconcileStoryPageCount(10, 6).delta).toBe(-4);
  });
});
