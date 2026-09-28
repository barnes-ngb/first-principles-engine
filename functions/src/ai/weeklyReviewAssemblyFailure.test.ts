import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UX-447 — the week's positions are on file BEFORE the week is assembled.
 *
 * FIX-236 (UX-409) put the record ahead of the model call, but inside
 * `generateReviewForChild`, and both callers reach that function through
 * `assembleWeekContext`. A throw there lost the whole week with nothing on file:
 * the owner, Sunday 2026-09-27, read *"No workbook positions were saved for this
 * week"* about the week of 2026-09-20. These tests drive BOTH callers over an
 * in-memory Firestore with merge semantics, make the assembly throw, and read
 * the document that is left.
 *
 * The positive control for the reorder is the cron with the pre-assembly step
 * replaced by a no-op — the pre-FIX-255 shape — which must leave no document.
 */

type Doc = Record<string, unknown>;

const state: {
  docs: Map<string, Doc>;
  configs: Array<{ id: string; data: Doc }>;
  assemblyFails: boolean;
  configQueries: number;
  claudeCalls: number;
} = {
  docs: new Map(),
  configs: [],
  assemblyFails: false,
  configQueries: 0,
  claudeCalls: 0,
};

const MARKER = "PLANTED-MARKER-families/fam-1/days/secret";

function mergeInto(path: string, data: Doc, options?: { merge?: boolean }) {
  const prior = options?.merge ? state.docs.get(path) ?? {} : {};
  state.docs.set(path, { ...prior, ...data });
}

function docRef(path: string): Record<string, unknown> {
  return {
    __path: path,
    get: async () => {
      if (state.assemblyFails && /\/children\/[^/]+$/.test(path)) {
        throw new Error(`permission denied reading ${MARKER}`);
      }
      if (/\/children\/[^/]+$/.test(path)) {
        return { exists: true, data: () => ({ name: "Lincoln", grade: "3rd" }) };
      }
      const data = state.docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    set: async (data: Doc, options?: { merge?: boolean }) => mergeInto(path, data, options),
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function query(path: string): Record<string, unknown> {
  const q: Record<string, unknown> = {
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    get: async () => {
      if (path.endsWith("/activityConfigs")) {
        state.configQueries += 1;
        return { docs: state.configs.map((c) => ({ id: c.id, data: () => c.data })) };
      }
      return { docs: [], empty: true, size: 0 };
    },
  };
  return q;
}

function collectionRef(path: string) {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (...args: unknown[]) => (query(path).where as (...a: unknown[]) => unknown)(...args),
  };
}

const fakeDb = {
  collection: (path: string) => collectionRef(path),
  doc: (path: string) => docRef(path),
  runTransaction: async (
    fn: (tx: {
      get: (ref: { __path: string }) => Promise<unknown>;
      set: (ref: { __path: string }, data: Doc, options?: { merge?: boolean }) => void;
    }) => Promise<void>,
  ) => {
    await fn({
      get: async (ref) => {
        const data = state.docs.get(ref.__path);
        return { exists: data !== undefined, data: () => data };
      },
      set: (ref, data, options) => mergeInto(ref.__path, data, options),
    });
  },
};

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => fakeDb }));
vi.mock("./aiConfig.js", () => ({ claudeApiKey: { value: () => "key" } }));
vi.mock("./authGuard.js", () => ({ requireEmailAuth: () => ({ uid: "fam-1" }) }));
vi.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: Record<string, unknown>, handler: unknown) => {
    deployedOptions.now = opts;
    return handler;
  },
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
const deployedOptions: { schedule?: Record<string, unknown>; now?: Record<string, unknown> } = {};
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (opts: Record<string, unknown>, handler: unknown) => {
    deployedOptions.schedule = opts;
    return handler;
  },
}));
vi.mock("./chatTypes.js", () => ({
  callClaude: async () => {
    state.claudeCalls += 1;
    return {
      text: JSON.stringify({
        celebration: "Good week",
        summary: "Steady",
        wins: ["Phonics"],
        growthAreas: [],
        paceAdjustments: [],
        recommendations: [],
        energyPattern: "even",
      }),
      inputTokens: 1,
      outputTokens: 1,
    };
  },
  logAiUsage: async () => undefined,
}));
vi.mock("./chat.js", () => ({ modelForTask: () => "claude-test" }));
vi.mock("./contextSlices.js", () => ({ buildContextForTask: async () => ["CONTEXT"] }));
vi.mock("./learnerSynthesis.js", () => ({ synthesizeIfStale: async () => undefined }));

const evaluate = await import("./evaluate.js");
const {
  runWeeklyReviewCycleForChild,
  recordWeekBeforeAssembly,
  writeContextFailure,
  CONTEXT_FAILURE_MESSAGES,
} = evaluate;
const generateWeeklyReviewNow = evaluate.generateWeeklyReviewNow as unknown as (
  req: unknown,
) => Promise<unknown>;

const WEEK = "2026-09-20";
const PATH = `families/fam-1/weeklyReviews/${WEEK}_lincoln`;
const db = fakeDb as never;

function runCron(overrides: Record<string, unknown> = {}) {
  return runWeeklyReviewCycleForChild(db, "fam-1", "lincoln", "Lincoln", WEEK, "key", {
    synthesizeIfStale: (async () => undefined) as never,
    assembleWeekContext: evaluate.assembleWeekContext,
    generateReviewForChild: evaluate.generateReviewForChild,
    ...overrides,
  });
}

function tryAgain() {
  return generateWeeklyReviewNow({
    data: { familyId: "fam-1", childId: "lincoln", weekKey: WEEK },
  });
}

const positionedConfigs = [
  { id: "w1", data: { name: "TGTB Math Level 3", currentPosition: 14, totalUnits: 60, unitLabel: "lesson" } },
  { id: "w2", data: { name: "TGTB Language Arts Level 1", currentPosition: 40 } },
];

beforeEach(() => {
  state.docs = new Map();
  state.configs = [];
  state.assemblyFails = false;
  state.configQueries = 0;
  state.claudeCalls = 0;
});

describe("the cron: assembly throws, and the week is still on file (UX-447)", () => {
  it("POSITIVE CONTROL — without the pre-assembly record, a thrown assembly leaves nothing", async () => {
    // The pre-FIX-255 shape: the only record write is inside
    // `generateReviewForChild`, which a throw in the assembly never reaches.
    state.configs = positionedConfigs;
    state.assemblyFails = true;

    await runCron({ recordWeekBeforeAssembly: async () => undefined });

    const doc = state.docs.get(PATH);
    expect(doc?.curriculumPositions).toBeUndefined();
    expect(doc?.status).toBeUndefined();
  });

  it("records the positions and a status even though the assembly threw", async () => {
    state.configs = positionedConfigs;
    state.assemblyFails = true;

    await expect(runCron()).resolves.toBeUndefined();

    const doc = state.docs.get(PATH)!;
    expect(doc.status).toBe("snapshot-only");
    expect(doc.childId).toBe("lincoln");
    expect(doc.weekKey).toBe(WEEK);
    expect(doc.curriculumPositions).toMatchObject({
      weekKey: WEEK,
      positions: evaluate.toCurriculumPositions(positionedConfigs),
    });
    // …and says which half failed, without implying a full record.
    expect(doc.contextError).toMatchObject({ reason: "assembly-failed" });
    expect(doc).not.toHaveProperty("hoursSummary");
    expect(doc).not.toHaveProperty("evidence");
    expect(doc).not.toHaveProperty("narrativeError");
    expect(state.claudeCalls).toBe(0);
  });

  it("stores the app's own sentence, never the thrown error's text", async () => {
    state.configs = positionedConfigs;
    state.assemblyFails = true;

    await runCron();

    const stored = state.docs.get(PATH)!.contextError as { message: string };
    expect(stored.message).toBe(CONTEXT_FAILURE_MESSAGES["assembly-failed"]);
    expect(JSON.stringify(state.docs.get(PATH))).not.toContain("PLANTED-MARKER");
  });

  it("round 1 P1 — records the positions even while learner synthesis hangs", async () => {
    // `synthesizeIfStale` is a model call; a hang until the function's deadline
    // used to happen BEFORE the positions write, which then never ran.
    state.configs = positionedConfigs;
    void runCron({ synthesizeIfStale: () => new Promise(() => undefined) });
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.docs.get(PATH)?.curriculumPositions).toMatchObject({
      positions: evaluate.toCurriculumPositions(positionedConfigs),
    });
  });

  it("records the positions BEFORE synthesis and BEFORE the assembly", async () => {
    const order: string[] = [];
    await runCron({
      synthesizeIfStale: async () => {
        order.push("synthesize");
      },
      recordWeekBeforeAssembly: async () => {
        order.push("record");
      },
      assembleWeekContext: async () => {
        order.push("assemble");
        throw new Error("boom");
      },
      writeContextFailure: async () => {
        order.push("context-failure");
      },
    });
    expect(order).toEqual(["record", "synthesize", "assemble", "context-failure"]);
  });

  it("a later successful run completes the record and clears the explanation", async () => {
    state.configs = positionedConfigs;
    state.assemblyFails = true;
    await runCron();
    const firstPositions = state.docs.get(PATH)!.curriculumPositions;

    state.assemblyFails = false;
    state.configs = [{ id: "w1", data: { name: "TGTB Math Level 3", currentPosition: 22 } }];
    await runCron();

    const doc = state.docs.get(PATH)!;
    expect(doc.contextError).toBeNull();
    expect(doc.hoursSummary).toBeDefined();
    expect(doc.status).toBe("no-data");
    // Create-only: the week's own reading stands.
    expect(doc.curriculumPositions).toEqual(firstPositions);
  });
});

describe("the snapshot stays create-only, and status is never downgraded", () => {
  it("a re-run does not re-stamp positions already on file", async () => {
    const recorded = {
      recordedAt: "2026-09-27T05:15:00.000Z",
      weekKey: WEEK,
      positions: [{ configId: "w1", name: "Math", currentPosition: 14 }],
    };
    state.docs.set(PATH, { status: "snapshot-only", curriculumPositions: recorded });
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 31 } }];
    state.assemblyFails = true;

    await runCron();

    expect(state.docs.get(PATH)!.curriculumPositions).toEqual(recorded);
  });

  it("a draft week is not downgraded by the pre-assembly record", async () => {
    state.docs.set(PATH, { status: "draft", celebration: "He read a chapter." });
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, { createPositions: true });
    expect(state.docs.get(PATH)!.status).toBe("draft");
    expect(state.docs.get(PATH)!.celebration).toBe("He read a chapter.");
  });

  it("a draft week is not downgraded by a context failure either", async () => {
    state.docs.set(PATH, { status: "draft", celebration: "He read a chapter." });
    state.assemblyFails = true;
    await runCron();
    const doc = state.docs.get(PATH)!;
    expect(doc.status).toBe("draft");
    expect(doc.celebration).toBe("He read a chapter.");
    expect(doc.contextError).toMatchObject({ reason: "assembly-failed" });
  });

  it("keeps a parent's answer untouched", async () => {
    const reflection = { answer: "about-right", answeredAt: "x" };
    state.docs.set(PATH, { childId: "lincoln", weekKey: WEEK, reflection });
    state.assemblyFails = true;
    await runCron();
    expect(state.docs.get(PATH)!.reflection).toEqual(reflection);
  });

  it("never throws, even when the store is unreachable", async () => {
    await expect(
      recordWeekBeforeAssembly({} as never, "fam-1", "lincoln", WEEK, { createPositions: true }),
    ).resolves.toBeUndefined();
    await expect(
      writeContextFailure({} as never, "fam-1", "lincoln", WEEK),
    ).resolves.toBeUndefined();
  });
});

describe("the manual path (Try again) never creates a snapshot (UX-420)", () => {
  it("never CREATES a document — a bad child id leaves no stray row", async () => {
    state.assemblyFails = true;
    await expect(tryAgain()).rejects.toThrow();
    expect(state.docs.has(PATH)).toBe(false);
  });


  it("does not read or write positions for a week that has none on file", async () => {
    // Today's positions are not that week's. The week of 2026-09-20 has no
    // recoverable positions, and a re-run must not invent them.
    state.docs.set(PATH, {
      status: "snapshot-only",
      contextError: { message: "x", reason: "assembly-failed", at: "y" },
    });
    state.configs = positionedConfigs;

    await tryAgain();

    const doc = state.docs.get(PATH)!;
    expect(doc).not.toHaveProperty("curriculumPositions");
    expect(state.configQueries).toBe(0);
    // …but it does recover what it can: the record and the narrative.
    expect(doc.hoursSummary).toBeDefined();
    expect(doc.contextError).toBeNull();
  });

  it("leaves a snapshot already on file exactly as it is", async () => {
    const recorded = {
      recordedAt: "2026-09-27T05:15:00.000Z",
      weekKey: WEEK,
      positions: [{ configId: "w1", name: "Math", currentPosition: 14 }],
    };
    state.docs.set(PATH, { status: "snapshot-only", curriculumPositions: recorded });
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 31 } }];

    await tryAgain();

    expect(state.docs.get(PATH)!.curriculumPositions).toEqual(recorded);
  });

  it("records a context failure on the manual path too, and still throws to the caller", async () => {
    state.docs.set(PATH, { status: "snapshot-only" });
    state.assemblyFails = true;

    const thrown = await tryAgain().then(
      () => null,
      (err: Error) => err,
    );
    expect(thrown).not.toBeNull();
    // UX-449: the cause stays in the logs; the caller gets the app's sentence.
    expect(thrown!.message).toBe(evaluate.WEEKLY_REVIEW_NOW_FAILED_MESSAGE);
    expect(thrown!.message).not.toContain("PLANTED-MARKER");

    const doc = state.docs.get(PATH)!;
    expect(doc.contextError).toMatchObject({ reason: "assembly-failed" });
    expect(doc.status).toBe("snapshot-only");
    expect(doc).not.toHaveProperty("curriculumPositions");
  });

  it("a successful manual run lands the narrative and clears the old explanation", async () => {
    state.docs.set(PATH, {
      status: "snapshot-only",
      curriculumPositions: { recordedAt: "r", weekKey: WEEK, positions: [] },
      narrativeError: { message: "x", reason: "call-failed", at: "y" },
    });
    await tryAgain();

    const doc = state.docs.get(PATH)!;
    // Empty fake week → the no-data prose, which replaces `snapshot-only`.
    expect(doc.status).toBe("no-data");
    expect(doc.narrativeError).toBeNull();
  });
});

describe("round 2 P1 — every child's positions land before any model call", () => {
  const oneFamily = {
    listFamilies: async () => ["fam-1"],
    listChildren: async () => [
      { childId: "lincoln", childName: "Lincoln" },
      { childId: "london", childName: "London" },
    ],
  };
  const LONDON = `families/fam-1/weeklyReviews/${WEEK}_london`;
  const flush = async () => {
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  };

  it("records every child in a first pass, before the first cycle starts", async () => {
    const order: string[] = [];
    await evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      ...oneFamily,
      recordWeekBeforeAssembly: async (_db, _f, childId) => {
        order.push(`record:${childId}`);
      },
      runCycle: async (_db, _f, childId) => {
        order.push(`cycle:${childId}`);
      },
    });
    expect(order).toEqual(["record:lincoln", "record:london", "cycle:lincoln", "cycle:london"]);
  });

  it("the second child's positions are on file though the first child's cycle hangs", async () => {
    state.configs = positionedConfigs;
    void evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      ...oneFamily,
      runCycle: () => new Promise(() => undefined),
    });
    await flush();
    expect(state.docs.get(PATH)?.curriculumPositions).toBeDefined();
    expect(state.docs.get(LONDON)?.curriculumPositions).toBeDefined();
  });

  it("POSITIVE CONTROL — with no first pass, a hang on the first child loses the second", async () => {
    state.configs = positionedConfigs;
    void evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      ...oneFamily,
      recordWeekBeforeAssembly: async () => undefined,
      runCycle: (d, f, c, n, w, k) =>
        c === "lincoln"
          ? new Promise(() => undefined)
          : runWeeklyReviewCycleForChild(d, f, c, n, w, k),
    });
    await flush();
    expect(state.docs.get(LONDON)?.curriculumPositions).toBeUndefined();
  });

  it("round 3 P1 — a family whose children cannot be read costs only itself", async () => {
    state.configs = positionedConfigs;
    const cycled: string[] = [];
    await evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      listFamilies: async () => ["fam-1", "fam-broken"],
      listChildren: async (_db, familyId) => {
        if (familyId === "fam-broken") throw new Error("unavailable");
        return [{ childId: "lincoln", childName: "Lincoln" }];
      },
      runCycle: async (_d, familyId, childId) => {
        cycled.push(`${familyId}/${childId}`);
      },
    });
    expect(state.docs.get(PATH)?.curriculumPositions).toBeDefined();
    expect(cycled).toEqual(["fam-1/lincoln"]);
  });

  it("round 3 P1 — a family discovered is recorded before the next is even listed", async () => {
    state.configs = positionedConfigs;
    void evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      listFamilies: async () => ["fam-1", "fam-stalled"],
      listChildren: (_db, familyId) =>
        familyId === "fam-stalled"
          ? new Promise(() => undefined)
          : Promise.resolve([{ childId: "lincoln", childName: "Lincoln" }]),
    });
    await flush();
    expect(state.docs.get(PATH)?.curriculumPositions).toBeDefined();
  });
});

describe("a killed run is observable: runStartedAt (UX-450)", () => {
  it("the scheduled function is DEPLOYED with its own deadline, not the 60s default", () => {
    // Read off the options object handed to `onSchedule`, so this is the value
    // the function ships with — the gap was an absent key, not a wrong one.
    expect(deployedOptions.schedule?.timeoutSeconds).toBe(evaluate.WEEKLY_REVIEW_TIMEOUT_SECONDS);
    expect(evaluate.WEEKLY_REVIEW_TIMEOUT_SECONDS).toBe(540);
  });

  it("the callable's deadline stays inside the scheduled one the page measures against", () => {
    expect(deployedOptions.now?.timeoutSeconds).toBe(evaluate.WEEKLY_REVIEW_NOW_TIMEOUT_SECONDS);
    expect(evaluate.WEEKLY_REVIEW_NOW_TIMEOUT_SECONDS).toBeLessThanOrEqual(
      evaluate.WEEKLY_REVIEW_TIMEOUT_SECONDS,
    );
  });

  it("the cron stamps when it started, on the record it creates", async () => {
    state.configs = positionedConfigs;
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, {
      createPositions: true,
      startedAt: "2026-09-27T05:15:02.000Z",
    });
    const doc = state.docs.get(PATH)!;
    expect(doc.runStartedAt).toBe("2026-09-27T05:15:02.000Z");
    expect(doc.status).toBe("snapshot-only");
  });

  it("a later run overwrites the stamp and changes nothing else — no status, no snapshot", async () => {
    const recorded = { recordedAt: "x", weekKey: WEEK, positions: [{ configId: "w1", name: "Math", currentPosition: 14 }] };
    state.docs.set(PATH, {
      status: "draft",
      celebration: "He read a chapter.",
      curriculumPositions: recorded,
      runStartedAt: "2026-09-27T05:15:02.000Z",
    });
    state.configs = [{ id: "w1", data: { name: "Math", currentPosition: 31 } }];
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, {
      createPositions: true,
      startedAt: "2026-09-28T14:00:00.000Z",
    });
    const doc = state.docs.get(PATH)!;
    expect(doc.runStartedAt).toBe("2026-09-28T14:00:00.000Z");
    expect(doc.status).toBe("draft");
    expect(doc.curriculumPositions).toEqual(recorded);
    expect(doc.celebration).toBe("He read a chapter.");
  });

  it("the manual path stamps a week that exists, and still creates none", async () => {
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, {
      createPositions: false,
      startedAt: "2026-09-28T14:00:00.000Z",
    });
    expect(state.docs.has(PATH)).toBe(false);

    state.docs.set(PATH, { status: "snapshot-only" });
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, {
      createPositions: false,
      startedAt: "2026-09-28T14:00:00.000Z",
    });
    expect(state.docs.get(PATH)!.runStartedAt).toBe("2026-09-28T14:00:00.000Z");
    expect(state.docs.get(PATH)!.status).toBe("snapshot-only");
  });

  it("a run killed after pass 1 leaves the stamp and NO error — the shape the page must name", async () => {
    // Pass 1 ran; the platform then ended the function before pass 2 reached
    // this child, so no catch ran. This is the document the page is handed.
    state.configs = positionedConfigs;
    await recordWeekBeforeAssembly(db, "fam-1", "lincoln", WEEK, { createPositions: true });
    const doc = state.docs.get(PATH)!;
    expect(doc.status).toBe("snapshot-only");
    expect(typeof doc.runStartedAt).toBe("string");
    expect(Number.isFinite(Date.parse(doc.runStartedAt as string))).toBe(true);
    expect(doc.narrativeError).toBeUndefined();
    expect(doc.contextError).toBeUndefined();
  });
});

describe("round 1 P2 — every child is stamped with the INVOCATION's start (UX-450)", () => {
  it("pass 1 and pass 2 stamp one instant, however late a child's turn comes", async () => {
    state.configs = positionedConfigs;
    const invocation = new Date("2026-09-27T05:15:00.000Z");
    const stamps: Array<string | undefined> = [];
    await evaluate.runWeeklyReviewCron(db, WEEK, "key", {
      startedAt: invocation,
      listFamilies: async () => ["fam-1"],
      listChildren: async () => [
        { childId: "lincoln", childName: "Lincoln" },
        { childId: "london", childName: "London" },
      ],
      recordWeekBeforeAssembly: async (_d, _f, _c, _w, opts) => {
        stamps.push(opts.startedAt);
      },
      runCycle: (d, f, c, n, w, k, _deps, opts) =>
        runWeeklyReviewCycleForChild(
          d, f, c, n, w, k,
          {
            synthesizeIfStale: (async () => undefined) as never,
            assembleWeekContext: evaluate.assembleWeekContext,
            generateReviewForChild: (async () => undefined) as never,
            recordWeekBeforeAssembly: async (_d2, _f2, _c2, _w2, o) => {
              stamps.push(o.startedAt);
            },
          },
          opts,
        ),
    });
    expect(stamps).toHaveLength(4);
    expect(new Set(stamps)).toEqual(new Set([invocation.toISOString()]));
  });

  it("POSITIVE CONTROL — a cycle called without the invocation's start stamps its own", async () => {
    state.configs = positionedConfigs;
    state.docs.set(PATH, { status: "snapshot-only" });
    await runWeeklyReviewCycleForChild(db, "fam-1", "lincoln", "Lincoln", WEEK, "key", {
      synthesizeIfStale: (async () => undefined) as never,
      assembleWeekContext: evaluate.assembleWeekContext,
      generateReviewForChild: (async () => undefined) as never,
    });
    const stamped = state.docs.get(PATH)!.runStartedAt as string;
    expect(stamped).not.toBe("2026-09-27T05:15:00.000Z");
    expect(Date.now() - Date.parse(stamped)).toBeLessThan(60_000);
  });
});
