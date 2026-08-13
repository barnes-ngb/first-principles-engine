import { describe, it, expect } from "vitest";
import {
  scorePhotos,
  pickHeroPhoto,
  pickHeroForMode,
  hasPositiveKidModeSignal,
  assignPhotosToSections,
  isBigStepCurriculumPhoto,
  MAX_CURRICULUM_PHOTOS_IN_BOOK,
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
    classifiedScanIds: new Set(),
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
      ...emptyContext(),
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.cover.kid).toEqual([]);
    expect(placement.cover.parent).toEqual([]);
    expect(placement.whatYouLoved.kid).toEqual([]);
    expect(placement.whatYouLoved.parent).toEqual([]);
    expect(placement.workedThrough.kid).toEqual([]);
    expect(placement.workedThrough.parent).toEqual([]);
    expect(placement.moreFromMonth.kid).toEqual([]);
    expect(placement.moreFromMonth.parent).toEqual([]);
    expect(placement.more).toEqual([]);
  });

  it("kid mode whatYouLoved caps at 6 (lowered so overflow reaches gallery)", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = {};
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 12; i++) {
      ctx.dayLogEngagement["2026-04-10"][`doc-${i}`] = "engaged";
      photos.push(photo({ id: `p${i}`, sourceDocId: `doc-${i}` }));
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.whatYouLoved.kid.length).toBe(6);
    expect(placement.whatYouLoved.parent.length).toBe(6);
  });

  it("kid mode whatYouLoved excludes workbook scans entirely", () => {
    const ctx = emptyContext();
    ctx.workbookArtifactIds = new Set(["wb-doc"]);
    // Give the creative artifacts engagement so they pass the kid-mode
    // positive-signal filter; the workbook scan should still be excluded.
    ctx.dayLogEngagement["2026-04-10"] = {
      "doc-1": "engaged",
      "doc-2": "engaged",
    };
    const photos: PhotoRef[] = [
      photo({ id: "art1", sourceDocId: "doc-1" }),
      photo({ id: "wb1", sourceDocId: "wb-doc" }),
      photo({ id: "art2", sourceDocId: "doc-2" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: true,
      hasDadLab: false,
    });
    const kidIds = placement.whatYouLoved.kid.map((p) => p.id);
    expect(kidIds).toContain("art1");
    expect(kidIds).toContain("art2");
    expect(kidIds).not.toContain("wb1");
  });

  it("kid mode workedThrough also excludes workbook scans", () => {
    const ctx = emptyContext();
    const photos: PhotoRef[] = [
      photo({ id: "scan-only", source: "scan", sourceDocId: "scan-x" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.workedThrough.kid).toEqual([]);
  });

  // FEAT-141 supersedes the old "parent mode allows workbook scans on
  // workedThrough" rule: an ungated curriculum image no longer reaches ANY
  // section. The parent evidence page is still the only section one can reach
  // — but only the single big-step exception (see the FEAT-141 block below).
  it("parent mode no longer places an ungated workbook scan anywhere", () => {
    const ctx = emptyContext();
    const photos: PhotoRef[] = [
      photo({ id: "wb1", source: "scan", sourceDocId: "scan-x" }),
      photo({ id: "art1", sourceDocId: "doc-a" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.workedThrough.parent.map((p) => p.id)).not.toContain("wb1");
    expect(placement.whatYouLoved.parent.map((p) => p.id)).not.toContain("wb1");
    // The creative artifact is untouched by the policy.
    expect(placement.whatYouLoved.parent.map((p) => p.id)).toContain("art1");
  });

  it("prefers resolved-blocker evidence for workedThrough (both modes)", () => {
    const ctx = emptyContext();
    ctx.resolvedBlockerEvidenceIds.add("evidence-photo");
    const photos: PhotoRef[] = [
      photo({ id: "evidence-photo" }),
      photo({ id: "other", capturedAt: "2026-04-20T12:00:00Z" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.workedThrough.kid.map((p) => p.id)).toContain(
      "evidence-photo",
    );
    expect(placement.workedThrough.parent.map((p) => p.id)).toContain(
      "evidence-photo",
    );
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
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });

    const subjects = placement.whatYouLoved.parent.map((p) => p.subjectTag);
    expect(subjects.includes("Math")).toBe(true);
  });
});

describe("hasPositiveKidModeSignal", () => {
  it("passes photo with engaged engagement", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "engaged" };
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", sourceDocId: "doc-a" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("passes photo with okay engagement (😐 is still real signal)", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "okay" };
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", sourceDocId: "doc-a" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("fails photo with struggled engagement only", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "struggled" };
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", sourceDocId: "doc-a" }),
        ctx,
      ),
    ).toBe(false);
  });

  it("passes book artifact regardless of engagement", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-1");
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", sourceDocId: "book-1" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("passes classified scan", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-x"]);
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", source: "scan", sourceDocId: "scan-x" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("passes resolved-blocker evidence", () => {
    const ctx = emptyContext();
    ctx.resolvedBlockerEvidenceIds.add("artifact:evidence-1");
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "artifact:evidence-1" }),
        ctx,
      ),
    ).toBe(true);
  });

  it("fails incidental photo with no creative tag and no engagement", () => {
    const ctx = emptyContext();
    const incidental = photo({ id: "incidental", sourceDocId: "rand-doc" });
    expect(hasPositiveKidModeSignal(incidental, ctx)).toBe(false);
  });

  it("fails unclassified scan even with good quality", () => {
    const ctx = emptyContext();
    ctx.scanQualityById["scan-y"] = "good";
    expect(
      hasPositiveKidModeSignal(
        photo({ id: "a", source: "scan", sourceDocId: "scan-y" }),
        ctx,
      ),
    ).toBe(false);
  });
});

describe("pickHeroForMode — strict allowlist", () => {
  it("returns undefined when only incidental photos exist", () => {
    const ctx = emptyContext();
    const scored = scorePhotos(
      [photo({ id: "incidental", sourceDocId: "rand" })],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)).toBeUndefined();
  });

  it("picks book artifact over higher-scoring incidental photo", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-doc");
    // Give the incidental photo a higher raw score via engagement.
    ctx.dayLogEngagement["2026-04-10"] = { "rand-doc": "engaged" };
    const scored = scorePhotos(
      [
        photo({ id: "incidental", sourceDocId: "rand-doc" }),
        photo({ id: "book", sourceDocId: "book-doc" }),
      ],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)?.id).toBe("book");
  });

  it("never picks a scan as cover hero, even when classified", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-class"]);
    const scored = scorePhotos(
      [
        photo({ id: "unclass", source: "scan", sourceDocId: "scan-rand" }),
        photo({ id: "class", source: "scan", sourceDocId: "scan-class" }),
      ],
      ctx,
    );
    // Scans — even classified ones — are evidence, not celebration. The
    // hero pool is artifact-only.
    expect(pickHeroForMode("kid", scored, new Set(), ctx)).toBeUndefined();
  });

  it("adds chosen hero to alreadyPlaced for dedup", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-doc");
    const scored = scorePhotos(
      [photo({ id: "book", sourceDocId: "book-doc" })],
      ctx,
    );
    const placed = new Set<string>();
    pickHeroForMode("kid", scored, placed, ctx);
    expect(placed.has("book")).toBe(true);
  });
});

describe("cross-section deduplication (within mode)", () => {
  it("does not place the same photo in both cover and whatYouLoved (kid)", () => {
    const ctx = emptyContext();
    ctx.bookArtifactIds.add("book-doc");
    const scored = scorePhotos(
      [photo({ id: "book", sourceDocId: "book-doc" })],
      ctx,
    );
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: true,
      hasDadLab: false,
    });
    const coverId = placement.cover.kid[0]?.id;
    expect(coverId).toBe("book");
    expect(placement.whatYouLoved.kid.map((p) => p.id)).not.toContain(coverId);
  });

  it("does not place the same photo in both whatYouLoved and workedThrough (kid)", () => {
    const ctx = emptyContext();
    ctx.dayLogEngagement["2026-04-10"] = { "doc-a": "engaged" };
    // One eligible photo + cover-disqualified (no creative tag).
    const scored = scorePhotos(
      [photo({ id: "p1", sourceDocId: "doc-a" })],
      ctx,
    );
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    const lovedIds = placement.whatYouLoved.kid.map((p) => p.id);
    const workedIds = placement.workedThrough.kid.map((p) => p.id);
    for (const id of lovedIds) expect(workedIds).not.toContain(id);
  });
});

describe("artifact-default kid-mode placement (v1.4)", () => {
  it("places non-workbook artifacts in kid mode without requiring engagement", () => {
    const ctx = emptyContext();
    // A "family-activity" photo with no engagement tagging, no creative-type
    // tag — under the v1.4 artifact-default policy it should still qualify
    // for kid-mode placement because it's a real artifact (not a workbook).
    const scored = scorePhotos(
      [photo({ id: "family-activity", sourceDocId: "art-doc" })],
      ctx,
    );
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.whatYouLoved.kid.map((p) => p.id)).toContain(
      "family-activity",
    );
  });

  it("excludes workbook scans from kid mode (unchanged behavior)", () => {
    const ctx = emptyContext();
    const scored = scorePhotos(
      [photo({ id: "wb1", source: "scan", sourceDocId: "scan-x" })],
      ctx,
    );
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    // Workbook scan is excluded from every kid-mode section.
    expect(placement.cover.kid).toEqual([]);
    expect(placement.whatYouLoved.kid).toEqual([]);
    expect(placement.workedThrough.kid).toEqual([]);
    expect(placement.moreFromMonth.kid).toEqual([]);
    // FEAT-141: and from parent mode too, unless it is the one big-step
    // exception — this scan carries no signal, so it is not.
    expect(placement.workedThrough.parent.map((p) => p.id)).not.toContain("wb1");
  });

  it("overflow goes to moreFromMonth when whatYouLoved + workedThrough are full", () => {
    const ctx = emptyContext();
    // 20 plain artifacts — no engagement, no creative tags. Kid sections:
    // whatYouLoved cap 6 + workedThrough cap 4 = 10; remaining 10 should
    // land in moreFromMonth.kid.
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 20; i++) {
      photos.push(
        photo({
          id: `art-${i}`,
          sourceDocId: `doc-${i}`,
          // Spread captures across days so spread penalties don't punish
          // the trailing photos out of the cap.
          capturedAt: `2026-04-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
        }),
      );
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.whatYouLoved.kid.length).toBe(6);
    expect(placement.moreFromMonth.kid.length).toBeGreaterThanOrEqual(4);
  });

  it("moreFromMonth is empty when no overflow exists", () => {
    const ctx = emptyContext();
    const photos: PhotoRef[] = [
      photo({ id: "a1", sourceDocId: "doc-1" }),
      photo({ id: "a2", sourceDocId: "doc-2" }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.moreFromMonth.kid).toEqual([]);
  });

  it("moreFromMonth.parent is always empty even with many photos", () => {
    const ctx = emptyContext();
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 20; i++) {
      photos.push(photo({ id: `a${i}`, sourceDocId: `doc-${i}` }));
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.moreFromMonth.parent).toEqual([]);
  });

  it("moreFromMonth respects the 20-photo cap", () => {
    const ctx = emptyContext();
    // 40 plain artifacts spread across the month. Kid sections place 12
    // (8 + 4), so 28 remain — moreFromMonth should cap at 20.
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 40; i++) {
      photos.push(
        photo({
          id: `a${i}`,
          sourceDocId: `doc-${i}`,
          capturedAt: `2026-04-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
        }),
      );
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.moreFromMonth.kid.length).toBe(20);
  });
});

describe("cover hero — no scans, even classified", () => {
  it("does not pick classified scan as cover hero when an artifact exists", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-class"]);
    ctx.allArtifactIds = new Set(["art-doc"]);
    const scored = scorePhotos(
      [
        photo({ id: "classified-scan", source: "scan", sourceDocId: "scan-class" }),
        photo({ id: "real-artifact", source: "artifact", sourceDocId: "art-doc" }),
      ],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)?.id).toBe(
      "real-artifact",
    );
  });

  it("returns undefined when only scans (classified or not) exist", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-class"]);
    const scored = scorePhotos(
      [
        photo({ id: "classified", source: "scan", sourceDocId: "scan-class" }),
        photo({ id: "unclass", source: "scan", sourceDocId: "scan-rand" }),
      ],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)).toBeUndefined();
  });
});

describe("cover hero allowlist — broadened pool", () => {
  it("picks any non-workbook artifact via allArtifactIds", () => {
    const ctx = emptyContext();
    ctx.allArtifactIds = new Set(["family-doc"]);
    const scored = scorePhotos(
      [photo({ id: "family", sourceDocId: "family-doc" })],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)?.id).toBe("family");
  });

  it("still excludes workbook scans from cover hero", () => {
    const ctx = emptyContext();
    ctx.workbookArtifactIds = new Set(["wb-doc"]);
    // Even if a workbook artifact were placed in allArtifactIds, the
    // isWorkbookScan guard inside the allowlist must reject it.
    ctx.allArtifactIds = new Set(["wb-doc"]);
    const scored = scorePhotos(
      [photo({ id: "wb", sourceDocId: "wb-doc" })],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)).toBeUndefined();
  });
});

// ── FEAT-141: the book stops printing workbook pages ────────────
//
// Nathan, 2026-08-13: "a picture of a page doesn't really have any bearing when
// reviewing… probably doesn't want any curriculum images. If it does, very few
// and only ones where he made big steps."
//
// These cases hold with ZERO content notes present — the policy is the half of
// FEAT-141 that works on an already-captured month.
describe("FEAT-141 curriculum-image policy", () => {
  it("a month of mostly workbook scans produces a book whose pages are artifacts", () => {
    const ctx = emptyContext();
    // 10 scans, all successfully classified (the exact photos that leaked into
    // Lincoln's book before this policy), plus 2 real artifacts.
    const photos: PhotoRef[] = [];
    for (let i = 0; i < 10; i++) {
      ctx.classifiedScanIds!.add(`scan-${i}`);
      photos.push(
        photo({
          id: `s${i}`,
          source: "scan",
          sourceDocId: `scan-${i}`,
          capturedAt: `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
        }),
      );
    }
    ctx.allArtifactIds = new Set(["art-a", "art-b"]);
    photos.push(photo({ id: "a1", sourceDocId: "art-a" }));
    photos.push(photo({ id: "a2", sourceDocId: "art-b" }));

    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });

    const placedIds = [
      ...placement.cover.kid,
      ...placement.cover.parent,
      ...placement.whatYouLoved.kid,
      ...placement.whatYouLoved.parent,
      ...placement.workedThrough.kid,
      ...placement.workedThrough.parent,
      ...placement.moreFromMonth.kid,
    ].map((p) => p.id);

    // Not one of the ten curriculum pages made the book.
    for (let i = 0; i < 10; i++) {
      expect(placedIds).not.toContain(`s${i}`);
    }
    expect(placedIds).toContain("a1");
    expect(placedIds).toContain("a2");
  });

  it("a classified scan is a curriculum image (the pre-FEAT-141 exemption is gone)", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-class"]);
    const scored = scorePhotos(
      [photo({ id: "sc", source: "scan", sourceDocId: "scan-class" })],
      ctx,
    );
    expect(scored[0].isWorkbookScan).toBe(true);
  });

  it("allows ONE big-step curriculum image on the parent evidence page", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-big", "scan-plain"]);
    ctx.dayLogEngagement["2026-07-10"] = { "scan-big": "engaged" };
    const photos: PhotoRef[] = [
      photo({
        id: "big",
        source: "scan",
        sourceDocId: "scan-big",
        capturedAt: "2026-07-10T12:00:00Z",
      }),
      photo({
        id: "plain",
        source: "scan",
        sourceDocId: "scan-plain",
        capturedAt: "2026-07-11T12:00:00Z",
      }),
    ];
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });

    expect(placement.workedThrough.parent.map((p) => p.id)).toEqual(["big"]);
    // The kid's book stays curriculum-free even for the big-step page.
    expect(placement.workedThrough.kid).toEqual([]);
    expect(placement.whatYouLoved.kid).toEqual([]);
    expect(placement.cover.kid).toEqual([]);
  });

  it("never places more than MAX_CURRICULUM_PHOTOS_IN_BOOK of them", () => {
    const ctx = emptyContext();
    const photos: PhotoRef[] = [];
    ctx.dayLogEngagement["2026-07-10"] = {};
    for (let i = 0; i < 5; i++) {
      ctx.classifiedScanIds!.add(`scan-${i}`);
      ctx.dayLogEngagement["2026-07-10"][`scan-${i}`] = "engaged";
      photos.push(
        photo({
          id: `big${i}`,
          source: "scan",
          sourceDocId: `scan-${i}`,
          capturedAt: "2026-07-10T12:00:00Z",
        }),
      );
    }
    const scored = scorePhotos(photos, ctx);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.workedThrough.parent.length).toBe(
      MAX_CURRICULUM_PHOTOS_IN_BOOK,
    );
  });

  it("resolved-blocker evidence qualifies a Worksheet artifact as a big step", () => {
    const ctx = emptyContext();
    ctx.workbookArtifactIds = new Set(["wb-doc"]);
    ctx.resolvedBlockerEvidenceIds.add("wb");
    const scored = scorePhotos(
      [photo({ id: "wb", sourceDocId: "wb-doc" })],
      ctx,
    );
    expect(isBigStepCurriculumPhoto(scored[0], ctx)).toBe(true);
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.workedThrough.parent.map((p) => p.id)).toEqual(["wb"]);
  });

  it("classification alone is not a big step — the parent's 😊 is required", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-x"]);
    const scored = scorePhotos(
      [photo({ id: "sc", source: "scan", sourceDocId: "scan-x" })],
      ctx,
    );
    expect(isBigStepCurriculumPhoto(scored[0], ctx)).toBe(false);

    // …and engagement alone, on an unclassified scan, is not one either.
    const ctx2 = emptyContext();
    ctx2.dayLogEngagement["2026-04-10"] = { "scan-y": "engaged" };
    const scored2 = scorePhotos(
      [photo({ id: "sc2", source: "scan", sourceDocId: "scan-y" })],
      ctx2,
    );
    expect(isBigStepCurriculumPhoto(scored2[0], ctx2)).toBe(false);
  });

  it("a struggled-through page is not a big step", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-x"]);
    ctx.dayLogEngagement["2026-04-10"] = { "scan-x": "struggled" };
    const scored = scorePhotos(
      [photo({ id: "sc", source: "scan", sourceDocId: "scan-x" })],
      ctx,
    );
    expect(isBigStepCurriculumPhoto(scored[0], ctx)).toBe(false);
  });

  it("cover behaviour is unchanged — a big-step page is still never the hero", () => {
    const ctx = emptyContext();
    ctx.classifiedScanIds = new Set(["scan-big"]);
    ctx.dayLogEngagement["2026-07-10"] = { "scan-big": "engaged" };
    const scored = scorePhotos(
      [
        photo({
          id: "big",
          source: "scan",
          sourceDocId: "scan-big",
          capturedAt: "2026-07-10T12:00:00Z",
        }),
      ],
      ctx,
    );
    expect(pickHeroForMode("kid", scored, new Set(), ctx)).toBeUndefined();
    expect(pickHeroForMode("parent", scored, new Set(), ctx)).toBeUndefined();
  });

  it("a month with no photos at all still produces an (empty) placement", () => {
    const placement = assignPhotosToSections([], {
      ...emptyContext(),
      hasBookCompletions: false,
      hasDadLab: false,
    });
    expect(placement.cover.parent).toEqual([]);
    expect(placement.whatYouLoved.parent).toEqual([]);
    expect(placement.workedThrough.parent).toEqual([]);
    expect(placement.more).toEqual([]);
  });

  it("carries no content note into a placed ref (parent-side metadata stays out of the book)", () => {
    const ctx = emptyContext();
    ctx.allArtifactIds = new Set(["art-a"]);
    const scored = scorePhotos(
      [photo({ id: "a1", sourceDocId: "art-a", contentNote: "Lego castle" })],
      ctx,
    );
    const placement = assignPhotosToSections(scored, {
      ...ctx,
      hasBookCompletions: false,
      hasDadLab: false,
    });
    const placed = [...placement.cover.parent, ...placement.whatYouLoved.parent];
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) {
      expect(p.contentNote).toBeUndefined();
    }
  });
});
