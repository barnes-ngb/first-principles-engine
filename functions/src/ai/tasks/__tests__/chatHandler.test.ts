import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

// ── Hoisted mocks ─────────────────────────────────────────────────

const { callClaudeMock, logAiUsageMock, buildContextForTaskMock } = vi.hoisted(
  () => ({
    callClaudeMock: vi.fn(async (_opts: { model: string }) => ({
      text: "ok",
      inputTokens: 1,
      outputTokens: 1,
      stopReason: "end_turn",
    })),
    logAiUsageMock: vi.fn(async () => undefined),
    buildContextForTaskMock: vi.fn(async () => ["CHARTER + CHILD CONTEXT"] as string[]),
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

// Import AFTER mocks are set up.
import { handleChat } from "../chatHandler.js";

// ── Helpers ───────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ChatTaskContext>): ChatTaskContext {
  return {
    db: {} as ChatTaskContext["db"],
    familyId: "fam1",
    childId: "child1",
    childData: { name: "Lincoln" },
    snapshotData: undefined,
    messages: [{ role: "user", content: "Suggest a Dad Lab" }],
    domain: undefined,
    apiKey: "key",
    ...overrides,
  };
}

describe("handleChat — per-request model override (ETHOS-03)", () => {
  beforeEach(() => {
    callClaudeMock.mockClear();
  });

  it("defaults to Haiku when no override is supplied", async () => {
    const result = await handleChat(makeCtx({ modelOverride: undefined }));
    expect(callClaudeMock).toHaveBeenCalledOnce();
    expect(callClaudeMock.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses the override model when supplied (Sonnet for Dad Lab)", async () => {
    const result = await handleChat(makeCtx({ modelOverride: "claude-sonnet-5" }));
    expect(callClaudeMock).toHaveBeenCalledOnce();
    expect(callClaudeMock.mock.calls[0][0].model).toBe("claude-sonnet-5");
    expect(result.model).toBe("claude-sonnet-5");
  });
});
