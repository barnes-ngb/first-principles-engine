import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  aggregateMonthData,
  getMonthBounds,
  getPreviousMonth,
  loadDadLabReportsInMonth,
  loadDayLogsForMonth,
  loadHoursForMonth,
  loadPhotosForMonth,
  loadRawDayLogsForMonth,
  loadReadingForMonth,
  type DadLabEntry,
} from "./monthlyReviewData.js";

// ── Minimal Firestore mock for chained `.where().where().get()` queries ──

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

interface WhereClause {
  field: string;
  op: string;
  value: unknown;
}

function makeFakeDb(docsByCollection: Record<string, FakeDoc[]>): Firestore {
  function findDoc(path: string): FakeDoc | undefined {
    // path is like `families/fam/artifacts/abc` → collection `families/fam/artifacts`, id `abc`
    const slash = path.lastIndexOf("/");
    if (slash === -1) return undefined;
    const collectionPath = path.slice(0, slash);
    const id = path.slice(slash + 1);
    return (docsByCollection[collectionPath] ?? []).find((d) => d.id === id);
  }

  function makeQuery(path: string, clauses: WhereClause[]): unknown {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...clauses, { field, op, value }]),
      get: async () => {
        const docs = docsByCollection[path] ?? [];
        const matched = docs.filter((doc) =>
          clauses.every((c) => {
            const v = doc.data[c.field];
            switch (c.op) {
              case "==":
                return v === c.value;
              case ">=":
                return typeof v === "string" && typeof c.value === "string"
                  ? v >= c.value
                  : (v as number) >= (c.value as number);
              case "<=":
                return typeof v === "string" && typeof c.value === "string"
                  ? v <= c.value
                  : (v as number) <= (c.value as number);
              default:
                return false;
            }
          }),
        );
        return {
          docs: matched.map((doc) => ({
            id: doc.id,
            data: () => doc.data,
          })),
          empty: matched.length === 0,
        };
      },
    };
  }

  function makeDocRef(path: string): unknown {
    return {
      path,
      get: async () => {
        const found = findDoc(path);
        return {
          id: path.slice(path.lastIndexOf("/") + 1),
          exists: !!found,
          data: () => found?.data,
        };
      },
    };
  }

  return {
    collection: (path: string) => makeQuery(path, []),
    doc: (path: string) => makeDocRef(path),
    getAll: async (...refs: Array<{ path: string }>) => {
      return refs.map((r) => {
        const found = findDoc(r.path);
        return {
          id: r.path.slice(r.path.lastIndexOf("/") + 1),
          exists: !!found,
          data: () => found?.data,
        };
      });
    },
  } as unknown as Firestore;
}

describe("getMonthBounds", () => {
  it("returns full month range for April (30 days)", () => {
    const { start, end } = getMonthBounds("2026-04");
    expect(start).toBe("2026-04-01");
    expect(end).toBe("2026-04-30");
  });

  it("returns 31 days for May", () => {
    const { start, end } = getMonthBounds("2026-05");
    expect(start).toBe("2026-05-01");
    expect(end).toBe("2026-05-31");
  });

  it("returns 28 days for non-leap February", () => {
    const { start, end } = getMonthBounds("2025-02");
    expect(start).toBe("2025-02-01");
    expect(end).toBe("2025-02-28");
  });

  it("returns 29 days for leap February", () => {
    const { start, end } = getMonthBounds("2024-02");
    expect(start).toBe("2024-02-01");
    expect(end).toBe("2024-02-29");
  });

  it("throws on invalid format", () => {
    expect(() => getMonthBounds("2026-4")).toThrow();
    expect(() => getMonthBounds("not-a-month")).toThrow();
  });
});

describe("getPreviousMonth", () => {
  it("returns May when today is June 1", () => {
    expect(getPreviousMonth(new Date(2026, 5, 1))).toBe("2026-05");
  });

  it("returns April when today is May 15", () => {
    expect(getPreviousMonth(new Date(2026, 4, 15))).toBe("2026-04");
  });

  it("crosses year boundary: returns 2025-12 when today is Jan 15 2026", () => {
    expect(getPreviousMonth(new Date(2026, 0, 15))).toBe("2025-12");
  });

  it("returns previous month even on the last day", () => {
    expect(getPreviousMonth(new Date(2026, 2, 31))).toBe("2026-02");
  });
});

describe("loadDadLabReportsInMonth", () => {
  const path = "families/fam/dadLabReports";

  // Production data: Lincoln's Firestore child doc id is an auto-generated
  // string, but the LabReportForm / KidLabView writer keys `childReports` by
  // `childName.toLowerCase()`. The loader must match by name first.
  const LINCOLN_DOC_ID = "child_abc123";

  it("matches by lowercase child name (writer key shape)", async () => {
    // The Bridge Test reproducer: real-use feedback found that families
    // don't always advance a session to 'complete' even after the kid did
    // the work. The loader must count it as long as the child contributed.
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-bridge",
          data: {
            date: "2026-04-04",
            status: "active",
            title: "The Bridge Test",
            question: "Can it hold the weight?",
            childReports: {
              lincoln: { prediction: "yes", explanation: "trusses" },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("The Bridge Test");
    expect(result[0].hasPrediction).toBe(true);
    expect(result[0].hasExplanation).toBe(true);
  });

  it("falls back to child doc id when childReports is keyed that way", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-legacy",
          data: {
            date: "2026-04-05",
            status: "complete",
            title: "Legacy lab",
            childReports: {
              [LINCOLN_DOC_ID]: { prediction: "x" },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(1);
    expect(result[0].hasPrediction).toBe(true);
  });

  // ── FEAT-163: the beat-era shape ──────────────────────────────────────────
  //
  // Nathan's August book counted 1 of 3 labs and reported "no photos". The
  // participation filter read `childReports` alone, and the FEAT-56 three-beat
  // capture (today's default, where FEAT-156 routes uploads) writes no
  // `childReports` key at all — so a modern lab was dropped whole, taking its
  // photos with it (`loadPhotosForMonth` resolves them through `artifactIds`).

  it("counts a beat-era lab that has no childReports key at all", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-rock-drop",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "The Great Rock Drop",
            question: "Which lands first?",
            childReports: {},
            beats: {
              predict: { items: [{ artifactId: "art-p", child: "both" }] },
              try: { text: "we dropped them", items: [] },
              saw: { items: [] },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("The Great Rock Drop");
  });

  it("counts a beat-era lab for BOTH children — a lab is whole-family (DATA-04)", async () => {
    // The beat shape carries no per-child participation signal by design:
    // `items[].child` defaults to the 'both' sentinel, the artifacts are
    // written `childId: 'both'`, the report has no `childId` field, and
    // completion credits hours + XP to every child. Filtering it per-child
    // would contradict the hours, XP and portfolio surfaces at once.
    const labs = {
      [path]: [
        {
          id: "lab-family",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "Family lab",
            childReports: {},
            beats: { saw: { items: [{ artifactId: "art-1", child: "c-london" }] } },
          },
        },
      ],
    };

    const forLincoln = await loadDadLabReportsInMonth(
      makeFakeDb(labs),
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    const forLondon = await loadDadLabReportsInMonth(
      makeFakeDb(labs),
      "fam",
      "child_london",
      "2026-04-01",
      "2026-04-30",
      "London",
    );

    expect(forLincoln).toHaveLength(1);
    expect(forLondon).toHaveLength(1);
    expect(forLincoln[0].artifactIds).toEqual(["art-1"]);
    expect(forLondon[0].artifactIds).toEqual(["art-1"]);
  });

  it("unions beat artifacts with child-report artifacts, de-duped by id", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-mixed",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "Mixed capture",
            childReports: { lincoln: { artifacts: ["art-shared", "art-child"] } },
            beats: {
              predict: {
                items: [
                  { artifactId: "art-shared", child: "both" },
                  { artifactId: "art-beat", child: "both" },
                ],
              },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result[0].artifactIds).toEqual(["art-shared", "art-child", "art-beat"]);
  });

  it("reads predicted/explained from the beats when there is no legacy contribution", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-written",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "Written lab",
            childReports: {},
            beats: {
              predict: { text: "the rock lands first", items: [] },
              try: { items: [] },
              saw: { text: "they landed together", items: [] },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result[0].hasPrediction).toBe(true);
    expect(result[0].hasExplanation).toBe(true);
  });

  it("does not credit a sibling's attributed beat line to this child (Codex P2, PR #1710)", async () => {
    // `LabBeat.textChild` credits the writing line to 'both' or one child doc
    // id. The prompt turns these flags into a per-child [predicted]/[explained]
    // tag, so London's sentence must not appear as Lincoln's contribution —
    // even though the LAB itself still counts for both (DATA-04).
    const labs = {
      [path]: [
        {
          id: "lab-attributed",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "Attributed lab",
            childReports: {},
            beats: {
              predict: { text: "it will bounce", textChild: "child_london", items: [] },
              saw: { text: "it bounced", textChild: "both", items: [] },
            },
          },
        },
      ],
    };

    const forLincoln = await loadDadLabReportsInMonth(
      makeFakeDb(labs),
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    const forLondon = await loadDadLabReportsInMonth(
      makeFakeDb(labs),
      "fam",
      "child_london",
      "2026-04-01",
      "2026-04-30",
      "London",
    );

    // The lab still counts for both — only the per-child claim is gated.
    expect(forLincoln).toHaveLength(1);
    expect(forLondon).toHaveLength(1);

    expect(forLincoln[0].hasPrediction).toBe(false);
    expect(forLondon[0].hasPrediction).toBe(true);
    // 'both' stays shared.
    expect(forLincoln[0].hasExplanation).toBe(true);
    expect(forLondon[0].hasExplanation).toBe(true);
  });

  it("still excludes a Planned backlog entry with nothing captured on it", async () => {
    // FEAT-157 lets the Shelly chat create `Planned` labs. Dropping the filter
    // outright would turn those into "Dad Lab sessions completed" in the book —
    // the opposite overcount, in the same number.
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-planned",
          data: {
            date: "2026-04-18",
            status: "planned",
            title: "Someday lab",
            childReports: {},
            beats: { predict: { items: [] }, try: { items: [] }, saw: { items: [] } },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(0);
  });

  it("excludes sessions where the queried child did not contribute", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-london-only",
          data: {
            date: "2026-04-10",
            status: "complete",
            title: "London's Solo Lab",
            childReports: { london: { prediction: "maybe" } },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(0);
  });

  it("excludes sessions outside the month window", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-march",
          data: {
            date: "2026-03-30",
            status: "complete",
            title: "March lab",
            childReports: { lincoln: { prediction: "x" } },
          },
        },
        {
          id: "lab-may",
          data: {
            date: "2026-05-01",
            status: "complete",
            title: "May lab",
            childReports: { lincoln: { prediction: "x" } },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(0);
  });

  it("extracts the artifact id list from childReports[name].artifacts", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: "lab-bridge",
          data: {
            date: "2026-04-04",
            status: "active",
            title: "The Bridge Test",
            childReports: {
              lincoln: {
                prediction: "yes",
                artifacts: ["art-1", "art-2", "art-3"],
              },
            },
          },
        },
      ],
    });

    const result = await loadDadLabReportsInMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      "Lincoln",
    );
    expect(result).toHaveLength(1);
    expect(result[0].artifactIds).toEqual(["art-1", "art-2", "art-3"]);
  });
});

describe("loadPhotosForMonth — Dad Lab photo extraction", () => {
  const LINCOLN_DOC_ID = "child_abc123";

  function bridgeReport(artifactIds: string[]): DadLabEntry {
    return {
      id: "lab-bridge",
      title: "The Bridge Test",
      question: "Can it hold the weight?",
      completedAt: "2026-04-04T12:00:00.000Z",
      hasPrediction: true,
      hasExplanation: false,
      artifactIds,
    };
  }

  it("fetches Dad Lab artifact photos that the childId-filtered query misses", async () => {
    // Repro: KidLabView writes artifact `childId` as the lowercase name
    // ("lincoln") instead of the Firestore child doc id. The artifacts query
    // (childId == child doc id) returns nothing, but the `childReports[name].artifacts`
    // list on the dadLabReport still points to the right artifact docs.
    const db = makeFakeDb({
      "families/fam/scans": [],
      "families/fam/artifacts": [
        {
          id: "art-bridge-1",
          data: {
            childId: "lincoln", // ← stored under lowercase name, not child doc id
            type: "Photo",
            storagePath: "artifacts/art-bridge-1.jpg",
            createdAt: "2026-04-04T12:30:00.000Z",
          },
        },
        {
          id: "art-bridge-2",
          data: {
            childId: "lincoln",
            type: "Photo",
            storagePath: "artifacts/art-bridge-2.jpg",
            createdAt: "2026-04-04T12:35:00.000Z",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      [bridgeReport(["art-bridge-1", "art-bridge-2"])],
    );

    expect(result.photos).toHaveLength(2);
    const dadLabPhotos = result.photos.filter(
      (p) => p.sourceMetadata?.type === "dadLab",
    );
    expect(dadLabPhotos).toHaveLength(2);
    expect(dadLabPhotos[0].sourceMetadata?.reportId).toBe("lab-bridge");
    expect(dadLabPhotos[0].sourceMetadata?.reportTitle).toBe("The Bridge Test");
  });

  it("adds Dad Lab artifacts to allArtifactIds (so they enter kid mode)", async () => {
    const db = makeFakeDb({
      "families/fam/scans": [],
      "families/fam/artifacts": [
        {
          id: "art-1",
          data: {
            childId: "lincoln",
            type: "Photo",
            storagePath: "artifacts/art-1.jpg",
            createdAt: "2026-04-04T12:30:00.000Z",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      [bridgeReport(["art-1"])],
    );

    expect(result.allArtifactIds.has("art-1")).toBe(true);
    expect(result.workbookArtifactIds.has("art-1")).toBe(false);
  });

  it("does not duplicate photos already picked up by the childId-filtered artifacts query", async () => {
    // When LabReportForm writes the photo, `childId` is the Firestore doc id,
    // so the artifacts query already returns it. We must not add it a second
    // time when walking dadLabReports.
    const db = makeFakeDb({
      "families/fam/scans": [],
      "families/fam/artifacts": [
        {
          id: "art-1",
          data: {
            childId: LINCOLN_DOC_ID, // ← matches the artifacts query
            type: "Photo",
            storagePath: "artifacts/art-1.jpg",
            createdAt: "2026-04-04T12:30:00.000Z",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      [bridgeReport(["art-1"])],
    );

    expect(result.photos).toHaveLength(1);
  });

  it("skips non-image artifacts referenced by the lab (e.g. audio recordings)", async () => {
    const db = makeFakeDb({
      "families/fam/scans": [],
      "families/fam/artifacts": [
        {
          id: "art-audio",
          data: {
            childId: "lincoln",
            type: "Audio",
            storagePath: "artifacts/art-audio.webm",
            createdAt: "2026-04-04T12:30:00.000Z",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
      [bridgeReport(["art-audio"])],
    );

    expect(result.photos).toHaveLength(0);
  });

  it("is a no-op when no Dad Lab reports are provided", async () => {
    const db = makeFakeDb({ "families/fam/scans": [], "families/fam/artifacts": [] });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      LINCOLN_DOC_ID,
      "2026-04-01",
      "2026-04-30",
    );

    expect(result.photos).toHaveLength(0);
  });
});

describe("loadReadingForMonth", () => {
  const path = "families/fam/bookProgress";
  const LINCOLN = "child_abc123";

  it("counts answered chapters/questions whose answeredDate falls in the month", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: `${LINCOLN}_book1`,
          data: {
            childId: LINCOLN,
            bookId: "book1",
            bookTitle: "Prince Caspian",
            totalChapters: 15,
            questionPool: [
              { chapter: 1, answered: true, answeredDate: "2026-04-03" },
              { chapter: 2, answered: true, answeredDate: "2026-04-10" },
              { chapter: 3, answered: false, skipped: true },
              // Out of month — should not count.
              { chapter: 4, answered: true, answeredDate: "2026-05-02" },
            ],
          },
        },
      ],
    });

    const result = await loadReadingForMonth(
      db,
      "fam",
      LINCOLN,
      "2026-04-01",
      "2026-04-30",
    );

    expect(result.books).toHaveLength(1);
    expect(result.books[0].title).toBe("Prince Caspian");
    expect(result.books[0].chaptersAnswered).toBe(2);
    expect(result.books[0].questionsAnswered).toBe(2);
    expect(result.books[0].questionsSkipped).toBe(1);
    expect(result.totalQuestionsAnswered).toBe(2);
    expect(result.totalChaptersAnswered).toBe(2);
    expect(result.totalQuestionsSkipped).toBe(1);
  });

  it("omits a book that had no dated answer this month", async () => {
    const db = makeFakeDb({
      [path]: [
        {
          id: `${LINCOLN}_book1`,
          data: {
            childId: LINCOLN,
            bookId: "book1",
            bookTitle: "Skips Only",
            totalChapters: 5,
            questionPool: [
              { chapter: 1, answered: false, skipped: true },
              { chapter: 2, answered: true, answeredDate: "2026-03-30" },
            ],
          },
        },
      ],
    });

    const result = await loadReadingForMonth(
      db,
      "fam",
      LINCOLN,
      "2026-04-01",
      "2026-04-30",
    );

    expect(result.books).toHaveLength(0);
    expect(result.totalQuestionsAnswered).toBe(0);
  });

  it("returns an empty summary when the child has no bookProgress docs", async () => {
    const db = makeFakeDb({ [path]: [] });

    const result = await loadReadingForMonth(
      db,
      "fam",
      LINCOLN,
      "2026-04-01",
      "2026-04-30",
    );

    expect(result.books).toEqual([]);
    expect(result.totalChaptersAnswered).toBe(0);
    expect(result.totalQuestionsAnswered).toBe(0);
    expect(result.totalQuestionsSkipped).toBe(0);
  });
});

// ── FEAT-141: capture-time content notes reach the loader ───────────────────
describe("loadPhotosForMonth — FEAT-141 content notes", () => {
  it("carries the note from a scan doc and from an artifact doc", async () => {
    const db = makeFakeDb({
      "families/fam/scans": [
        {
          id: "scan-1",
          data: {
            childId: "child-1",
            storagePath: "scans/1.jpg",
            createdAt: "2026-07-05T10:00:00",
            contentNote: "GATB Math 3 p.73 — elapsed time",
            results: { subject: "math" },
          },
        },
      ],
      "families/fam/artifacts": [
        {
          id: "art-1",
          data: {
            childId: "child-1",
            type: "Photo",
            storagePath: "artifacts/1.jpg",
            createdAt: "2026-07-06T10:00:00",
            contentNote: "Lego castle with a working drawbridge",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      "child-1",
      "2026-07-01",
      "2026-07-31",
    );

    const byId = Object.fromEntries(result.photos.map((p) => [p.id, p]));
    expect(byId["scan:scan-1"].contentNote).toBe("GATB Math 3 p.73 — elapsed time");
    expect(byId["artifact:art-1"].contentNote).toBe(
      "Lego castle with a working drawbridge",
    );
  });

  it("leaves the field absent on photos captured before notes existed", async () => {
    const db = makeFakeDb({
      "families/fam/artifacts": [
        {
          id: "art-old",
          data: {
            childId: "child-1",
            type: "Photo",
            storagePath: "artifacts/old.jpg",
            createdAt: "2026-07-06T10:00:00",
          },
        },
        {
          id: "art-blank",
          data: {
            childId: "child-1",
            type: "Photo",
            storagePath: "artifacts/blank.jpg",
            createdAt: "2026-07-07T10:00:00",
            contentNote: "   ",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(
      db,
      "fam",
      "child-1",
      "2026-07-01",
      "2026-07-31",
    );

    for (const p of result.photos) {
      expect(p.contentNote).toBeUndefined();
    }
    expect(result.photos).toHaveLength(2);
  });

  it("carries the note on a Dad Lab photo reached through the report", async () => {
    const db = makeFakeDb({
      "families/fam/artifacts": [
        {
          id: "lab-art",
          data: {
            childId: "lincoln",
            type: "Photo",
            storagePath: "artifacts/lab.jpg",
            createdAt: "2026-07-08T10:00:00",
            contentNote: "Baking-soda volcano mid-eruption",
          },
        },
      ],
    });

    const reports: DadLabEntry[] = [
      {
        id: "lab-1",
        title: "The Bridge Test",
        completedAt: "2026-07-08",
        hasPrediction: true,
        hasExplanation: true,
        artifactIds: ["lab-art"],
      } as DadLabEntry,
    ];

    const result = await loadPhotosForMonth(
      db,
      "fam",
      "child-1",
      "2026-07-01",
      "2026-07-31",
      reports,
    );

    const labPhoto = result.photos.find((p) => p.id === "artifact:lab-art");
    expect(labPhoto?.contentNote).toBe("Baking-soda volcano mid-eruption");
  });
});

// ── FEAT-141 Codex round (PR #1666) ─────────────────────────────────────────
describe("loadDayLogsForMonth — FEAT-141 curation joins", () => {
  function dayDoc(id: string, checklist: unknown[]) {
    return {
      id,
      data: { childId: "child-1", date: id, checklist },
    };
  }

  it("indexes engagement by the item's evidence id, not just id/label (Codex P2)", async () => {
    // Curation matches a photo to its item by the photo's SOURCE DOC ID — a
    // scan id or an artifact id. Indexing only by item id/label meant the
    // engagement signal never matched a photo in production.
    const db = makeFakeDb({
      "families/fam/days": [
        dayDoc("2026-07-10", [
          {
            id: "item-1",
            label: "GATB Math (30m)",
            completed: true,
            engagement: "engaged",
            evidenceArtifactId: "scan-abc",
          },
        ]),
      ],
    });

    const logs = await loadDayLogsForMonth(db, "fam", "child-1", "2026-07-01", "2026-07-31");
    expect(logs[0].itemEngagement["scan-abc"]).toBe("engaged");
    // The original keys are kept — nothing that read them before breaks.
    expect(logs[0].itemEngagement["item-1"]).toBe("engaged");
  });

  it("collects the evidence ids and labels of workbook-linked items (Codex P1)", async () => {
    const db = makeFakeDb({
      "families/fam/days": [
        dayDoc("2026-07-10", [
          {
            id: "item-1",
            label: "GATB Math (30m)",
            completed: true,
            workbookConfigId: "wb-math",
            evidenceArtifactId: "art-workbook",
          },
          {
            id: "item-2",
            label: "Reading Eggs",
            completed: true,
            workbookScanRegistration: { configName: "Reading Eggs", position: 4 },
            evidenceArtifactId: "art-eggs",
          },
          {
            id: "item-3",
            label: "Build something",
            completed: true,
            evidenceArtifactId: "art-creative",
          },
        ]),
      ],
    });

    const logs = await loadDayLogsForMonth(db, "fam", "child-1", "2026-07-01", "2026-07-31");
    expect(logs[0].workbookEvidenceIds).toEqual(["art-workbook", "art-eggs"]);
    expect(logs[0].workbookItemLabels).toEqual(["GATB Math (30m)", "Reading Eggs"]);
    // The creative item is not swept in.
    expect(logs[0].workbookEvidenceIds).not.toContain("art-creative");
  });
});

describe("loadPhotosForMonth — FEAT-141 planItem index (Codex P1)", () => {
  it("records each artifact's planItem tag so batch pages can be recognized", async () => {
    const db = makeFakeDb({
      "families/fam/artifacts": [
        {
          id: "art-1",
          data: {
            childId: "child-1",
            type: "Photo",
            storagePath: "artifacts/1.jpg",
            createdAt: "2026-07-06T10:00:00",
            tags: { planItem: "GATB Math (30m)" },
          },
        },
        {
          id: "art-2",
          data: {
            childId: "child-1",
            type: "Photo",
            storagePath: "artifacts/2.jpg",
            createdAt: "2026-07-07T10:00:00",
          },
        },
      ],
    });

    const result = await loadPhotosForMonth(db, "fam", "child-1", "2026-07-01", "2026-07-31");
    expect(result.artifactPlanItems).toEqual({ "art-1": "GATB Math (30m)" });
  });
});

describe("aggregateMonthData — FEAT-163 end-to-end: a beat-era lab reaches the book with its photos", () => {
  const LINCOLN_DOC_ID = "child_abc123";

  /**
   * The reported symptom, whole: August's book named one lab and printed "No
   * photos" for the section. Both halves came from the same dropped report —
   * the count from `dadLabReports.length`, the photos from `artifactIds` — so
   * this pins the chain the two share rather than either loader alone.
   *
   * The beat photo deliberately carries `childId: 'both'` (BEAT_BOTH), which is
   * what every FEAT-56 capture writes: the childId-filtered artifacts query
   * cannot see it, so the report doc is its ONLY route into the book.
   */
  it("counts the beat-era lab and surfaces its 'both'-attributed photo", async () => {
    const db = makeFakeDb({
      "families/fam/dadLabReports": [
        {
          id: "lab-rock-drop",
          data: {
            date: "2026-04-12",
            status: "complete",
            title: "The Great Rock Drop",
            question: "Which lands first?",
            updatedAt: "2026-04-12T18:00:00.000Z",
            childReports: {},
            beats: {
              predict: { text: "the heavy one", items: [] },
              try: { items: [{ artifactId: "art-beat-photo", child: "both" }] },
              saw: { items: [] },
            },
          },
        },
      ],
      "families/fam/artifacts": [
        {
          id: "art-beat-photo",
          data: {
            childId: "both",
            type: "Photo",
            storagePath: "families/fam/artifacts/rock.jpg",
            createdAt: "2026-04-12T17:30:00.000Z",
          },
        },
      ],
    });

    const data = await aggregateMonthData(db, "fam", LINCOLN_DOC_ID, "2026-04", "Lincoln");

    expect(data.dadLabReports).toHaveLength(1);
    expect(data.dadLabReports[0].title).toBe("The Great Rock Drop");

    const labPhotos = data.photos.filter((p) => p.sourceMetadata?.type === "dadLab");
    expect(labPhotos).toHaveLength(1);
    expect(labPhotos[0].sourceDocId).toBe("art-beat-photo");
    expect(labPhotos[0].sourceMetadata?.reportTitle).toBe("The Great Rock Drop");
  });
});

// ── FEAT-164: the book's hours figure counts all three sources ───────────────
describe("loadHoursForMonth — the book agrees with the Records page", () => {
  // A month shaped like a real one: some time logged as `hours` docs, most of
  // it in day logs, and a family-wide Dad Lab adjustment. Pre-FEAT-164 the
  // loader summed the `hours` collection alone, so the book narrated a smaller
  // month — and could rank the wrong subject as its biggest.
  const collections = {
    "families/fam/hours": [
      {
        id: "h-1",
        data: {
          childId: "child-1",
          date: "2026-08-06",
          minutes: 45,
          subjectBucket: "Science",
        },
      },
      {
        id: "h-2",
        data: {
          childId: "child-2",
          date: "2026-08-06",
          minutes: 500,
          subjectBucket: "Math",
        },
      },
    ],
    "families/fam/days": [
      {
        id: "2026-08-03",
        data: {
          childId: "child-1",
          date: "2026-08-03",
          blocks: [
            { title: "Math Workbook", subjectBucket: "Math", location: "Home", actualMinutes: 30 },
          ],
          checklist: [
            { label: "Math Workbook (30m)", completed: true, estimatedMinutes: 30 },
            {
              label: "Handwriting practice (15m)",
              completed: true,
              estimatedMinutes: 15,
              subjectBucket: "LanguageArts",
            },
          ],
        },
      },
      {
        id: "2026-08-05",
        data: {
          childId: "child-2",
          date: "2026-08-05",
          blocks: [{ subjectBucket: "Math", actualMinutes: 99 }],
        },
      },
    ],
    "families/fam/hoursAdjustments": [
      {
        id: "adj-1",
        data: {
          childId: "both",
          date: "2026-08-10",
          minutes: 60,
          reason: "Dad Lab",
          subjectBucket: "Science",
        },
      },
      {
        id: "adj-2",
        data: {
          childId: "child-2",
          date: "2026-08-11",
          minutes: 120,
          reason: "sibling only",
          subjectBucket: "Math",
        },
      },
    ],
  };

  it("adds day-log and adjustment minutes to the hours collection", async () => {
    const hours = await loadHoursForMonth(
      makeFakeDb(collections),
      "fam",
      "child-1",
      "2026-08-01",
      "2026-08-31",
    );

    // 45 (hours doc) + 30 (block actual) + 15 (unmatched carried item) + 60
    // (family-wide adjustment). The pre-fix loader returned 45.
    expect(hours.totalMinutes).toBe(150);
    expect(hours.minutesBySubject).toEqual({
      Science: 105,
      Math: 30,
      LanguageArts: 15,
    });
  });

  it("keeps another child's time out of this child's total", async () => {
    const hours = await loadHoursForMonth(
      makeFakeDb(collections),
      "fam",
      "child-2",
      "2026-08-01",
      "2026-08-31",
    );
    // 500 (own hours doc) + 99 (own day log) + 60 ('both') + 120 (own tag).
    expect(hours.totalMinutes).toBe(779);
    expect(hours.minutesBySubject.Science).toBe(60);
  });

  it("reaches the aggregate the book is generated from", async () => {
    const data = await aggregateMonthData(
      makeFakeDb(collections),
      "fam",
      "child-1",
      "2026-08",
    );
    expect(data.hours.totalMinutes).toBe(150);
    // The day-log projection is unchanged — its own minutesBySubject stays the
    // completed-checklist rollup used for narrative colour, not the hours math.
    expect(data.dayLogs).toHaveLength(1);
    expect(data.dayLogs[0].date).toBe("2026-08-03");
  });
});

// ── FEAT-164 (Codex P2, PR #1711) ───────────────────────────────────────────
describe("loadRawDayLogsForMonth — legacy day logs carry the child in the doc id", () => {
  // `days/{date}_{childId}` documents written before the `childId` field
  // existed. Both Records read paths derive the child from the id before
  // counting, so a book that drops them undercounts exactly the day-log
  // minutes FEAT-164 exists to include.
  const legacy = {
    "families/fam/days": [
      {
        id: "2026-08-03_child-1",
        data: {
          date: "2026-08-03",
          blocks: [{ subjectBucket: "Math", location: "Home", actualMinutes: 40 }],
        },
      },
      {
        id: "child-1_2026-08-04",
        data: {
          date: "2026-08-04",
          blocks: [{ subjectBucket: "Reading", location: "Home", actualMinutes: 20 }],
        },
      },
      {
        id: "2026-08-05_child-2",
        data: {
          date: "2026-08-05",
          blocks: [{ subjectBucket: "Math", location: "Home", actualMinutes: 99 }],
        },
      },
    ],
  };

  it("resolves the child from the doc id, in both composite orders", async () => {
    const logs = await loadRawDayLogsForMonth(
      makeFakeDb(legacy),
      "fam",
      "child-1",
      "2026-08-01",
      "2026-08-31",
    );
    expect(logs.map((l) => l.date)).toEqual(["2026-08-03", "2026-08-04"]);
    expect(logs.every((l) => l.childId === "child-1")).toBe(true);
  });

  it("counts those minutes in the book's hours total", async () => {
    const hours = await loadHoursForMonth(
      makeFakeDb(legacy),
      "fam",
      "child-1",
      "2026-08-01",
      "2026-08-31",
    );
    expect(hours.totalMinutes).toBe(60);
    expect(hours.minutesBySubject).toEqual({ Math: 40, Reading: 20 });
  });

  it("still keeps another child's legacy day out of this child's total", async () => {
    const hours = await loadHoursForMonth(
      makeFakeDb(legacy),
      "fam",
      "child-2",
      "2026-08-01",
      "2026-08-31",
    );
    expect(hours.totalMinutes).toBe(99);
  });

  it("drops a day log whose child cannot be resolved at all", async () => {
    const logs = await loadRawDayLogsForMonth(
      makeFakeDb({
        "families/fam/days": [
          { id: "2026-08-06", data: { date: "2026-08-06", blocks: [] } },
        ],
      }),
      "fam",
      "child-1",
      "2026-08-01",
      "2026-08-31",
    );
    expect(logs).toEqual([]);
  });
});
