import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";
import type { RevisePageInput, RevisePageOutput } from "../../chat.js";

// ── Hoisted mocks ─────────────────────────────────────────────────

const { callClaudeMock, logAiUsageMock, buildContextForTaskMock } = vi.hoisted(
  () => ({
    callClaudeMock: vi.fn(),
    logAiUsageMock: vi.fn(async () => undefined),
    buildContextForTaskMock: vi.fn(async () => [] as string[]),
  }),
);

vi.mock("../../chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../chatTypes.js")>();
  return {
    ...actual,
    callClaude: callClaudeMock,
    logAiUsage: logAiUsageMock,
  };
});

vi.mock("../../contextSlices.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../contextSlices.js")>();
  return {
    ...actual,
    buildContextForTask: buildContextForTaskMock,
  };
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
import { handleRevisePage } from "../revisePage.js";

// ── Helpers ───────────────────────────────────────────────────────

function validInput(overrides?: Partial<RevisePageInput>): RevisePageInput {
  return {
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
      ],
      characterNames: ["Ember"],
    },
    childCalibration: {
      childAge: 6,
      childName: "London",
      sentenceTarget: "1-2 short sentences (5-9 words each)",
      vocabularyLevel: "kindergarten",
    },
    ...overrides,
  };
}

function makeCtx(input: unknown): ChatTaskContext {
  return {
    db: {} as ChatTaskContext["db"],
    familyId: "fam-1",
    childId: "child-london",
    childData: { name: "London" },
    snapshotData: undefined,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    domain: undefined,
    apiKey: "test-key",
  };
}

const happyOutput: RevisePageOutput = {
  newText: "Sparkle flapped her tiny wings and finally lifted off the ground!",
  newSceneDescription: "A sparkly girl dragon lifting off in a sunny meadow.",
  wordsOnPage: ["her", "and", "the"],
  regenerateImage: "yes",
  qualityNotes: "Renamed Ember to Sparkle per feedback; scene changed so regen.",
};

beforeEach(() => {
  vi.clearAllMocks();
  buildContextForTaskMock.mockResolvedValue([]);
  callClaudeMock.mockResolvedValue({
    text: JSON.stringify(happyOutput),
    inputTokens: 100,
    outputTokens: 50,
    stopReason: "end_turn",
  });
});

// ── Tests ─────────────────────────────────────────────────────────

describe("handleRevisePage", () => {
  it("happy path: parses Claude JSON and returns a RevisePageOutput-shaped message", async () => {
    const result = await handleRevisePage(makeCtx(validInput()));

    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("claude-sonnet-4-6");
    const parsed = JSON.parse(result.message) as RevisePageOutput;
    expect(parsed.newText).toBe(happyOutput.newText);
    expect(parsed.newSceneDescription).toBe(happyOutput.newSceneDescription);
    expect(parsed.wordsOnPage).toEqual(happyOutput.wordsOnPage);
    expect(parsed.regenerateImage).toBe("yes");
  });

  it("uses Sonnet at low maxTokens (2048 — page revisions are small)", async () => {
    await handleRevisePage(makeCtx(validInput()));
    const callArgs = callClaudeMock.mock.calls[0][0] as {
      model: string;
      maxTokens: number;
    };
    expect(callArgs.model).toBe("claude-sonnet-4-6");
    expect(callArgs.maxTokens).toBe(2048);
  });

  it("returns regenerateImage='no' correctly when the model sets it", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: JSON.stringify({ ...happyOutput, regenerateImage: "no" }),
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });
    const result = await handleRevisePage(makeCtx(validInput()));
    const parsed = JSON.parse(result.message) as RevisePageOutput;
    expect(parsed.regenerateImage).toBe("no");
  });

  it("handles malformed JSON gracefully (returns raw text without throwing)", async () => {
    callClaudeMock.mockResolvedValueOnce({
      text: "Here is your page: {not valid json at all",
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });
    const result = await handleRevisePage(makeCtx(validInput()));
    // Did not throw; raw text is passed through for the client to handle.
    expect(result.message).toContain("not valid json");
  });

  it("logs AI usage with taskType=revisePage", async () => {
    await handleRevisePage(makeCtx(validInput()));
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    const call = logAiUsageMock.mock.calls[0] as unknown as unknown[];
    const payload = call[2] as Record<string, unknown>;
    expect(payload.taskType).toBe("revisePage");
    expect(payload.childId).toBe("child-london");
  });

  it("loads context via the revisePage slice list", async () => {
    await handleRevisePage(makeCtx(validInput()));
    expect(buildContextForTaskMock).toHaveBeenCalledWith(
      "revisePage",
      expect.objectContaining({ familyId: "fam-1", childId: "child-london" }),
    );
  });

  it("embeds the listener feedback into the system prompt", async () => {
    await handleRevisePage(makeCtx(validInput()));
    const callArgs = callClaudeMock.mock.calls[0][0] as { systemPrompt: string };
    expect(callArgs.systemPrompt).toContain(
      'LISTENER FEEDBACK: "Make the dragon a girl named Sparkle."',
    );
  });

  it("rejects non-JSON message content (invalid-argument)", async () => {
    const ctx = makeCtx(validInput());
    ctx.messages[0].content = "this is not json";
    await expect(handleRevisePage(ctx)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects a payload missing fullStoryContext.allPages (invalid-argument)", async () => {
    const bad = { ...validInput(), fullStoryContext: { title: "x" } };
    await expect(handleRevisePage(makeCtx(bad))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
