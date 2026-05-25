import { describe, it, expect } from "vitest";
import {
  scorePhotos,
  pickHeroPhoto,
  assignPhotosToSections,
  type PhotoCurationContext,
  type ScoredPhoto,
} from "./monthlyReviewCuration.js";
import type { PhotoRef } from "./monthlyReviewData.js";

function emptyContext(): PhotoCurationContext {
  return {
    dayLogEngagement: {},
    scanQualityById: {},
    bookArtifactIds: new Set(),
    sketchArtifactIds: new Set(),
    dadLabArtifactIds: new Set(),
    resolvedBlockerEvidenceIds: new Set(),
  };
}

function photo(over: Partial<PhotoRef>): PhotoRef {
  return {
    id: "p1",
    storagePath: "x",
    source: "artifact",
    sourceDocId: "doc",
    capturedAt: "2026-04-10T12:00:00Z",
    ...over,
  };
}

describe("scorePhotos", () => {
  it("returns empty when no photos", () => {
    expect(scorePhotos([], emptyContext())).toEqual([]);
  });

  it("adds engagement bonus from day log emoji on linked item", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "engaged" };
    const scored = scorePhotos(
      [photo({ id: "a", sourceDocId: "doc-a" })],
      ctx,
    );
    expect(scored[0].score).toBe(3);
  });

  it("subtracts for refused engagement", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "refused" };
    const scored = scorePhotos(
      [photo({ id: "a", sourceDocId: "doc-a" })],
      ctx,
    );
    expect(scored[0].score).toBe(-2);
  });

  it("adds +2 for 'good' scan quality", () => {
    const ctx = emptyContext();
    ctx.scanQualityById["scan-x"] = "good";
    const scored = scorePhotos(
      [photo({ id: "a", source: "scan", sourceDocId: "scan-x" })],
      ctx,
    );
    expect(scored[0].score).toBe(2);
  });

  it("marks book artifacts as auto-include with infinite score", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-1");
    const scored = scorePhotos(
      [photo({ id: "a", sourceDocId: "book-1" })],
      ctx,
    );
    expect(scored[0].autoInclude).toBe(true);
    expect(scored[0].score).toBe(Number.POSITIVE_INFINITY);
  });

  it("boosts dad lab artifacts with explanation present", () => {
    const ctx = emptyContext();
    ctx.dadLabArtifactIds.add("lab-1");
    const scored = scorePhotos(
      [photo({ id: "a", sourceDocId: "lab-1" })],
      ctx,
    );
    expect(scored[0].score).toBe(2);
  });

  it("boosts resolved-blocker evidence photos by +2", () => {
    const ctx = emptyContext();
    ctx.resolvedBlockerEvidenceIds.add("photo-evidence");
    const scored = scorePhotos(
      [photo({ id: "photo-evidence" })],
      ctx,
    );
    expect(scored[0].score).toBe(2);
  });

  it("sorts descending by score, with auto-include first", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-1");
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "engaged" };
    const scored = scorePhotos(
      [
        photo({ id: "a", sourceDocId: "doc-a" }),
        photo({ id: "b", sourceDocId: "book-1" }),
      ],
      ctx,
    );
    expect(scored[0].id).toBe("b");
    expect(scored[1].id).toBe("a");
  });
});

describe("pickHeroPhoto", () => {
  it("returns undefined when no photos", () => {
    expect(pickHeroPhoto([])).toBeUndefined();
  });

  it("skips workbook scans even when they score highest", () => {
    const ctx = emptyContext();
    ctx.scanQualityById["scan-x"] = "good";
    const scored = scorePhotos(
      [
        photo({ id: "scan", source: "scan", sourceDocId: "scan-x" }),
        photo({ id: "art", source: "artifact" }),
      ],
      ctx,
    );
    const hero = pickHeroPhoto(scored);
    expect(hero?.id).toBe("art");
  });

  it("returns top non-scan photo", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "engaged" };
    const scored = scorePhotos(
      [
        photo({ id: "a", sourceDocId: "doc-a" }),
        photo({ id: "b", sourceDocId: "doc-b" }),
      ],
      ctx,
    );
    expect(pickHeroPhoto(scored)?.id).toBe("a");
  });

  it("excludes workbook scans even if highest scored", () => {
    const scored: ScoredPhoto[] = [
      {
        ...photo({ id: "workbook" }),
        score: 100,
        autoInclude: false,
        isWorkbookScan: true,
      },
      {
        ...photo({ id: "creative" }),
        score: 20,
        autoInclude: false,
        isWorkbookScan: false,
      },
    ];
    expect(pickHeroPhoto(scored)?.id).toBe("creative");
  });

  it("returns undefined when only workbook scans exist", () => {
    const scored: ScoredPhoto[] = [
      {
        ...photo({ id: "wb1" }),
        score: 100,
        autoInclude: false,
        isWorkbookScan: true,
      },
      {
        ...photo({ id: "wb2" }),
        score: 50,
        autoInclude: false,
        isWorkbookScan: true,
      },
    ];
    expect(pickHeroPhoto(scored)).toBeUndefined();
  });

  it("treats Worksheet-type artifacts as workbook scans via context", () => {
    const ctx = emptyContext();
    ctx.workbookArtifactIds = new Set(["worksheet-doc"]);
    const scored = scorePhotos(
      [
        photo({ id: "worksheet", sourceDocId: "worksheet-doc" }),
        photo({ id: "art", sourceDocId: "other-doc" }),
      ],
      ctx,
    );
    expect(pickHeroPhoto(scored)?.id).toBe("art");
  });
});

describe("assignPhotosToSections", () => {
  it("returns empty placement for empty input", () => {
    const placement = assignPhotosToSections([], {
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.whatYouLoved).toEqual([]);
    expect(placement.workedThrough).toEqual([]);
    expect(placement.more).toEqual([]);
  });

  it("places top photos into whatYouLoved (capped at MAX_PHOTOS_PER_SECTION.whatYouLoved)", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = {};
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 10; i++) {
      ctx.dayLogEngagement["2026-04-10"][`doc-${i}`] = "engaged";
      photos.push(photo({ id: `p${i}`, sourceDocId: `doc-${i}` }));
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.whatYouLoved.length).toBe(6);
  });

  it("prefers resolved-blocker evidence for workedThrough", () => {
    const ctx = emptyContext();
    ctx.resolvedBlockerEvidenceIds.add("evidence-photo");
    const photos: PhotoRef[] = [
      photo({ id: "evidence-photo" }),
      photo({ id: "other", capturedAt: "2026-04-20T12:00:00Z" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      hasBookCompletions: false,
      hasDadLab: false,
      resolvedBlockerEvidenceIds: new Set(["evidence-photo"]),
    });
    const workedIds = placement.workedThrough.map((p) => p.id);
    expect(workedIds).toContain("evidence-photo");
  });

  it("applies subject diversity penalty after 3rd same-subject photo", () => {
    const ctx = emptyContext();
    // 10 reading-tagged photos + 1 math photo. After picking 3 readings the
    // 4th+ reading photos take a diversity penalty so the Math photo wins
    // a slot before the lowest-ranked readings.
    ctx.dayLogEngagement["2026-04-10"] = {};
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 10; i++) {
      const docId = `doc-${i}`;
      ctx.dayLogEngagement["2026-04-10"][docId] = "engaged";
      photos.push(
        photo({ id: `p${i}`, sourceDocId: docId, subjectTag: "Reading" }),
      );
    }
    ctx.dayLogEngagement["2026-04-10"]["doc-math"] = "engaged";
    photos.push(
      photo({ id: "math", sourceDocId: "doc-math", subjectTag: "Math" }),
    );

    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      hasBookCompletions: false,
      hasDadLab: false,
    });

    const subjects = placement.whatYouLoved.map((p) => p.subjectTag);
    expect(subjects.includes("Math")).toBe(true);
  });
});
