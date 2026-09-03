import { describe, expect, it } from "vitest";
import {
  DECODABLE_PATTERN_ROWS,
  buildReadingLevelBlock,
  buildRevisePagePrompt,
  buildReviseStoryPrompt,
  buildStoryPrompt,
  buildStoryReadabilityFixPrompt,
  exampleStoryPageForLevel,
  sentenceTargetFor,
  sentenceTargetForAge,
} from "./chat.js";
import type { ReadingLevelBlockInput, RevisePageInput, ReviseStoryInput } from "./chat.js";

// ── The block itself ──────────────────────────────────────────────

function blockInput(overrides: Partial<ReadingLevelBlockInput> = {}): ReadingLevelBlockInput {
  return {
    childName: "London",
    level: 2,
    levelSource: "assessed",
    levelText: "decoding at phonics Level 2 of 8 — CVC words by word family (cat, sun, hop, big)",
    safeWords: ["the", "and", "a", "said", "you"],
    sentenceTarget: "1-2 sentences (3-6 words each)",
    ...overrides,
  };
}

describe("buildReadingLevelBlock (FEAT-176 — concrete, not abstract)", () => {
  it("at Level 2: names CVC, prints SAFE WORDS, gives the sentence shape", () => {
    const b = buildReadingLevelBlock(blockInput());
    expect(b).toContain("READING LEVEL");
    expect(b).toContain("phonics Level 2 of 8");
    expect(b).toContain("CVC / VC / CV words with one short vowel");
    expect(b).toContain("cat, sun, hop, big, up, go");
    expect(b).toContain("SAFE WORDS");
    expect(b).toContain("the, and, a, said, you");
    expect(b).toContain("SENTENCE SHAPE: each page is 1-2 sentences (3-6 words each).");
  });

  it("at Level 2: BANS the bands above it by name, with example words", () => {
    // A negative list is what the model actually obeys. FEAT-173's single
    // positive line ("keep the decoding demands at or below it") did not hold.
    const b = buildReadingLevelBlock(blockInput());
    expect(b).toContain("BANNED at Level 2");
    expect(b).toMatch(/No silent-e words \(make, bike/);
    expect(b).toMatch(/No vowel teams \(boat, rain/);
    expect(b).toMatch(/No two-syllable words \(rabbit, basket\)/);
    expect(b).toMatch(/No consonant digraphs/);
    expect(b).toMatch(/No prefixes or suffixes/);
  });

  it("at Level 7: does NOT ban silent-e, vowel teams or two-syllable words", () => {
    const b = buildReadingLevelBlock(blockInput({ level: 7, sentenceTarget: "2-4 sentences" }));
    expect(b).toContain("BANNED at Level 7");
    expect(b).not.toMatch(/No silent-e words/);
    expect(b).not.toMatch(/No vowel teams/);
    expect(b).not.toMatch(/No two-syllable words/);
    expect(b).toMatch(/No prefixes or suffixes/);
    // And it DOES allow what Level 2 banned.
    expect(b).toContain("silent-e / long vowels");
    expect(b).toContain("r-controlled vowels");
  });

  it("at Level 8: says there is nothing above it rather than printing an empty ban list", () => {
    const b = buildReadingLevelBlock(blockInput({ level: 8 }));
    expect(b).toContain("this is the top of the ladder");
  });

  it("states precedence over the theme's vocabulary style and the planner's word list", () => {
    const b = buildReadingLevelBlock(blockInput());
    expect(b).toContain("THIS BLOCK OUTRANKS EVERY OTHER VOCABULARY INSTRUCTION");
    expect(b).toMatch(/outranks THEME GUIDANCE's VOCABULARY STYLE/);
    expect(b).toMatch(/medium complexity with descriptive fantasy words/);
    expect(b).toMatch(/outranks every other word list/);
    expect(b).toMatch(/words needing work/);
  });

  it("bans contractions at Level 4 and below, and allows them above", () => {
    // WRITING QUALITY says "Contractions are fine". "can't" is not decodable at
    // Level 2, so the block has to say which wins.
    expect(buildReadingLevelBlock(blockInput({ level: 2 }))).toContain("NO CONTRACTIONS");
    expect(buildReadingLevelBlock(blockInput({ level: 4 }))).toContain("NO CONTRACTIONS");
    expect(buildReadingLevelBlock(blockInput({ level: 5 }))).not.toContain("NO CONTRACTIONS");
  });

  it("makes character names part of the rule, and names the ones that break Level 2", () => {
    const b = buildReadingLevelBlock(blockInput());
    expect(b).toContain("CHARACTER NAMES");
    expect(b).toContain("Sam, Max, Pip, Dot");
    expect(b).toContain("names like Marco, Ember and Coral do not");
  });

  it("shows one worked page at the level instead of describing the register", () => {
    const b = buildReadingLevelBlock(blockInput());
    expect(b).toContain("Sam has a red hat. The hat is big. Sam can hop.");
    expect(exampleStoryPageForLevel(2)).not.toContain("Marco");
    expect(exampleStoryPageForLevel(8)).toContain("Marco");
  });

  it("says when the level is only an estimate, and prints the assessed line when it is not", () => {
    const assessed = buildReadingLevelBlock(blockInput());
    expect(assessed).toContain("ASSESSED — London's working level from the Skill Snapshot");
    expect(assessed).toContain("CVC words by word family");

    const guessed = buildReadingLevelBlock(
      blockInput({ levelSource: "age", levelText: undefined }),
    );
    expect(guessed).toContain("ESTIMATED from age");
    expect(guessed).toContain("no assessed reading level is on file for London yet");
  });

  it("says so plainly when the child has no safe words on file", () => {
    const b = buildReadingLevelBlock(blockInput({ safeWords: [] }));
    expect(b).toContain("SAFE WORDS: none on file for London yet");
  });

  it("clamps a level outside the ladder instead of printing an empty block", () => {
    expect(buildReadingLevelBlock(blockInput({ level: 0 }))).toContain("Level 1 of 8");
    expect(buildReadingLevelBlock(blockInput({ level: 99 }))).toContain("Level 8 of 8");
  });

  it("keeps the pattern rows cumulative and in ladder order", () => {
    expect(DECODABLE_PATTERN_ROWS.map((r) => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ── Sentence shape ────────────────────────────────────────────────

describe("sentenceTargetFor (FEAT-176 — length follows the LEVEL, age is the fallback)", () => {
  it("uses the assessed level when there is one", () => {
    expect(sentenceTargetFor({ phonicsLevel: 2, age: 10 })).toBe("1-2 sentences (3-6 words each)");
    expect(sentenceTargetFor({ phonicsLevel: 4, age: 6 })).toBe("2-3 sentences (4-8 words each)");
    expect(sentenceTargetFor({ phonicsLevel: 6, age: 6 })).toBe("2-3 sentences (6-10 words each)");
    expect(sentenceTargetFor({ phonicsLevel: 8, age: 6 })).toBe("2-4 sentences (8-14 words each)");
  });

  it("falls back to the age row when no level is assessed", () => {
    expect(sentenceTargetFor({ phonicsLevel: null, age: 6 })).toBe(sentenceTargetForAge(6));
    expect(sentenceTargetFor({ age: 10 })).toBe(sentenceTargetForAge(10));
    expect(sentenceTargetFor({ phonicsLevel: 0, age: 10 })).toBe(sentenceTargetForAge(10));
  });

  it("asks a Level 1-2 reader for SHORTER sentences than the old age<=7 row", () => {
    // The whole point: Lincoln at 10 decoding around Level 2 used to be asked
    // for 8-14 word sentences because the only input was his birthdate.
    expect(sentenceTargetForAge(6)).toBe("1-2 short sentences (5-9 words each)");
    expect(sentenceTargetForAge(10)).toBe("2-4 sentences (8-14 words each)");
    expect(sentenceTargetFor({ phonicsLevel: 2, age: 10 })).toBe("1-2 sentences (3-6 words each)");
  });

  it("is monotone non-decreasing across the ladder", () => {
    const maxWords = (t: string) => Number(/\((?:\d+)-(\d+) words/.exec(t)?.[1] ?? 0);
    let prev = 0;
    for (let level = 1; level <= 8; level++) {
      const w = maxWords(sentenceTargetFor({ phonicsLevel: level, age: 10 }));
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

// ── The three story prompts all carry the block ───────────────────

describe("the block reaches all three story prompts", () => {
  it("buildStoryPrompt puts it above the story idea, and drives the sentence rule and the JSON sample", () => {
    const p = buildStoryPrompt({
      storyIdea: "a dragon who cannot fly",
      words: [],
      pageCount: 6,
      childName: "London",
      childAge: 6,
      readingLevelBlock: blockInput(),
    });
    expect(p).toContain("READING LEVEL");
    expect(p.indexOf("READING LEVEL")).toBeLessThan(p.indexOf("STORY IDEA:"));
    expect(p).toContain("Each page has 1-2 sentences (3-6 words each).");
    // The JSON sample page reads at the level, not at the age.
    expect(p).toContain("Sam has a red hat.");
    expect(p).not.toContain("A little cat sat in the sun.");
    // And the copyright example names are marked as being for an older reader.
    expect(p).toContain('at Level 2, "Princess Peach" → "Pip"');
  });

  it("buildStoryPrompt is unchanged when no block is injected (older caller)", () => {
    const p = buildStoryPrompt({
      storyIdea: "a dragon who cannot fly",
      words: [],
      pageCount: 6,
      childName: "London",
      childAge: 6,
    });
    expect(p).not.toContain("BANNED at Level");
    expect(p).not.toContain("SAFE WORDS");
    expect(p).toContain("1-2 short sentences (5-9 words each)");
    expect(p).toContain("A little cat sat in the sun.");
  });

  it("buildReviseStoryPrompt carries the same block", () => {
    const input: ReviseStoryInput = {
      chatHistory: [],
      currentStory: { title: "T", pages: [{ pageNumber: 1, text: "x", sceneDescription: "y" }] },
      childCalibration: {
        childAge: 6,
        childName: "London",
        illustrationStyle: "comic",
        pageCount: 1,
      },
      newFeedback: "make it more exciting",
      readingLevelBlock: blockInput(),
    };
    const p = buildReviseStoryPrompt(input);
    expect(p).toContain("BANNED at Level 2");
    expect(p).toContain("Each page should have 1-2 sentences (3-6 words each).");
    // Without the block it falls back to the age row, unchanged.
    const { readingLevelBlock: _omitted, ...withoutBlock } = input;
    expect(buildReviseStoryPrompt(withoutBlock)).not.toContain("BANNED at Level");
  });

  it("buildRevisePagePrompt carries the same block", () => {
    const input: RevisePageInput = {
      pageNumber: 1,
      currentText: "x",
      currentSceneDescription: "y",
      feedback: "make the dragon a girl",
      fullStoryContext: { title: "T", allPages: [{ pageNumber: 1, text: "x" }], characterNames: [] },
      childCalibration: {
        childAge: 6,
        childName: "London",
        sentenceTarget: "",
        vocabularyLevel: "",
      },
      readingLevelBlock: blockInput(),
    };
    const p = buildRevisePagePrompt(input);
    expect(p).toContain("BANNED at Level 2");
    expect(p).toContain("Each page should have 1-2 sentences (3-6 words each).");
    const { readingLevelBlock: _omitted, ...withoutBlock } = input;
    expect(buildRevisePagePrompt(withoutBlock)).not.toContain("BANNED at Level");
  });
});

// ── The one fix prompt ────────────────────────────────────────────

describe("buildStoryReadabilityFixPrompt (FEAT-176 — narrow on purpose)", () => {
  const fix = () =>
    buildStoryReadabilityFixPrompt({
      childName: "London",
      storyJson: '{"title":"The Castle","pages":[{"pageNumber":1,"text":"The castle was ready."}]}',
      hardWordsByPage: [{ page: 1, words: ["castle", "ready"] }],
      readingLevelBlock: blockInput(),
      pageCount: 6,
    });

  it("hands the model the story, the exact failing words, and the same level block", () => {
    const p = fix();
    expect(p).toContain("BANNED at Level 2");
    expect(p).toContain("- Page 1: castle, ready");
    expect(p).toContain('{"title":"The Castle"');
  });

  it("pins what must not change so a fix cannot become a rewrite", () => {
    const p = fix();
    expect(p).toContain("Replace ONLY the words listed above");
    expect(p).toContain("The title.");
    expect(p).toContain("exactly 6 pages");
    expect(p).toContain("sceneDescription");
    expect(p).toMatch(/rename that character EVERYWHERE/);
  });

  it("carries no beats, no theme guidance and no family context — every one is a reason to drift", () => {
    const p = fix();
    expect(p).not.toContain("PAGE BEATS");
    expect(p).not.toContain("STORY WORLD:");
    expect(p).not.toContain("VOCABULARY STYLE:");
    expect(p).not.toContain("CHARTER");
    expect(p).not.toContain("WRITING QUALITY:");
  });
});
