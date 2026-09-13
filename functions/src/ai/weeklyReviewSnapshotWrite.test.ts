import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the weekly review WRITE does, and in what ORDER (UX-212 / UX-214 / UX-409).
 *
 * ── The order is the point (UX-409) ─────────────────────────────────────────
 * `generateReviewForChild` used to call Claude first and write the document only
 * after that call returned, so a rate limit, a missing secret, a parse failure
 * or an outage wrote NOTHING — losing the regenerable narrative and, with it,
 * the `curriculumPositions` snapshot, which is the repository's only record of
 * where a workbook stood on a date and cannot be rebuilt once the positions
 * move on. Owner decision, 2026-09-13: write the snapshot first, narrative
 * second. These tests assert that as an order, with the failing-model case as
 * the positive control: make the call throw, and the week's record must still be
 * on file with no narrative on it.
 *
 * ── The properties that were already here ───────────────────────────────────
 *   • the positions are recorded even when the week was empty (UX-212); and
 *   • a regenerate does not delete a parent's answer (UX-214). Every write from
 *     the module is now field-scoped, which makes the answer safe by
 *     construction, and the transactional carry-forward is kept on top.
 */

interface CapturedWrite {
  data: Record<string, unknown>;
  options: unknown;
  viaTransaction: boolean;
  /** Monotonic tick, so a write can be ordered against the model call. */
  at: number;
}

interface FakeState {
  configs: Array<{ id: string; data: Record<string, unknown> }>;
  existing: Record<string, unknown> | undefined;
  /** Fields already on the review document, beside the reflection. */
  existingDoc: Record<string, unknown> | undefined;
  /** When true, the transactional read of the review document throws. */
  existingReadFails: boolean;
  /** Set by the caller to simulate an answer saved DURING the transaction. */
  onTransactionRead: (() => void) | undefined;
  written: Record<string, unknown> | undefined;
  writeOptions: unknown;
  /** True when the write went through a transaction rather than a plain set. */
  wroteInTransaction: boolean;
  configQueries: unknown[][];
  /** Every write, in order — UX-409 is about which one lands first. */
  writes: CapturedWrite[];
  /** What the model call does: return text, or throw. */
  claude: () => { text: string; inputTokens: number; outputTokens: number };
  /** The tick at which the model was called, or null if it never was. */
  claudeCalledAt: number | null;
  usageLogged: number;
  clock: number;
}

const state: FakeState = {
  configs: [],
  existing: undefined,
  existingDoc: undefined,
  existingReadFails: false,
  onTransactionRead: undefined,
  written: undefined,
  writeOptions: undefined,
  wroteInTransaction: false,
  configQueries: [],
  writes: [],
  claude: () => ({ text: "{}", inputTokens: 0, outputTokens: 0 }),
  claudeCalledAt: null,
  usageLogged: 0,
  clock: 0,
};

function tick(): number {
  state.clock += 1;
  return state.clock;
}

function record(
  data: Record<string, unknown>,
  options: unknown,
  viaTransaction: boolean,
): void {
  state.written = { ...data };
  state.writeOptions = options;
  state.wroteInTransaction = viaTransaction;
  state.writes.push({ data: { ...data }, options, viaTransaction, at: tick() });
}

/** Read the review document the way the real transaction would. */
function readReviewDoc() {
  if (state.existingReadFails) throw new Error("unavailable");
  state.onTransactionRead?.();
  const doc = {
    ...state.existingDoc,
    ...(state.existing ? { reflection: state.existing } : {}),
  };
  const exists = state.existing !== undefined || state.existingDoc !== undefined;
  return { exists, data: () => doc };
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
          record({ ...data, __path: `${path}/${id}` }, options, false);
        },
      }),
    }),
    // Only `loadSnapshotData` reaches this, and only on the model path.
    doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: unknown) => Promise<unknown>;
        set: (ref: unknown, data: Record<string, unknown>, options?: unknown) => void;
      }) => Promise<void>,
    ) => {
      await fn({
        get: async () => readReviewDoc(),
        set: (_ref, data, options) => record(data, options, true),
      });
    },
  }),
}));

// The model and the context it is given — mocked so the ORDER of the writes
// around them can be asserted without a network call.
vi.mock("./chatTypes.js", () => ({
  callClaude: async () => {
    state.claudeCalledAt = tick();
    return state.claude();
  },
  logAiUsage: async () => {
    state.usageLogged += 1;
  },
}));

vi.mock("./chat.js", () => ({
  modelForTask: () => "claude-test",
}));

vi.mock("./contextSlices.js", () => ({
  buildContextForTask: async () => ["CONTEXT"],
}));

vi.mock("./learnerSynthesis.js", () => ({
  synthesizeIfStale: async () => undefined,
}));

const { generateReviewForChild, toCurriculumPositions } = await import("./evaluate.js");
import type { WeekContext } from "./evaluate.js";

const emptyWeek: WeekContext = {
  child: { id: "lincoln", name: "Lincoln", grade: "3rd" },
  weekKey: "2026-08-30",
  dayLogs: [],
  dayLogDocs: [],
  hours: [],
  hoursAdjustments: [],
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

/** A week with evidence — the path that actually calls the model. */
const loggedWeek: WeekContext = {
  ...emptyWeek,
  hours: [
    { childId: "lincoln", minutes: 45, subjectBucket: "Reading", date: "2026-08-31" },
  ],
};

const VALID_REVIEW = JSON.stringify({
  celebration: "Great week",
  summary: "Steady",
  wins: ["Phonics"],
  growthAreas: [],
  paceAdjustments: [],
  recommendations: [],
  energyPattern: "even",
});

beforeEach(() => {
  state.configs = [];
  state.existing = undefined;
  state.existingDoc = undefined;
  state.existingReadFails = false;
  state.onTransactionRead = undefined;
  state.written = undefined;
  state.writeOptions = undefined;
  state.wroteInTransaction = false;
  state.configQueries = [];
  state.writes = [];
  state.claude = () => ({ text: VALID_REVIEW, inputTokens: 10, outputTokens: 20 });
  state.claudeCalledAt = null;
  state.usageLogged = 0;
  state.clock = 0;
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

describe("the record is written BEFORE the model is called (UX-409)", () => {
  it("writes the week's record first, then calls the model", async () => {
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 14 } }];

    await generateReviewForChild("fam-1", loggedWeek, "key");

    expect(state.claudeCalledAt).not.toBeNull();
    expect(state.writes[0].at).toBeLessThan(state.claudeCalledAt!);
    expect(state.writes[0].data.curriculumPositions).toBeDefined();
    // …and the narrative arrives on a LATER write, never in that first one.
    expect(state.writes[0].data).not.toHaveProperty("celebration");
    expect(state.writes.length).toBeGreaterThan(1);
  });

  it("POSITIVE CONTROL — a model failure still leaves the week's record on file", async () => {
    // The whole of UX-409: this is the run that used to write nothing at all.
    state.configs = [
      { id: "w1", data: { name: "TGTB Math", currentPosition: 14, totalUnits: 60, unitLabel: "lesson" } },
    ];
    state.claude = () => {
      throw new Error("429 rate limit");
    };

    await expect(
      generateReviewForChild("fam-1", loggedWeek, "key"),
    ).rejects.toThrow("429 rate limit");

    const first = state.writes[0].data;
    expect(first.status).toBe("snapshot-only");
    expect(first.curriculumPositions).toBeDefined();
    expect(first.hoursSummary).toBeDefined();
    expect(first).not.toHaveProperty("celebration");
    expect(first).not.toHaveProperty("summary");
  });

  it("says on the document WHY the narrative is missing", async () => {
    state.claude = () => {
      throw new Error("Missing CLAUDE_API_KEY secret");
    };

    await expect(
      generateReviewForChild("fam-1", loggedWeek, "key"),
    ).rejects.toThrow();

    const last = state.writes[state.writes.length - 1].data;
    expect(last.narrativeError).toMatchObject({
      message: "Missing CLAUDE_API_KEY secret",
    });
    // The explanation is merged on; it carries no narrative and no record fields.
    expect(last).not.toHaveProperty("curriculumPositions");
    expect(state.writes[state.writes.length - 1].options).toEqual({ merge: true });
  });

  it("an unparseable reply is a narrative failure, not a lost week", async () => {
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 3 } }];
    state.claude = () => ({ text: "I can't do that.", inputTokens: 1, outputTokens: 1 });

    await expect(
      generateReviewForChild("fam-1", loggedWeek, "key"),
    ).rejects.toThrow();

    expect(state.writes[0].data.curriculumPositions).toBeDefined();
    expect(state.writes[state.writes.length - 1].data).toHaveProperty("narrativeError");
    expect(state.usageLogged).toBe(0);
  });

  it("clears the explanation once a narrative lands", async () => {
    await generateReviewForChild("fam-1", loggedWeek, "key");

    const narrativeWrite = state.writes.find((w) => "celebration" in w.data)!;
    expect(narrativeWrite.data.status).toBe("draft");
    expect(narrativeWrite.data.narrativeError).toBeNull();
    expect(narrativeWrite.options).toEqual({ merge: true });
    expect(state.usageLogged).toBe(1);
  });

  it("never writes the whole document, so the parent's answer cannot be in the payload", async () => {
    state.existing = { answer: "about-right", answeredAt: "x" };

    await generateReviewForChild("fam-1", loggedWeek, "key");

    for (const write of state.writes) {
      expect(write.options).toEqual({ merge: true });
    }
    // The record write carries the answer forward; the narrative write, which
    // does not read the document at all, must not mention it.
    const narrativeWrite = state.writes.find((w) => "celebration" in w.data)!;
    expect(narrativeWrite.data).not.toHaveProperty("reflection");
  });
});

describe("the snapshot is the record of THAT week, not of today (UX-409)", () => {
  it("does not re-stamp positions a previous run already recorded", async () => {
    // The manual regenerate case: re-run the narrative for a week whose
    // workbooks have moved on since. The week's own reading must stand.
    state.existingDoc = {
      curriculumPositions: {
        recordedAt: "2026-08-30T05:15:00.000Z",
        weekKey: "2026-08-30",
        positions: [{ configId: "w1", name: "Math", currentPosition: 14 }],
      },
    };
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 31 } }];

    await generateReviewForChild("fam-1", loggedWeek, "key");

    expect(state.writes[0].data).not.toHaveProperty("curriculumPositions");
  });

  it("does not downgrade the status of a week that already generated one", async () => {
    state.existingDoc = { status: "draft" };
    await generateReviewForChild("fam-1", loggedWeek, "key");
    expect(state.writes[0].data).not.toHaveProperty("status");
  });

  it("keeps the UX-212 snapshot shape exactly — derived, not retyped", async () => {
    const configs = [
      { id: "w1", data: { name: "TGTB Math", currentPosition: 14, totalUnits: 60, unitLabel: "lesson" } },
      { id: "s1", data: { name: "History", currentPosition: 4, unitLabel: "session" } },
      { id: "r1", data: { name: "Prayer", defaultMinutes: 10 } },
    ];
    state.configs = configs;

    await generateReviewForChild("fam-1", loggedWeek, "key");

    const snapshot = state.writes[0].data.curriculumPositions as {
      recordedAt: string;
      weekKey: string;
      positions: unknown[];
    };
    expect(snapshot.weekKey).toBe("2026-08-30");
    expect(snapshot.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The positions are asserted against the same pure function the pre-UX-409
    // ordering wrote them with, so a drift in the shape fails here rather than
    // silently changing what a week's record means.
    expect(snapshot.positions).toEqual(toCurriculumPositions(configs));
  });
});

describe("the week's counted minutes are recorded with it (UX-409 / UX-410)", () => {
  it("folds all three sources onto the record, stamped", async () => {
    const week: WeekContext = {
      ...emptyWeek,
      dayLogDocs: [
        {
          childId: "lincoln",
          date: "2026-08-31",
          checklist: [
            { label: "Phonics", completed: true, subjectBucket: "Reading", estimatedMinutes: 20 },
          ],
        },
      ],
      hours: [
        { childId: "lincoln", minutes: 45, subjectBucket: "Math", date: "2026-08-31" },
      ],
      hoursAdjustments: [
        { childId: "both", minutes: 15, subjectBucket: "Science", date: "2026-09-01" },
      ],
    };

    await generateReviewForChild("fam-1", week, "key");

    expect(state.writes[0].data.hoursSummary).toMatchObject({
      weekKey: "2026-08-30",
      totalMinutes: 80,
      minutesBySubject: { Reading: 20, Math: 45, Science: 15 },
    });
  });
});
