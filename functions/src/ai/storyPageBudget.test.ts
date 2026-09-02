import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_PAGE_COUNT,
  STORY_BASE_TOKENS,
  STORY_TOKENS_PER_PAGE,
  STORY_TOKENS_PER_WORD,
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

  it("computes base + per-page for in-range targets (FEAT-172 mapping)", () => {
    // base 8192 + 512/page
    expect(STORY_BASE_TOKENS).toBe(8192);
    expect(STORY_TOKENS_PER_PAGE).toBe(512);
    expect(maxTokensForPageCount(6)).toBe(11264);
    expect(maxTokensForPageCount(10)).toBe(13312);
    expect(maxTokensForPageCount(14)).toBe(15360);
  });

  it("gives the confirmed-truncating case (Normal / 10 pages, FEAT-169) far more than the 7168 it ran out at", () => {
    // FEAT-169's diagnostic proved a 10-page book with a word list stopped on
    // max_tokens at 7168. Nearly all of that budget is thinking room, so the
    // headroom lives in the base.
    expect(maxTokensForPageCount(10)).toBeGreaterThanOrEqual(7168 + 4096);
  });

  it("scales with the word list too — a word list makes a story (and the reasoning before it) longer", () => {
    expect(STORY_TOKENS_PER_WORD).toBe(64);
    // Shelly's report: Normal / 10 pages with 12 typed words.
    expect(maxTokensForPageCount(10, 12)).toBe(13312 + 12 * 64);
    expect(maxTokensForPageCount(10, 12)).toBe(14080);
    // The practice list's cap (15) on a long book still sits under the ceiling.
    expect(maxTokensForPageCount(14, 15)).toBe(16320);
    // A missing / non-finite / negative word count adds nothing.
    expect(maxTokensForPageCount(10, undefined)).toBe(maxTokensForPageCount(10));
    expect(maxTokensForPageCount(10, Number.NaN)).toBe(maxTokensForPageCount(10));
    expect(maxTokensForPageCount(10, -3)).toBe(maxTokensForPageCount(10));
  });

  it("gives a 14-page book more budget than the old fixed 6144", () => {
    // The FEAT-77/78 lesson: a long book must not truncate under high effort.
    expect(maxTokensForPageCount(14)).toBeGreaterThan(6144);
  });

  it("clamps a tiny target up to the floor", () => {
    // A 1-page ask lands above the floor on the FEAT-172 base; the floor rail
    // still holds for the pathological (0 / NaN → default) path below.
    expect(maxTokensForPageCount(1)).toBe(8704);
    expect(maxTokensForPageCount(1)).toBeGreaterThanOrEqual(4096);
  });

  it("clamps a runaway target — or a runaway word list — down to the ceiling", () => {
    expect(maxTokensForPageCount(1000)).toBe(16384);
    // FEAT-169's original report: 22 words typed on a 14-page book.
    expect(maxTokensForPageCount(14, 22)).toBe(16384);
    expect(maxTokensForPageCount(10, 500)).toBe(16384);
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
