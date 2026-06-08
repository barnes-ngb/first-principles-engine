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
    allArtifactIds: new Set(),
    conundrums: [],
    teachBacks: [],
    hours: { totalMinutes: 0, minutesBySubject: {} },
    diamonds: { totalDiamonds: 0, questEvents: 0, routineEvents: 0 },
    questCount: 0,
    reading: {
      books: [],
      totalChaptersAnswered: 0,
      totalQuestionsAnswered: 0,
      totalQuestionsSkipped: 0,
    },
  };
}

function emptyPlacement(): SectionPlacement {
  return {
    cover: { kid: [], parent: [] },
    whatYouLoved: { kid: [], parent: [] },
    workedThrough: { kid: [], parent: [] },
    moreFromMonth: { kid: [], parent: [] },
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

  it("omits the moreFromMonth page when no overflow exists", () => {
    const review = composeMonthlyReview(baseInput());
    const sectionTypes = review.pages.map((p) => p.sectionType);
    expect(sectionTypes).not.toContain("moreFromMonth");
  });

  it("adds a moreFromMonth page with fixed kid content when overflow >= 2", () => {
    const overflowPhotos = [1, 2].map((n) => ({
      id: `artifact:over-${n}`,
      storagePath: `art/over-${n}.jpg`,
      source: "artifact" as const,
      sourceDocId: `over-${n}`,
      capturedAt: "2026-05-15T10:00:00Z",
    }));
    const placement: SectionPlacement = {
      cover: { kid: [], parent: [] },
      whatYouLoved: { kid: [], parent: [] },
      workedThrough: { kid: [], parent: [] },
      moreFromMonth: { kid: overflowPhotos, parent: [] },
      more: [],
    };
    const review = composeMonthlyReview(baseInput({ placement }));
    const page = review.pages.find((p) => p.sectionType === "moreFromMonth");
    expect(page).toBeDefined();
    expect(page!.kidMode.headline).toBe("More from this month");
    expect(page!.kidMode.body).toBe("Look at everything you made.");
    // Parent mode is empty content — the renderer filters this page out
    // entirely in parent mode.
    expect(page!.parentMode).toEqual({});
    const photoRefs = page!.photoRefs;
    if (Array.isArray(photoRefs)) {
      throw new Error("expected per-mode photoRefs");
    }
    expect(photoRefs.kid.map((p) => p.id)).toEqual([
      "artifact:over-1",
      "artifact:over-2",
    ]);
    expect(photoRefs.parent).toEqual([]);
  });

  it("omits the moreFromMonth page when overflow is only 1 photo", () => {
    const placement: SectionPlacement = {
      cover: { kid: [], parent: [] },
      whatYouLoved: { kid: [], parent: [] },
      workedThrough: { kid: [], parent: [] },
      moreFromMonth: {
        kid: [
          {
            id: "artifact:lone",
            storagePath: "art/lone.jpg",
            source: "artifact",
            sourceDocId: "lone",
            capturedAt: "2026-05-15T10:00:00Z",
          },
        ],
        parent: [],
      },
      more: [],
    };
    const review = composeMonthlyReview(baseInput({ placement }));
    const sectionTypes = review.pages.map((p) => p.sectionType);
    expect(sectionTypes).not.toContain("moreFromMonth");
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

  it("omits the reading recap entirely when no reading happened", () => {
    const review = composeMonthlyReview(baseInput());
    // Additive + Firestore-safe: the key is absent (not undefined) when empty.
    expect("reading" in review).toBe(false);
    expect(findUndefinedPaths(review)).toEqual([]);
  });

  it("includes the reading recap when books were read this month", () => {
    const data = emptyAggregate();
    data.reading = {
      books: [
        {
          bookId: "b1",
          title: "Prince Caspian",
          totalChapters: 15,
          chaptersAnswered: 3,
          questionsAnswered: 3,
          questionsSkipped: 1,
        },
      ],
      totalChaptersAnswered: 3,
      totalQuestionsAnswered: 3,
      totalQuestionsSkipped: 1,
    };
    const review = composeMonthlyReview(baseInput({ data }));
    expect(review.reading).toBeDefined();
    expect(review.reading!.books).toHaveLength(1);
    expect(review.reading!.books[0].title).toBe("Prince Caspian");
    expect(review.reading!.totalQuestionsAnswered).toBe(3);
    // Still no undefined leaves once the optional recap is populated.
    expect(findUndefinedPaths(review)).toEqual([]);
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
