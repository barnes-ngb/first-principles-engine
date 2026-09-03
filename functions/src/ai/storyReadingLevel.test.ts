import { describe, expect, it } from "vitest";
import {
  COMPREHENSION_LEVEL_CAP,
  PHONICS_LEVEL_BANDS,
  PHONICS_LEVEL_CAP,
  readingLevelFromAge,
  resolveStoryReadingLevel,
} from "./storyReadingLevel.js";

const lincolnPhonics = {
  level: 5,
  updatedAt: "2026-08-12T15:00:00.000Z",
  source: "quest",
  evidence: "Session ended at Level 5 with 7/9 correct",
};

describe("resolveStoryReadingLevel (FEAT-173 — read the child's real level, guess only as fallback)", () => {
  it("reads the assessed phonics working level and names its band, source and date", () => {
    const r = resolveStoryReadingLevel({ phonics: lincolnPhonics }, 10);
    expect(r.source).toBe("assessed");
    expect(r.text).toContain("decoding at phonics Level 5 of 8");
    expect(r.text).toContain(PHONICS_LEVEL_BANDS[5]);
    expect(r.text).toContain("silent-e");
    expect(r.text).toContain("assessed by quest, Aug 12, 2026");
    // The age guess is NOT in play for an assessed child.
    expect(r.text).not.toContain("1st grade");
  });

  it("is the age-derived string — the pre-FEAT-173 guess — ONLY when no assessed level exists", () => {
    expect(resolveStoryReadingLevel(undefined, 10)).toEqual({ text: "1st grade", source: "age", phonics: null });
    expect(resolveStoryReadingLevel({}, 6)).toEqual({ text: "pre-K to kindergarten", source: "age", phonics: null });
    // Other modes (math, writing, sentence) are not reading levels.
    expect(
      resolveStoryReadingLevel({ math: { level: 4, source: "quest", updatedAt: "2026-08-01" } }, 10),
    ).toEqual({ text: "1st grade", source: "age", phonics: null });
    expect(readingLevelFromAge(7)).toBe("pre-K to kindergarten");
    expect(readingLevelFromAge(8)).toBe("1st grade");
  });

  it("adds comprehension alongside decoding when both are assessed", () => {
    const r = resolveStoryReadingLevel(
      {
        phonics: lincolnPhonics,
        comprehension: { level: 3, source: "evaluation", updatedAt: "2026-08-20T00:00:00.000Z" },
      },
      10,
    );
    expect(r.source).toBe("assessed");
    expect(r.text).toContain("phonics Level 5 of 8");
    expect(r.text).toContain("comprehension Level 3 of 6 (assessed by evaluation, Aug 20, 2026)");
  });

  it("says plainly that decoding is unassessed when only comprehension exists", () => {
    const r = resolveStoryReadingLevel(
      { comprehension: { level: 2, source: "quest", updatedAt: "2026-08-20T00:00:00.000Z" } },
      10,
    );
    expect(r.source).toBe("assessed");
    expect(r.text).toContain("decoding level not yet assessed");
    expect(r.text).toContain("WORD MASTERY");
    expect(r.text).toContain("comprehension Level 2 of 6");
  });

  it("never invents a level from a broken entry — a non-numeric, NaN or zero level falls back to age", () => {
    expect(resolveStoryReadingLevel({ phonics: { level: Number.NaN } }, 10).source).toBe("age");
    expect(resolveStoryReadingLevel({ phonics: { level: 0 } }, 10).source).toBe("age");
    expect(
      resolveStoryReadingLevel({ phonics: { level: "5" as unknown as number } }, 10).source,
    ).toBe("age");
  });

  it("clamps an out-of-range level to the mode's cap and rounds a fractional one, never throwing", () => {
    expect(resolveStoryReadingLevel({ phonics: { level: 12 } }, 10).text).toContain(
      `phonics Level ${PHONICS_LEVEL_CAP} of ${PHONICS_LEVEL_CAP}`,
    );
    expect(resolveStoryReadingLevel({ comprehension: { level: 9 } }, 10).text).toContain(
      `comprehension Level ${COMPREHENSION_LEVEL_CAP} of ${COMPREHENSION_LEVEL_CAP}`,
    );
    expect(resolveStoryReadingLevel({ phonics: { level: 2.4 } }, 10).text).toContain("Level 2 of 8");
  });

  it("copes with a missing source / date (a manual entry with no stamp) and a bad date", () => {
    const bare = resolveStoryReadingLevel({ phonics: { level: 3 } }, 10);
    expect(bare.text).toBe(`decoding at phonics Level 3 of 8 — ${PHONICS_LEVEL_BANDS[3]}`);
    const badDate = resolveStoryReadingLevel(
      { phonics: { level: 3, source: "manual", updatedAt: "not a date" } },
      10,
    );
    expect(badDate.text).toContain("(assessed by manual)");
  });

  it("has a band for every rung of the 1–8 phonics ladder", () => {
    for (let level = 1; level <= PHONICS_LEVEL_CAP; level++) {
      expect(PHONICS_LEVEL_BANDS[level], `level ${level}`).toBeTruthy();
    }
  });
});
