import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  getMonthBounds,
  getPreviousMonth,
  loadDadLabReportsInMonth,
  loadPhotosForMonth,
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
