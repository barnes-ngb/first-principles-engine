import { describe, expect, it } from "vitest";

import { collectHoursContributions } from "../../shared/hoursContributions.js";
import type { RawDayLog } from "../../shared/hoursContributions.js";
import { projectDayLogEntries } from "./monthlyReviewData.js";

/**
 * FEAT-200: a month containing Life Days must read as a month with school in it.
 *
 * A Life Day is an ordinary `days` document — a block carrying the recorded
 * minutes, and zero-minute completed checklist rows recording what happened. The
 * monthly review book's loader reads `days` and its counted hours come from the
 * one shared fold, so a Life Day needs NO new code to be visible: this suite
 * pins that, so a later change to either path cannot quietly turn these days
 * into a gap in the book.
 *
 * The fixtures below mirror exactly what the client writes (see
 * `src/features/today/lifeDay.ts`; the app side asserts the same shape in
 * `lifeDay.test.ts`, which pins this seam from its end).
 */

const CHILD = "lincoln";

/** What `withLifeDayMinutes` + `toggleLifeDayChip` produce for one Life Day. */
function lifeDay(date: string, minutes: number): RawDayLog {
  return {
    childId: CHILD,
    date,
    blocks: [
      {
        type: "Other",
        title: "Life Day",
        subjectBucket: "Other",
        location: "Home",
        source: "manual",
        actualMinutes: minutes,
      },
    ],
    checklist: [
      {
        label: "📦 Packing",
        completed: true,
        estimatedMinutes: 0,
        subjectBucket: "PracticalArts",
        source: "manual",
      },
      {
        label: "🌳 Outside",
        completed: true,
        estimatedMinutes: 0,
        subjectBucket: "PE",
        source: "manual",
      },
    ],
    retro: "Packed the kitchen. London made a fort out of the boxes.",
  } as RawDayLog;
}

/** An ordinary planned day, for the mixed-month case. */
function plannedDay(date: string): RawDayLog {
  return {
    childId: CHILD,
    date,
    blocks: [
      {
        type: "Math",
        title: "Math Workbook",
        subjectBucket: "Math",
        location: "Home",
        actualMinutes: 25,
      },
    ],
    checklist: [
      {
        label: "Math Workbook (25m)",
        completed: true,
        estimatedMinutes: 25,
        subjectBucket: "Math",
        source: "planner",
      },
    ],
  } as RawDayLog;
}

describe("a month containing Life Days", () => {
  const month = [
    plannedDay("2026-09-01"),
    lifeDay("2026-09-02", 120),
    lifeDay("2026-09-03", 180),
    plannedDay("2026-09-04"),
  ];

  it("projects without crashing", () => {
    expect(() => projectDayLogEntries(month)).not.toThrow();
  });

  it("counts every Life Day as a day with activity — not a gap", () => {
    const entries = projectDayLogEntries(month);
    // `daysWithActivity` in the book's prompt is exactly `dayLogs.length`.
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("records what happened on a Life Day rather than an empty day", () => {
    const [, first] = projectDayLogEntries(month);
    expect(first.totalItems).toBe(2);
    expect(first.completedItems).toBe(2);
  });

  it("counts a Life Day's hours through the one existing fold", () => {
    const total = collectHoursContributions(month, [], [], CHILD).reduce(
      (n, c) => n + c.minutes,
      0,
    );
    // 25 + 120 + 180 + 25 — the two Life Days contribute their recorded blocks
    // and their chips add nothing on top.
    expect(total).toBe(350);
  });

  it("attributes a Life Day's minutes to its block, never to its chips", () => {
    const contributions = collectHoursContributions(
      [lifeDay("2026-09-02", 120)],
      [],
      [],
      CHILD,
    );
    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      kind: "day-log",
      date: "2026-09-02",
      minutes: 120,
      location: "Home",
    });
  });

  it("leaves a month of only Life Days looking like real school", () => {
    const allLife = [lifeDay("2026-09-02", 120), lifeDay("2026-09-03", 120)];
    expect(projectDayLogEntries(allLife)).toHaveLength(2);
    const total = collectHoursContributions(allLife, [], [], CHILD).reduce(
      (n, c) => n + c.minutes,
      0,
    );
    expect(total).toBe(240);
  });

  it("does not narrate a zero-hour Life Day as hours it did not have", () => {
    // The parent chose "None" — the day is still present, and it claims nothing.
    const none = [lifeDay("2026-09-02", 0)];
    expect(projectDayLogEntries(none)).toHaveLength(1);
    expect(collectHoursContributions(none, [], [], CHILD)).toEqual([]);
  });
});
