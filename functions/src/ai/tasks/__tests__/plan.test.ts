import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatTaskContext } from "../../chatTypes.js";

// ── Hoisted mocks ─────────────────────────────────────────────────

const { callClaudeMock, logAiUsageMock, buildContextForTaskMock } = vi.hoisted(
  () => ({
    callClaudeMock: vi.fn(),
    logAiUsageMock: vi.fn(async () => undefined),
    // Stand in for the assembled context slices. The skill-snapshot slice
    // (with the mastered list) is unit-tested separately in contextSlices.test;
    // here we feed a representative mastered line so we can assert the planner
    // PROMPT wires the skip-mastered instruction around it.
    buildContextForTaskMock: vi.fn(async () => [
      "SKILL SNAPSHOT (from evaluations):\nMASTERED — DO NOT RE-SERVE AS NEW WORK:\n- CVC blending",
    ] as string[]),
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
import { handlePlan } from "../plan.js";

// ── Helpers ───────────────────────────────────────────────────────

/** Minimal Firestore stub: plannerDefaults doc does not exist. */
function makeDb(): ChatTaskContext["db"] {
  return {
    doc: () => ({
      get: async () => ({ exists: false, data: () => undefined }),
    }),
  } as unknown as ChatTaskContext["db"];
}

function makeCtx(): ChatTaskContext {
  return {
    db: makeDb(),
    familyId: "fam-1",
    childId: "child-lincoln",
    childData: { name: "Lincoln" },
    snapshotData: undefined,
    messages: [{ role: "user", content: "Generate Lincoln a plan for the week." }],
    domain: undefined,
    apiKey: "test-key",
  };
}

/** Pull the systemPrompt the handler passed to callClaude. */
function capturedSystemPrompt(): string {
  return (callClaudeMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
}

beforeEach(() => {
  vi.clearAllMocks();
  callClaudeMock.mockResolvedValue({
    text: JSON.stringify({ days: [] }),
    inputTokens: 100,
    outputTokens: 50,
    stopReason: "end_turn",
  });
});

// ── Tests ─────────────────────────────────────────────────────────

describe("handlePlan — skip-mastered prompt composition (FEAT-10)", () => {
  it("teaches the planner to skip mastered skills as new work", async () => {
    await handlePlan(makeCtx());
    const prompt = capturedSystemPrompt();
    expect(prompt).toContain("SKIP MASTERED — TARGET THE FRONTIER + THE GAPS");
    expect(prompt).toMatch(/Do NOT fill must-do minutes with new instruction on a/i);
    // References the labeled list the snapshot slice emits.
    expect(prompt).toContain("MASTERED — DO NOT RE-SERVE AS NEW WORK");
  });

  it("preserves ADDRESS NOW gap routing (does not rip out gap-targeting)", async () => {
    await handlePlan(makeCtx());
    const prompt = capturedSystemPrompt();
    expect(prompt).toMatch(/KEEP TARGETING THE GAPS/i);
    expect(prompt).toContain("ADDRESS NOW");
  });

  it("advances the frontier and allows light review (no over-skipping)", async () => {
    await handlePlan(makeCtx());
    const prompt = capturedSystemPrompt();
    expect(prompt).toMatch(/ADVANCE THE FRONTIER/i);
    expect(prompt).toMatch(/LIGHT REVIEW IS STILL ALLOWED/i);
  });

  it("surfaces the mastered list from the assembled context into the prompt", async () => {
    await handlePlan(makeCtx());
    const prompt = capturedSystemPrompt();
    // The mastered skill from the (mocked) snapshot slice is present, so the
    // skip instruction has something concrete to act on.
    expect(prompt).toContain("- CVC blending");
  });
});
