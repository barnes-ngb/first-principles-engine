import { describe, expect, it } from "vitest";

import { loadWeeklyReviewsForMonth } from "./monthlyReviewData.js";

/**
 * UX-409 — a week's RECORD is not a week's NARRATIVE.
 *
 * The weekly cron now writes the positions and the hours BEFORE it calls the
 * model, so a week whose model call failed leaves a document with no prose on
 * it. The monthly book's prompt maps every row it is handed, so such a row would
 * have arrived in the book's raw material as `- 2026-08-30: ` — a line about a
 * week, saying nothing, indistinguishable to the model from a week in which
 * nothing was celebrated.
 */

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

function fakeDb(docs: FakeDoc[]) {
  const query = {
    where: () => query,
    get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
  };
  return { collection: () => query } as never;
}

const NARRATIVE = {
  childId: "lincoln",
  weekKey: "2026-09-06",
  status: "draft",
  celebration: "He read a whole chapter aloud.",
  summary: "Steady week.",
  wins: ["Phonics"],
  growthAreas: [],
  recommendations: [],
};

describe("the monthly book reads weeks that have a narrative", () => {
  it("keeps a generated week", async () => {
    const rows = await loadWeeklyReviewsForMonth(
      fakeDb([{ id: "2026-09-06_lincoln", data: NARRATIVE }]),
      "fam-1",
      "lincoln",
      "2026-09-01",
      "2026-09-30",
    );
    expect(rows.map((r) => r.weekKey)).toEqual(["2026-09-06"]);
  });

  it("skips a week whose record was written but whose narrative failed", async () => {
    const rows = await loadWeeklyReviewsForMonth(
      fakeDb([
        {
          id: "2026-09-13_lincoln",
          data: {
            childId: "lincoln",
            weekKey: "2026-09-13",
            status: "snapshot-only",
            hoursSummary: { totalMinutes: 405, minutesBySubject: {}, weekKey: "2026-09-13", recordedAt: "x" },
            curriculumPositions: { recordedAt: "x", weekKey: "2026-09-13", positions: [] },
            narrativeError: { message: "429 rate limit", at: "x" },
          },
        },
        { id: "2026-09-06_lincoln", data: NARRATIVE },
      ]),
      "fam-1",
      "lincoln",
      "2026-09-01",
      "2026-09-30",
    );
    expect(rows.map((r) => r.weekKey)).toEqual(["2026-09-06"]);
  });

  it("keeps a no-data week, which IS a narrative about an empty week", async () => {
    const rows = await loadWeeklyReviewsForMonth(
      fakeDb([
        {
          id: "2026-09-06_lincoln",
          data: {
            ...NARRATIVE,
            status: "no-data",
            celebration: "No activities were logged this week.",
            wins: [],
          },
        },
      ]),
      "fam-1",
      "lincoln",
      "2026-09-01",
      "2026-09-30",
    );
    expect(rows).toHaveLength(1);
  });
});
