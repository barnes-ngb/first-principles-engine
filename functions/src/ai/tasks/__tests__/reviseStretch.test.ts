import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

/**
 * FEAT-191 — a revise of a stretched book stays stretched.
 *
 * FEAT-176 made the READING LEVEL block server-injected on both revise tasks so
 * a revise could not walk the vocabulary back *up*. The same reasoning applies
 * downward: without this, the first "make it more exciting" on a book written
 * one step up would re-level it at the child's base, and every word the parent
 * asked for would come back as a word to fix. The number therefore comes off the
 * BOOK's own `generationConfig` — never off the revise payload.
 */

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

import { handleReviseStory } from "../reviseStory.js";
import { handleRevisePage } from "../revisePage.js";

/** Records every doc path read, so "did it read the book?" is observable. */
const readPaths: string[] = [];

function makeDb(bookConfig: Record<string, unknown> | undefined) {
  return {
    doc: (path: string) => {
      readPaths.push(path);
      return {
        get: async () => ({
          exists: true,
          data: () =>
            path.includes("/books/")
              ? { generationConfig: bookConfig }
              : { birthdate: "2016-01-01" },
        }),
      };
    },
    collection: () => ({ get: async () => ({ docs: [] }) }),
  } as unknown as ChatTaskContext["db"];
}

function makeCtx(payload: Record<string, unknown>, bookConfig?: Record<string, unknown>) {
  return {
    db: makeDb(bookConfig),
    familyId: "fam-1",
    childId: "child-1",
    childData: { name: "Lincoln" },
    snapshotData: {
      workingLevels: {
        phonics: { level: 2, updatedAt: "2026-09-01T00:00:00.000Z", source: "quest" },
      },
    },
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    domain: undefined,
    apiKey: "test-key",
  } as ChatTaskContext;
}

const REVISE_STORY_PAYLOAD = {
  chatHistory: [],
  currentStory: {
    title: "The Ship",
    pages: [{ pageNumber: 1, text: "The ship is black.", sceneDescription: "a dock" }],
  },
  childCalibration: {
    childAge: 10,
    childName: "Lincoln",
    illustrationStyle: "minecraft",
    pageCount: 1,
  },
  newFeedback: "make it more exciting",
};

const REVISE_PAGE_PAYLOAD = {
  pageNumber: 1,
  currentText: "The ship is black.",
  currentSceneDescription: "a dock",
  feedback: "make it more exciting",
  fullStoryContext: {
    title: "The Ship",
    allPages: [{ pageNumber: 1, text: "The ship is black." }],
    characterNames: [],
  },
  childCalibration: {
    childAge: 10,
    childName: "Lincoln",
    sentenceTarget: "",
    vocabularyLevel: "",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  readPaths.length = 0;
  buildContextForTaskMock.mockResolvedValue([]);
  callClaudeMock.mockResolvedValue({
    text: JSON.stringify({ humanResponse: "ok", storyUpdated: false, newText: "The ship." }),
    inputTokens: 10,
    outputTokens: 10,
    stopReason: "end_turn",
  });
});

describe("handleReviseStory (FEAT-191)", () => {
  it("keeps a stretched book stretched, reading the number off the book itself", async () => {
    await handleReviseStory(
      makeCtx({ ...REVISE_STORY_PAYLOAD, bookId: "book-1" }, { levelStretch: 1, pageCount: 1 }),
    );

    expect(readPaths).toContain("families/fam-1/books/book-1");
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("write this story at phonics Level 3");
    expect(prompt).toContain("one step up");
  });

  it("is unchanged for a book with no stretch on record", async () => {
    await handleReviseStory(
      makeCtx({ ...REVISE_STORY_PAYLOAD, bookId: "book-1" }, { pageCount: 1 }),
    );
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("Lincoln decodes at phonics Level 2 of 8");
    expect(prompt).not.toContain("step up");
  });

  it("ignores a level asserted in the payload — only the book's record counts", async () => {
    await handleReviseStory(
      makeCtx(
        { ...REVISE_STORY_PAYLOAD, bookId: "book-1", levelStretch: 2 },
        { pageCount: 1 },
      ),
    );
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("Lincoln decodes at phonics Level 2 of 8");
    expect(prompt).not.toContain("step up");
  });

  it("works with no bookId at all (a draft whose create failed)", async () => {
    await handleReviseStory(makeCtx(REVISE_STORY_PAYLOAD));
    expect(readPaths.some((p) => p.includes("/books/"))).toBe(false);
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("Lincoln decodes at phonics Level 2 of 8");
  });
});

describe("handleRevisePage (FEAT-191)", () => {
  it("keeps a stretched book stretched on a single-page rewrite", async () => {
    await handleRevisePage(
      makeCtx({ ...REVISE_PAGE_PAYLOAD, bookId: "book-1" }, { levelStretch: 2, pageCount: 1 }),
    );

    expect(readPaths).toContain("families/fam-1/books/book-1");
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("write this story at phonics Level 4");
    expect(prompt).toContain("two steps up");
  });

  it("is unchanged for a book with no stretch on record", async () => {
    await handleRevisePage(
      makeCtx({ ...REVISE_PAGE_PAYLOAD, bookId: "book-1" }, { pageCount: 1 }),
    );
    const prompt = callClaudeMock.mock.calls[0][0].systemPrompt as string;
    expect(prompt).toContain("Lincoln decodes at phonics Level 2 of 8");
    expect(prompt).not.toContain("step up");
  });
});
