import { describe, it, expect } from "vitest";
import { composeMonthlyReview, type ComposeInput } from "./monthlyReview.js";
import type { MonthAggregate } from "./monthlyReviewData.js";
import type { SectionPlacement } from "./monthlyReviewCuration.js";

function emptyAggregate(): MonthAggregate {
  return {
    month: "2026-05",
    monthStart: "2026-05-01",
    monthEnd: "2026-05-31",
    dayLogs: [],
    weeklyReviews: [],
    activeBlockers: [],
    resolvedBlockers: [],
    completedBooks: [],
    dadLabReports: [],
    photos: [],
    workbookArtifactIds: new Set(),
    classifiedScanIds: new Set(),
    conundrums: [],
    teachBacks: [],
    hours: { totalMinutes: 0, minutesBySubject: {} },
    diamonds: { totalDiamonds: 0, questEvents: 0, routineEvents: 0 },
    questCount: 0,
  };
}

function emptyPlacement(): SectionPlacement {
  return {
    cover: { kid: [], parent: [] },
    whatYouLoved: { kid: [], parent: [] },
    workedThrough: { kid: [], parent: [] },
    more: [],
  };
}

function baseInput(over: Partial<ComposeInput> = {}): ComposeInput {
  return {
    familyId: "fam",
    childId: "lincoln",
    month: "2026-05",
    data: emptyAggregate(),
    hero: undefined,
    scored: [],
    placement: emptyPlacement(),
    parsed: { theme: "Quiet Month", sections: {} },
    ...over,
  };
}

describe("composeMonthlyReview", () => {
  it("composes a valid review document when no hero photo qualifies", () => {
    const review = composeMonthlyReview(baseInput());

    // Critical: heroPhotoRef must be null, not undefined — Firestore rejects
    // undefined values, so the picker's "no result" must be coerced at the
    // write boundary.
    expect(review.heroPhotoRef).toBeNull();
    expect(review.heroPhotoRef).not.toBeUndefined();
  });

  it("never writes undefined values anywhere in the payload", () => {
    const review = composeMonthlyReview(baseInput());

    // Walk the payload; any literal `undefined` leaf will cause Firestore
    // `.set(payload)` to throw.
    const undefinedPaths = findUndefinedPaths(review);
    expect(undefinedPaths).toEqual([]);
  });

  it("includes the hero when one is provided", () => {
    const hero = {
      id: "scan:abc",
      storagePath: "scans/abc.jpg",
      source: "scan" as const,
      sourceDocId: "abc",
      capturedAt: "2026-05-12T10:00:00Z",
    };
    const review = composeMonthlyReview(baseInput({ hero }));
    expect(review.heroPhotoRef).toEqual(hero);
  });

  it("omits optional photo fields (score/subjectTag) when undefined on curated photos", () => {
    const review = composeMonthlyReview(
      baseInput({
        scored: [
          {
            id: "scan:abc",
            storagePath: "scans/abc.jpg",
            source: "scan",
            sourceDocId: "abc",
            capturedAt: "2026-05-12T10:00:00Z",
            score: 5,
            autoInclude: false,
            isWorkbookScan: false,
          },
        ],
      }),
    );
    const ref = review.curatedPhotos[0];
    expect(ref).toBeDefined();
    expect("subjectTag" in ref).toBe(false);
    expect(ref.score).toBe(5);
  });
});

function findUndefinedPaths(obj: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (obj === undefined) {
    out.push(path);
    return out;
  }
  if (obj === null || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...findUndefinedPaths(v, `${path}[${i}]`)));
    return out;
  }
  if (obj instanceof Set || obj instanceof Map) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) {
      out.push(`${path}.${k}`);
    } else {
      out.push(...findUndefinedPaths(v, `${path}.${k}`));
    }
  }
  return out;
}
