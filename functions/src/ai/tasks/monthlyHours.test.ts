import { describe, it, expect } from "vitest";

import { computeMonthHours, summarizeHoursContributions } from "./monthlyHours.js";

/**
 * The monthly review book's FOLD, over a realistic month.
 *
 * This corpus is the data half of the retired PARITY FIXTURE (FEAT-164), which
 * used to be repeated verbatim here and in
 * `src/features/records/records.logic.test.ts` to pin two hand-kept copies of
 * the counting rule together. The rule now has ONE definition
 * (`functions/src/shared/hoursContributions.ts`, tested in full by
 * `hoursContributions.test.ts`) compiled by both projects, so the compiler holds
 * the two surfaces together and the fixture's parity role is gone.
 *
 * What is still worth asserting HERE is what this module actually owns: the fold
 * from a contribution list to the two numbers the book's prose reads, and the
 * FEAT-164 wiring decision that the book counts all three sources rather than
 * the `hours` collection alone.
 *
 * The subject map is asserted, not just the total, because the prose RANKS
 * subjects off it ("Science was his biggest subject this month") — a per-subject
 * error rewrites the narrative even when the total agrees.
 *
 * The corpus exercises: a day in block-actuals mode where one completed item
 * MATCHES a tracked block (deduped) and another is an unmatched carried-over
 * item (DATA-14, counted at Home); an untracked block on a tracked day (counts
 * zero); a checklist-only day, including a "(Nm)" label with no minutes fields;
 * a 'both'-attributed adjustment (counts) and a sibling-tagged one (does not);
 * a negative adjustment; a manual entry, one carrying `hours` instead of
 * `minutes`, and a zero-minute entry (skipped); and another child's day log and
 * hours entry (filtered by the safety net).
 */
const CHILD_ID = "c-lincoln";

const DAY_LOGS = [
  {
    childId: "c-lincoln",
    date: "2026-08-03",
    blocks: [
      {
        title: "Math Workbook",
        subjectBucket: "Math",
        location: "Home",
        actualMinutes: 30,
      },
      {
        title: "Reading Station",
        subjectBucket: "Reading",
        location: "Home",
        plannedMinutes: 20,
      },
    ],
    checklist: [
      {
        label: "Math Workbook (30m)",
        completed: true,
        estimatedMinutes: 30,
        subjectBucket: "Math",
      },
      {
        label: "Handwriting practice (15m)",
        completed: true,
        estimatedMinutes: 15,
        subjectBucket: "LanguageArts",
      },
      { label: "Reading Station (20m)", completed: false, subjectBucket: "Reading" },
    ],
  },
  {
    childId: "c-lincoln",
    date: "2026-08-04",
    blocks: [],
    checklist: [
      { label: "Read aloud (25m)", completed: true, subjectBucket: "Reading" },
      {
        label: "Science experiment",
        completed: true,
        plannedMinutes: 40,
        subjectBucket: "Science",
      },
    ],
  },
  {
    childId: "c-london",
    date: "2026-08-05",
    blocks: [{ subjectBucket: "Math", location: "Home", actualMinutes: 99 }],
    checklist: [],
  },
];

const HOURS_ENTRIES = [
  {
    childId: "c-lincoln",
    date: "2026-08-06",
    minutes: 45,
    subjectBucket: "Science",
    location: "FieldTrip",
  },
  { childId: "c-lincoln", date: "2026-08-07", hours: 1.5, subjectBucket: "Math" },
  { childId: "c-lincoln", date: "2026-08-08", minutes: 0, subjectBucket: "Other" },
  { childId: "c-london", date: "2026-08-06", minutes: 60, subjectBucket: "Math" },
];

const ADJUSTMENTS = [
  {
    childId: "both",
    date: "2026-08-10",
    minutes: 60,
    reason: "Dad Lab (family-wide)",
    subjectBucket: "Science",
  },
  {
    childId: "c-london",
    date: "2026-08-11",
    minutes: 120,
    reason: "sibling only",
    subjectBucket: "Math",
  },
  {
    childId: "c-lincoln",
    date: "2026-08-12",
    minutes: -20,
    reason: "double-counted correction",
    subjectBucket: "Math",
  },
];

const EXPECTED = {
  totalMinutes: 285,
  minutesBySubject: {
    Math: 100,
    LanguageArts: 15,
    Reading: 25,
    Science: 145,
  },
};

describe("computeMonthHours — the book's month figure", () => {
  it("folds a realistic month into a total and a per-subject split", () => {
    expect(computeMonthHours(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD_ID)).toEqual(EXPECTED);
  });

  it("counts all three additive sources, not just the hours collection", () => {
    // The pre-FEAT-164 book totalled only this slice — the defect in one line.
    expect(computeMonthHours([], HOURS_ENTRIES, [], CHILD_ID).totalMinutes).toBe(135);
    expect(computeMonthHours(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD_ID).totalMinutes).toBe(285);
  });

  it("can change which subject leads the month, not just the total", () => {
    // The prose ranks subjects off this map, so a missing source is a narrative
    // bug: on the hours collection alone Math leads; counting everything,
    // Science does.
    const leader = (byBucket: Record<string, number>) =>
      Object.entries(byBucket).sort((a, b) => b[1] - a[1])[0][0];
    expect(leader(computeMonthHours([], HOURS_ENTRIES, [], CHILD_ID).minutesBySubject)).toBe("Math");
    expect(
      leader(computeMonthHours(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD_ID).minutesBySubject),
    ).toBe("Science");
  });
});

describe("summarizeHoursContributions — the fold itself", () => {
  it("sums per subject, and the total is the sum of those rows", () => {
    const totals = summarizeHoursContributions([
      { kind: "entry", date: "d", subjectBucket: "Math", minutes: 30 },
      { kind: "day-log", date: "d", subjectBucket: "Math", minutes: 20 },
      { kind: "adjustment", date: "d", subjectBucket: "Science", minutes: 15 },
    ]);
    expect(totals).toEqual({ totalMinutes: 65, minutesBySubject: { Math: 50, Science: 15 } });
    expect(totals.totalMinutes).toBe(
      Object.values(totals.minutesBySubject).reduce((s, m) => s + m, 0),
    );
  });

  it("subtracts a negative correction from its subject and from the total", () => {
    expect(
      summarizeHoursContributions([
        { kind: "day-log", date: "d", subjectBucket: "Math", minutes: 50 },
        { kind: "adjustment", date: "d", subjectBucket: "Math", minutes: -20 },
      ]),
    ).toEqual({ totalMinutes: 30, minutesBySubject: { Math: 30 } });
  });

  it("folds an empty month to zero", () => {
    expect(summarizeHoursContributions([])).toEqual({ totalMinutes: 0, minutesBySubject: {} });
  });
});

// The counting rule itself — `collectHoursContributions`, `entryMinutes`,
// `dayLogMinuteContributions`, `itemMatchesBlock` — no longer lives here: it has
// one definition in `functions/src/shared/hoursContributions.ts` (ARCH-47 slice
// 4) and every case this file used to cover moved to
// `functions/src/shared/hoursContributions.test.ts`, alongside the app suite's.
// `deriveChildIdFromDocId` moved the same way in slice 2, to `shared/docId.ts`.
