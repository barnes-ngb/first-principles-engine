import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  DIAGNOSTIC_WINDOW_RADIUS,
  MALFORMED_MESSAGE,
  STRICT_JSON_RETRY_REMINDER,
  TRUNCATED_MESSAGE,
  buildNoteIndex,
  buildParseFailureDiagnostics,
  collectWorkbookArtifactIds,
  composeMonthlyReview,
  formatPhotoSection,
  generateBookJsonWithRetry,
  parsePositionFromError,
  rawTextWindow,
  type ComposeInput,
} from "./monthlyReview.js";
import type { MonthAggregate, PhotoRef } from "./monthlyReviewData.js";
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
    artifactPlanItems: {},
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

// ── FEAT-141: content notes ground the generator ────────────────────────────
//
// The notes are prompt input only. They never enter the composed book document
// (see `strip()` in monthlyReviewCuration.ts) — the book is read by the kid.
describe("FEAT-141 — content notes in the generator prompt", () => {
  function photo(over: Partial<PhotoRef>): PhotoRef {
    return {
      id: "artifact:a1",
      storagePath: "x",
      source: "artifact",
      sourceDocId: "a1",
      capturedAt: "2026-07-10T12:00:00Z",
      ...over,
    };
  }

  function placementWith(loved: PhotoRef[]): SectionPlacement {
    return {
      cover: { kid: [], parent: [] },
      whatYouLoved: { kid: loved, parent: loved },
      workedThrough: { kid: [], parent: [] },
      moreFromMonth: { kid: [], parent: [] },
      more: [],
    };
  }

  it("indexes only the photos that carry a note", () => {
    const index = buildNoteIndex([
      photo({ id: "a", contentNote: "Lego castle" }),
      photo({ id: "b" }),
    ]);
    expect(index).toEqual({ a: "Lego castle" });
  });

  it("appends the note to that photo's prompt line", () => {
    const p = photo({ id: "artifact:a1", subjectTag: "Art" });
    const text = formatPhotoSection(undefined, placementWith([p]), {
      "artifact:a1": "Lego castle with a working drawbridge",
    });
    expect(text).toContain('shows="Lego castle with a working drawbridge"');
  });

  it("appends the hero's note too", () => {
    const hero = photo({ id: "artifact:hero" });
    const text = formatPhotoSection(hero, placementWith([]), {
      "artifact:hero": "Finished chapter book, held up",
    });
    expect(text).toContain('Hero (cover): photoId="artifact:hero", shows="Finished chapter book, held up"');
  });

  it("leaves the prompt byte-identical when no photo has a note (characterization)", () => {
    const p = photo({ id: "artifact:a1", subjectTag: "Art" });
    const withEmptyIndex = formatPhotoSection(undefined, placementWith([p]), {});
    const withNoIndexArg = formatPhotoSection(undefined, placementWith([p]));
    expect(withEmptyIndex).toBe(withNoIndexArg);
    expect(withEmptyIndex).toContain(
      '  - photoId="artifact:a1", subject=Art, captured=2026-07-10',
    );
    expect(withEmptyIndex).not.toContain("shows=");
  });

  it("neutralizes a double quote in a note so the prompt line stays parseable", () => {
    const p = photo({ id: "artifact:a1" });
    const text = formatPhotoSection(undefined, placementWith([p]), {
      'artifact:a1': 'page titled "Elapsed Time"',
    });
    expect(text).toContain("shows=\"page titled 'Elapsed Time'\"");
  });
});

// ── FEAT-141 Codex round (PR #1666): the workbook page's artifact twin ──────
//
// The workbook capture path writes the SAME page as a scan and as a plain
// `Photo` artifact. Excluding only the scan left the twin free to be printed —
// including as the cover hero — so the policy leaked exactly the photo it
// exists to keep out.
describe("collectWorkbookArtifactIds — FEAT-141 (Codex P1)", () => {
  function dayLog(over: Partial<MonthAggregate["dayLogs"][number]>) {
    return {
      date: "2026-07-10",
      totalItems: 1,
      completedItems: 1,
      itemEngagement: {},
      engagementCounts: {},
      minutesBySubject: {},
      evidenceCount: 0,
      evidenceArtifactIds: [],
      workbookEvidenceIds: [],
      workbookItemLabels: [],
      hasTeachBack: false,
      ...over,
    };
  }

  it("keeps the Worksheet-type artifacts it already knew about", () => {
    const data = emptyAggregate();
    data.workbookArtifactIds = new Set(["wb-typed"]);
    expect(collectWorkbookArtifactIds(data).has("wb-typed")).toBe(true);
  });

  it("adds the artifact twin of a workbook-linked checklist item", () => {
    const data = emptyAggregate();
    data.dayLogs = [dayLog({ workbookEvidenceIds: ["art-workbook"] })];
    expect(collectWorkbookArtifactIds(data).has("art-workbook")).toBe(true);
  });

  it("adds a batch page that carries only the workbook item's planItem tag", () => {
    const data = emptyAggregate();
    data.dayLogs = [dayLog({ workbookItemLabels: ["GATB Math (30m)"] })];
    data.artifactPlanItems = {
      "art-extra": "GATB Math (30m)",
      "art-creative": "Build something",
    };
    const ids = collectWorkbookArtifactIds(data);
    expect(ids.has("art-extra")).toBe(true);
    // A photo taken against a non-workbook activity is untouched.
    expect(ids.has("art-creative")).toBe(false);
  });

  it("returns only what it was given when no day log names a workbook", () => {
    const data = emptyAggregate();
    data.artifactPlanItems = { "art-1": "Build something" };
    expect(collectWorkbookArtifactIds(data).size).toBe(0);
  });

  it("tolerates day logs written before these fields existed", () => {
    const data = emptyAggregate();
    // Pre-FEAT-141 shape: neither array present.
    data.dayLogs = [
      dayLog({}) as MonthAggregate["dayLogs"][number],
    ].map((d) => {
      const { workbookEvidenceIds, workbookItemLabels, ...rest } = d;
      void workbookEvidenceIds;
      void workbookItemLabels;
      return rest as MonthAggregate["dayLogs"][number];
    });
    expect(() => collectWorkbookArtifactIds(data)).not.toThrow();
    expect(collectWorkbookArtifactIds(data).size).toBe(0);
  });
});

// ── FEAT-144: parse diagnostics + one automatic retry ─────────

describe("book JSON parse diagnostics", () => {
  const goodBook = JSON.stringify({
    theme: "Stories You Built",
    sections: { cover: { kidMode: { headline: "Stories You Built" } } },
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the failure position out of a JSON.parse error", () => {
    let err: unknown;
    try {
      JSON.parse('{"a": "unterminated');
    } catch (e) {
      err = e;
    }
    expect(parsePositionFromError(err)).toBeGreaterThan(0);
    expect(parsePositionFromError(new Error("no offset here"))).toBeUndefined();
  });

  it("bounds the raw window and centers it on the failure position", () => {
    const text = "x".repeat(3000);
    const { window, from, to } = rawTextWindow(text, 2965);
    expect(window.length).toBeLessThanOrEqual(DIAGNOSTIC_WINDOW_RADIUS * 2 + 1);
    expect(from).toBe(2965 - DIAGNOSTIC_WINDOW_RADIUS);
    // The failing position itself is inside the window, not just near it.
    expect(from).toBeLessThanOrEqual(2965);
    expect(to).toBeGreaterThan(2965);
  });

  it("falls back to a bounded tail when the error carries no position", () => {
    const text = "y".repeat(3000);
    const { window, to } = rawTextWindow(text, undefined);
    expect(window.length).toBe(DIAGNOSTIC_WINDOW_RADIUS * 2);
    expect(to).toBe(3000);
  });

  it("logs a bounded, labeled window — never the whole payload", () => {
    const text = "z".repeat(5000);
    const diagnostics = buildParseFailureDiagnostics({
      stopReason: "end_turn",
      text,
      err: new SyntaxError("Unterminated string in JSON at position 2965"),
      attempt: 1,
    });
    expect(diagnostics.window.length).toBeLessThanOrEqual(
      DIAGNOSTIC_WINDOW_RADIUS * 2 + 1,
    );
    expect(diagnostics.logLine).toContain("stop_reason=end_turn");
    expect(diagnostics.logLine).toContain("responseLength=5000");
    expect(diagnostics.logLine).toContain("failurePosition=2965");
    expect(diagnostics.logLine).toContain("rawWindow[2765..3166]");
    // The whole 5000-char payload must not be in the log line.
    expect(diagnostics.logLine.length).toBeLessThan(text.length);
  });

  it("names the two roots apart", () => {
    const malformed = buildParseFailureDiagnostics({
      stopReason: "end_turn",
      text: "{",
      err: new SyntaxError("bad"),
      attempt: 1,
    });
    expect(malformed.truncated).toBe(false);
    expect(malformed.userMessage).toBe(MALFORMED_MESSAGE);
    expect(malformed.userMessage).toContain("malformed");

    const cut = buildParseFailureDiagnostics({
      stopReason: "max_tokens",
      text: "{",
      err: new SyntaxError("bad"),
      attempt: 1,
    });
    expect(cut.truncated).toBe(true);
    expect(cut.userMessage).toBe(TRUNCATED_MESSAGE);
    expect(cut.userMessage).toContain("cut off");
  });

  it("never puts raw model text in the parent-facing message", () => {
    const diagnostics = buildParseFailureDiagnostics({
      stopReason: "end_turn",
      text: '{"body": "Lincoln read Papa Hut on April 8"',
      err: new SyntaxError("Unterminated string in JSON at position 42"),
      attempt: 1,
    });
    expect(diagnostics.userMessage).not.toContain("Lincoln");
    expect(diagnostics.userMessage).not.toContain("Papa Hut");
  });
});

describe("generateBookJsonWithRetry", () => {
  const goodBook = JSON.stringify({
    theme: "Stories You Built",
    sections: { cover: { kidMode: { headline: "Stories You Built" } } },
  });
  const brokenBook = '{"theme": "Stories", "sections": {"cover": ';

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retry a clean first response", async () => {
    const call = vi.fn().mockResolvedValue({
      text: goodBook,
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });

    const result = await generateBookJsonWithRetry(call, "USER PROMPT");

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("USER PROMPT");
    expect(result.retried).toBe(false);
    expect(result.parsed.theme).toBe("Stories You Built");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("retries once on a parse failure and appends the strictness reminder", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        text: brokenBook,
        inputTokens: 100,
        outputTokens: 50,
        stopReason: "end_turn",
      })
      .mockResolvedValueOnce({
        text: goodBook,
        inputTokens: 110,
        outputTokens: 60,
        stopReason: "end_turn",
      });

    const result = await generateBookJsonWithRetry(call, "USER PROMPT");

    expect(call).toHaveBeenCalledTimes(1 + 1);
    expect(call.mock.calls[1][0]).toBe(
      `USER PROMPT\n\n${STRICT_JSON_RETRY_REMINDER}`,
    );
    expect(result.retried).toBe(true);
    expect(result.parsed.theme).toBe("Stories You Built");
    // Usage is summed across both attempts, so cost logging stays honest.
    expect(result.inputTokens).toBe(210);
    expect(result.outputTokens).toBe(110);
  });

  it("retries a max_tokens cut even when nothing threw", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        text: goodBook,
        inputTokens: 100,
        outputTokens: 6000,
        stopReason: "max_tokens",
      })
      .mockResolvedValueOnce({
        text: goodBook,
        inputTokens: 110,
        outputTokens: 60,
        stopReason: "end_turn",
      });

    const result = await generateBookJsonWithRetry(call, "USER PROMPT");
    expect(call).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
  });

  it("throws the cut-off message after a second max_tokens failure", async () => {
    const call = vi.fn().mockResolvedValue({
      text: '{"theme": "Stories", "body": "he read the whole',
      inputTokens: 100,
      outputTokens: 6000,
      stopReason: "max_tokens",
    });

    await expect(generateBookJsonWithRetry(call, "USER PROMPT")).rejects.toThrow(
      TRUNCATED_MESSAGE,
    );
    // Two attempts is the whole budget — no third.
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("throws the malformed message after two malformed responses, with diagnostics logged", async () => {
    const call = vi.fn().mockResolvedValue({
      text: brokenBook,
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });

    await expect(generateBookJsonWithRetry(call, "USER PROMPT")).rejects.toThrow(
      MALFORMED_MESSAGE,
    );
    expect(call).toHaveBeenCalledTimes(2);

    const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    expect(logged).toHaveLength(2);
    expect(logged[0]).toContain("attempt 1");
    expect(logged[1]).toContain("attempt 2");
    for (const line of logged) {
      expect(line).toContain("rawWindow[");
      expect(line).toContain("stop_reason=end_turn");
    }
  });

  it("keeps the first attempt's book when the retry comes back unreadable", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        text: goodBook,
        inputTokens: 100,
        outputTokens: 6000,
        stopReason: "max_tokens",
      })
      .mockResolvedValueOnce({
        text: brokenBook,
        inputTokens: 110,
        outputTokens: 60,
        stopReason: "end_turn",
      });

    const result = await generateBookJsonWithRetry(call, "USER PROMPT");
    expect(call).toHaveBeenCalledTimes(2);
    expect(result.parsed.theme).toBe("Stories You Built");
    expect(result.retried).toBe(true);
  });

  it("parses a first response whose only flaw is an interior quote — no retry", async () => {
    // The exact production failure class, end to end through the sanitizer.
    const call = vi.fn().mockResolvedValue({
      text: `{
  "theme": "The "Big" Month",
  "sections": {
    "whatYouLoved": {
      "kidMode": { "body": "You read a lot
and you built a lot" }
    }
  }
}`,
      inputTokens: 100,
      outputTokens: 50,
      stopReason: "end_turn",
    });

    const result = await generateBookJsonWithRetry(call, "USER PROMPT");
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.parsed.theme).toBe('The "Big" Month');
    expect(result.parsed.sections.whatYouLoved.kidMode?.body).toBe(
      "You read a lot\nand you built a lot",
    );
  });
});
