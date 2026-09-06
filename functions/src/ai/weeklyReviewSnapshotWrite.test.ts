import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UX-212 / UX-214 — what the review WRITE does around the snapshot.
 *
 * Exercised through the no-evidence path, which reaches Firestore and skips the
 * model entirely: a week with nothing logged is exactly the week the rate exists
 * to make visible, so it must record positions like any other.
 *
 * Two properties, both of which would be invisible until they cost real data:
 *   • the positions are recorded even when the week was empty; and
 *   • a regenerate does not delete a parent's answer. Both write paths `.set()`
 *     the WHOLE document, so an answer given on Tuesday would vanish the moment
 *     anybody tapped "Regenerate Review" — the carry-forward read is the only
 *     thing standing between the parent's judgement and a silent deletion.
 */

interface FakeState {
  configs: Array<{ id: string; data: Record<string, unknown> }>;
  existing: Record<string, unknown> | undefined;
  /** When true, the transactional read of the review document throws. */
  existingReadFails: boolean;
  /** Set by the caller to simulate an answer saved DURING the transaction. */
  onTransactionRead: (() => void) | undefined;
  written: Record<string, unknown> | undefined;
  writeOptions: unknown;
  /** True when the write went through a transaction rather than a plain set. */
  wroteInTransaction: boolean;
  configQueries: unknown[][];
}

const state: FakeState = {
  configs: [],
  existing: undefined,
  existingReadFails: false,
  onTransactionRead: undefined,
  written: undefined,
  writeOptions: undefined,
  wroteInTransaction: false,
  configQueries: [],
};

/** Read the review document the way the real transaction would. */
function readReviewDoc() {
  if (state.existingReadFails) throw new Error("unavailable");
  state.onTransactionRead?.();
  return {
    exists: state.existing !== undefined,
    data: () => (state.existing ? { reflection: state.existing } : {}),
  };
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: (path: string) => ({
      where: (...args: unknown[]) => {
        state.configQueries.push(args);
        return {
          get: async () => ({
            docs: state.configs.map((c) => ({ id: c.id, data: () => c.data })),
          }),
        };
      },
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>, options?: unknown) => {
          state.written = { ...data, __path: `${path}/${id}` };
          state.writeOptions = options;
        },
      }),
    }),
    doc: () => ({
      get: async () => readReviewDoc(),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: unknown) => Promise<unknown>;
        set: (ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      await fn({
        get: async () => readReviewDoc(),
        set: (_ref, data) => {
          state.written = { ...data };
          state.writeOptions = undefined;
          state.wroteInTransaction = true;
        },
      });
    },
  }),
}));

const { generateReviewForChild } = await import("./evaluate.js");
import type { WeekContext } from "./evaluate.js";

const emptyWeek: WeekContext = {
  child: { id: "lincoln", name: "Lincoln", grade: "3rd" },
  weekKey: "2026-08-30",
  dayLogs: [],
  hours: [],
  dailyPlans: [],
  missedDays: 5,
  bookActivity: [],
  books: {
    booksCreated: [],
    booksCompleted: [],
    readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
  },
  teachBacks: { count: 0, bySubject: {}, audioCount: 0, textCount: 0, examples: [] },
};

beforeEach(() => {
  state.configs = [];
  state.existing = undefined;
  state.existingReadFails = false;
  state.onTransactionRead = undefined;
  state.written = undefined;
  state.writeOptions = undefined;
  state.wroteInTransaction = false;
  state.configQueries = [];
});

describe("the review write records the week's positions (UX-212)", () => {
  it("records them even on a week with nothing logged", async () => {
    state.configs = [
      { id: "w1", data: { name: "TGTB Math", currentPosition: 14, totalUnits: 60, unitLabel: "lesson" } },
      { id: "r1", data: { name: "Prayer and Scripture", defaultMinutes: 10 } },
    ];

    await generateReviewForChild("fam-1", emptyWeek, "key");

    const snapshot = state.written?.curriculumPositions as {
      weekKey: string;
      recordedAt: string;
      positions: Array<{ configId: string }>;
    };
    expect(snapshot.weekKey).toBe("2026-08-30");
    expect(snapshot.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.positions.map((p) => p.configId)).toEqual(["w1"]);
  });

  it("reads the same child-or-both audience every activityConfigs reader uses", async () => {
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 1 } }];
    await generateReviewForChild("fam-1", emptyWeek, "key");
    expect(state.configQueries[0]).toEqual(["childId", "in", ["lincoln", "both"]]);
  });

  it("writes no snapshot key at all when there is nothing to record", async () => {
    await generateReviewForChild("fam-1", emptyWeek, "key");
    expect(state.written).not.toHaveProperty("curriculumPositions");
  });
});

describe("a regenerate does not delete the parent's answer (UX-214)", () => {
  it("carries an existing reflection forward onto the rewritten document", async () => {
    state.existing = {
      answer: "can-do-more",
      note: "packing week",
      answeredAt: "2026-09-01T10:00:00.000Z",
    };

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written?.reflection).toEqual(state.existing);
  });

  it("carries it forward ATOMICALLY, inside the write's own transaction", async () => {
    // A read-then-write pair loses an answer saved in the gap between them.
    // Firestore retries a transaction whose document changed underneath, so the
    // read and the write have to be the same unit — asserted by the write
    // arriving through the transaction rather than a plain set.
    state.existing = { answer: "about-right", answeredAt: "x" };
    await generateReviewForChild("fam-1", emptyWeek, "key");
    expect(state.wroteInTransaction).toBe(true);
  });

  it("sees an answer saved during the write, not the one that was there before", async () => {
    // The parent taps Save while the review is regenerating. The transactional
    // read is what decides, so the newly saved answer is what survives.
    state.existing = undefined;
    state.onTransactionRead = () => {
      state.existing = { answer: "can-do-more", answeredAt: "later" };
      state.onTransactionRead = undefined;
    };

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written?.reflection).toEqual({
      answer: "can-do-more",
      answeredAt: "later",
    });
  });

  it("writes no reflection key when the parent has not answered", async () => {
    await generateReviewForChild("fam-1", emptyWeek, "key");
    expect(state.written).not.toHaveProperty("reflection");
  });

  it("merges instead of replacing when the transaction cannot complete", async () => {
    // A failed read is not a confirmed absence. Replacing the document on that
    // path would delete an answer we simply could not see — a transient network
    // blip silently destroying a judgement a person recorded.
    state.existingReadFails = true;

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written).not.toHaveProperty("reflection");
    expect(state.writeOptions).toEqual({ merge: true });
    expect(state.wroteInTransaction).toBe(false);
  });

  it("still records the week's snapshot on that fallback path", async () => {
    state.existingReadFails = true;
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 7 } }];

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written?.curriculumPositions).toBeDefined();
    expect(state.writeOptions).toEqual({ merge: true });
  });
});
