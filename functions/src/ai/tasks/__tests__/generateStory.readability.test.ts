import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

// ── Hoisted mocks ─────────────────────────────────────────────────

const { callClaudeMock, logAiUsageMock, buildContextForTaskMock } = vi.hoisted(() => ({
  callClaudeMock: vi.fn(),
  logAiUsageMock: vi.fn(async () => undefined),
  buildContextForTaskMock: vi.fn(async () => [] as string[]),
}));

vi.mock("../../chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../chatTypes.js")>();
  return { ...actual, callClaude: callClaudeMock, logAiUsage: logAiUsageMock };
});

vi.mock("../../contextSlices.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../contextSlices.js")>();
  return { ...actual, buildContextForTask: buildContextForTaskMock };
});

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Import AFTER mocks are set up.
import {
  MAX_REPORTED_HARD_WORDS,
  handleGenerateStory,
  hardWordsByPage,
  mergeFixedStory,
  parseStoryForReadability,
  shouldKeepFixedStory,
  toReadabilityInfo,
} from "../generateStory.js";
import { checkStoryReadability, CORE_SIGHT_WORDS } from "../../storyDecodability.js";

// ── Firestore stub ────────────────────────────────────────────────

/**
 * `handleGenerateStory` reads the child doc (for the birthdate) and, since
 * FEAT-176, `sightWordProgress` (for the allowlist). Both are stubbed here; the
 * `chat` slices are mocked away above.
 */
function makeDb(options: { birthdate?: string; sightWords?: Array<[string, string]> } = {}) {
  const { birthdate = "2020-01-01", sightWords = [] } = options;
  return {
    doc: () => ({
      get: async () => ({
        exists: true,
        data: () => ({ birthdate, interests: "dragons" }),
      }),
    }),
    collection: () => ({
      get: async () => ({
        docs: sightWords.map(([word, masteryLevel], i) => ({
          id: `child-1_${i}`,
          data: () => ({ word, masteryLevel }),
        })),
      }),
    }),
  } as unknown as ChatTaskContext["db"];
}

function makeCtx(
  storyConfig: Record<string, unknown>,
  dbOptions?: Parameters<typeof makeDb>[0],
  workingLevels?: Record<string, { level: number }>,
): ChatTaskContext {
  return {
    db: makeDb(dbOptions),
    familyId: "fam-1",
    childId: "child-1",
    childData: { name: "London" },
    snapshotData: workingLevels ? { workingLevels } : undefined,
    messages: [{ role: "user", content: JSON.stringify(storyConfig) }],
    domain: undefined,
    apiKey: "test-key",
  } as ChatTaskContext;
}

function story(pages: string[], title = "Sam and the Hat") {
  return JSON.stringify({
    title,
    pages: pages.map((text, i) => ({
      pageNumber: i + 1,
      text,
      sceneDescription: "a sunny spot",
    })),
  });
}

const EASY = ["Sam has a red hat.", "The hat is big.", "Sam can hop."];
const HARD = [
  "London stood before the enormous castle gates.",
  "The dragon guardian was ready to challenge him.",
  "Together they journeyed beyond the shimmering mountains.",
];
/** Above Level 2 (r-controlled, diphthongs, two syllables) but fine at Level 7. */
const MEDIUM = [
  "Marco ran to the farm.",
  "The rabbit had a basket of corn.",
  "He found a coin in the cloud.",
];

function reply(text: string, stopReason = "end_turn") {
  return { text, inputTokens: 100, outputTokens: 200, stopReason };
}

const CONFIG = { storyIdea: "a dragon", pageCount: 3, words: [] };

beforeEach(() => {
  vi.clearAllMocks();
  buildContextForTaskMock.mockResolvedValue([]);
});

// ── The handler ───────────────────────────────────────────────────

describe("handleGenerateStory readability pass (FEAT-176)", () => {
  it("makes NO fix call when the drafted story already reads at the level", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(EASY)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(result.readability).toMatchObject({ passed: true, revised: false });
    expect(result.readability?.hardWords).toEqual([]);
    expect(result.message).toBe(story(EASY));
  });

  it("makes EXACTLY ONE fix call when the story is above the level, and never loops", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story(EASY)))
      .mockResolvedValue(reply(story(HARD)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    expect(result.readability).toMatchObject({ passed: true, revised: true });
    expect(result.message).toBe(story(EASY));
  });

  it("hands the fix call the failing words and the reading level block, and nothing else", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story(EASY)));

    await handleGenerateStory(makeCtx(CONFIG));

    const fixPrompt = callClaudeMock.mock.calls[1][0].systemPrompt as string;
    expect(fixPrompt).toContain("WORDS THAT ARE TOO HARD, by page:");
    expect(fixPrompt).toContain("castle");
    expect(fixPrompt).toContain("BANNED at Level");
    expect(fixPrompt).toContain("Replace ONLY the words listed above");
    expect(fixPrompt).not.toContain("PAGE BEATS");
  });

  it("keeps the ORIGINAL when the fix comes back no better", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story(HARD, "Still Hard")));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    expect(result.message).toBe(story(HARD));
    expect(result.readability).toMatchObject({ passed: false, revised: false });
  });

  it("keeps the ORIGINAL when the fix drops pages — a fix is not a rewrite", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story([EASY[0]])));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(result.message).toBe(story(HARD));
    expect(result.readability?.revised).toBe(false);
  });

  it("keeps the ORIGINAL when the fix call itself throws — the story is never lost", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockRejectedValueOnce(new Error("rate limited"));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(result.message).toBe(story(HARD));
    expect(result.readability).toMatchObject({ passed: false, revised: false });
  });

  it("reports the words that are still above the level, page-tagged", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story(HARD)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(result.readability?.passed).toBe(false);
    const words = result.readability?.hardWords.map((h) => h.word) ?? [];
    expect(words).toContain("castle");
    expect(result.readability?.hardWords[0].page).toBe(1);
  });

  it("attaches NO readability report when the reply does not parse into pages", async () => {
    // Every FEAT-169 failure path is unchanged: unparseable text flows through
    // exactly as before, with no fix attempt.
    callClaudeMock.mockResolvedValueOnce(reply("I had trouble writing that", "max_tokens"));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(result.readability).toBeUndefined();
    expect(result.stopReason).toBe("max_tokens");
    expect(result.message).toBe("I had trouble writing that");
  });

  it("checks against the ASSESSED level when one is on file — the same story passes at 7 and fails at 2", async () => {
    // r-controlled, diphthongs and two-syllable words: above Level 2, fine at 7.
    callClaudeMock.mockResolvedValueOnce(reply(story(MEDIUM)));
    const atSeven = await handleGenerateStory(
      makeCtx(CONFIG, undefined, { phonics: { level: 7 } }),
    );
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(atSeven.readability).toMatchObject({
      phonicsLevel: 7,
      levelSource: "assessed",
      passed: true,
    });

    vi.clearAllMocks();
    callClaudeMock.mockResolvedValue(reply(story(MEDIUM)));
    const atTwo = await handleGenerateStory(makeCtx(CONFIG, undefined, { phonics: { level: 2 } }));
    expect(atTwo.readability).toMatchObject({
      phonicsLevel: 2,
      levelSource: "assessed",
      passed: false,
    });
  });

  it("falls back to a low level by age when none is on file, and marks it an estimate", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(EASY)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(result.readability).toMatchObject({ phonicsLevel: 2, levelSource: "age" });
  });

  it("treats the child's own sight words as safe at any level", async () => {
    const pages = ["The dragon flew over the castle.", "Sam can hop.", "The hat is big."];
    callClaudeMock.mockResolvedValue(reply(story(pages)));

    const withoutWords = await handleGenerateStory(makeCtx(CONFIG));
    expect(withoutWords.readability?.passed).toBe(false);

    vi.clearAllMocks();
    callClaudeMock.mockResolvedValue(reply(story(pages)));
    const withWords = await handleGenerateStory(
      makeCtx(CONFIG, {
        sightWords: [
          ["dragon", "mastered"],
          ["flew", "mastered"],
          ["over", "familiar"],
          ["castle", "practicing"],
        ],
      }),
    );
    expect(withWords.readability?.passed).toBe(true);
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
  });

  it("prints the child's own words into the SAFE WORDS block of the generation prompt", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(EASY)));

    await handleGenerateStory(
      makeCtx({ ...CONFIG, words: ["pretty", "eight"] }, { sightWords: [["mop", "mastered"]] }),
    );

    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("SAFE WORDS");
    expect(prompt).toContain("mop");
    expect(prompt).toContain("pretty");
    expect(prompt).toContain("eight");
  });

  it("bills BOTH calls when a fix runs, and one when it does not", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(story(HARD)))
      .mockResolvedValueOnce(reply(story(EASY)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(logAiUsageMock).toHaveBeenCalledTimes(2);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 400 });

    vi.clearAllMocks();
    callClaudeMock.mockResolvedValueOnce(reply(story(EASY)));
    const clean = await handleGenerateStory(makeCtx(CONFIG));
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    expect(clean.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
  });
});

// ── The pure pieces the handler leans on ──────────────────────────

describe("parseStoryForReadability", () => {
  it("reads a story out of fenced or preambled JSON, and returns null for anything else", () => {
    expect(parseStoryForReadability(story(EASY))?.pages).toHaveLength(3);
    expect(parseStoryForReadability("```json\n" + story(EASY) + "\n```")?.title).toBe(
      "Sam and the Hat",
    );
    expect(parseStoryForReadability("not json")).toBeNull();
    expect(parseStoryForReadability('{"title":"T"}')).toBeNull();
    expect(parseStoryForReadability('{"title":"T","pages":[]}')).toBeNull();
    expect(parseStoryForReadability("")).toBeNull();
  });
});

describe("shouldKeepFixedStory", () => {
  const opts = { phonicsLevel: 2, allowedWords: CORE_SIGHT_WORDS };
  const original = checkStoryReadability(
    HARD.map((text, i) => ({ pageNumber: i + 1, text })),
    opts,
  );
  const better = checkStoryReadability(
    EASY.map((text, i) => ({ pageNumber: i + 1, text })),
    opts,
  );

  it("keeps a fix only when it parsed, kept the page count, and has strictly fewer hard words", () => {
    expect(shouldKeepFixedStory(original, better, 3, 3)).toBe(true);
    expect(shouldKeepFixedStory(original, null, 3, 3)).toBe(false);
    expect(shouldKeepFixedStory(original, better, 3, 2)).toBe(false);
    expect(shouldKeepFixedStory(original, original, 3, 3)).toBe(false);
    expect(shouldKeepFixedStory(better, original, 3, 3)).toBe(false);
  });
});

describe("hardWordsByPage / toReadabilityInfo", () => {
  it("groups the failing words by page for the fix prompt, skipping clean pages", () => {
    const report = checkStoryReadability(
      [
        { pageNumber: 1, text: "Sam can hop." },
        { pageNumber: 2, text: "The castle was enormous." },
      ],
      { phonicsLevel: 2, allowedWords: CORE_SIGHT_WORDS },
    );
    const grouped = hardWordsByPage(report);
    expect(grouped.map((g) => g.page)).toEqual([2]);
    expect(grouped[0].words).toContain("castle");
  });

  it("caps how many hard words the client is handed", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      pageNumber: i + 1,
      text: "castle journey enormous",
    }));
    const report = checkStoryReadability(many, {
      phonicsLevel: 2,
      allowedWords: CORE_SIGHT_WORDS,
    });
    expect(toReadabilityInfo(report, false).hardWords.length).toBeLessThanOrEqual(12);
  });
});

// ── Codex review round (PR #1737) ─────────────────────────────────

describe("the readability pass preserves the whole story shape (Codex P1)", () => {
  const withTopLevelFields = (pages: string[]) =>
    JSON.stringify({
      title: "Sam and the Hat",
      pages: pages.map((text, i) => ({
        pageNumber: i + 1,
        text,
        sceneDescription: "a sunny spot",
        wordsOnPage: ["the"],
      })),
      allWordsUsed: ["the", "and"],
      missedWords: ["pretty"],
      qualityNotes: "n/a",
    });

  it("keeps allWordsUsed / missedWords when a fix is accepted", async () => {
    // CreateSightWordBook reads `preview.missedWords.length` unguarded off a raw
    // JSON.parse (useStoryGenerator) — dropping the field is a TypeError there,
    // and that flow calls this same task.
    callClaudeMock
      .mockResolvedValueOnce(reply(withTopLevelFields(HARD)))
      // The fixed story omits the top-level fields, as a model well might.
      .mockResolvedValueOnce(reply(story(EASY)));

    const result = await handleGenerateStory(makeCtx(CONFIG));

    expect(result.readability?.revised).toBe(true);
    const returned = JSON.parse(result.message) as Record<string, unknown>;
    expect(returned.missedWords).toEqual(["pretty"]);
    expect(returned.allWordsUsed).toEqual(["the", "and"]);
    // The FIXED pages are the ones returned — the merge never restores pages.
    expect((returned.pages as Array<{ text: string }>)[0].text).toBe(EASY[0]);
  });

  it("hands the fix call the complete story, not a reduced view", async () => {
    callClaudeMock
      .mockResolvedValueOnce(reply(withTopLevelFields(HARD)))
      .mockResolvedValueOnce(reply(story(EASY)));

    await handleGenerateStory(makeCtx(CONFIG));

    // Assert on the STORY JSON in the prompt, not on the instruction text —
    // the "what must not change" list names these fields too, so a bare
    // `toContain` would pass even with a reduced story.
    const fixPrompt = callClaudeMock.mock.calls[1][0].systemPrompt as string;
    const storyJson = fixPrompt.slice(fixPrompt.indexOf('{"title"'));
    expect(storyJson).toContain('"missedWords":["pretty"]');
    expect(storyJson).toContain('"allWordsUsed":["the","and"]');
    expect(storyJson).toContain('"sceneDescription"');
  });
});

describe("mergeFixedStory", () => {
  it("lets fixed fields win and restores only what the fix dropped", () => {
    expect(
      mergeFixedStory(
        { title: "Old", missedWords: ["pretty"], pages: ["old"], extra: 1 },
        { title: "New", pages: ["new"] },
      ),
    ).toEqual({ title: "New", pages: ["new"], missedWords: ["pretty"], extra: 1 });
  });

  it("never restores the original pages", () => {
    const merged = mergeFixedStory({ pages: ["old"] }, { pages: ["new"] });
    expect(merged.pages).toEqual(["new"]);
    expect(mergeFixedStory({ pages: ["old"] }, {}).pages).toBeUndefined();
  });
});

describe("shouldKeepFixedStory compares the whole outcome (Codex P2)", () => {
  const opts = { phonicsLevel: 2, allowedWords: CORE_SIGHT_WORDS };
  const check = (pages: string[]) =>
    checkStoryReadability(
      pages.map((text, i) => ({ pageNumber: i + 1, text })),
      opts,
    );

  it("rejects a fix that trades several distinct hard words for one repeated many times", () => {
    // Two hard words, spread thin — one on each of two pages.
    const original = check([
      "Sam can hop by the castle.",
      "Sam can nap by the temple.",
      "Sam can sit on the mat.",
    ]);
    // ONE distinct hard word, so the old distinct-count rule would accept it —
    // but it is now eight occurrences packed onto a single page.
    const denser = check([
      "Castle castle castle castle castle castle castle castle.",
      "Sam can nap on the mat.",
      "Sam can sit on the mat.",
    ]);
    expect(denser.totalHardWords).toBeLessThan(original.totalHardWords);
    expect(denser.totalHardOccurrences).toBeGreaterThan(original.totalHardOccurrences);
    expect(shouldKeepFixedStory(original, denser, 3, 3)).toBe(false);
  });

  it("keeps a fix that actually passes the tolerance", () => {
    const original = check(HARD);
    const passing = check(EASY);
    expect(passing.passed).toBe(true);
    expect(shouldKeepFixedStory(original, passing, 3, 3)).toBe(true);
  });

  it("keeps a genuine improvement that is still short of passing", () => {
    const original = check([
      "The castle temple fountain.",
      "The castle temple fountain.",
      "The castle temple fountain.",
    ]);
    const better = check([
      "Sam can hop by the castle.",
      "Sam can nap by the pot.",
      "Sam can sit by the mat.",
    ]);
    expect(better.passed).toBe(false);
    expect(shouldKeepFixedStory(original, better, 3, 3)).toBe(true);
  });
});

describe("the hard-word total the client is given is not truncated (Codex P2)", () => {
  it("reports the true distinct count alongside the capped sample", () => {
    const many = [
      "castle temple fountain marketplace",
      "harbour cathedral monument boulevard",
      "carnival festival tournament",
      "adventure treasure mountain",
      "journey mystery",
    ];
    const report = checkStoryReadability(
      many.map((text, i) => ({ pageNumber: i + 1, text })),
      { phonicsLevel: 2, allowedWords: CORE_SIGHT_WORDS },
    );
    const info = toReadabilityInfo(report, false);
    expect(report.distinctHardWords.length).toBeGreaterThan(MAX_REPORTED_HARD_WORDS);
    expect(info.hardWords).toHaveLength(MAX_REPORTED_HARD_WORDS);
    expect(info.hardWordCount).toBe(report.distinctHardWords.length);
  });

  it("carries the count through the handler response", async () => {
    callClaudeMock.mockResolvedValue(reply(story(HARD)));
    const result = await handleGenerateStory(makeCtx(CONFIG));
    expect(result.readability?.hardWordCount).toBeGreaterThanOrEqual(
      result.readability?.hardWords.length ?? 0,
    );
  });
});
