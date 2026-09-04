import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

// ── Hoisted mocks (same shape as generateStory.readability.test.ts) ──

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

import { handleGenerateStory, toReadabilityInfo } from "../generateStory.js";
import { checkStoryReadability } from "../../storyDecodability.js";

function makeDb() {
  return {
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ birthdate: "2016-01-01" }) }),
    }),
    collection: () => ({ get: async () => ({ docs: [] }) }),
  } as unknown as ChatTaskContext["db"];
}

function makeCtx(storyConfig: Record<string, unknown>): ChatTaskContext {
  return {
    db: makeDb(),
    familyId: "fam-1",
    childId: "child-1",
    childData: { name: "Lincoln" },
    // Assessed Level 2 — the reported case: "Tom had a map. He was in the hut."
    snapshotData: {
      workingLevels: {
        phonics: { level: 2, updatedAt: "2026-09-01T00:00:00.000Z", source: "quest" },
      },
    },
    messages: [{ role: "user", content: JSON.stringify(storyConfig) }],
    domain: undefined,
    apiKey: "test-key",
  } as ChatTaskContext;
}

function story(pages: string[]) {
  return JSON.stringify({
    title: "The Ship",
    pages: pages.map((text, i) => ({
      pageNumber: i + 1,
      text,
      sceneDescription: "a sunny spot",
    })),
  });
}

/** Digraphs and blends: above Level 2, exactly at Level 3. */
const LEVEL_3 = ["The ship is black.", "Chip has a chin.", "That was a big shed."];

function reply(text: string) {
  return { text, inputTokens: 100, outputTokens: 200, stopReason: "end_turn" };
}

const BASE_CONFIG = { storyIdea: "a ship", pageCount: 3, words: [] };

beforeEach(() => {
  vi.clearAllMocks();
  buildContextForTaskMock.mockResolvedValue([]);
});

describe("handleGenerateStory — the per-story stretch (FEAT-191)", () => {
  it("threads `levelStretch` from the config into the prompt the model is given", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(LEVEL_3)));

    await handleGenerateStory(makeCtx({ ...BASE_CONFIG, levelStretch: 1 }));

    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("write this story at phonics Level 3");
    expect(prompt).toContain("Lincoln decodes at Level 2");
    expect(prompt).toContain("one step up");
  });

  it("checks the story at the level it was written at — no fix call, and it passes", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(LEVEL_3)));

    const result = await handleGenerateStory(makeCtx({ ...BASE_CONFIG, levelStretch: 1 }));

    // The ONE thing this feature has to get right: raising the ceiling raised
    // the ruler, so the words the parent asked for are not then flagged.
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(result.readability).toMatchObject({
      passed: true,
      phonicsLevel: 3,
      stretch: 1,
      revised: false,
    });
  });

  it("still flags the same story when no stretch was asked for", async () => {
    callClaudeMock.mockResolvedValue(reply(story(LEVEL_3)));

    const result = await handleGenerateStory(makeCtx(BASE_CONFIG));

    expect(result.readability).toMatchObject({ passed: false, phonicsLevel: 2, stretch: 0 });
  });

  it("reports the stretch on the response so the draft line can say why", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(LEVEL_3)));
    const result = await handleGenerateStory(makeCtx({ ...BASE_CONFIG, levelStretch: 2 }));
    expect(result.readability?.stretch).toBe(2);
    expect(result.readability?.phonicsLevel).toBe(4);
  });

  it("writes no level: the assessed number is only ever read", async () => {
    callClaudeMock.mockResolvedValueOnce(reply(story(LEVEL_3)));
    const ctx = makeCtx({ ...BASE_CONFIG, levelStretch: 2 });
    await handleGenerateStory(ctx);
    // The only writes the handler makes are the usage records.
    expect(logAiUsageMock).toHaveBeenCalled();
    expect(ctx.snapshotData?.workingLevels?.phonics.level).toBe(2);
  });

  it("logs the stretch", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    callClaudeMock.mockResolvedValueOnce(reply(story(LEVEL_3)));

    await handleGenerateStory(makeCtx({ ...BASE_CONFIG, levelStretch: 1 }));

    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("generateStory"));
    expect(line).toContain("stretch=1");
    expect(line).toContain("readabilityLevel=3");
    log.mockRestore();
  });

  it("logs stretch=0 for an ordinary story", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    callClaudeMock.mockResolvedValue(reply(story(LEVEL_3)));

    await handleGenerateStory(makeCtx(BASE_CONFIG));

    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("generateStory"));
    expect(line).toContain("stretch=0");
    log.mockRestore();
  });
});

describe("toReadabilityInfo carries the stretch", () => {
  const report = checkStoryReadability([{ pageNumber: 1, text: "Sam has a hat." }], {
    phonicsLevel: 3,
  });

  it("reports what was asked for", () => {
    expect(toReadabilityInfo(report, false, 2).stretch).toBe(2);
  });

  it("defaults to 0, so an unstretched story reports exactly what it always did", () => {
    expect(toReadabilityInfo(report, false).stretch).toBe(0);
  });

  it("clamps a nonsense value rather than passing it to the client", () => {
    expect(toReadabilityInfo(report, false, 99).stretch).toBe(2);
  });
});
