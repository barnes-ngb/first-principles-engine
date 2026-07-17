import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

// ── Hoisted mocks ─────────────────────────────────────────────────
// The orchestrator wraps one Claude call around the pure synthesis layer. We
// mock the model call so we can assert the FAILURE path surfaces the underlying
// error class + message end-to-end (DOC-09 — no opaque failures).

const { callClaudeMock, logAiUsageMock } = vi.hoisted(() => ({
  callClaudeMock: vi.fn(),
  logAiUsageMock: vi.fn(async () => undefined),
}));

vi.mock("./chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatTypes.js")>();
  return { ...actual, callClaude: callClaudeMock, logAiUsage: logAiUsageMock };
});

vi.mock("./chat.js", () => ({
  modelForTask: () => "claude-sonnet-5",
}));

vi.mock("./tasks/learnerSynthesis.js", () => ({
  buildSynthesisInput: () => ({ childName: "Lincoln" }),
  buildSynthesisPrompt: () => "SYSTEM",
  parseSynthesisResponse: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
  rawResponseHead: (text: string, max = 200) => text.replace(/\s+/g, " ").trim().slice(0, max),
}));

// Module-load-time dependencies of the callable registration.
vi.mock("./aiConfig.js", () => ({ claudeApiKey: { value: () => "key" } }));
vi.mock("./authGuard.js", () => ({ requireEmailAuth: () => ({ uid: "fam-1" }) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));
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
import { synthesizeLearnerModelForChild } from "./learnerSynthesis.js";

/** Minimal Firestore stub: the learner model doc exists and is seeded. */
function makeDb(): Firestore {
  return {
    doc: () => ({
      get: async () => ({
        exists: true,
        data: () => ({ status: "seeded", conceptStates: {} }),
      }),
      set: async () => undefined,
    }),
  } as unknown as Firestore;
}

describe("synthesizeLearnerModelForChild — honest error propagation (DOC-09)", () => {
  beforeEach(() => {
    callClaudeMock.mockReset();
    logAiUsageMock.mockClear();
  });

  it("surfaces the model-call error class + message in the failed result", async () => {
    class NotFoundError extends Error {
      constructor() {
        super("model: claude-opus-4-8 not found");
        this.name = "NotFoundError";
      }
    }
    callClaudeMock.mockRejectedValue(new NotFoundError());

    const result = await synthesizeLearnerModelForChild(
      makeDb(),
      "fam-1",
      "lincoln",
      "Lincoln",
      "key",
    );

    expect(result.status).toBe("failed");
    // The detail carries the underlying class + message, not an opaque "failed".
    expect(result.detail).toBe("NotFoundError: model: claude-opus-4-8 not found");
    expect(result.synthesis).toBeUndefined();
  });

  it("surfaces a parse-failure reason when the model returns non-JSON", async () => {
    callClaudeMock.mockResolvedValue({
      text: "not json at all",
      inputTokens: 1,
      outputTokens: 1,
    });

    const result = await synthesizeLearnerModelForChild(
      makeDb(),
      "fam-1",
      "lincoln",
      "Lincoln",
      "key",
    );

    expect(result.status).toBe("failed");
    // The detail now carries the raw response head so a third failure mode
    // (refusal / truncation / wrong shape) names itself on the next tap.
    expect(result.detail).toBe(
      "Synthesis response could not be parsed as JSON. Raw head: not json at all",
    );
  });

  it("emits a named empty-reply error with usage numbers, not a parse failure (FEAT-77)", async () => {
    // The model call succeeded but reasoning consumed the whole budget: empty
    // text, non-trivial output tokens. This must NOT read as unparseable JSON.
    callClaudeMock.mockResolvedValue({
      text: "   ",
      inputTokens: 3200,
      outputTokens: 4000,
    });

    const result = await synthesizeLearnerModelForChild(
      makeDb(),
      "fam-1",
      "lincoln",
      "Lincoln",
      "key",
    );

    expect(result.status).toBe("failed");
    expect(result.detail).toBe(
      "Model returned no text (4000 output/thinking tokens consumed, 0 visible text) — likely reasoning consumed the budget; check effort/maxTokens.",
    );
    // It is the empty-reply message, never the JSON-parse message.
    expect(result.detail).not.toContain("could not be parsed as JSON");
  });

  it("surfaces the raw response head for a garbage (non-JSON) reply", async () => {
    callClaudeMock.mockResolvedValue({
      text: "I'm sorry, but I can't help with that request.\n\nLet me know if...",
      inputTokens: 1,
      outputTokens: 1,
    });

    const result = await synthesizeLearnerModelForChild(
      makeDb(),
      "fam-1",
      "lincoln",
      "Lincoln",
      "key",
    );

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("Raw head: I'm sorry, but I can't help");
    // Newlines are collapsed to single spaces in the head.
    expect(result.detail).not.toContain("\n");
  });
});
