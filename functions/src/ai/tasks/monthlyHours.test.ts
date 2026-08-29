import { describe, it, expect } from "vitest";

import {
  collectHoursContributions,
  computeMonthHours,
  dayLogMinuteContributions,
  entryMinutes,
  itemMatchesBlock,
} from "./monthlyHours.js";

/**
 * THE PARITY FIXTURE (FEAT-164).
 *
 * `functions/` cannot import from `src/` (TS6059 `rootDir` + TS2835 node16
 * resolution — measured, see the module header), so the hours counting rule
 * exists twice: `collectHoursContributions` in
 * `src/features/records/records.logic.ts` and its port in `monthlyHours.ts`.
 * This fixture is the contract between the two copies: it is repeated VERBATIM
 * in `src/features/records/records.logic.test.ts` (search that file for
 * "PARITY FIXTURE"), where `computeHoursSummary` is asserted to produce the
 * same `PARITY_EXPECTED` total AND the same per-subject map. If you change one
 * implementation, this pair fails until you change the other.
 *
 * The subject map is asserted, not just the total, because the book's prose
 * RANKS subjects off it ("Science was his biggest subject this month") — a
 * per-subject drift rewrites the narrative even when the total agrees.
 *
 * It exercises the parts most likely to drift:
 *  - a day in block-actuals mode where a completed item MATCHES a tracked block
 *    (deduped, not double-counted) and another is an unmatched carried-over
 *    item (DATA-14 — counted, at Home);
 *  - an untracked block on a tracked day (counts zero — the partial-day edge);
 *  - a checklist-only day, including a "(Nm)" label with no minutes fields;
 *  - a 'both'-attributed adjustment (counts) and a sibling-tagged one (does
 *    not) — DATA-09;
 *  - a negative adjustment (corrections subtract);
 *  - a manual `hours` entry, one carrying `hours` instead of `minutes`, and a
 *    zero-minute entry (skipped);
 *  - another child's day log and hours entry (filtered by the safety net).
 */
export const PARITY_CHILD_ID = "c-lincoln";

export const PARITY_DAY_LOGS = [
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

export const PARITY_HOURS_ENTRIES = [
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

export const PARITY_ADJUSTMENTS = [
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

export const PARITY_EXPECTED = {
  totalMinutes: 285,
  minutesBySubject: {
    Math: 100,
    LanguageArts: 15,
    Reading: 25,
    Science: 145,
  },
};

describe("monthlyHours — the functions-side port of records.logic.ts's counting path", () => {
  it("agrees with the app-side computeHoursSummary on the shared PARITY FIXTURE", () => {
    expect(
      computeMonthHours(
        PARITY_DAY_LOGS,
        PARITY_HOURS_ENTRIES,
        PARITY_ADJUSTMENTS,
        PARITY_CHILD_ID,
      ),
    ).toEqual(PARITY_EXPECTED);
  });

  it("counts all three additive sources, not just the hours collection", () => {
    const entriesOnly = computeMonthHours([], PARITY_HOURS_ENTRIES, [], PARITY_CHILD_ID);
    // The pre-FEAT-164 book totalled only this slice — the defect in one line.
    expect(entriesOnly.totalMinutes).toBe(135);
    expect(
      computeMonthHours(
        PARITY_DAY_LOGS,
        PARITY_HOURS_ENTRIES,
        PARITY_ADJUSTMENTS,
        PARITY_CHILD_ID,
      ).totalMinutes,
    ).toBe(285);
  });

  it("can change which subject leads the month, not just the total", () => {
    // The prose ranks subjects off this map, so a missing source is a narrative
    // bug: on the hours collection alone Math leads; counting everything,
    // Science does.
    const leader = (byBucket: Record<string, number>) =>
      Object.entries(byBucket).sort((a, b) => b[1] - a[1])[0][0];
    expect(
      leader(computeMonthHours([], PARITY_HOURS_ENTRIES, [], PARITY_CHILD_ID).minutesBySubject),
    ).toBe("Math");
    expect(
      leader(
        computeMonthHours(
          PARITY_DAY_LOGS,
          PARITY_HOURS_ENTRIES,
          PARITY_ADJUSTMENTS,
          PARITY_CHILD_ID,
        ).minutesBySubject,
      ),
    ).toBe("Science");
  });
});

describe("entryMinutes", () => {
  it("prefers explicit minutes, falls back to hours, else zero", () => {
    expect(entryMinutes({ minutes: 45 })).toBe(45);
    expect(entryMinutes({ hours: 1.5 })).toBe(90);
    expect(entryMinutes({ hours: 0.7 })).toBe(42);
    expect(entryMinutes({ minutes: 10, hours: 99 })).toBe(10);
    expect(entryMinutes({})).toBe(0);
  });
});

describe("dayLogMinuteContributions — the partial-day rule (DATA-14)", () => {
  it("uses block actuals and ignores untracked blocks on a tracked day", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { subjectBucket: "Math", location: "Home", actualMinutes: 30 },
          { subjectBucket: "Reading", location: "Home", plannedMinutes: 20 },
        ],
      }),
    ).toEqual([{ subjectBucket: "Math", minutes: 30, location: "Home" }]);
  });

  it("carries an unmatched completed item on a block-actuals day, at Home", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [{ title: "Math Workbook", subjectBucket: "Math", actualMinutes: 30 }],
        checklist: [
          { label: "Carried over (15m)", completed: true, subjectBucket: "Reading" },
        ],
      }),
    ).toEqual([
      { subjectBucket: "Math", minutes: 30, location: undefined },
      { subjectBucket: "Reading", minutes: 15, location: "Home" },
    ]);
  });

  it("does NOT double-count an item that matches a tracked block", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [{ title: "Math Workbook", subjectBucket: "Math", actualMinutes: 30 }],
        checklist: [
          { label: "Math Workbook (30m)", completed: true, estimatedMinutes: 30 },
        ],
      }),
    ).toEqual([{ subjectBucket: "Math", minutes: 30, location: undefined }]);
  });

  it("falls back entirely to completed checklist items when no block tracked time", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [{ subjectBucket: "Math", plannedMinutes: 30 }],
        checklist: [
          { label: "Read aloud (25m)", completed: true, subjectBucket: "Reading" },
          { label: "Skipped (40m)", completed: false, subjectBucket: "Math" },
        ],
      }),
    ).toEqual([{ subjectBucket: "Reading", minutes: 25, location: "Home" }]);
  });

  it("defaults a missing subjectBucket to Other and reads malformed docs safely", () => {
    expect(dayLogMinuteContributions({ blocks: [{ actualMinutes: 10 }] })).toEqual([
      { subjectBucket: "Other", minutes: 10, location: undefined },
    ]);
    expect(dayLogMinuteContributions({})).toEqual([]);
    expect(dayLogMinuteContributions({ blocks: "nope", checklist: 7 })).toEqual([]);
  });
});

describe("collectHoursContributions — attribution and source rules", () => {
  it("counts a 'both' adjustment and skips a sibling's (DATA-09)", () => {
    const kinds = collectHoursContributions(
      [],
      [],
      [
        { childId: "both", date: "2026-08-10", minutes: 60, subjectBucket: "Science" },
        { childId: "c-london", date: "2026-08-11", minutes: 120, subjectBucket: "Math" },
      ],
      PARITY_CHILD_ID,
    );
    expect(kinds).toEqual([
      {
        kind: "adjustment",
        date: "2026-08-10",
        subjectBucket: "Science",
        minutes: 60,
        location: undefined,
      },
    ]);
  });

  it("emits negative and zero adjustments (corrections must subtract)", () => {
    expect(
      collectHoursContributions(
        [],
        [],
        [
          { childId: PARITY_CHILD_ID, date: "2026-08-12", minutes: -20 },
          { childId: PARITY_CHILD_ID, date: "2026-08-13", minutes: 0 },
        ],
        PARITY_CHILD_ID,
      ).map((c) => c.minutes),
    ).toEqual([-20, 0]);
  });

  it("skips non-positive hours entries (unlike adjustments)", () => {
    expect(
      collectHoursContributions(
        [],
        [
          { childId: PARITY_CHILD_ID, date: "2026-08-08", minutes: 0 },
          { childId: PARITY_CHILD_ID, date: "2026-08-09", minutes: -5 },
          { childId: PARITY_CHILD_ID, date: "2026-08-09", minutes: 5 },
        ],
        [],
        PARITY_CHILD_ID,
      ).map((c) => c.minutes),
    ).toEqual([5]);
  });

  it("filters day logs and entries belonging to another child", () => {
    expect(
      collectHoursContributions(
        PARITY_DAY_LOGS,
        PARITY_HOURS_ENTRIES,
        [],
        "c-london",
      ),
    ).toEqual([
      {
        kind: "entry",
        date: "2026-08-06",
        subjectBucket: "Math",
        minutes: 60,
        location: undefined,
      },
      {
        kind: "day-log",
        date: "2026-08-05",
        subjectBucket: "Math",
        minutes: 99,
        location: "Home",
      },
    ]);
  });

  it("passes everything through when no childId is given", () => {
    expect(collectHoursContributions([], [], PARITY_ADJUSTMENTS)).toHaveLength(3);
  });
});

describe("itemMatchesBlock — the shared DATA-14 correspondence rule", () => {
  it("matches on a block checklist entry with the same label", () => {
    expect(
      itemMatchesBlock(
        { label: "Phonics drill" },
        { checklist: [{ label: "Phonics drill" }] },
      ),
    ).toBe(true);
  });

  it("matches a block title against the label with its (Nm) suffix stripped", () => {
    expect(itemMatchesBlock({ label: "Math Workbook (30m)" }, { title: "Math Workbook" })).toBe(
      true,
    );
    expect(itemMatchesBlock({ label: "Morning Math Workbook (30m)" }, { title: "math" })).toBe(
      true,
    );
  });

  it("does not match an unrelated block", () => {
    expect(itemMatchesBlock({ label: "Handwriting practice (15m)" }, { title: "Reading" })).toBe(
      false,
    );
    expect(itemMatchesBlock({ label: "Handwriting practice" }, {})).toBe(false);
  });
});
