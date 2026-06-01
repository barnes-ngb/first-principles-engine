import { describe, expect, it } from "vitest";
import {
  buildEvaluationPrompt,
  buildKnownBlockersSection,
  buildPageBeats,
  buildQuestPrompt,
  buildRecentCurriculumSection,
  buildRevisePagePrompt,
  buildReviseStoryPrompt,
  buildStoryPrompt,
  getWeekMonday,
} from "./chat.js";
import type { ReviseStoryInput, RevisePageInput } from "./chat.js";
import { MATH_CONCEPT_BANDS } from "./levelDefinitions.js";

// ── getWeekMonday ──────────────────────────────────────────────

describe("getWeekMonday", () => {
  it("returns Monday for a Monday input", () => {
    const mon = new Date(2026, 2, 2); // Mon March 2, 2026
    const result = getWeekMonday(mon);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Wednesday input", () => {
    const wed = new Date(2026, 2, 4); // Wed March 4, 2026
    const result = getWeekMonday(wed);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Sunday input", () => {
    const sun = new Date(2026, 2, 1); // Sun March 1, 2026
    const result = getWeekMonday(sun);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-23");
  });

  it("returns Monday for a Saturday input", () => {
    const sat = new Date(2026, 2, 7); // Sat March 7, 2026
    const result = getWeekMonday(sat);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Friday input", () => {
    const fri = new Date(2026, 2, 6); // Fri March 6, 2026
    const result = getWeekMonday(fri);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });
});

// ── Phase 2: KNOWN BLOCKERS prompt section ─────────────────────

describe("buildKnownBlockersSection", () => {
  it("returns empty string when no blockers are provided", () => {
    expect(buildKnownBlockersSection(undefined)).toBe("");
    expect(buildKnownBlockersSection([])).toBe("");
  });

  it("emits ADDRESS_NOW and RESOLVING sections with ids and example words", () => {
    const section = buildKnownBlockersSection([
      {
        id: "short-i-vs-e",
        name: "Short vowel i vs e",
        status: "ADDRESS_NOW",
        affectedSkills: ["phonics.short-i-vs-e"],
        rationale: "2 wrong on bed/bid in last session",
        specificWords: ["bed", "bid", "ten", "tin"],
      },
      {
        id: "digraph-oo",
        name: "Digraph /oo/",
        status: "RESOLVING",
        affectedSkills: ["phonics.digraphs"],
        rationale: "Trending up after practice",
        specificWords: ["moon", "zoo"],
      },
    ]);

    expect(section).toContain("## KNOWN BLOCKERS");
    expect(section).toContain("ADDRESS_NOW blockers");
    expect(section).toContain("RESOLVING blockers");
    expect(section).toContain('id="short-i-vs-e"');
    expect(section).toContain('id="digraph-oo"');
    expect(section).toContain("bed, bid");
    expect(section).toContain("targetedBlockerId");
    // Distribution rules must be present so the AI scales with count
    expect(section).toContain("2 targeted questions");
  });

  it("handles ADDRESS_NOW-only lists (no RESOLVING header)", () => {
    const section = buildKnownBlockersSection([
      {
        id: "cvc-blending",
        name: "CVC blending",
        status: "ADDRESS_NOW",
        affectedSkills: ["phonics.cvc"],
      },
    ]);
    expect(section).toContain("ADDRESS_NOW blockers");
    expect(section).not.toContain("RESOLVING blockers");
  });
});

describe("buildRecentCurriculumSection", () => {
  it("returns empty string when there are no recent scans", () => {
    expect(buildRecentCurriculumSection(false)).toBe("");
  });

  it("emits the RECENT CURRICULUM framing when scans are present", () => {
    const section = buildRecentCurriculumSection(true);
    expect(section).toContain("## RECENT CURRICULUM");
    expect(section).toContain("RECENT WORKBOOK SCANS");
    expect(section).toContain("NOT mandatory");
    expect(section).toContain("targetedBlockerId");
  });
});

describe("buildQuestPrompt — phase 2 extras", () => {
  it("appends KNOWN BLOCKERS and RECENT CURRICULUM for reading phonics quests", () => {
    const prompt = buildQuestPrompt("reading", 4, "phonics", {
      activeBlockers: [
        {
          id: "short-i-vs-e",
          name: "Short vowel i vs e",
          status: "ADDRESS_NOW",
          affectedSkills: ["phonics.short-i-vs-e"],
          specificWords: ["bed", "bid"],
        },
      ],
      hasRecentScans: true,
    });
    expect(prompt).toContain("## KNOWN BLOCKERS");
    expect(prompt).toContain("## RECENT CURRICULUM");
    expect(prompt).toContain('"targetedBlockerId": null');
    expect(prompt).toContain("TARGETED BLOCKER FIELD");
    // KNOWN BLOCKERS should appear before the RESPONSE FORMAT section.
    const blockersIdx = prompt.indexOf("## KNOWN BLOCKERS");
    const responseIdx = prompt.indexOf("RESPONSE FORMAT");
    expect(blockersIdx).toBeGreaterThan(0);
    expect(blockersIdx).toBeLessThan(responseIdx);
  });

  it("appends KNOWN BLOCKERS and RECENT CURRICULUM for math quests", () => {
    const prompt = buildQuestPrompt("math", 3, "math", {
      activeBlockers: [
        {
          id: "multiplication-2s",
          name: "Times tables — 2s",
          status: "ADDRESS_NOW",
          affectedSkills: ["math.multiplication.2s"],
        },
      ],
      hasRecentScans: false,
    });
    expect(prompt).toContain("## KNOWN BLOCKERS");
    expect(prompt).not.toContain("## RECENT CURRICULUM");
    expect(prompt).toContain("TARGETED BLOCKER FIELD");
    expect(prompt).toContain('"targetedBlockerId": null');
  });

  it("omits KNOWN BLOCKERS when no blockers are provided", () => {
    const prompt = buildQuestPrompt("reading", 2, "phonics", {
      activeBlockers: [],
      hasRecentScans: false,
    });
    expect(prompt).not.toContain("## KNOWN BLOCKERS");
    // targetedBlockerId field still appears in RESPONSE FORMAT so the AI knows the schema.
    expect(prompt).toContain("targetedBlockerId");
  });
});

// ── FEAT-04: build-the-word (encoding) generation guidance ──────

describe("buildQuestPrompt — build-the-word (FEAT-04)", () => {
  const extras = { activeBlockers: [], hasRecentScans: false };

  it("instructs the phonics quest to emit calibrated, checkable build-word questions", () => {
    const prompt = buildQuestPrompt("reading", 3, "phonics", extras, "Lincoln");
    // The encoding question type is taught.
    expect(prompt).toContain("BUILD-THE-WORD");
    expect(prompt).toContain('"type": "build-word"');
    expect(prompt).toContain('"targetWord"');
    expect(prompt).toContain('"tiles"');
    // Level calibration (CVC low, digraphs/blends higher).
    expect(prompt).toContain("Levels 1-2: CVC words");
    expect(prompt).toContain("Levels 3-4: digraphs/blends");
    // Checkability guarantee: tiles must spell the target.
    expect(prompt).toContain("EXACTLY spells the target word");
    // No-typing / don't-leak-answer guardrails.
    expect(prompt).toContain("must build it from the sound");
  });

  it("does not offer build-word to the comprehension quest (decoding-free surface)", () => {
    const prompt = buildQuestPrompt("reading", 2, "comprehension", extras, "London");
    expect(prompt).not.toContain("BUILD-THE-WORD");
    expect(prompt).not.toContain('"type": "build-word"');
  });
});

// ── G55: childName templating ──────────────────────────────────

describe("buildQuestPrompt — childName templating (G55)", () => {
  const extras = { activeBlockers: [], hasRecentScans: false };

  it("phonics prompt uses Lincoln when childName=Lincoln and never names another child", () => {
    const prompt = buildQuestPrompt("reading", 4, "phonics", extras, "Lincoln");
    expect(prompt).toContain("Lincoln");
    expect(prompt).not.toContain("London");
  });

  it("phonics prompt uses London when childName=London and never names another child", () => {
    const prompt = buildQuestPrompt("reading", 2, "phonics", extras, "London");
    expect(prompt).toContain("London");
    expect(prompt).not.toContain("Lincoln");
  });

  it("comprehension prompt addresses London (no Lincoln) when childName=London", () => {
    const prompt = buildQuestPrompt("reading", 2, "comprehension", extras, "London");
    expect(prompt).toContain("London");
    expect(prompt).not.toContain("Lincoln");
  });

  it("comprehension prompt addresses Lincoln when childName=Lincoln", () => {
    const prompt = buildQuestPrompt("reading", 4, "comprehension", extras, "Lincoln");
    expect(prompt).toContain("Lincoln");
    expect(prompt).not.toContain("London");
  });

  it("math prompt addresses London (no Lincoln) when childName=London", () => {
    const prompt = buildQuestPrompt("math", 3, "math", extras, "London");
    expect(prompt).toContain("London");
    expect(prompt).not.toContain("Lincoln");
  });

  it("math prompt addresses Lincoln when childName=Lincoln", () => {
    const prompt = buildQuestPrompt("math", 3, "math", extras, "Lincoln");
    expect(prompt).toContain("Lincoln");
    expect(prompt).not.toContain("London");
  });

  it("falls back to a neutral placeholder when childName is omitted", () => {
    const prompt = buildQuestPrompt("reading", 2, "phonics", extras);
    expect(prompt).not.toContain("Lincoln");
    expect(prompt).not.toContain("London");
    expect(prompt).toContain("the child");
  });
});

// ── G54: math STARTING LEVEL directive ────────────────────────

describe("buildQuestPrompt — math STARTING LEVEL (G54)", () => {
  const extras = { activeBlockers: [], hasRecentScans: false };

  it("injects STARTING LEVEL directive into the math prompt when startingLevel is provided", () => {
    const prompt = buildQuestPrompt("math", 4, "math", extras, "Lincoln");
    expect(prompt).toContain("STARTING LEVEL");
    expect(prompt).toContain("Level 4");
  });

  it("caps the math STARTING LEVEL at 6 (QUEST_MODE_LEVEL_CAP.math)", () => {
    const prompt = buildQuestPrompt("math", 9, "math", extras, "Lincoln");
    expect(prompt).toContain("STARTING LEVEL");
    expect(prompt).toContain("Level 6");
    // The raw 9 should not appear as a level instruction
    expect(prompt).not.toMatch(/Start the quest at Level 9/);
  });

  it("omits the STARTING LEVEL directive block when startingLevel is undefined for math", () => {
    const prompt = buildQuestPrompt("math", undefined, "math", extras, "Lincoln");
    // The directive block declares mastery and an explicit "Start the quest at Level N".
    expect(prompt).not.toMatch(/STARTING LEVEL:\s*This child has demonstrated/);
    expect(prompt).not.toMatch(/Start the quest at Level \d/);
  });

  it("references STARTING LEVEL in math ADAPTIVE BEHAVIOR (parity with phonics/comprehension)", () => {
    const prompt = buildQuestPrompt("math", 3, "math", extras, "Lincoln");
    expect(prompt).toMatch(/begin at the STARTING LEVEL if specified/);
  });
});

// ── G26: math guided evaluation prompt ─────────────────────────

describe("buildEvaluationPrompt — math (G26)", () => {
  it("emits a non-empty math evaluation prompt with the diagnostic role", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toContain("diagnostic math specialist");
  });

  it("addresses the child by templated name (Lincoln)", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt).toContain("Lincoln");
  });

  it("addresses London when childName=London and never mentions Lincoln (G55 inheritance)", () => {
    const prompt = buildEvaluationPrompt("math", "London");
    expect(prompt).toContain("London");
    expect(prompt).not.toContain("Lincoln");
  });

  it("includes the shared math concept bands (L1-L6) verbatim", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    for (const band of MATH_CONCEPT_BANDS) {
      expect(prompt).toContain(band);
    }
  });

  it("teaches the AI to emit <finding> and <complete> blocks", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt).toContain("<finding>");
    expect(prompt).toContain("</finding>");
    expect(prompt).toContain("<complete>");
    expect(prompt).toContain("</complete>");
  });

  it("includes completion criteria gating on ceiling + struggle-above signal", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt).toContain("COMPLETION CRITERIA");
    expect(prompt).toMatch(/mastered.*ceiling/i);
    expect(prompt).toMatch(/(emerging|not-yet).*next level/i);
  });

  it("includes 'no shame' evidence-based framing", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt).toMatch(/No grades.*no rankings|evidence-based/i);
  });

  it("provides math-specific skill tags for findings extraction", () => {
    const prompt = buildEvaluationPrompt("math", "Lincoln");
    expect(prompt).toContain("math.addition.within-20");
    expect(prompt).toContain("math.subtraction.within-20");
    expect(prompt).toContain("math.fractions");
  });
});

// ── Story Generation V2 Phase 1: buildPageBeats ────────────────

describe("buildPageBeats", () => {
  it("returns the full 6-beat arc for a 6-page story with no climax language", () => {
    const beats = buildPageBeats(6);
    expect(beats).toContain("PAGE BEATS:");
    expect(beats).toContain("1. Meet the hero.");
    expect(beats).toContain("6. The happy ending.");
    // 6-beat arc must not use the 10-beat-only climax phrasing
    expect(beats).not.toContain("Tension peaks");
    // Should have exactly 6 numbered beats
    const numbered = beats.match(/^\d+\./gm) ?? [];
    expect(numbered).toHaveLength(6);
  });

  it("truncates the 6-beat arc when fewer than 6 pages", () => {
    const beats = buildPageBeats(3);
    const numbered = beats.match(/^\d+\./gm) ?? [];
    expect(numbered).toHaveLength(3);
    expect(beats).toContain("1. Meet the hero.");
    expect(beats).toContain("2. The problem arrives");
    expect(beats).toContain("3. The hero tries something.");
    // Beat 4+ should not appear
    expect(beats).not.toMatch(/^4\./m);
  });

  it("returns the full 10-beat arc for a 10-page story including 'Tension peaks'", () => {
    const beats = buildPageBeats(10);
    const numbered = beats.match(/^\d+\./gm) ?? [];
    expect(numbered).toHaveLength(10);
    expect(beats).toContain("Tension peaks");
    expect(beats).toContain("1. Meet the hero in their world.");
    expect(beats).toContain("10. A satisfying close.");
  });

  it("scales proportionally beyond 10 pages with anchored climax/resolution", () => {
    const beats = buildPageBeats(14);
    const numbered = beats.match(/^\d+\./gm) ?? [];
    expect(numbered).toHaveLength(14);
    // Rising-action middle range expands
    expect(beats).toContain("Rising action beat 1");
    // Anchored tail still present
    expect(beats).toContain("Tension peaks");
    // Resolution + close are at the END, not floating mid-story
    expect(beats).toMatch(/13\.\s+The resolution\./);
    expect(beats).toMatch(/14\.\s+A satisfying close\./);
  });
});

// ── Story Generation V2 Phase 1: buildStoryPrompt ──────────────

describe("buildStoryPrompt", () => {
  const londonInput = {
    storyIdea: "a dragon who can't fly",
    words: ["the", "and", "go"],
    pageCount: 6,
    childName: "London",
    childAge: 6,
    childInterests: "animals, drawing, fairy tales",
  };

  const lincolnInput = {
    storyIdea: "a hero who defeats a giant cube monster",
    words: [],
    pageCount: 10,
    childName: "Lincoln",
    childAge: 10,
    childInterests: "Minecraft, dragons, quests",
  };

  it("opens with the child's name, age, and interests", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("London");
    expect(p).toContain("6-year-old");
    expect(p).toContain("animals, drawing, fairy tales");
  });

  it("includes the story idea verbatim when provided", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("STORY IDEA: a dragon who can't fly");
  });

  it("uses the age-appropriate fallback for London when the idea is empty", () => {
    const p = buildStoryPrompt({ ...londonInput, storyIdea: "" });
    expect(p).toContain("A fun story with animals and a happy ending");
  });

  it("uses the age-appropriate fallback for Lincoln when the idea is empty", () => {
    const p = buildStoryPrompt({ ...lincolnInput, storyIdea: "" });
    expect(p).toContain("A fun adventure — surprise me!");
  });

  it("never mentions CVC in a Lincoln (age 10) prompt", () => {
    const p = buildStoryPrompt(lincolnInput);
    expect(p).not.toContain("CVC");
    expect(p).not.toMatch(/CVC words are great/i);
  });

  it("uses age-appropriate content stakes language for Lincoln", () => {
    const p = buildStoryPrompt(lincolnInput);
    expect(p).toContain("real problems, real heroes, no toddler scenarios");
  });

  it("targets shorter sentences for London (5-9 words) and longer for Lincoln (8-14)", () => {
    const londonP = buildStoryPrompt(londonInput);
    const lincolnP = buildStoryPrompt(lincolnInput);
    expect(londonP).toContain("1-2 short sentences (5-9 words each)");
    expect(lincolnP).toContain("2-4 sentences (8-14 words each)");
  });

  it("uses the soft sight-word rule when words are present and never 'MUST use every word'", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("Weave 3-5 of them into the story where they fit naturally");
    expect(p).toContain("DO NOT force every word in");
    expect(p).toContain("If a word doesn't fit, leave it out");
    // Old hard rule must be gone
    expect(p).not.toMatch(/MUST use every word/i);
    expect(p).not.toMatch(/use every word at least once/i);
  });

  it("omits the sight-word section when words is empty", () => {
    const p = buildStoryPrompt(lincolnInput);
    expect(p).not.toContain("SIGHT WORDS");
    expect(p).not.toContain("Weave 3-5");
    // It still tells the AI to calibrate vocabulary
    expect(p).toContain("VOCABULARY:");
  });

  it("references WORD MASTERY and SKILL SNAPSHOT sections above", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toMatch(/WORD MASTERY and \(if present\) SKILL SNAPSHOT sections above/);
  });

  it("includes a PAGE BEATS block", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("PAGE BEATS:");
    expect(p).toContain("1. Meet the hero.");
  });

  it("includes WRITING QUALITY guardrails", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("WRITING QUALITY:");
    expect(p).toContain("Read each page aloud");
    expect(p).toContain("Use natural dialogue");
    expect(p).toContain("Consistent character names");
    expect(p).toContain("Each page should advance the story");
    expect(p).toContain("Avoid run-on sentences");
    expect(p).toContain("No typos");
    expect(p).toContain("ending should answer the beginning");
  });

  it("preserves the COPYRIGHT block", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain("COPYRIGHT — IMPORTANT:");
    expect(p).toContain("Never use copyrighted character names");
    expect(p).toContain("Princess Coral");
    expect(p).toContain("Marco");
  });

  it("preserves the output JSON contract fields useBookGenerator parses", () => {
    const p = buildStoryPrompt(londonInput);
    expect(p).toContain('"title"');
    expect(p).toContain('"pages"');
    expect(p).toContain('"pageNumber"');
    expect(p).toContain('"text"');
    expect(p).toContain('"sceneDescription"');
    expect(p).toContain('"wordsOnPage"');
    expect(p).toContain('"allWordsUsed"');
    expect(p).toContain('"missedWords"');
  });

  it("adds the new optional qualityNotes field to the JSON schema", () => {
    const withWords = buildStoryPrompt(londonInput);
    const noWords = buildStoryPrompt(lincolnInput);
    expect(withWords).toContain('"qualityNotes"');
    expect(noWords).toContain('"qualityNotes"');
  });

  it("does not use copyrighted character names in the JSON example", () => {
    const p = buildStoryPrompt(lincolnInput);
    // The old example used Nintendo's "Link" — replaced with an original name.
    expect(p).not.toMatch(/"text":\s*"[^"]*\bLink\b/);
  });

  it("threads theme guidance into the prompt when provided", () => {
    const p = buildStoryPrompt({
      ...londonInput,
      themeGuidance: {
        storyTone: "whimsical and magical with wonder",
        storyWorldDescription: "an enchanted realm with dragons and fairies",
        storyVocabularyLevel: "medium complexity with descriptive fantasy words",
        imageStylePrefix: "A magical fantasy scene.",
      },
    });
    expect(p).toContain("THEME GUIDANCE:");
    expect(p).toContain("an enchanted realm with dragons and fairies");
    expect(p).toContain("whimsical and magical");
    expect(p).toContain("A magical fantasy scene.");
  });

  it("falls back to age 10 when childAge is undefined", () => {
    const p = buildStoryPrompt({
      ...lincolnInput,
      childAge: undefined,
    });
    expect(p).toContain("10-year-old");
    // And uses the age-10 calibration (no CVC anywhere)
    expect(p).not.toContain("CVC");
    expect(p).toContain("real problems, real heroes");
  });
});

// ── Story Generation V2 Phase 2 PR-A: buildReviseStoryPrompt ───

describe("buildReviseStoryPrompt", () => {
  const baseLondon: ReviseStoryInput = {
    chatHistory: [
      { role: "kid", content: "a dragon who can't fly" },
      { role: "ai", content: "Here's your story!" },
    ],
    currentStory: {
      title: "Ember the Dragon",
      pages: [
        {
          pageNumber: 1,
          text: "Ember the dragon could not fly.",
          sceneDescription: "A small green dragon on a mossy hill at dawn.",
          wordsOnPage: ["the", "and"],
        },
        {
          pageNumber: 2,
          text: "She flapped her tiny wings, but stayed on the ground.",
          sceneDescription: "The dragon flapping her wings hard in a meadow.",
        },
      ],
    },
    childCalibration: {
      childAge: 6,
      childName: "London",
      illustrationStyle: "storybook",
      pageCount: 6,
    },
    newFeedback: "Make the dragon a girl named Sparkle.",
  };

  const baseLincoln: ReviseStoryInput = {
    ...baseLondon,
    childCalibration: {
      childAge: 10,
      childName: "Lincoln",
      illustrationStyle: "minecraft",
      pageCount: 10,
    },
  };

  it("opens with the child's name and age", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("London");
    expect(p).toContain("age 6");
  });

  it("embeds the CHAT HISTORY section with each turn", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("CHAT HISTORY:");
    expect(p).toContain("a dragon who can't fly");
    expect(p).toContain("Here's your story!");
  });

  it("renders an empty CHAT HISTORY block when no prior turns exist", () => {
    const p = buildReviseStoryPrompt({ ...baseLondon, chatHistory: [] });
    expect(p).toContain("CHAT HISTORY:");
    expect(p).toContain("(no prior turns)");
  });

  it("includes a LATEST MESSAGE section with the new feedback verbatim", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("LATEST MESSAGE FROM London:");
    expect(p).toContain("Make the dragon a girl named Sparkle.");
  });

  it("embeds every current-story page with its text and scene", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("PAGE 1:");
    expect(p).toContain("Ember the dragon could not fly.");
    expect(p).toContain("A small green dragon on a mossy hill at dawn.");
    expect(p).toContain("PAGE 2:");
    expect(p).toContain("She flapped her tiny wings, but stayed on the ground.");
    expect(p).toContain("The dragon flapping her wings hard in a meadow.");
  });

  it("includes wordsOnPage for pages that have one", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("WORDS ON PAGE: the, and");
  });

  it("reuses the WRITING QUALITY guardrails block", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("WRITING QUALITY:");
    expect(p).toContain("Consistent character names");
    expect(p).toContain("No typos. No misspellings");
  });

  it("reuses the COPYRIGHT block (Mario → Marco example present)", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("COPYRIGHT — IMPORTANT:");
    expect(p).toContain("Mario");
    expect(p).toContain("Marco");
  });

  it("calibrates London (age 6) with short-sentence target", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("1-2 short sentences (5-9 words each)");
  });

  it("calibrates Lincoln (age 10) with longer sentence + content-stakes language", () => {
    const p = buildReviseStoryPrompt(baseLincoln);
    expect(p).toContain("2-4 sentences (8-14 words each)");
    expect(p).toContain("real problems, real heroes");
  });

  it("never calibrates Lincoln with CVC-style infantilizing language", () => {
    const p = buildReviseStoryPrompt(baseLincoln);
    expect(p).not.toContain("CVC");
  });

  it("includes the illustration style and page count in the prompt", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain("ILLUSTRATION STYLE: storybook");
    expect(p).toContain("PAGE COUNT: 6");
  });

  it("instructs the AI not to change page count", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toMatch(/do not add or remove pages/i);
  });

  it("describes the conversational-vs-revision dispatch", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toMatch(/conversational/i);
    expect(p).toContain('storyUpdated to false');
  });

  it("output schema declares humanResponse, storyUpdated, updatedStory, pagesNeedingImageRegen", () => {
    const p = buildReviseStoryPrompt(baseLondon);
    expect(p).toContain('"humanResponse"');
    expect(p).toContain('"storyUpdated"');
    expect(p).toContain('"updatedStory"');
    expect(p).toContain('"pagesNeedingImageRegen"');
  });

  it("uses the full chat history (does not silently drop turns)", () => {
    const p = buildReviseStoryPrompt({
      ...baseLondon,
      chatHistory: [
        { role: "kid", content: "first turn" },
        { role: "ai", content: "second turn" },
        { role: "kid", content: "third turn" },
        { role: "ai", content: "fourth turn" },
      ],
    });
    expect(p).toContain("first turn");
    expect(p).toContain("second turn");
    expect(p).toContain("third turn");
    expect(p).toContain("fourth turn");
  });
});

// ── Story Generation V2 Phase 2 PR-B: buildRevisePagePrompt ────

describe("buildRevisePagePrompt", () => {
  const baseLondon: RevisePageInput = {
    pageNumber: 2,
    currentText: "She flapped her tiny wings, but stayed on the ground.",
    currentSceneDescription: "The dragon flapping her wings hard in a meadow.",
    feedback: "Make the dragon a girl named Sparkle.",
    fullStoryContext: {
      title: "Ember the Dragon",
      allPages: [
        { pageNumber: 1, text: "Ember the dragon could not fly." },
        {
          pageNumber: 2,
          text: "She flapped her tiny wings, but stayed on the ground.",
        },
        { pageNumber: 3, text: "Then a wise owl gave her an idea." },
      ],
      characterNames: ["Ember"],
    },
    childCalibration: {
      childAge: 6,
      childName: "London",
      sentenceTarget: "1-2 short sentences (5-9 words each)",
      vocabularyLevel: "kindergarten",
    },
  };

  const baseLincoln: RevisePageInput = {
    ...baseLondon,
    childCalibration: {
      childAge: 10,
      childName: "Lincoln",
      sentenceTarget: "2-4 sentences (8-14 words each)",
      vocabularyLevel: "1st-2nd grade decoding",
    },
  };

  it("includes the child name and age in the calibration section", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("London");
    expect(p).toContain("age 6");
  });

  it("states LISTENER FEEDBACK with the feedback verbatim", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain('LISTENER FEEDBACK: "Make the dragon a girl named Sparkle."');
  });

  it("embeds the full story context (all pages with text)", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("Ember the dragon could not fly.");
    expect(p).toContain("She flapped her tiny wings, but stayed on the ground.");
    expect(p).toContain("Then a wise owl gave her an idea.");
  });

  it("makes the page number to revise explicit", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("REVISE THIS PAGE");
    expect(p).toMatch(/Apply the feedback to PAGE 2 ONLY/);
  });

  it("reuses the WRITING QUALITY guardrails block", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("WRITING QUALITY:");
    expect(p).toContain("Consistent character names");
  });

  it("reuses the COPYRIGHT block (Mario → Marco example present)", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("COPYRIGHT — IMPORTANT:");
    expect(p).toContain("Mario");
    expect(p).toContain("Marco");
  });

  it("declares the output schema (newText, newSceneDescription, wordsOnPage, regenerateImage, qualityNotes)", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain('"newText"');
    expect(p).toContain('"newSceneDescription"');
    expect(p).toContain('"wordsOnPage"');
    expect(p).toContain('"regenerateImage"');
    expect(p).toContain('"qualityNotes"');
  });

  it("instructs the model to decide regenerateImage", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toMatch(/DECIDE regenerateImage/);
    expect(p).toContain('"yes"');
    expect(p).toContain('"no"');
  });

  it("calibrates London (age 6) with a short-sentence target", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("1-2 short sentences (5-9 words each)");
  });

  it("calibrates Lincoln (age 10) with longer sentences + content-stakes language", () => {
    const p = buildRevisePagePrompt(baseLincoln);
    expect(p).toContain("2-4 sentences (8-14 words each)");
    expect(p).toContain("real problems, real heroes");
  });

  it("never calibrates Lincoln with CVC-style infantilizing language", () => {
    const p = buildRevisePagePrompt(baseLincoln);
    expect(p).not.toContain("CVC");
  });

  it("includes character names when provided", () => {
    const p = buildRevisePagePrompt(baseLondon);
    expect(p).toContain("CHARACTER NAMES");
    expect(p).toContain("Ember");
  });
});
