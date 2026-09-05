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
  /** When true, reading the existing review document throws. */
  existingReadFails: boolean;
  written: Record<string, unknown> | undefined;
  writeOptions: unknown;
  configQueries: unknown[][];
}

const state: FakeState = {
  configs: [],
  existing: undefined,
  existingReadFails: false,
  written: undefined,
  writeOptions: undefined,
  configQueries: [],
};

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
      get: async () => {
        if (state.existingReadFails) throw new Error("unavailable");
        return {
          exists: state.existing !== undefined,
          data: () => (state.existing ? { reflection: state.existing } : {}),
        };
      },
    }),
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
  state.written = undefined;
  state.writeOptions = undefined;
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

  it("writes no reflection key when the parent has not answered", async () => {
    await generateReviewForChild("fam-1", emptyWeek, "key");
    expect(state.written).not.toHaveProperty("reflection");
    // A confirmed absence is a replacement, as it always was.
    expect(state.writeOptions).toBeUndefined();
  });

  it("merges instead of replacing when the carry-forward read FAILED", async () => {
    // A failed read is not a confirmed absence. Replacing the document on that
    // path would delete an answer we simply could not see — a transient network
    // blip silently destroying a judgement a person recorded.
    state.existingReadFails = true;

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written).not.toHaveProperty("reflection");
    expect(state.writeOptions).toEqual({ merge: true });
  });

  it("still records the week's snapshot on that merge path", async () => {
    state.existingReadFails = true;
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 7 } }];

    await generateReviewForChild("fam-1", emptyWeek, "key");

    expect(state.written?.curriculumPositions).toBeDefined();
    expect(state.writeOptions).toEqual({ merge: true });
  });
});
