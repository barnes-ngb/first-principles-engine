import { describe, expect, it } from "vitest";

import { buildWorkbookBackfillPatch } from "./workbookActivityConfigBackfill.js";

describe("buildWorkbookBackfillPatch", () => {
  it("creates workbook activity fields from legacy workbook data", () => {
    const now = "2026-04-07T00:00:00.000Z";
    const patch = buildWorkbookBackfillPatch(null, {
      childId: "lincoln",
      name: "GATB Reading Level 1",
      subjectBucket: "Reading",
      totalUnits: 120,
      currentPosition: 42,
      unitLabel: "lesson",
      curriculum: {
        provider: "gatb",
        completed: false,
        masteredSkills: ["phonics.cvc.short-a"],
      },
    }, now);

    expect(patch.type).toBe("workbook");
    expect(patch.currentPosition).toBe(42);
    expect(patch.totalUnits).toBe(120);
    expect(patch.unitLabel).toBe("lesson");
    expect(patch.curriculumMeta?.provider).toBe("gatb");
    expect(patch.curriculumMeta?.masteredSkills).toEqual(["phonics.cvc.short-a"]);
    expect(patch.completed).toBe(false);
  });

  it("merges existing activity + legacy curriculum completion idempotently", () => {
    const now = "2026-04-07T00:00:00.000Z";
    const patch = buildWorkbookBackfillPatch({
      name: "Good and the Beautiful Reading",
      type: "workbook",
      childId: "lincoln",
      subjectBucket: "Reading",
      defaultMinutes: 20,
      frequency: "daily",
      sortOrder: 11,
      curriculum: "GATB Reading",
      totalUnits: 60,
      currentPosition: 20,
      unitLabel: "lesson",
      curriculumMeta: {
        provider: "gatb",
        masteredSkills: ["phonics.cvc.short-a"],
      },
      completed: false,
      scannable: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }, {
      childId: "lincoln",
      name: "Good and the Beautiful Reading",
      subjectBucket: "Reading",
      totalUnits: 80,
      currentPosition: 45,
      curriculum: {
        provider: "gatb",
        completed: true,
        masteredSkills: ["phonics.long-vowels", "phonics.cvc.short-a"],
      },
      completed: true,
    }, now);

    expect(patch.currentPosition).toBe(45);
    expect(patch.totalUnits).toBe(80);
    expect(patch.completed).toBe(true);
    expect(patch.curriculumMeta?.completed).toBe(true);
    expect(patch.curriculumMeta?.masteredSkills).toEqual([
      "phonics.cvc.short-a",
      "phonics.long-vowels",
    ]);
  });
});
