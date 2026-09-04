import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import { buildReadingLevelBlock } from "./chat.js";
import {
  DECODABILITY_LEVEL_CAP,
  MAX_LEVEL_STRETCH,
  applyLevelStretch,
  checkStoryReadability,
  levelStretchPhrase,
  normalizeLevelStretch,
} from "./storyDecodability.js";
import { loadBookLevelStretch, resolveStoryLevelContext } from "./storyLevelContext.js";

/**
 * FEAT-191 — the per-story "one step up".
 *
 * The load-bearing property under test is that the stretch moves the CEILING and
 * the RULER together: a book written one rung above the child's level must also
 * be measured one rung above it, or the honest line would flag every word the
 * parent just asked for.
 */

// ── The pure arithmetic ─────────────────────────────────────────

describe("normalizeLevelStretch", () => {
  it("keeps the three real choices", () => {
    expect(normalizeLevelStretch(0)).toBe(0);
    expect(normalizeLevelStretch(1)).toBe(1);
    expect(normalizeLevelStretch(2)).toBe(2);
  });

  it("defaults to 0 for anything that is not a usable number", () => {
    expect(normalizeLevelStretch(undefined)).toBe(0);
    expect(normalizeLevelStretch(null)).toBe(0);
    expect(normalizeLevelStretch("nonsense")).toBe(0);
    expect(normalizeLevelStretch(Number.NaN)).toBe(0);
    expect(normalizeLevelStretch(-3)).toBe(0);
  });

  it("clamps an over-large ask to the maximum, and rounds", () => {
    expect(normalizeLevelStretch(7)).toBe(MAX_LEVEL_STRETCH);
    expect(normalizeLevelStretch("2")).toBe(2);
    expect(normalizeLevelStretch(1.4)).toBe(1);
  });
});

describe("applyLevelStretch", () => {
  it("raises the level and keeps the base alongside it", () => {
    const out = applyLevelStretch({ level: 2, source: "assessed" }, 1);
    expect(out).toEqual({ level: 3, source: "assessed", stretch: 1, baseLevel: 2 });
  });

  it("is the identity at stretch 0 — every story before this run", () => {
    const out = applyLevelStretch({ level: 5, source: "age" }, 0);
    expect(out).toMatchObject({ level: 5, source: "age", stretch: 0, baseLevel: 5 });
  });

  it("clamps at the top of the ladder: a Level 8 reader asked for two steps up stays 8", () => {
    const out = applyLevelStretch({ level: 8, source: "assessed" }, 2);
    expect(out.level).toBe(DECODABILITY_LEVEL_CAP);
    // The ASK is still reported — the level did not move, and the honest line
    // reads the level, so nothing over-claims.
    expect(out.stretch).toBe(2);
    expect(out.baseLevel).toBe(8);
  });

  it("clamps a partial overflow too (Level 7 + two steps = 8, not 9)", () => {
    expect(applyLevelStretch({ level: 7, source: "assessed" }, 2).level).toBe(8);
  });
});

describe("levelStretchPhrase", () => {
  it("names one rung and two rungs", () => {
    expect(levelStretchPhrase(1)).toBe("one step up");
    expect(levelStretchPhrase(2)).toBe("two steps up");
  });
});

// ── The block the model reads ───────────────────────────────────

const BLOCK_BASE = {
  childName: "Lincoln",
  levelSource: "assessed" as const,
  safeWords: ["the", "and"],
  sentenceTarget: "2-3 sentences (4-8 words each)",
};

describe("buildReadingLevelBlock — the stretch is stated, not hidden", () => {
  it("names both levels and says whose choice the higher one was", () => {
    const block = buildReadingLevelBlock({
      ...BLOCK_BASE,
      level: 3,
      stretch: 1,
      baseLevel: 2,
    });
    expect(block).toContain("write this story at phonics Level 3");
    expect(block).toContain("Lincoln decodes at Level 2");
    expect(block).toContain("one step up");
    expect(block).toContain("the parent chose");
  });

  it("permits the stretched level's patterns and bans only what is above IT", () => {
    const block = buildReadingLevelBlock({
      ...BLOCK_BASE,
      level: 3,
      stretch: 1,
      baseLevel: 2,
    });
    // Level 3 unlocks digraphs and blends — at Level 2 they were the first
    // thing on the BANNED list.
    expect(block).toContain("ALLOWED WORD PATTERNS (cumulative — everything at or below Level 3)");
    expect(block).not.toContain(
      "- No consonant digraphs (ship, chin, that) and no blends (stop, hand, black).",
    );
    expect(block).toContain("- No silent-e words (make, bike, home, cute).");
  });

  it("is byte-identical to the pre-FEAT-191 heading when nothing was stretched", () => {
    const withField = buildReadingLevelBlock({ ...BLOCK_BASE, level: 2, stretch: 0, baseLevel: 2 });
    const without = buildReadingLevelBlock({ ...BLOCK_BASE, level: 2 });
    expect(withField).toBe(without);
    expect(without).toContain("Lincoln decodes at phonics Level 2 of 8");
    expect(without).not.toContain("step up");
  });
});

// ── Prompt and check move together ──────────────────────────────

function stubDb(): Firestore {
  return {
    collection: () => ({ get: async () => ({ docs: [] }) }),
  } as unknown as Firestore;
}

const LEVEL_3_PAGES = [
  // "ship", "chin" and "black" all need the Level 3 digraph/blend rung: hard at
  // Level 2, fine at Level 3.
  { pageNumber: 1, text: "The ship is black. Chip has a chin." },
];

describe("resolveStoryLevelContext (FEAT-191)", () => {
  const args = {
    db: stubDb(),
    familyId: "fam",
    childId: "kid",
    childName: "Lincoln",
    age: 10,
    workingLevels: { phonics: { level: 2 } },
  };

  it("writes AND checks a stretched story at the stretched level", async () => {
    const ctx = await resolveStoryLevelContext({ ...args, levelStretch: 1 });
    expect(ctx.effective).toMatchObject({ level: 3, baseLevel: 2, stretch: 1, source: "assessed" });
    expect(ctx.block.level).toBe(3);
    expect(ctx.block.stretch).toBe(1);
    expect(ctx.block.baseLevel).toBe(2);

    // The ruler moved with the ceiling: the same page that fails at the base
    // level passes at the stretched one.
    const passes = checkStoryReadability(LEVEL_3_PAGES, {
      phonicsLevel: ctx.effective.level,
      levelSource: ctx.effective.source,
      allowedWords: ctx.allowedWords,
    });
    expect(passes.passed).toBe(true);
  });

  it("leaves an unstretched story exactly where FEAT-176 left it", async () => {
    const ctx = await resolveStoryLevelContext(args);
    expect(ctx.effective).toMatchObject({ level: 2, baseLevel: 2, stretch: 0 });
    expect(ctx.block.level).toBe(2);

    const fails = checkStoryReadability(LEVEL_3_PAGES, {
      phonicsLevel: ctx.effective.level,
      levelSource: ctx.effective.source,
      allowedWords: ctx.allowedWords,
    });
    expect(fails.passed).toBe(false);
    expect(fails.distinctHardWords).toContain("ship");
  });

  it("holds the cap: a Level 8 reader asked for two steps up is still Level 8", async () => {
    const ctx = await resolveStoryLevelContext({
      ...args,
      workingLevels: { phonics: { level: 8 } },
      levelStretch: 2,
    });
    expect(ctx.effective.level).toBe(DECODABILITY_LEVEL_CAP);
    expect(ctx.block.level).toBe(DECODABILITY_LEVEL_CAP);
  });

  it("clamps whatever the client sent — a level is never taken on trust", async () => {
    const wild = await resolveStoryLevelContext({ ...args, levelStretch: 99 });
    expect(wild.effective.level).toBe(4); // 2 + MAX_LEVEL_STRETCH
    const junk = await resolveStoryLevelContext({ ...args, levelStretch: "lots" });
    expect(junk.effective.level).toBe(2);
  });

  it("gives a stretched story the sentence shape of the level it is written at", async () => {
    const base = await resolveStoryLevelContext(args);
    const up = await resolveStoryLevelContext({ ...args, levelStretch: 1 });
    // Level 2 → "1-2 sentences (3-6 words each)"; Level 3 → the next row up.
    expect(up.block.sentenceTarget).not.toBe(base.block.sentenceTarget);
    expect(up.block.sentenceTarget).toContain("4-8 words");
  });

  it("writes no level: the stretch never reaches the assessed reading level", async () => {
    const ctx = await resolveStoryLevelContext({ ...args, levelStretch: 2 });
    // FEAT-173's descriptive line is the ASSESSED level, and it does not move.
    expect(ctx.readingLevel.phonics).toBe(2);
    expect(ctx.readingLevel.text).toContain("Level 2");
  });
});

// ── A revise reads the book, not the payload ────────────────────

describe("loadBookLevelStretch (FEAT-191)", () => {
  function dbWith(data: unknown, capture?: (path: string) => void): Firestore {
    return {
      doc: (path: string) => {
        capture?.(path);
        return { get: async () => ({ data: () => data }) };
      },
    } as unknown as Firestore;
  }

  it("reads the stretch the book was generated with", async () => {
    const paths: string[] = [];
    const db = dbWith({ generationConfig: { levelStretch: 2 } }, (p) => paths.push(p));
    await expect(loadBookLevelStretch(db, "fam", "book1")).resolves.toBe(2);
    expect(paths).toEqual(["families/fam/books/book1"]);
  });

  it("is 0 for a book that carries no stretch — every book before this run", async () => {
    const db = dbWith({ generationConfig: { words: [], pageCount: 6 } });
    await expect(loadBookLevelStretch(db, "fam", "book1")).resolves.toBe(0);
  });

  it("is 0 with no id, a missing book, or an unusable stored value", async () => {
    const db = dbWith({ generationConfig: { levelStretch: "high" } });
    await expect(loadBookLevelStretch(db, "fam", undefined)).resolves.toBe(0);
    await expect(loadBookLevelStretch(dbWith(undefined), "fam", "gone")).resolves.toBe(0);
    await expect(loadBookLevelStretch(db, "fam", "book1")).resolves.toBe(0);
  });

  it("refuses an id that is not one path segment, without reading anything", async () => {
    const paths: string[] = [];
    const db = dbWith({ generationConfig: { levelStretch: 2 } }, (p) => paths.push(p));
    await expect(loadBookLevelStretch(db, "fam", "a/b")).resolves.toBe(0);
    await expect(loadBookLevelStretch(db, "fam", "../other")).resolves.toBe(0);
    expect(paths).toEqual([]);
  });

  it("never throws a failed read into the caller's lap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = {
      doc: () => ({
        get: async () => {
          throw new Error("permission denied");
        },
      }),
    } as unknown as Firestore;
    await expect(loadBookLevelStretch(db, "fam", "book1")).resolves.toBe(0);
    warn.mockRestore();
  });
});
