import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../chatTypes.js";

// ── Hoisted mocks ─────────────────────────────────────────────────

const { callClaudeMock, logAiUsageMock, buildContextForTaskMock } = vi.hoisted(
  () => ({
    callClaudeMock: vi.fn(async () => ({
      text: '{"profileDate":"2026-10-01","dispositions":{}}',
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    })),
    logAiUsageMock: vi.fn(async () => undefined),
    buildContextForTaskMock: vi.fn(
      async () => ["CHARTER + CHILD CONTEXT"] as string[],
    ),
  }),
);

vi.mock("../chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chatTypes.js")>();
  return {
    ...actual,
    callClaude: callClaudeMock,
    logAiUsage: logAiUsageMock,
  };
});

vi.mock("../contextSlices.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../contextSlices.js")>();
  return {
    ...actual,
    buildContextForTask: buildContextForTaskMock,
  };
});

vi.mock("../chat.js", () => ({
  modelForTask: () => "claude-sonnet-5",
}));

import { handleDisposition } from "./disposition.js";

// ── Helpers ───────────────────────────────────────────────────────

function mockFirestoreQuery(docs: Array<{ data: () => Record<string, unknown> }>) {
  return {
    docs,
    empty: docs.length === 0,
  };
}

function makeMockDb(options: {
  dayLogs?: Array<Record<string, unknown>>;
  chapterResponses?: Array<Record<string, unknown>>;
  dadLabReports?: Array<Record<string, unknown>>;
} = {}) {
  const dayLogDocs = (options.dayLogs ?? []).map((d) => ({
    data: () => d,
  }));
  const chapterDocs = (options.chapterResponses ?? []).map((d) => ({
    data: () => d,
  }));
  const labDocs = (options.dadLabReports ?? []).map((d) => ({
    data: () => d,
  }));

  const mockGet = vi.fn();
  const mockWhere = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockCollection = vi.fn();

  // Chain builder that resolves based on collection path
  const buildChain = (collectionPath: string) => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    // Wire up get to return the right data
    if (collectionPath.includes("/days")) {
      chain.get.mockResolvedValue(mockFirestoreQuery(dayLogDocs));
    } else if (collectionPath.includes("/chapterResponses")) {
      chain.get.mockResolvedValue(mockFirestoreQuery(chapterDocs));
    } else if (collectionPath.includes("/dadLabReports")) {
      chain.get.mockResolvedValue(mockFirestoreQuery(labDocs));
    } else {
      chain.get.mockResolvedValue(mockFirestoreQuery([]));
    }

    return chain;
  };

  mockCollection.mockImplementation((path: string) => buildChain(path));

  return { collection: mockCollection } as unknown as ChatTaskContext["db"];
}

function makeCtx(
  overrides?: Partial<ChatTaskContext> & {
    dayLogs?: Array<Record<string, unknown>>;
    chapterResponses?: Array<Record<string, unknown>>;
    dadLabReports?: Array<Record<string, unknown>>;
  },
): ChatTaskContext {
  const { dayLogs, chapterResponses, dadLabReports, ...rest } = overrides ?? {};
  return {
    db: makeMockDb({ dayLogs, chapterResponses, dadLabReports }),
    familyId: "fam1",
    childId: "child1",
    childData: { name: "Lincoln" },
    snapshotData: undefined,
    messages: [],
    domain: undefined,
    apiKey: "test-key",
    ...rest,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("handleDisposition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callClaudeMock.mockResolvedValue({
      text: '{"profileDate":"2026-10-01","dispositions":{}}',
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });
  });

  it("calls buildContextForTask with 'disposition' and correct params", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    expect(buildContextForTaskMock).toHaveBeenCalledWith(
      "disposition",
      expect.objectContaining({
        familyId: "fam1",
        childId: "child1",
        childData: { name: "Lincoln" },
      }),
    );
  });

  it("returns the model response and usage info", async () => {
    const ctx = makeCtx();
    const result = await handleDisposition(ctx);

    expect(result.message).toBe(
      '{"profileDate":"2026-10-01","dispositions":{}}',
    );
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("logs AI usage with correct task type", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    expect(logAiUsageMock).toHaveBeenCalledWith(
      ctx.db,
      "fam1",
      expect.objectContaining({
        childId: "child1",
        taskType: "disposition",
        model: "claude-sonnet-5",
        inputTokens: 100,
        outputTokens: 50,
      }),
    );
  });

  it("includes child name in the system prompt", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain("Lincoln");
    expect(callArgs.systemPrompt).toContain("Learning Disposition Profile");
  });

  it("includes five disposition categories in the system prompt", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain("Curiosity");
    expect(callArgs.systemPrompt).toContain("Persistence");
    expect(callArgs.systemPrompt).toContain("Articulation");
    expect(callArgs.systemPrompt).toContain("Self-Awareness");
    expect(callArgs.systemPrompt).toContain("Ownership");
  });

  it("reports no day logs when none exist for the child", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Total day logs in period: 0");
  });

  it("filters day logs by childId", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [{ label: "Math", completed: true, estimatedMinutes: 30, subjectBucket: "Math" }],
        },
        {
          date: "2026-10-21",
          childId: "other-child",
          checklist: [{ label: "Reading", completed: true, estimatedMinutes: 20 }],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Total day logs in period: 1");
  });

  it("aggregates day log data into weekly summaries", async () => {
    // Two days in the same week (Sun Oct 18 - Sat Oct 24, 2026)
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-19",
          childId: "child1",
          checklist: [
            { label: "Math", completed: true, estimatedMinutes: 30, subjectBucket: "Math", engagement: "engaged" },
            { label: "Reading", completed: false, estimatedMinutes: 20, subjectBucket: "Reading" },
          ],
        },
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "Science", completed: true, estimatedMinutes: 25, subjectBucket: "Science", evidenceArtifactId: "art1" },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    // Should contain weekly aggregate info
    expect(userMsg).toContain("2 days");
    expect(userMsg).toContain("Total day logs in period: 2");
  });

  it("includes chapter response summary when responses exist", async () => {
    const ctx = makeCtx({
      chapterResponses: [
        {
          date: "2026-10-20",
          childId: "child1",
          bookTitle: "Charlotte's Web",
          chapter: "Chapter 3",
          question: "Why did Fern care about Wilbur?",
          questionType: "empathy",
          virtue: "compassion",
          audioUrl: "https://example.com/audio.mp3",
          textResponse: null,
        },
        {
          date: "2026-10-21",
          childId: "child1",
          bookTitle: "Charlotte's Web",
          chapter: "Chapter 4",
          question: "What would you do if you were Wilbur?",
          questionType: "perspective",
          virtue: "",
          audioUrl: null,
          textResponse: "I would try to escape",
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("2 chapter discussion responses recorded");
    expect(userMsg).toContain("Charlotte's Web");
    expect(userMsg).toContain("1 audio recordings");
  });

  it("formats chapter responses with no responses gracefully", async () => {
    const ctx = makeCtx({ chapterResponses: [] });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("No chapter discussion responses recorded");
  });

  it("includes lab report summary when reports exist", async () => {
    const ctx = makeCtx({
      dadLabReports: [
        {
          title: "Vinegar Volcano",
          status: "completed",
          completedAt: "2026-10-15",
          contributions: [
            { childId: "child1", prediction: "It will explode", explanation: "Because of the acid" },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Vinegar Volcano");
    expect(userMsg).toContain("[predicted]");
    expect(userMsg).toContain("[explained]");
  });

  it("shows no lab reports when none exist", async () => {
    const ctx = makeCtx({ dadLabReports: [] });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("No recent lab reports");
  });

  it("does not include [predicted] or [explained] for other child's contributions", async () => {
    const ctx = makeCtx({
      dadLabReports: [
        {
          title: "Magnet Test",
          status: "completed",
          completedAt: "2026-10-10",
          contributions: [
            { childId: "other-child", prediction: "It sticks", explanation: "Magnets are strong" },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Magnet Test");
    expect(userMsg).not.toContain("[predicted]");
    expect(userMsg).not.toContain("[explained]");
  });

  it("counts engagement from checklist items", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "Math", completed: true, engagement: "engaged", estimatedMinutes: 30, subjectBucket: "Math" },
            { label: "Reading", completed: true, engagement: "struggled", estimatedMinutes: 20, subjectBucket: "Reading" },
            { label: "Science", completed: false, engagement: "engaged", estimatedMinutes: 15 },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("engaged:2");
    expect(userMsg).toContain("struggled:1");
  });

  it("counts evidence artifacts from checklist items", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "Math", completed: true, evidenceArtifactId: "art1" },
            { label: "Reading", completed: true, evidenceArtifactId: "art2" },
            { label: "Science", completed: false },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("2 evidence");
  });

  it("handles day logs with missing checklist gracefully", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          // no checklist field
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Total day logs in period: 1");
  });

  it("reports completion rate as percentage", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "A", completed: true },
            { label: "B", completed: true },
            { label: "C", completed: false },
            { label: "D", completed: false },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    // 2 of 4 = 50%
    expect(userMsg).toContain("50% completion");
  });

  it("uses maxTokens of 4096", async () => {
    const ctx = makeCtx();
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(4096);
  });

  it("includes grade results in day log processing", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "Math Quiz", completed: true, gradeResult: "4/5 correct" },
          ],
        },
      ],
    });
    // The grade results are processed internally; we verify the handler runs without error
    await handleDisposition(ctx);
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
  });

  it("groups chapter responses by book in the summary", async () => {
    const ctx = makeCtx({
      chapterResponses: [
        {
          date: "2026-10-20",
          childId: "child1",
          bookTitle: "Charlotte's Web",
          chapter: "Chapter 1",
          question: "Q1",
          questionType: "comprehension",
          audioUrl: "url1",
        },
        {
          date: "2026-10-21",
          childId: "child1",
          bookTitle: "Charlotte's Web",
          chapter: "Chapter 2",
          question: "Q2",
          questionType: "empathy",
          textResponse: "text",
        },
        {
          date: "2026-10-22",
          childId: "child1",
          bookTitle: "The Lion the Witch and the Wardrobe",
          chapter: "Chapter 1",
          question: "Q3",
          questionType: "perspective",
          audioUrl: "url2",
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("3 chapter discussion responses recorded");
    expect(userMsg).toContain("Charlotte's Web: 2 responses (1 audio recordings)");
    expect(userMsg).toContain("The Lion the Witch and the Wardrobe: 1 responses (1 audio recordings)");
  });

  it("includes virtue counts in chapter response summary", async () => {
    const ctx = makeCtx({
      chapterResponses: [
        {
          date: "2026-10-20",
          childId: "child1",
          bookTitle: "Book A",
          chapter: "Ch1",
          question: "Q1",
          questionType: "empathy",
          virtue: "compassion",
        },
        {
          date: "2026-10-21",
          childId: "child1",
          bookTitle: "Book A",
          chapter: "Ch2",
          question: "Q2",
          questionType: "ethics",
          virtue: "courage",
        },
        {
          date: "2026-10-22",
          childId: "child1",
          bookTitle: "Book A",
          chapter: "Ch3",
          question: "Q3",
          questionType: "empathy",
          virtue: "compassion",
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Virtues explored:");
    expect(userMsg).toContain("compassion (2)");
    expect(userMsg).toContain("courage (1)");
  });

  it("includes sample questions (up to 3) in chapter response summary", async () => {
    const ctx = makeCtx({
      chapterResponses: [
        { date: "2026-10-20", childId: "child1", bookTitle: "Book", chapter: "Ch1", question: "First question here", questionType: "t" },
        { date: "2026-10-21", childId: "child1", bookTitle: "Book", chapter: "Ch2", question: "Second question here", questionType: "t" },
        { date: "2026-10-22", childId: "child1", bookTitle: "Book", chapter: "Ch3", question: "Third question here", questionType: "t" },
        { date: "2026-10-23", childId: "child1", bookTitle: "Book", chapter: "Ch4", question: "Fourth question here", questionType: "t" },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Sample questions discussed");
    expect(userMsg).toContain("First question here");
    expect(userMsg).toContain("Second question here");
    expect(userMsg).toContain("Third question here");
    // Fourth should NOT appear in samples
    expect(userMsg).not.toContain("Fourth question here");
  });

  it("truncates long questions in samples at 100 chars", async () => {
    const longQ = "A".repeat(150);
    const ctx = makeCtx({
      chapterResponses: [
        { date: "2026-10-20", childId: "child1", bookTitle: "Book", chapter: "Ch1", question: longQ, questionType: "t" },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("A".repeat(100) + "...");
    expect(userMsg).not.toContain("A".repeat(101));
  });

  it("uses plannedMinutes as fallback when estimatedMinutes is missing", async () => {
    const ctx = makeCtx({
      dayLogs: [
        {
          date: "2026-10-20",
          childId: "child1",
          checklist: [
            { label: "Math", completed: true, plannedMinutes: 45, subjectBucket: "Math" },
          ],
        },
      ],
    });
    await handleDisposition(ctx);

    const callArgs = callClaudeMock.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    // The handler processes minutesBySubject internally — verify it runs
    expect(userMsg).toContain("subjects: Math");
  });
});
