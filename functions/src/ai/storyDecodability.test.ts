import { describe, expect, it } from "vitest";
import {
  CORE_SIGHT_WORDS,
  DECODABILITY_LEVEL_CAP,
  FALLBACK_LEVEL_OLDER,
  FALLBACK_LEVEL_YOUNG,
  SAFE_WORD_CAP,
  checkStoryReadability,
  composeSafeWords,
  countSyllables,
  effectivePhonicsLevel,
  minPhonicsLevelForWord,
  normalizeWord,
  tokenizeStoryText,
  toleranceForLevel,
} from "./storyDecodability.js";

// ── The classifier ────────────────────────────────────────────────

describe("minPhonicsLevelForWord (FEAT-176 — what patterns does this word need?)", () => {
  it("classifies the ladder, band by band", () => {
    // The table the run-prompt pinned: one word per rung, in order.
    expect(minPhonicsLevelForWord("cat")).toBe(2);
    expect(minPhonicsLevelForWord("up")).toBe(2);
    expect(minPhonicsLevelForWord("go")).toBe(2);
    expect(minPhonicsLevelForWord("sun")).toBe(2);
    expect(minPhonicsLevelForWord("ship")).toBe(3);
    expect(minPhonicsLevelForWord("stop")).toBe(3);
    expect(minPhonicsLevelForWord("bike")).toBe(5);
    expect(minPhonicsLevelForWord("boat")).toBe(6);
    expect(minPhonicsLevelForWord("farm")).toBe(7);
    expect(minPhonicsLevelForWord("rabbit")).toBe(7);
    expect(minPhonicsLevelForWord("unkind")).toBe(8);
    expect(minPhonicsLevelForWord("jumping")).toBe(8);
  });

  it("unlocks digraphs and blends together at 3, so the two repo ladders cannot disagree", () => {
    // FEAT-173 flagged that buildQuestPrompt has 3 = digraphs / 4 = blends while
    // PHONICS_SKILL_LEVEL_MAP has the reverse. Both land at 3 here — refusing to
    // pick a side rather than picking one.
    expect(minPhonicsLevelForWord("shop")).toBe(3); // digraph
    expect(minPhonicsLevelForWord("clap")).toBe(3); // blend
    expect(minPhonicsLevelForWord("chin")).toBe(3);
    expect(minPhonicsLevelForWord("hand")).toBe(3);
  });

  it("puts the words that make a book unreadable above a beginner's level", () => {
    expect(minPhonicsLevelForWord("castle")).toBeGreaterThan(2);
    expect(minPhonicsLevelForWord("ready")).toBeGreaterThan(2);
    expect(minPhonicsLevelForWord("journey")).toBeGreaterThan(2);
  });

  it("treats the/said/Marco as hard — they are only safe via allowedWords", () => {
    expect(minPhonicsLevelForWord("the")).toBeGreaterThan(2); // th digraph
    expect(minPhonicsLevelForWord("said")).toBeGreaterThan(2); // ai vowel team
    expect(minPhonicsLevelForWord("Marco")).toBeGreaterThan(2); // two syllables
  });

  it("ignores case and surrounding punctuation", () => {
    expect(minPhonicsLevelForWord("CAT")).toBe(2);
    expect(minPhonicsLevelForWord('"Cat,"')).toBe(2);
    expect(minPhonicsLevelForWord("cat!")).toBe(2);
    expect(minPhonicsLevelForWord("(sun)")).toBe(2);
  });

  it("puts numerals, hyphenated compounds and contractions above the bottom bands", () => {
    expect(minPhonicsLevelForWord("7")).toBe(DECODABILITY_LEVEL_CAP);
    expect(minPhonicsLevelForWord("level-2")).toBe(DECODABILITY_LEVEL_CAP);
    expect(minPhonicsLevelForWord("well-known")).toBe(DECODABILITY_LEVEL_CAP);
    // A contraction needs the apostrophe convention — "can't" is not a Level 2 word.
    expect(minPhonicsLevelForWord("can't")).toBeGreaterThanOrEqual(5);
    expect(minPhonicsLevelForWord("can’t")).toBeGreaterThanOrEqual(5);
  });

  it("never throws, and never returns outside 1..8", () => {
    for (const input of ["", "   ", "!!!", "'", "-", "ééé"]) {
      const level = minPhonicsLevelForWord(input);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(DECODABILITY_LEVEL_CAP);
    }
  });
});

describe("countSyllables", () => {
  it("discounts a silent final e so bike is one syllable and rabbit is two", () => {
    expect(countSyllables("bike")).toBe(1);
    expect(countSyllables("make")).toBe(1);
    expect(countSyllables("the")).toBe(1);
    expect(countSyllables("rabbit")).toBe(2);
    expect(countSyllables("marco")).toBe(2);
  });
});

describe("normalizeWord / tokenizeStoryText", () => {
  it("splits a page into words, dropping punctuation and keeping contractions", () => {
    expect(tokenizeStoryText('"Sam can hop!" said Pip.')).toEqual([
      "sam",
      "can",
      "hop",
      "said",
      "pip",
    ]);
    expect(tokenizeStoryText("It's a big, red hat.")).toEqual(["it's", "a", "big", "red", "hat"]);
  });

  it("returns nothing for empty or punctuation-only text", () => {
    expect(tokenizeStoryText("")).toEqual([]);
    expect(tokenizeStoryText("... --- !!!")).toEqual([]);
    expect(normalizeWord("  ")).toBe("");
  });
});

// ── The level a story is checked against ──────────────────────────

describe("effectivePhonicsLevel (FEAT-176 fallback)", () => {
  it("uses the assessed level when there is one", () => {
    expect(effectivePhonicsLevel(5, 6)).toEqual({ level: 5, source: "assessed" });
    expect(effectivePhonicsLevel(1, 10)).toEqual({ level: 1, source: "assessed" });
  });

  it("falls back LOW by age when no level is on file — the reported case", () => {
    // London, 6, no assessed level: "regardless the words are too advanced".
    expect(effectivePhonicsLevel(null, 6)).toEqual({
      level: FALLBACK_LEVEL_YOUNG,
      source: "age",
    });
    expect(effectivePhonicsLevel(undefined, 7)).toEqual({
      level: FALLBACK_LEVEL_YOUNG,
      source: "age",
    });
    expect(effectivePhonicsLevel(null, 10)).toEqual({
      level: FALLBACK_LEVEL_OLDER,
      source: "age",
    });
  });

  it("clamps a stored level into the ladder rather than trusting it", () => {
    expect(effectivePhonicsLevel(99, 10).level).toBe(DECODABILITY_LEVEL_CAP);
    expect(effectivePhonicsLevel(0, 6)).toEqual({ level: FALLBACK_LEVEL_YOUNG, source: "age" });
    expect(effectivePhonicsLevel(Number.NaN, 6).source).toBe("age");
  });
});

describe("toleranceForLevel", () => {
  it("scales with the level — a beginner stalls on one unknown word", () => {
    expect(toleranceForLevel(1)).toEqual({ maxPerPage: 1, maxRatio: 0.05 });
    expect(toleranceForLevel(4)).toEqual({ maxPerPage: 1, maxRatio: 0.05 });
    expect(toleranceForLevel(5)).toEqual({ maxPerPage: 2, maxRatio: 0.1 });
    expect(toleranceForLevel(6)).toEqual({ maxPerPage: 2, maxRatio: 0.1 });
    expect(toleranceForLevel(7)).toEqual({ maxPerPage: 3, maxRatio: 0.15 });
    expect(toleranceForLevel(8)).toEqual({ maxPerPage: 3, maxRatio: 0.15 });
  });
});

// ── The check ─────────────────────────────────────────────────────

const CORE = CORE_SIGHT_WORDS;

describe("checkStoryReadability (FEAT-176 — measure, do not ask)", () => {
  it("passes a clean Level 2 story", () => {
    const pages = [
      { pageNumber: 1, text: "Sam has a red hat." },
      { pageNumber: 2, text: "The hat is big." },
      { pageNumber: 3, text: "Sam can hop." },
    ];
    const report = checkStoryReadability(pages, { phonicsLevel: 2, allowedWords: CORE });
    expect(report.passed).toBe(true);
    expect(report.hardWords).toEqual([]);
    expect(report.totalHardWords).toBe(0);
  });

  it("fails the story the owner reported — right level, wrong words", () => {
    const pages = [
      { pageNumber: 1, text: "London stood before the enormous castle gates." },
      { pageNumber: 2, text: "The dragon guardian was ready to challenge him." },
    ];
    const report = checkStoryReadability(pages, { phonicsLevel: 2, allowedWords: CORE });
    expect(report.passed).toBe(false);
    expect(report.distinctHardWords).toContain("castle");
    expect(report.distinctHardWords).toContain("ready");
  });

  it("allows one hard word per page at Level 2 but not two on the same page", () => {
    // Long enough pages that ONE hard word stays inside the 5% ratio, so this
    // test is about the per-page cap and nothing else.
    const easy = "Sam can hop and run to the big red hat on a mat. Sam can nap on it too";
    const onePerPage = Array.from({ length: 6 }, (_, i) => ({
      pageNumber: i + 1,
      text: `${easy} castle.`,
    }));
    const one = checkStoryReadability(onePerPage, { phonicsLevel: 2, allowedWords: CORE });
    expect(one.pages.every((p) => p.hardWords.length === 1)).toBe(true);
    expect(one.passed).toBe(true);

    const twoOnOne = onePerPage.map((p, i) =>
      i === 2 ? { ...p, text: `${easy} castle journey.` } : p,
    );
    const two = checkStoryReadability(twoOnOne, { phonicsLevel: 2, allowedWords: CORE });
    expect(two.passed).toBe(false);
  });

  it("holds the ratio rule at the 5% boundary over a 14-page story", () => {
    // 10 tokens a page x 14 pages = 140 tokens. 7 hard words (one on each of 7
    // pages) is exactly 5% and passes; an 8th tips it over even though no page
    // carries more than one.
    const easyTen = "Sam can hop and run to the big red mat";
    const build = (hardPages: number) =>
      Array.from({ length: 14 }, (_, i) => ({
        pageNumber: i + 1,
        text: i < hardPages ? `${easyTen} castle` : `${easyTen} pot`,
      }));

    const atBoundary = checkStoryReadability(build(7), { phonicsLevel: 2, allowedWords: CORE });
    expect(atBoundary.totalTokens).toBe(154);
    expect(atBoundary.pages.every((p) => p.hardWords.length <= 1)).toBe(true);
    expect(atBoundary.totalHardOccurrences / atBoundary.totalTokens).toBeLessThanOrEqual(0.05);
    expect(atBoundary.passed).toBe(true);

    const overBoundary = checkStoryReadability(build(9), { phonicsLevel: 2, allowedWords: CORE });
    expect(overBoundary.pages.every((p) => p.hardWords.length <= 1)).toBe(true);
    expect(overBoundary.totalHardOccurrences / overBoundary.totalTokens).toBeGreaterThan(0.05);
    expect(overBoundary.passed).toBe(false);
  });

  it("counts a word repeated on one page once for the per-page rule", () => {
    const report = checkStoryReadability(
      [{ pageNumber: 1, text: "The castle. The castle. The castle is big." }],
      { phonicsLevel: 2, allowedWords: CORE },
    );
    expect(report.pages[0].hardWords).toHaveLength(1);
    expect(report.pages[0].hardOccurrences).toBe(3);
  });

  it("waves through any word in allowedWords, at any level", () => {
    const pages = [{ pageNumber: 1, text: "The dragon flew over the castle." }];
    const strict = checkStoryReadability(pages, { phonicsLevel: 2, allowedWords: CORE });
    expect(strict.passed).toBe(false);
    const withWords = checkStoryReadability(pages, {
      phonicsLevel: 2,
      allowedWords: [...CORE, "dragon", "flew", "over", "castle"],
    });
    expect(withWords.passed).toBe(true);
  });

  it("treats a character name as a word the reader has to decode", () => {
    const report = checkStoryReadability([{ pageNumber: 1, text: "Marco ran to the big hat." }], {
      phonicsLevel: 2,
      allowedWords: CORE,
    });
    expect(report.distinctHardWords).toContain("marco");
  });

  it("passes the same story at a higher level", () => {
    const pages = [{ pageNumber: 1, text: "Jake made a boat and set it on the lake." }];
    expect(checkStoryReadability(pages, { phonicsLevel: 2, allowedWords: CORE }).passed).toBe(
      false,
    );
    expect(checkStoryReadability(pages, { phonicsLevel: 6, allowedWords: CORE }).passed).toBe(true);
  });

  it("numbers pages from their index when the JSON omits pageNumber, and never throws on junk", () => {
    const report = checkStoryReadability(
      [{ text: "castle" }, {}, { text: undefined }] as Array<{ text?: string }>,
      { phonicsLevel: 2, levelSource: "age", allowedWords: CORE },
    );
    expect(report.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(report.hardWords[0]).toMatchObject({ page: 1, word: "castle" });
    expect(report.levelSource).toBe("age");
  });

  it("passes an empty story rather than dividing by zero", () => {
    const report = checkStoryReadability([], { phonicsLevel: 2 });
    expect(report.passed).toBe(true);
    expect(report.totalTokens).toBe(0);
  });
});

// ── Safe-word composition ─────────────────────────────────────────

describe("composeSafeWords", () => {
  it("orders core then mastered then familiar then practicing, deduped and lower-cased", () => {
    const out = composeSafeWords({
      core: ["the", "and"],
      mastered: ["Hat", "the"],
      familiar: ["mop"],
      practicing: ["pin"],
    });
    expect(out).toEqual(["the", "and", "hat", "mop", "pin"]);
  });

  it("never drops a requested word, even when the mastered list would fill the cap", () => {
    const mastered = Array.from({ length: 200 }, (_, i) => `mword${i}`);
    const out = composeSafeWords({ mastered, requested: ["pretty", "eight"] }, SAFE_WORD_CAP);
    expect(out).toHaveLength(SAFE_WORD_CAP);
    expect(out).toContain("pretty");
    expect(out).toContain("eight");
  });

  it("caps the child's own words", () => {
    const mastered = Array.from({ length: 500 }, (_, i) => `w${i}`);
    expect(composeSafeWords({ mastered })).toHaveLength(SAFE_WORD_CAP);
    expect(composeSafeWords({ mastered }, 10)).toHaveLength(10);
  });

  it("prints the core in full and never lets a long mastered list crowd it out", () => {
    // The core is longer than the cap; capping the two together would silently
    // drop `the` and `said` from the block.
    const mastered = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const out = composeSafeWords({ core: CORE_SIGHT_WORDS, mastered, requested: ["pretty"] });
    expect(out).toHaveLength(CORE_SIGHT_WORDS.length + SAFE_WORD_CAP);
    expect(out).toContain("the");
    expect(out).toContain("said");
    expect(out).toContain("pretty");
    expect(out.slice(0, CORE_SIGHT_WORDS.length)).toEqual([...CORE_SIGHT_WORDS]);
  });

  it("is empty for empty input", () => {
    expect(composeSafeWords({})).toEqual([]);
  });
});

describe("CORE_SIGHT_WORDS", () => {
  it("carries the function words a decodable story cannot be written without", () => {
    for (const w of ["the", "a", "and", "is", "said", "to", "was", "you", "of"]) {
      expect(CORE_SIGHT_WORDS).toContain(w);
    }
  });

  it("is a small allowlist of high-frequency words, not a vocabulary — the words the owner reported are NOT in it", () => {
    expect(CORE_SIGHT_WORDS.length).toBeLessThan(120);
    for (const w of ["castle", "dragon", "journey", "ready", "enormous", "guardian"]) {
      expect(CORE_SIGHT_WORDS).not.toContain(w);
    }
  });

  it("is already normalized (lower-case, no duplicates)", () => {
    expect(new Set(CORE_SIGHT_WORDS).size).toBe(CORE_SIGHT_WORDS.length);
    for (const w of CORE_SIGHT_WORDS) expect(w).toBe(normalizeWord(w));
  });
});
