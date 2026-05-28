import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  getMonthBounds,
  getPreviousMonth,
  loadDadLabReportsInMonth,
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
  return {
    collection: (path: string) => makeQuery(path, []),
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
});
