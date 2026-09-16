import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTaskContext } from "../chatTypes.js";

const { callClaudeMock, logAiUsageMock } = vi.hoisted(() => ({
  callClaudeMock: vi.fn(),
  logAiUsageMock: vi.fn(async () => undefined),
}));

vi.mock("../chatTypes.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../chatTypes.js")>(),
  callClaude: callClaudeMock,
  logAiUsage: logAiUsageMock,
}));
vi.mock("../contextSlices.js", () => ({
  buildContextForTask: vi.fn(async () => [] as string[]),
}));

import { handleGenerateStory, resolveThemeGuidance } from "./generateStory.js";

// UX-172: existing client story guidance, restored verbatim. These assertions
// inspect the actual provider input, including the assessed reading-level rule.
const restoredThemes = [
  {
    id: "family",
    storyTone: "warm, loving, and relatable with family moments",
    storyWorldDescription: "a loving home where a family shares everyday adventures together",
    storyVocabularyLevel: "simple sentences about daily life and emotions",
  },
  {
    id: "science",
    storyTone: "curious and educational with discovery and experimentation",
    storyWorldDescription: "a world where young scientists explore nature, conduct experiments, and make discoveries",
    storyVocabularyLevel: "medium complexity with age-appropriate science vocabulary",
  },
  {
    id: "sight_words",
    storyTone: "simple and repetitive for reading practice",
    storyWorldDescription: "everyday scenes that naturally use common sight words in context",
    storyVocabularyLevel: "very simple with high-frequency sight words repeated throughout",
  },
  {
    id: "faith",
    storyTone: "gentle, reverent, and encouraging with faith themes",
    storyWorldDescription: "a world that reflects God's creation, kindness, and the beauty of faith",
    storyVocabularyLevel: "simple sentences with age-appropriate faith vocabulary",
  },
];

function makeContext(config: Record<string, unknown>): ChatTaskContext {
  return {
    db: {
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ birthdate: "2016-01-01" }) }),
      }),
      collection: () => ({ get: async () => ({ docs: [] }) }),
    },
    familyId: "synthetic-family",
    childId: "synthetic-child",
    childData: { name: "Sample" },
    snapshotData: {
      workingLevels: {
        phonics: { level: 2, source: "quest", updatedAt: "2026-09-01T00:00:00Z" },
      },
    },
    messages: [{
      role: "user",
      content: JSON.stringify({ storyIdea: "A cat on a mat", pageCount: 1, words: [], ...config }),
    }],
    apiKey: "synthetic-no-network",
  } as unknown as ChatTaskContext;
}

async function generate(config: Record<string, unknown>) {
  const ctx = makeContext(config);
  const result = await handleGenerateStory(ctx);
  expect(callClaudeMock).toHaveBeenCalledTimes(1);
  return { ctx, result, prompt: callClaudeMock.mock.calls[0][0].systemPrompt as string };
}

beforeEach(() => {
  vi.clearAllMocks();
  callClaudeMock.mockResolvedValue({
    text: JSON.stringify({ title: "Cat", pages: [{ pageNumber: 1, text: "A cat sat." }] }),
    inputTokens: 1,
    outputTokens: 1,
    stopReason: "end_turn",
  });
});

describe("generateStory restored presets (UX-172)", () => {
  it.each(restoredThemes)("$id reaches the model below the assessed reading level", async ({ id, ...guidance }) => {
    expect(resolveThemeGuidance(id)).toEqual(guidance);
    const { ctx, prompt, result } = await generate({ theme: id });
    expect(prompt).toContain("STORY WORLD: " + guidance.storyWorldDescription);
    expect(prompt).toContain("STORY TONE: " + guidance.storyTone);
    expect(prompt).toContain("VOCABULARY STYLE: " + guidance.storyVocabularyLevel);
    // This repair restores story instructions without adding an art direction.
    expect(prompt).not.toContain("IMAGE STYLE:");
    expect(prompt).toContain("READING LEVEL — Sample decodes at phonics Level 2");
    expect(prompt).toContain("THIS BLOCK OUTRANKS EVERY OTHER VOCABULARY INSTRUCTION");
    expect(prompt).toContain("It outranks THEME GUIDANCE's VOCABULARY STYLE");
    expect(prompt.indexOf("READING LEVEL —")).toBeLessThan(prompt.indexOf("THEME GUIDANCE:\n"));
    expect(result.readability).toMatchObject({ phonicsLevel: 2, levelSource: "assessed", passed: true, stretch: 0 });
    expect(ctx.snapshotData?.workingLevels?.phonics.level).toBe(2);
  });

  it.each(restoredThemes)("a normalized parent note replaces $id", async ({ id, storyTone }) => {
    const { prompt } = await generate({ theme: id, customTheme: "  warm\n  and   kind  " });
    expect(resolveThemeGuidance(id, "  warm\n  and   kind  ")).toEqual({ customNote: "warm and kind" });
    expect(prompt).toContain("STORY WORLD AND TONE: warm and kind");
    expect(prompt).not.toContain(storyTone);
    expect(prompt).not.toContain("VOCABULARY STYLE:");
    expect(prompt).not.toContain("IMAGE STYLE:");
    expect(prompt).toContain("does NOT change the vocabulary");
    expect(prompt).toContain("READING LEVEL — Sample decodes at phonics Level 2");
  });

  it.each(restoredThemes)("blank and invalid notes still resolve $id", ({ id, ...guidance }) => {
    expect(resolveThemeGuidance(id, " \n  ")).toEqual(guidance);
    expect(resolveThemeGuidance(id, { note: "not typed words" })).toEqual(guidance);
  });

  it("word-list input keeps the practice words beside the sight-word guidance", async () => {
    const { prompt } = await generate({ theme: "sight_words", words: ["cat", "sat"] });
    expect(prompt).toContain("SIGHT WORDS SAMPLE IS PRACTICING:\ncat, sat");
    expect(prompt).toContain("STORY TONE: simple and repetitive for reading practice");
    expect(prompt).toContain("DO NOT force every word in");
  });

  it("keeps the parent's one-story stretch without changing the assessed level", async () => {
    const { ctx, prompt, result } = await generate({ theme: "science", levelStretch: 1 });
    expect(prompt).toContain("write this story at phonics Level 3");
    expect(prompt).toContain("Sample decodes at Level 2");
    expect(result.readability).toMatchObject({ phonicsLevel: 3, stretch: 1 });
    expect(ctx.snapshotData?.workingLevels?.phonics.level).toBe(2);
  });

  it("keeps existing preset story and image guidance", async () => {
    const { prompt } = await generate({ theme: "adventure" });
    expect(prompt).toContain("STORY TONE: adventurous and exciting with brave heroes");
    expect(prompt).toContain("IMAGE STYLE: A colorful adventure scene for a children's book.");
  });

  it.each([undefined, "", "other", "unknown-synthetic"])("keeps absent/unknown %s without a preset", async (theme) => {
    expect(resolveThemeGuidance(theme)).toBeUndefined();
    const { prompt } = await generate({ theme });
    expect(prompt).not.toContain("THEME GUIDANCE:\n");
  });
});
