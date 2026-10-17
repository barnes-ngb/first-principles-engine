import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

/**
 * An old synthesis must not land on a model that has moved (FEAT-242).
 *
 * A Sonnet call takes seconds; a learner-model write takes none. So a confirmed
 * program completion — or an eval, or a quest close, or a second synthesis run —
 * can commit while a synthesis is in flight. Two things were wrong before:
 * the late run cleared `synthesisStaleAt` (marking prose FRESH that was computed
 * without the newer evidence), and it wrote `{ synthesis }` unconditionally,
 * which could overwrite a newer run's advice and could RECREATE a model that had
 * been deleted meanwhile.
 *
 * The rule now: on any revision movement, or a missing document, write NOTHING.
 */

const { callClaudeMock, logAiUsageMock } = vi.hoisted(() => ({
  callClaudeMock: vi.fn(),
  logAiUsageMock: vi.fn(async () => undefined),
}));

vi.mock("./chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatTypes.js")>();
  return { ...actual, callClaude: callClaudeMock, logAiUsage: logAiUsageMock };
});
vi.mock("./chat.js", () => ({ modelForTask: () => "claude-sonnet-5" }));
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
  rawResponseHead: (text: string) => text.slice(0, 200),
}));
vi.mock("./aiConfig.js", () => ({ claudeApiKey: { value: () => "key" } }));
vi.mock("./authGuard.js", () => ({ requireEmailAuth: () => ({ uid: "fam-1" }) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));
vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {},
}));

import { synthesizeLearnerModelForChild } from "./learnerSynthesis.js";

const REPLY = JSON.stringify({
  whatMattersNext: [],
  narrative: "n",
  openQuestionsSummary: [],
});

/**
 * A Firestore stub with one document and real-enough transaction semantics: the
 * callback sees the CURRENT document, and `onFirstTxRead` lets a test commit a
 * competing write in the window the real race lives in.
 *
 * The document carries a REVISION, exposed as `updateTime` the way the admin
 * SDK does, and every mutation — a write, or a test assigning `state.doc`
 * directly — advances it. That is what lets a test move the evidence while
 * leaving `updatedAt` and `synthesisStaleAt` byte-identical.
 */
function makeDb(
  initial: Record<string, unknown> | null,
  hooks: { onFirstTxRead?: () => void } = {},
) {
  let doc: Record<string, unknown> | null = initial;
  let revision = 1;
  const state = {
    get doc(): Record<string, unknown> | null {
      return doc;
    },
    set doc(value: Record<string, unknown> | null) {
      doc = value;
      revision += 1;
    },
  };
  const writes: Array<Record<string, unknown>> = [];
  // The admin SDK's `Timestamp` shape, and deliberately all inside ONE second —
  // each mutation advances the document by a single microsecond, so every case
  // in this file is also a test that two commits inside the same millisecond are
  // told apart. A millisecond-resolution comparison would call them equal.
  const snapshot = () => ({
    exists: doc !== null,
    data: () => doc,
    updateTime: { seconds: 1760000000, nanoseconds: revision * 1000 },
  });
  const ref = {
    get: async () => snapshot(),
    set: async (data: Record<string, unknown>) => {
      writes.push(data);
      state.doc = { ...(doc ?? {}), ...data };
    },
  };
  let txReads = 0;
  const db = {
    doc: () => ref,
    runTransaction: async (
      fn: (tx: {
        get: (r: typeof ref) => Promise<ReturnType<typeof snapshot>>;
        set: (r: typeof ref, data: Record<string, unknown>) => void;
      }) => unknown,
    ) => {
      const staged: Array<Record<string, unknown>> = [];
      const out = await fn({
        get: async () => {
          txReads += 1;
          if (txReads === 1 && hooks.onFirstTxRead) hooks.onFirstTxRead();
          return snapshot();
        },
        set: (_r, data) => {
          staged.push(data);
        },
      });
      for (const data of staged) {
        writes.push(data);
        state.doc = { ...(doc ?? {}), ...data };
      }
      return out;
    },
  } as unknown as Firestore;
  return { db, state, writes };
}

beforeEach(() => {
  callClaudeMock.mockReset();
  logAiUsageMock.mockReset();
  callClaudeMock.mockResolvedValue({ text: REPLY, inputTokens: 10, outputTokens: 10 });
});

describe("synthesizeLearnerModelForChild — overlapping runs", () => {
  it("clears the stale mark when nothing moved underneath it", async () => {
    const { db, state, writes } = makeDb({
      status: "seeded",
      conceptStates: {},
      synthesisStaleAt: "2026-10-17T00:00:00.000Z",
      updatedAt: "2026-10-17T00:00:00.000Z",
    });
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("written");
    expect(writes).toHaveLength(1);
    expect((state.doc as { synthesisStaleAt: unknown }).synthesisStaleAt).toBeNull();
  });

  it("writes NOTHING when the model moved mid-call — the newer advice and the stale mark both stand", async () => {
    const newer = {
      status: "seeded",
      conceptStates: {},
      synthesis: { narrative: "B — from newer evidence" },
      synthesisStaleAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
    };
    const { db, state, writes } = makeDb(
      {
        status: "seeded",
        conceptStates: {},
        synthesisStaleAt: "2026-10-17T00:00:00.000Z",
        updatedAt: "2026-10-17T00:00:00.000Z",
      },
      {
        // Run B commits while run A is in its transaction.
        onFirstTxRead: () => {
          state.doc = { ...newer };
        },
      },
    );
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("skipped-stale");
    expect(writes).toHaveLength(0);
    const doc = state.doc as { synthesis: { narrative: string }; synthesisStaleAt: unknown };
    expect(doc.synthesis.narrative).toBe("B — from newer evidence");
    expect(doc.synthesisStaleAt).toBe("2026-10-18T00:00:00.000Z");
  });

  it("writes NOTHING when the document revision moved but both app stamps stayed equal", async () => {
    // The independent review's countertest. A concept-state write can leave
    // `updatedAt` and `synthesisStaleAt` exactly as they were (same ISO second,
    // or a writer that touches neither), and comparing only those marked prose
    // fresh that was generated before that evidence existed.
    const { db, state, writes } = makeDb(
      {
        status: "seeded",
        conceptStates: {},
        synthesisStaleAt: "same",
        updatedAt: "same",
      },
      {
        onFirstTxRead: () => {
          state.doc = {
            status: "seeded",
            conceptStates: { "reading.phonics.cvc": { state: "forming" } },
            synthesisStaleAt: "same",
            updatedAt: "same",
          };
        },
      },
    );
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("skipped-stale");
    expect(writes).toHaveLength(0);
    expect((state.doc as { synthesis?: unknown }).synthesis).toBeUndefined();
    // ...and the stale mark the other writer left is untouched, so the next beat
    // regenerates against the evidence this run could not see.
    expect((state.doc as { synthesisStaleAt: unknown }).synthesisStaleAt).toBe("same");
  });

  it("records the usage of a run whose prose was discarded", async () => {
    // The call was paid for whichever way the commit went. Logging it only on
    // success under-reported every discarded run.
    const { db, state, writes } = makeDb(
      {
        status: "seeded",
        conceptStates: {},
        synthesisStaleAt: "2026-10-17T00:00:00.000Z",
        updatedAt: "2026-10-17T00:00:00.000Z",
      },
      { onFirstTxRead: () => { state.doc = { ...(state.doc ?? {}), conceptStates: { x: {} } }; } },
    );
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("skipped-stale");
    expect(writes).toHaveLength(0);
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    const logged = logAiUsageMock.mock.calls.at(0) as unknown as unknown[];
    expect(logged[2]).toMatchObject({
      taskType: "learnerSynthesis",
      inputTokens: 10,
      outputTokens: 10,
    });
  });

  it("fails CLOSED when no revision can be read at all", async () => {
    // A snapshot with no `updateTime` cannot be compared, and "we could not
    // tell" must never resolve to "nothing moved".
    const noRevision = {
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ status: "seeded", conceptStates: {} }) }) }),
      runTransaction: async (
        fn: (tx: {
          get: () => Promise<{ exists: boolean; data: () => unknown }>;
          set: () => void;
        }) => unknown,
      ) =>
        fn({
          get: async () => ({ exists: true, data: () => ({ status: "seeded", conceptStates: {} }) }),
          set: () => {
            throw new Error("wrote on an unreadable revision");
          },
        }),
    } as unknown as Firestore;
    // The stub's `set` throws, so a write here fails the test rather than
    // merely being counted.
    const result = await synthesizeLearnerModelForChild(noRevision, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("skipped-stale");
    expect(result.detail).toMatch(/revision/);
  });

  it("records the usage of a successful run exactly once", async () => {
    const { db, writes } = makeDb({
      status: "seeded",
      conceptStates: {},
      synthesisStaleAt: "2026-10-17T00:00:00.000Z",
      updatedAt: "2026-10-17T00:00:00.000Z",
    });
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("written");
    expect(writes).toHaveLength(1);
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
  });

  it("does not recreate a model deleted during the call", async () => {
    const { db, state, writes } = makeDb(
      { status: "seeded", conceptStates: {}, updatedAt: "2026-10-17T00:00:00.000Z" },
      { onFirstTxRead: () => { state.doc = null; } },
    );
    const result = await synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k");
    expect(result.status).toBe("skipped-no-model");
    expect(writes).toHaveLength(0);
    expect(state.doc).toBeNull();
  });
});

/**
 * A commit that REJECTS still spent the provider's tokens.
 *
 * The transaction can fail outright — contention, a permission error, a dropped
 * connection — after a paid response has already come back. Accounting has to
 * record that call once anyway, and the caller has to see the ORIGINAL commit
 * error: an accounting failure must never be the error that surfaces, and a
 * failed write must never be reported as a success.
 */
describe("synthesizeLearnerModelForChild — accounting when the commit fails", () => {
  const seeded = {
    status: "seeded",
    conceptStates: {},
    synthesisStaleAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };

  it("records the paid usage once, then re-throws the transaction's own error", async () => {
    const { db, state } = makeDb({ ...seeded });
    db.runTransaction = (async () => {
      throw new Error("commit failed");
    }) as unknown as Firestore["runTransaction"];

    await expect(synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k")).rejects.toThrow(
      "commit failed",
    );
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    const logged = logAiUsageMock.mock.calls.at(0) as unknown as unknown[];
    expect(logged[2]).toMatchObject({
      taskType: "learnerSynthesis",
      inputTokens: 10,
      outputTokens: 10,
    });
    // Nothing was stored, and nothing was faked as stored.
    expect((state.doc as { synthesis?: unknown }).synthesis).toBeUndefined();
    expect((state.doc as { synthesisStaleAt: unknown }).synthesisStaleAt).toBe(
      "2026-10-17T00:00:00.000Z",
    );
  });

  it("keeps the commit error when the accounting write ALSO fails", async () => {
    const { db } = makeDb({ ...seeded });
    db.runTransaction = (async () => {
      throw new Error("commit failed");
    }) as unknown as Firestore["runTransaction"];
    logAiUsageMock.mockRejectedValueOnce(new Error("usage log failed"));

    // The primary failure is the one the caller needs; the logging failure must
    // not mask it.
    await expect(synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k")).rejects.toThrow(
      "commit failed",
    );
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
  });

  it("still surfaces an accounting failure when the commit SUCCEEDED", async () => {
    // Unchanged behavior on the healthy path: with the prose stored, a failure
    // to record the spend is the only failure there is, so it propagates.
    const { db, writes } = makeDb({ ...seeded });
    logAiUsageMock.mockRejectedValueOnce(new Error("usage log failed"));

    await expect(synthesizeLearnerModelForChild(db, "f1", "c1", "Lincoln", "k")).rejects.toThrow(
      "usage log failed",
    );
    expect(writes).toHaveLength(1);
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
  });
});
