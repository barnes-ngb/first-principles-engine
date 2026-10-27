/**
 * The chapter-book pair never hands a cut-short reply back as the answer (UX-464).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

const { callClaudeMock, logAiUsageMock } = vi.hoisted(() => ({
  callClaudeMock: vi.fn(),
  logAiUsageMock: vi.fn(async () => undefined),
}));

vi.mock("../../chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../chatTypes.js")>();
  return { ...actual, callClaude: callClaudeMock, logAiUsage: logAiUsageMock };
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

import { handleChapterQuestions } from "../chapterQuestions.js";
import { handleBookLookup } from "../bookLookup.js";

function makeCtx(input: unknown): ChatTaskContext {
  return {
    db: {} as ChatTaskContext["db"],
    familyId: "fam-1",
    childId: "child-1",
    childData: { name: "Lincoln" },
    snapshotData: undefined,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    domain: undefined,
    apiKey: "test-key",
  };
}

const chapterInput = {
  bookTitle: "A Long Book",
  author: "A. Writer",
  chapters: [{ number: 1, title: "One" }, { number: 2, title: "Two" }],
  childName: "Lincoln",
  childAge: 10,
  weekTheme: "Courage",
  weekVirtue: "Patience",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleChapterQuestions (UX-464)", () => {
  it("runs at LOW effort and returns clean JSON with its stop reason", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: '```json\n[{"chapter":1,"questionType":"opinion","question":"Why?"}]\n```',
      inputTokens: 10,
      outputTokens: 20,
      stopReason: "end_turn",
    });
    const result = await handleChapterQuestions(makeCtx(chapterInput));
    expect((callClaudeMock.mock.calls[0][0] as { effort?: string }).effort).toBe("low");
    expect(JSON.parse(result.message)).toEqual([
      { chapter: 1, questionType: "opinion", question: "Why?" },
    ]);
    expect(result.stopReason).toBe("end_turn");
    expect(result.failure).toBeUndefined();
  });

  it("a reply stopped at max_tokens is a named failure, never text", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: '[{"chapter":1,"questionType":"opinion","question":"Why?"},{"chapter":2,"quest',
      inputTokens: 10,
      outputTokens: 4096,
      stopReason: "max_tokens",
    });
    const result = await handleChapterQuestions(makeCtx(chapterInput));
    expect(result.failure).toBe("cut-short");
    expect(result.message).toBe("");
    expect(result.stopReason).toBe("max_tokens");
  });

  it("a finished reply that is not an array is `unreadable`, never text", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: "I'm sorry, I can't help with that.",
      inputTokens: 10,
      outputTokens: 12,
      stopReason: "end_turn",
    });
    const result = await handleChapterQuestions(makeCtx(chapterInput));
    expect(result.failure).toBe("unreadable");
    expect(result.message).toBe("");
  });
});

describe("handleBookLookup (UX-464)", () => {
  const full = {
    title: "A Long Book",
    author: "A. Writer",
    totalChapters: 3,
    chapters: [{ number: 1, title: "One", summary: "Things happen." }],
  };

  it("runs at LOW effort and returns the parsed book", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: JSON.stringify(full), inputTokens: 5, outputTokens: 5, stopReason: "end_turn",
    });
    const result = await handleBookLookup(makeCtx({ title: "long book" }));
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect((callClaudeMock.mock.calls[0][0] as { effort?: string }).effort).toBe("low");
    const parsed = JSON.parse(result.message);
    expect(parsed.chapters[0].summary).toBe("Things happen.");
    expect(parsed.chapterSummariesOmitted).toBeUndefined();
  });

  it("a cut-short reply is retried ONCE in the titles-only shape and says so", async () => {
    callClaudeMock
      .mockResolvedValueOnce({
        text: '{"title":"A Long Book","chapters":[{"number":1,"summ',
        inputTokens: 5, outputTokens: 8192, stopReason: "max_tokens",
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(full), inputTokens: 5, outputTokens: 50, stopReason: "end_turn",
      });
    const result = await handleBookLookup(makeCtx({ title: "long book" }));
    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    const secondPrompt = (callClaudeMock.mock.calls[1][0] as { systemPrompt: string }).systemPrompt;
    expect(secondPrompt).toContain('"title" ONLY');
    const parsed = JSON.parse(result.message);
    expect(parsed.chapterSummariesOmitted).toBe(true);
    // A summary the model sent anyway is dropped: the flag is the truth.
    expect(parsed.chapters).toEqual([{ number: 1, title: "One" }]);
    expect(result.usage.outputTokens).toBe(8242);
  });

  it("a titles-only reply cut short too fails — never parsed as whole", async () => {
    const cut = {
      text: '{"title":"A Long Book","author":"A. Writer","totalChapters":3}',
      inputTokens: 5, outputTokens: 8192, stopReason: "max_tokens",
    };
    callClaudeMock.mockResolvedValueOnce(cut).mockResolvedValueOnce(cut);
    await expect(handleBookLookup(makeCtx({ title: "long book" }))).rejects.toThrow(
      "Couldn't read the book details",
    );
  });
});
