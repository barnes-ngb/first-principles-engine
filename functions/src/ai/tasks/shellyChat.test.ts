import { describe, expect, it } from "vitest";
import {
  extractImageUrls,
  buildActivityMinutesActionAddendum,
  buildWatchActionAddendum,
  formatWatchLibrary,
  plannableWatchDays,
  buildAllChildrenLearnerModels,
  buildDraftNextWeekAddendum,
  formatWeekSpan,
  nextWeekDays,
  buildCurriculumActionAddendum,
  buildDayItemActionAddendum,
  chatChecklistItemKey,
  civilDateInZone,
  currentWeekDays,
  DEFAULT_FAMILY_TIME_ZONE,
  formatChatWeekDays,
  buildFrictionCaptureAddendum,
  buildPlanAdjustmentActionAddendum,
  buildShellyChatRoleSection,
  buildSightWordActionAddendum,
  buildSnapshotActionAddendum,
  buildWebSearchAddendum,
  formatChatActivities,
  formatConundrumTitle,
  formatDispositionProfile,
  formatRecentTeachBacks,
  formatRecentWeeklyReviews,
} from "./shellyChat.js";
import type {
  ChatActivityRow,
  WatchLibraryRow,
  DispositionCacheDoc,
  DispositionOverridesDoc,
  TeachBackArtifactInput,
  WeeklyReviewRow,
} from "./shellyChat.js";

// ── Test fixtures (Lincoln-shaped, deliberately realistic) ────────

function lincolnDispositionCache(): DispositionCacheDoc {
  return {
    generatedAt: "2026-05-20T18:00:00.000Z",
    result: {
      profileDate: "2026-05-20",
      dispositions: {
        curiosity: {
          level: "growing",
          trend: "up",
          narrative: "Asks more follow-up questions during Narnia read-alouds, especially about Edmund.",
        },
        persistence: {
          level: "steady",
          trend: "stable",
          narrative: "Sticks with multisyllable phonics for the full 20 minutes most days.",
        },
        articulation: {
          level: "emerging",
          trend: "up",
          narrative: "Teach-backs are getting longer and more structured — three-step explanations are common.",
        },
        selfAwareness: {
          level: "emerging",
          trend: "stable",
          narrative: "Names which parts felt hard when prompted, not yet unprompted.",
        },
        ownership: {
          level: "growing",
          trend: "up",
          narrative: "Chooses booster cards over reading workbook when given the choice — picks the harder option.",
        },
      },
      celebration: "Three teach-backs this week that he initiated himself.",
      nudge: "Try a one-question conundrum at the dinner table mid-week.",
    },
  };
}

function lincolnWeeklyReviews(): WeeklyReviewRow[] {
  return [
    {
      weekKey: "2026-05-18",
      status: "draft",
      summary: "Big week for fluency — Lincoln moved through three pages of the GATB reader at pace and the audio teach-backs got noticeably more confident.",
      celebration: "Three confident audio teach-backs in a row.",
      growthAreas: ["multisyllable phonics", "comprehension follow-up Qs", "handwriting endurance"],
      createdAt: "2026-05-18T19:00:00.000Z",
    },
    {
      weekKey: "2026-05-11",
      status: "draft",
      summary: "Mixed week. Strong math (place value clicking) but reading endurance dropped on Thursday/Friday.",
      celebration: "Place value clicking.",
      growthAreas: ["reading endurance"],
      createdAt: "2026-05-11T19:00:00.000Z",
    },
    {
      weekKey: "2026-05-04",
      status: "draft",
      summary: "Recovery week after the lab field trip. Fewer items completed but high engagement on the ones that were.",
      createdAt: "2026-05-04T19:00:00.000Z",
    },
    {
      weekKey: "2026-04-27",
      status: "draft",
      summary: "First week using the new sight-word pool. Engagement was high, mastery still emerging.",
      createdAt: "2026-04-27T19:00:00.000Z",
    },
    {
      weekKey: "2026-04-20",
      status: "draft",
      summary: "Steady. Most-likely-skipped item this week: handwriting on Friday.",
      createdAt: "2026-04-20T19:00:00.000Z",
    },
  ];
}

function lincolnTeachBackArtifacts(): TeachBackArtifactInput[] {
  return [
    {
      title: "Teach-back: syllables",
      type: "Audio",
      content: "I told London that big words have parts called syllables and you clap them out.",
      mediaUrl: "https://storage.example.com/audio/tb-001.m4a",
      createdAt: "2026-05-22T14:00:00.000Z",
      tags: { subjectBucket: "Reading", engineStage: "Explain" },
    },
    {
      title: "Teach-back: counting by 5s",
      type: "Audio",
      content: "5, 10, 15, 20 — you just add five each time.",
      mediaUrl: "https://storage.example.com/audio/tb-002.m4a",
      createdAt: "2026-05-21T15:00:00.000Z",
      tags: { subjectBucket: "Math", engineStage: "Explain" },
    },
    {
      title: "Teach-back: plot of Narnia chapter 6",
      type: "Text",
      content: "Edmund eats Turkish Delight and the witch tricks him.",
      notes: "Wrote his own — no help.",
      createdAt: "2026-05-20T18:00:00.000Z",
      tags: { subjectBucket: "LanguageArts", engineStage: "Explain" },
    },
    {
      title: "Teach-back: place value",
      type: "Audio",
      content: "The 3 in 30 is worth thirty because it's in the tens place.",
      mediaUrl: "https://storage.example.com/audio/tb-003.m4a",
      createdAt: "2026-05-19T16:00:00.000Z",
      tags: { subjectBucket: "Math", engineStage: "Explain" },
    },
  ];
}

// ── 1. Disposition populates from dispositionCache with overrides applied ──

describe("formatDispositionProfile", () => {
  it("populates from dispositionCache with override text winning over AI narrative", () => {
    const cache = lincolnDispositionCache();
    const overrides: DispositionOverridesDoc = {
      persistence: {
        text: "Shelly's edit: actually he's been bailing on the second 10-minute block lately.",
      },
    };

    const out = formatDispositionProfile("Lincoln", cache, overrides);

    // Header present, dated.
    expect(out).toContain("DISPOSITION PROFILE for Lincoln (generated ");
    // All five dimensions in fixed order.
    const curiosityIdx = out.indexOf("Curiosity:");
    const persistenceIdx = out.indexOf("Persistence:");
    const articulationIdx = out.indexOf("Articulation:");
    const selfAwarenessIdx = out.indexOf("Self-Awareness:");
    const ownershipIdx = out.indexOf("Ownership:");
    expect(curiosityIdx).toBeGreaterThan(0);
    expect(persistenceIdx).toBeGreaterThan(curiosityIdx);
    expect(articulationIdx).toBeGreaterThan(persistenceIdx);
    expect(selfAwarenessIdx).toBeGreaterThan(articulationIdx);
    expect(ownershipIdx).toBeGreaterThan(selfAwarenessIdx);

    // Override text wins for persistence.
    expect(out).toContain("Shelly's edit: actually he's been bailing");
    expect(out).not.toContain("Sticks with multisyllable phonics");

    // AI text wins for non-overridden dimensions.
    expect(out).toContain("Asks more follow-up questions during Narnia");
    expect(out).toContain("Teach-backs are getting longer");
    expect(out).toContain("Names which parts felt hard when prompted");
    expect(out).toContain("Chooses booster cards over reading workbook");

    // Level and trend included.
    expect(out).toContain("growing, trend up");
    expect(out).toContain("emerging, trend stable");

    // Celebration + nudge included.
    expect(out).toContain("Celebration: Three teach-backs");
    expect(out).toContain("Nudge: Try a one-question conundrum");
  });

  // ── 2. Disposition omits cleanly when cache absent ──
  it("returns empty string when dispositionCache is absent (omit, don't explain absence)", () => {
    const out = formatDispositionProfile("Lincoln", undefined, {});
    expect(out).toBe("");
  });

  it("returns empty string when dispositionCache.result.dispositions is empty", () => {
    const out = formatDispositionProfile(
      "Lincoln",
      { generatedAt: "2026-05-20T18:00:00.000Z", result: { dispositions: {} } },
      {},
    );
    expect(out).toBe("");
  });

  it("omits the block when every disposition has empty narrative and no override", () => {
    const out = formatDispositionProfile(
      "Lincoln",
      {
        generatedAt: "2026-05-20T18:00:00.000Z",
        result: {
          dispositions: {
            curiosity: { level: "growing", trend: "up", narrative: "" },
            persistence: { level: "steady", trend: "stable", narrative: "" },
          },
        },
      },
      {},
    );
    expect(out).toBe("");
  });
});

// ── 3. Weekly-review strip surfaces ≤5 rows, skips no-data, extras on most-recent only ──

describe("formatRecentWeeklyReviews", () => {
  it("surfaces 5 rows in most-recent-first order, attaches celebration + top-2 growth areas to most-recent only", () => {
    const out = formatRecentWeeklyReviews("Lincoln", lincolnWeeklyReviews());

    // Header.
    expect(out).toContain("RECENT WEEKLY REVIEWS for Lincoln (most recent first):");

    // 5 row markers (each row starts with "- " under the header).
    const rowMatches = out.match(/^- /gm) || [];
    expect(rowMatches.length).toBe(5);

    // Most-recent week is first, oldest is last.
    const recentIdx = out.indexOf("2026-05-18");
    const oldestIdx = out.indexOf("2026-04-20");
    expect(recentIdx).toBeGreaterThan(0);
    expect(oldestIdx).toBeGreaterThan(recentIdx);

    // Most-recent row carries celebration + top 2 growth areas (bracketed).
    expect(out).toContain("celebration: Three confident audio teach-backs in a row.");
    expect(out).toContain("growth areas: multisyllable phonics; comprehension follow-up Qs");
    // The third growth area on the most-recent row is dropped (cap at 2).
    expect(out).not.toContain("handwriting endurance");

    // Older rows do NOT carry extras even though they have them.
    expect(out).not.toContain("celebration: Place value clicking");
    expect(out).not.toContain("growth areas: reading endurance");
  });

  it("filters out status='no-data' rows", () => {
    const rows: WeeklyReviewRow[] = [
      {
        weekKey: "2026-05-18",
        status: "no-data",
        summary: "Should NOT appear because status is no-data.",
        createdAt: "2026-05-18T19:00:00.000Z",
      },
      {
        weekKey: "2026-05-11",
        status: "draft",
        summary: "Should appear.",
        createdAt: "2026-05-11T19:00:00.000Z",
      },
    ];
    const out = formatRecentWeeklyReviews("Lincoln", rows);
    expect(out).toContain("Should appear");
    expect(out).not.toContain("Should NOT appear");
    expect((out.match(/^- /gm) || []).length).toBe(1);
  });

  it("truncates summaries longer than 140 chars and appends an ellipsis", () => {
    const longSummary = "a".repeat(200);
    const out = formatRecentWeeklyReviews("Lincoln", [
      { weekKey: "2026-05-18", status: "draft", summary: longSummary, createdAt: "2026-05-18T19:00:00.000Z" },
    ]);
    // 140 'a's followed by an ellipsis (single char), not 200 'a's.
    expect(out).toContain("a".repeat(140) + "…");
    expect(out).not.toContain("a".repeat(141));
  });

  // ── 4. Weekly-review strip omits cleanly ──
  it("returns empty string when no reviews are provided", () => {
    expect(formatRecentWeeklyReviews("Lincoln", [])).toBe("");
  });

  it("returns empty string when every row is filtered out (all no-data or no summary)", () => {
    const out = formatRecentWeeklyReviews("Lincoln", [
      { weekKey: "2026-05-18", status: "no-data", summary: "x", createdAt: "2026-05-18T19:00:00.000Z" },
      { weekKey: "2026-05-11", status: "draft", summary: undefined, createdAt: "2026-05-11T19:00:00.000Z" },
    ]);
    expect(out).toBe("");
  });
});

// ── Conundrum title fix (third dead-read) — round-trip on the new helper ──

describe("formatConundrumTitle", () => {
  it("formats from the nested conundrum.title field", () => {
    expect(formatConundrumTitle({ conundrum: { title: "Should we share the last cookie?" } }))
      .toBe("\n\nCONUNDRUM THIS WEEK: Should we share the last cookie?");
  });
  it("returns empty string when conundrum or title is absent", () => {
    expect(formatConundrumTitle(undefined)).toBe("");
    expect(formatConundrumTitle({})).toBe("");
    expect(formatConundrumTitle({ conundrum: {} })).toBe("");
  });
});

// ── 5. Teach-back loader respects title filter + summarizer pass-through ──

describe("formatRecentTeachBacks", () => {
  it("renders count, audio/text breakdown, by-subject, and up to 3 example excerpts", () => {
    const out = formatRecentTeachBacks(lincolnTeachBackArtifacts());

    // Header line — 4 total artifacts (3 audio, 1 text per fixture).
    expect(out).toContain("RECENT TEACH-BACKS (last 14 days): 4 total (audio: 3, text: 1).");

    // By-subject line includes each subject with its count.
    expect(out).toContain("By subject:");
    expect(out).toMatch(/Reading 1/);
    expect(out).toMatch(/Math 2/);
    expect(out).toMatch(/LanguageArts 1/);

    // Examples header + exactly 3 example rows (cap from summarizeTeachBacks).
    expect(out).toContain("Examples:");
    const exampleLines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(exampleLines.length).toBe(3);

    // Each example carries subject, an excerpt in quotes, and (audio|text).
    for (const line of exampleLines) {
      expect(line).toMatch(/^- \S+ — ".+" \((audio|text)\)$/);
    }
  });

  it("filters out artifacts whose title does not start with 'teach-back' (case-insensitive)", () => {
    const mixed: TeachBackArtifactInput[] = [
      {
        title: "Teach-back: syllables",
        type: "Audio",
        content: "real teach-back",
        mediaUrl: "https://x/a.m4a",
        createdAt: "2026-05-22T14:00:00.000Z",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
      {
        title: "Other Explain artifact",
        type: "Text",
        content: "not a teach-back — should be filtered out",
        createdAt: "2026-05-21T14:00:00.000Z",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
    ];
    const out = formatRecentTeachBacks(mixed);
    expect(out).toContain("1 total");
    expect(out).not.toContain("not a teach-back");
  });

  // ── 6. Teach-back block omits cleanly ──
  it("returns empty string when zero artifacts match the title filter", () => {
    expect(formatRecentTeachBacks([])).toBe("");
    expect(
      formatRecentTeachBacks([
        {
          title: "Other Explain artifact",
          type: "Text",
          content: "x",
          createdAt: "2026-05-21T14:00:00.000Z",
          tags: { subjectBucket: "Reading", engineStage: "Explain" },
        },
      ]),
    ).toBe("");
  });
});

// ── 7. PLANNING-PARTNER MODE addendum is child-scoped only ──

describe("buildShellyChatRoleSection", () => {
  it("includes the PLANNING-PARTNER MODE addendum when a child is selected", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("PLANNING-PARTNER MODE:");
    // Names the upstream section headers so the model can ground claims.
    expect(out).toContain("EVALUATION HISTORY BY DOMAIN");
    expect(out).toContain("DISPOSITION PROFILE");
    expect(out).toContain("CURRICULUM MAP / COVERAGE");
    expect(out).toContain("HOURS PROGRESS");
    expect(out).toContain("RECENT WEEKLY REVIEWS");
    expect(out).toContain("RECENT TEACH-BACKS");
    // Names the child throughout (no stray placeholder).
    expect(out).toContain("The Lincoln tab is selected");
    expect(out).toContain("Use them to help the parent see patterns over time");
    // Nathan's preserved framing.
    expect(out).toContain("don't argue with it, build on it");
    expect(out).not.toContain("${childName}");
  });

  it("omits the addendum on the general (no-child) branch", () => {
    const out = buildShellyChatRoleSection(undefined);
    expect(out).not.toContain("PLANNING-PARTNER MODE");
    expect(out).not.toContain("EVALUATION HISTORY BY DOMAIN");
    expect(out).toContain("This is a general conversation");
  });

  it("invites cross-child comparison grounded in PER-CHILD LEARNER MODELS on the general branch (FEAT-60)", () => {
    const out = buildShellyChatRoleSection(undefined);
    expect(out).toContain("Cross-child comparison is welcome here");
    // Points at the section the general handler loads for every child.
    expect(out).toContain("PER-CHILD LEARNER MODELS");
    // Same honesty rails as the child tabs — never guess a missing level.
    expect(out.toLowerCase()).toContain("no data");
    expect(out).toContain("reading & math only");
  });

  it("treats an empty-string childName as the no-child branch", () => {
    const out = buildShellyChatRoleSection("");
    expect(out).not.toContain("PLANNING-PARTNER MODE");
    expect(out).toContain("This is a general conversation");
  });

  it("never assumes a parent's name and addresses the user as 'you' on both branches (FEAT-60)", () => {
    const child = buildShellyChatRoleSection("Lincoln");
    const general = buildShellyChatRoleSection(undefined);
    // No parent name hardcoded (mirrors the FEAT-53 child-agnostic pattern).
    expect(child).not.toContain("Shelly");
    expect(general).not.toContain("Shelly");
    // Addresses the user directly, refers to "the parent" in third person.
    expect(child.toLowerCase()).toContain("never assume or use the parent's name");
    expect(general.toLowerCase()).toContain("never assume or use the parent's name");
    // Parent-neutral ROLE line.
    expect(child).toContain("You are the family's homeschool assistant");
    expect(general).toContain("You are the family's homeschool assistant");
  });
});

// ── 7a-ii. Cross-child learner models on the general branch (FEAT-60) ──

describe("buildAllChildrenLearnerModels", () => {
  it("concatenates every child's slice under a per-child header (fixture with 2)", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "Lincoln", slice: "LEARNER MODEL — Lincoln.\nWorking edge: multisyllable words." },
      { name: "London", slice: "LEARNER MODEL — London.\nWorking edge: letter sounds." },
    ]);
    // Both children present, each under a clear header.
    expect(out).toContain("PER-CHILD LEARNER MODELS");
    expect(out).toContain("── Lincoln ──");
    expect(out).toContain("── London ──");
    expect(out).toContain("multisyllable words");
    expect(out).toContain("letter sounds");
    // Lincoln's block precedes London's (iteration order preserved).
    expect(out.indexOf("── Lincoln ──")).toBeLessThan(out.indexOf("── London ──"));
    // No hardcoded child count baked into the wording.
    expect(out).not.toContain("${");
  });

  it("skips children with an empty slice (no usable model) but keeps the populated ones", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "Lincoln", slice: "LEARNER MODEL — Lincoln." },
      { name: "London", slice: "" },
    ]);
    expect(out).toContain("── Lincoln ──");
    expect(out).not.toContain("── London ──");
  });

  it("scales past two children without hardcoding names or count (post-ARCH-40 discipline)", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "A", slice: "model A" },
      { name: "B", slice: "model B" },
      { name: "C", slice: "model C" },
    ]);
    expect((out.match(/── \w ──/g) || []).length).toBe(3);
  });

  it("returns empty string when no child has a usable model (omit-on-empty)", () => {
    expect(buildAllChildrenLearnerModels([])).toBe("");
    expect(
      buildAllChildrenLearnerModels([
        { name: "Lincoln", slice: "" },
        { name: "London", slice: "   " },
      ]),
    ).toBe("");
  });
});

// ── 7a-iii. No writes from general mode — every action addendum stays child-only ──

describe("no-writes-from-general guard (FEAT-60)", () => {
  it("every <action>/handoff addendum returns '' on the general (no-child) branch", () => {
    // Comparison is read-only in general mode: no action grammar is emitted.
    expect(buildSightWordActionAddendum(undefined, undefined)).toBe("");
    expect(buildSnapshotActionAddendum(undefined, undefined)).toBe("");
    expect(buildPlanAdjustmentActionAddendum(undefined, undefined)).toBe("");
    expect(buildActivityMinutesActionAddendum(undefined, undefined)).toBe("");
    // FEAT-142 — the live-day grammar is child-scoped too: no THIS WEEK section
    // is loaded on the general branch, so there is nothing valid to propose.
    expect(buildDayItemActionAddendum(undefined, undefined)).toBe("");
    // The general role section teaches comparison but no write grammar.
    const general = buildShellyChatRoleSection(undefined);
    expect(general).not.toContain("<action>");
  });
});

// ── 7b. Sight-word <action> grammar addendum (Build Step 3b) ──

describe("buildSightWordActionAddendum", () => {
  it("teaches the add/remove grammar and binds to the active childId on a child tab", () => {
    const out = buildSightWordActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("SIGHT-WORD ACTIONS");
    // Uses the literal childId so the model addresses the right child.
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"kind":"addSightWord"');
    expect(out).toContain('"kind":"removeSightWord"');
    expect(out).toContain("Lincoln");
    // Conservative + propose-only guardrails are present.
    expect(out).toContain("NEVER say the change is done");
    expect(out).toContain("do NOT emit an action");
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("returns empty string on the general (no-child) branch", () => {
    expect(buildSightWordActionAddendum(undefined, undefined)).toBe("");
    expect(buildSightWordActionAddendum("", "")).toBe("");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildSightWordActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

// ── 7b-ii. Additive snapshot <action> grammar addendum (Build Step 6b) ──

describe("buildSnapshotActionAddendum", () => {
  it("returns empty string when childId is missing (general tab)", () => {
    expect(buildSnapshotActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildSnapshotActionAddendum("", "")).toBe("");
  });

  it("emits all four additive snapshot kinds bound to the active childId", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("SKILL-SNAPSHOT ACTIONS");
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"kind":"addPrioritySkill"');
    expect(out).toContain('"kind":"addSupport"');
    expect(out).toContain('"kind":"addStopRule"');
    expect(out).toContain('"kind":"markSkillProgress"');
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("teaches additive-only — never a removal or downgrade", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("ADDITIVE ONLY");
    expect(out.toLowerCase()).toContain("cannot remove");
  });

  it("frames it as propose→confirm, never claiming the write is done", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("confirm");
    expect(out).toContain("NEVER claim it's done");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildSnapshotActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

// ── 7b-bis. Plan-adjustment HANDOFF grammar addendum (chunk 2A/2) ──

describe("buildPlanAdjustmentActionAddendum", () => {
  it("returns empty string when childId is missing (general tab)", () => {
    expect(buildPlanAdjustmentActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildPlanAdjustmentActionAddendum("", "")).toBe("");
  });

  it("emits the proposePlanAdjustment grammar bound to the active childId", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("PLAN-ADJUSTMENT HANDOFF");
    expect(out).toContain('"kind":"proposePlanAdjustment"');
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"summary"');
    expect(out).toContain('"rationale"');
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("frames it as a handoff that never writes the plan", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("HANDOFF");
    expect(out).toContain("do NOT write the plan");
    expect(out).toContain("NEVER claim the plan is changed");
  });

  it("routes snapshot/friction elsewhere — only for next-week plan changes", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("additive snapshot actions");
    expect(out).toContain("silent friction capture");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildPlanAdjustmentActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

// ── 7c. Silent friction-capture grammar addendum (Build Step 5a) ──

describe("buildFrictionCaptureAddendum", () => {
  it("teaches the <friction> grammar with the interpretedWant field", () => {
    const out = buildFrictionCaptureAddendum();
    expect(out).toContain("FRICTION CAPTURE");
    expect(out).toContain("<friction>");
    expect(out).toContain("</friction>");
    expect(out).toContain("interpretedWant");
    expect(out).toContain('"quote"');
  });

  it("instructs the model to keep it silent and conservative", () => {
    const out = buildFrictionCaptureAddendum().toLowerCase();
    // Invisible plumbing: never surfaced to Shelly.
    expect(out).toContain("do not");
    expect(out).toContain("silent");
    // One block per turn, only on genuine signal.
    expect(out).toContain("one");
  });

  it("takes no arguments and is stable (no leaked template placeholder)", () => {
    expect(buildFrictionCaptureAddendum()).toBe(buildFrictionCaptureAddendum());
    expect(buildFrictionCaptureAddendum()).not.toContain("${");
  });
});

// ── 7d. Web-search guidance addendum (FEAT-12 Phase 1) ──

describe("buildWebSearchAddendum", () => {
  it("tells the assistant it may search the web for planning info and cite links", () => {
    const out = buildWebSearchAddendum();
    expect(out).toContain("WEB SEARCH");
    // Names the planning use cases, including videos.
    expect(out.toLowerCase()).toContain("activities");
    expect(out.toLowerCase()).toContain("videos");
    // Requires cited markdown links.
    expect(out).toContain("[title](url)");
    // Keeps it planning-oriented and conservative about when to search.
    expect(out.toLowerCase()).toContain("planning");
    expect(out.toLowerCase()).toContain("don't search for things you already know");
  });

  it("is stable with no leaked template placeholder (general + child-scoped)", () => {
    expect(buildWebSearchAddendum()).toBe(buildWebSearchAddendum());
    expect(buildWebSearchAddendum()).not.toContain("${");
    expect(buildWebSearchAddendum("Lincoln")).not.toContain("${");
  });

  it("omits the teaching-video block on the general (no-child) branch", () => {
    const out = buildWebSearchAddendum();
    expect(out).not.toContain("TEACHING VIDEOS");
    expect(out.toLowerCase()).not.toContain("which child is this for");
  });

  it("scopes teaching videos to the child by age and soft interest preference when child-scoped (FEAT-20)", () => {
    const out = buildWebSearchAddendum("Lincoln");
    expect(out).toContain("TEACHING VIDEOS for Lincoln");
    // Age/level pitch.
    expect(out.toLowerCase()).toContain("age");
    // Soft preference, never a hard filter.
    expect(out.toLowerCase()).toContain("softly prefer");
    expect(out.toLowerCase()).toContain("tiebreaker, never a filter");
    expect(out.toLowerCase()).toContain("best plain video");
    // Doesn't ask which child when already child-scoped.
    expect(out.toLowerCase()).toContain("don't ask");
    // Still includes the base web-search guidance.
    expect(out).toContain("WEB SEARCH");
  });
});

// ── 8. Token-budget sanity bound on the Phase 1 additions ──

describe("Phase 1 supplemental-block token-budget sanity", () => {
  it("realistic Lincoln-shaped data keeps the Phase 1 additions under 8000 chars (≈ 2000 tokens)", () => {
    const childName = "Lincoln";
    const disposition = formatDispositionProfile(childName, lincolnDispositionCache(), {});
    const weeklyReviews = formatRecentWeeklyReviews(childName, lincolnWeeklyReviews());
    const conundrum = formatConundrumTitle({ conundrum: { title: "Should we share the last cookie?" } });
    const teachBacks = formatRecentTeachBacks(lincolnTeachBackArtifacts());
    const roleSection = buildShellyChatRoleSection(childName);

    const totalChars = disposition.length + weeklyReviews.length + conundrum.length + teachBacks.length + roleSection.length;

    // Bound (8000 chars ≈ 2000 tokens) covers all Phase 1 supplemental additions
    // plus the new addendum-bearing role section. Stays comfortably below the
    // +25-29% headroom budgeted in Step 1.
    expect(totalChars).toBeLessThan(8000);

    // All Phase 1 sections actually populated under realistic fixtures.
    expect(disposition).not.toBe("");
    expect(weeklyReviews).not.toBe("");
    expect(conundrum).not.toBe("");
    expect(teachBacks).not.toBe("");
    expect(roleSection).toContain("PLANNING-PARTNER MODE");
  });
});

describe("extractImageUrls — multi-image vision parity (FEAT-59)", () => {
  it("pulls a single leading marker (unchanged single-image behavior)", () => {
    const r = extractImageUrls("[IMAGE_URL:https://x/a.jpg]\nwhat is this?");
    expect(r.urls).toEqual(["https://x/a.jpg"]);
    expect(r.text).toBe("what is this?");
  });

  it("pulls N leading markers and returns the shared context text once", () => {
    const r = extractImageUrls(
      "[IMAGE_URL:https://x/a.jpg][IMAGE_URL:https://x/b.jpg][IMAGE_URL:https://x/c.jpg]\nthese are Fast Phonics",
    );
    expect(r.urls).toEqual(["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"]);
    expect(r.text).toBe("these are Fast Phonics");
  });

  it("returns no urls for a plain text message (text path)", () => {
    const r = extractImageUrls("just a question, no image");
    expect(r.urls).toEqual([]);
    expect(r.text).toBe("just a question, no image");
  });
});

// ── FEAT-135. The chat can set an activity's default minutes ────────
//
// Nathan asked the chat to make his subjects match the ~30-45 minutes they
// actually spend. The assistant said it couldn't, and then sent him to a
// "schedule/settings screen" that does not exist. Three things had to change:
// the model can now SEE the activities (ACTIVITIES section), it has a real
// action to propose (setActivityMinutes), and it is forbidden from inventing a
// destination when it still can't do something.

describe("formatChatActivities (FEAT-135) — the section that makes an id proposable", () => {
  const ROWS: ChatActivityRow[] = [
    {
      id: "cfg_math",
      name: "Math Lesson",
      subjectBucket: "Math",
      defaultMinutes: 15,
      frequency: "daily",
      childId: "lincoln1",
    },
    {
      id: "cfg_read",
      name: "Read Aloud",
      subjectBucket: "LanguageArts",
      defaultMinutes: 20,
      frequency: "daily",
      childId: "both",
    },
    {
      id: "cfg_done",
      name: "Finished Workbook",
      subjectBucket: "Math",
      defaultMinutes: 10,
      frequency: "3x",
      childId: "lincoln1",
      completed: true,
    },
  ];

  it("carries the doc id, name, current minutes, frequency and subject for each activity", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("ACTIVITIES");
    expect(out).toContain("Math Lesson");
    expect(out).toContain("15 min");
    expect(out).toContain("daily");
    expect(out).toContain("Math");
    // The id is the whole point — without it the model has nothing valid to
    // put in a setActivityMinutes payload.
    expect(out).toContain("(id: cfg_math)");
    expect(out).toContain("(id: cfg_read)");
  });

  it("marks a shared config plainly, by the names of the children it covers", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("shared: Lincoln and London");
    // ...and the non-shared row is NOT marked.
    const mathLine = out.split("\n").find((l) => l.includes("cfg_math")) ?? "";
    expect(mathLine).not.toContain("shared");
  });

  it("excludes completed activities, as loadWorkbookPaces already does", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).not.toContain("Finished Workbook");
    expect(out).not.toContain("cfg_done");
  });

  it("tells the model to copy ids exactly and to flag a shared change first", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("exactly");
    expect(out).toContain("changing its minutes changes it for all of them");
  });

  it("omits the section entirely when nothing survives the completed filter", () => {
    expect(formatChatActivities([], ["Lincoln"])).toBe("");
    expect(formatChatActivities([ROWS[2]], ["Lincoln"])).toBe("");
  });

  it("degrades gracefully when child names are unknown", () => {
    const out = formatChatActivities([ROWS[1]], []);
    expect(out).toContain("shared: every child");
  });
});

describe("buildActivityMinutesActionAddendum (FEAT-135)", () => {
  it("returns empty string on the general (no-child) tab", () => {
    expect(buildActivityMinutesActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildActivityMinutesActionAddendum("", "")).toBe("");
  });

  it("emits the setActivityMinutes grammar bound to the active childId", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain('"kind":"setActivityMinutes"');
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"activityConfigId"');
    expect(out).toContain('"minutes"');
    expect(out).not.toContain("${");
  });

  it("forbids inventing an activity id and points at the ACTIVITIES section", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("ACTIVITIES");
    expect(out).toContain("NEVER invent");
    expect(out).toContain("ask which one they mean");
  });

  it("states the 5–120 band the parser enforces", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("between 5 and 120");
  });

  it("says the change is forward-looking and never retroactive", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("FUTURE plans");
    expect(out).toContain("hours already recorded");
    expect(out).toContain("NEVER say it's done");
  });

  it("requires flagging a shared activity before proposing", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("shared");
    expect(out).toContain("both boys");
  });

  it("keeps itself distinct from the plan-adjustment handoff", () => {
    const out = buildActivityMinutesActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("STANDING default");
    expect(out).toContain("Changing a number = this action; changing the week = the handoff");
  });

  it("falls back to a generic noun when childName is absent", () => {
    const out = buildActivityMinutesActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

describe("navigation honesty (FEAT-135) — stop inventing screens", () => {
  it("forbids naming a screen the model was not told exists, on the child tab", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("NAVIGATION HONESTY");
    expect(out).toContain("NEVER describe a screen");
    expect(out).toContain("isn't in the app yet");
  });

  it("applies the same rule on the general tab", () => {
    const out = buildShellyChatRoleSection(undefined);
    expect(out).toContain("NAVIGATION HONESTY");
    expect(out).toContain("NEVER describe a screen");
  });

  it("gives the TRUE location for activity durations — Progress → Curriculum", () => {
    for (const out of [buildShellyChatRoleSection("Lincoln"), buildShellyChatRoleSection(undefined)]) {
      expect(out).toContain("Progress → Curriculum");
    }
  });

  it("explicitly denies that Settings holds a schedule or duration screen", () => {
    // The exact confabulation from the live report: "the app's schedule/settings
    // screen ... where you can set a target duration per subject".
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain(
      "Settings does NOT contain any schedule, subject-duration, or time-block screen",
    );
  });
});

describe("plan-adjustment trigger widening (FEAT-135)", () => {
  it("no longer requires the parent to be frustrated", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("does NOT have to be upset");
    expect(out).toContain("calm, specific request");
    // The old gate read "When the parent voices frustration that warrants
    // changing ..." — a calm request fell outside it.
    expect(out).not.toContain("When the parent voices frustration");
  });

  it("still frames itself as a handoff that never writes the plan", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("HANDOFF");
    expect(out).toContain("NEVER claim the plan is changed");
  });

  it("routes a standing per-activity default to setActivityMinutes instead", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("setActivityMinutes");
    expect(out).toContain("SHAPE of next week");
  });
});

// ── FEAT-142 — THIS WEEK section + live-day action grammar ────────

describe("currentWeekDays (FEAT-142)", () => {
  it("returns exactly the five weekdays of the week containing the date", () => {
    // Wednesday 2026-08-12.
    const week = currentWeekDays(new Date("2026-08-12T12:00:00Z"), "America/Chicago");
    expect(week.map((d) => d.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
    expect(week.map((d) => d.dateKey)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("treats Sunday as belonging to the week that is ending, not the next one", () => {
    // Sunday 2026-08-16 → the Mon-Fri that just finished.
    const week = currentWeekDays(new Date("2026-08-16T12:00:00Z"), "America/Chicago");
    expect(week[0].dateKey).toBe("2026-08-10");
    expect(week[4].dateKey).toBe("2026-08-14");
  });

  it("derives from the FAMILY's civil date, not the runtime's (Codex P2, PR #1667)", () => {
    // Superseded the original assertion here, which pinned formatting from the
    // runtime's LOCAL components — that was the runtime-zone assumption the
    // timezone fix exists to remove. The contract now: an instant that is
    // Monday 00:00 UTC is still SUNDAY in Chicago, so the family's week is the
    // one that is ending.
    const mondayUtcMidnight = new Date("2026-08-10T00:00:00Z");
    expect(currentWeekDays(mondayUtcMidnight, "America/Chicago")[0].dateKey).toBe("2026-08-03");
    // Once it is genuinely Monday for the family, the week turns over.
    const mondayMorningCt = new Date("2026-08-10T13:00:00Z");
    expect(currentWeekDays(mondayMorningCt, "America/Chicago")[0].dateKey).toBe("2026-08-10");
  });
});

describe("chatChecklistItemKey (FEAT-142) — parity with the client's identity", () => {
  // This MUST match src/features/today/dayWriteGuard.ts's checklistItemKey. The
  // string emitted here is the string the model copies into a payload and the
  // client resolves by comparing against its own function's output.
  it("prefers an explicit id", () => {
    expect(chatChecklistItemKey({ id: "row-1", label: "Math (15m)" })).toBe("row-1");
  });

  it("falls back to label::subjectBucket", () => {
    expect(
      chatChecklistItemKey({ label: "Reading Eggs (30m)", subjectBucket: "Reading" }),
    ).toBe("Reading Eggs (30m)::Reading");
  });

  it("uses an empty subject segment when the row carries no bucket", () => {
    expect(chatChecklistItemKey({ label: "Copywork (10m)" })).toBe("Copywork (10m)::");
  });
});

describe("formatChatWeekDays (FEAT-142) — the section that makes a row proposable", () => {
  const week = (): Parameters<typeof formatChatWeekDays>[0] => [
    {
      dateKey: "2026-08-10",
      label: "Monday",
      checklist: [
        { label: "Reading Eggs (30m)", subjectBucket: "Reading", completed: true },
        { label: "Math Facts (10m)", subjectBucket: "Math", completed: false },
      ],
    },
    { dateKey: "2026-08-11", label: "Tuesday", checklist: [] },
    {
      dateKey: "2026-08-12",
      label: "Wednesday",
      checklist: [{ id: "row-9", label: "Watch: Volcanoes (12m)", skipped: true }],
    },
  ];

  it("emits each row's identity key so the model has something valid to propose", () => {
    const out = formatChatWeekDays(week(), "Lincoln");
    expect(out).toContain("itemKey: Math Facts (10m)::Math");
    expect(out).toContain("itemKey: row-9");
  });

  it("marks a completed row as immovable, in the row itself", () => {
    const out = formatChatWeekDays(week(), "Lincoln");
    // The model must know BEFORE it proposes, or it spends the parent's tap on
    // a card the write layer will refuse.
    expect(out).toContain("Reading Eggs (30m) [DONE — cannot be moved or removed]");
    expect(out).not.toContain("Math Facts (10m) [DONE");
  });

  it("marks a skipped row as skipped, not as done — it is still removable", () => {
    const out = formatChatWeekDays(week(), "Lincoln");
    expect(out).toContain("Watch: Volcanoes (12m) [skipped]");
  });

  it("lists an empty weekday rather than omitting it", () => {
    // A day with nothing on it is still a day a row can be moved onto; a gap
    // would read as "that day doesn't exist".
    const out = formatChatWeekDays(week(), "Lincoln");
    expect(out).toContain("Tuesday (2026-08-11):");
    expect(out).toContain("(nothing on this day yet)");
  });

  it("scopes itself to the current Monday–Friday and says so", () => {
    const out = formatChatWeekDays(week(), "Lincoln");
    expect(out).toContain("Monday–Friday of the CURRENT week");
    expect(out).toContain("Lincoln");
  });

  it("returns '' when there is no week at all, so the section is omitted", () => {
    expect(formatChatWeekDays([], "Lincoln")).toBe("");
  });
});

describe("buildDayItemActionAddendum (FEAT-142)", () => {
  it("teaches all three kinds with the child's real id baked in", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain('"kind":"removeItemFromDay"');
    expect(out).toContain('"kind":"moveItemToDay"');
    expect(out).toContain('"kind":"addItemToDay"');
    expect(out).toContain('"childId":"lincoln123"');
  });

  it("forbids inventing an itemKey or a date", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("MUST be copied exactly from the THIS WEEK section");
    expect(out).toContain("NEVER invent, guess, or reconstruct");
  });

  it("states the completed-row rule as hard, with no override", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("FINISHED WORK IS NEVER EDITABLE");
    expect(out).toContain("There is no override");
  });

  it("bounds moves to a different weekday of the SAME week", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("Only days in THIS WEEK");
    expect(out).toContain("different weekday of the same week");
  });

  it("states the minutes band and says a value outside it is rejected, not clamped", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("whole number between 5 and 120");
    expect(out).toContain("rejected outright");
  });

  it("keeps itself distinct from setActivityMinutes and the next-week handoff", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("setActivityMinutes");
    expect(out).toContain("plan-adjustment handoff");
  });

  it("never claims the change is already made", () => {
    const out = buildDayItemActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("NEVER say it's done");
  });

  it("emits nothing on the general (no-child) branch", () => {
    expect(buildDayItemActionAddendum(undefined, undefined)).toBe("");
  });
});

describe("navigation honesty after FEAT-142/150 — two endings, and no invented screens", () => {
  it("names the live-week edits among what the chat CAN change", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("what is on a day of THIS week");
  });

  it("still names the REAL screen for each area a parent asks about", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("Progress → Curriculum");
    expect(out).toContain("Watch Library");
    expect(out).toContain("Plan My Week");
  });

  it("permits exactly TWO endings now, not three — 'coming' is gone (FEAT-150)", () => {
    // FEAT-142 introduced "coming" as a legitimate third ending while three
    // slices were genuinely outstanding. All three have shipped, so the ending
    // has no true use left and is forbidden rather than merely bounded.
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("end in one of exactly two ways");
    expect(out).toContain("or say it isn't in the app yet");
    expect(out).not.toContain("say the capability is coming");
    expect(out).not.toContain("do not promise anything else is on the way");
  });

  it("still forbids naming a screen it was not told exists, and still denies Settings", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("NEVER describe a screen");
    expect(out).toContain(
      "Settings does NOT contain any schedule, subject-duration, or time-block screen",
    );
    // The Watch Library is NOT in Settings any more (FEAT-132) — the map must
    // not send anyone there for it.
    expect(out).toContain("it is NOT inside Settings");
  });
});

describe("currentWeekDays in the family's zone (Codex P2, PR #1667)", () => {
  it("defaults to the zone every scheduled function in this repo runs on", () => {
    expect(DEFAULT_FAMILY_TIME_ZONE).toBe("America/Chicago");
  });

  it("uses the FAMILY's Sunday, not the runtime's already-Monday", () => {
    // Sunday 2026-08-16, 21:00 America/Chicago = Monday 2026-08-17 02:00 UTC.
    // Deriving from the runtime clock would select the week the family has not
    // started yet, and every action emitted from it would be refused by the
    // client gate as out-of-week. Sunday evening is when a homeschool parent
    // plans, so this is the wrong hour to be an hour off.
    const sundayEvening = new Date("2026-08-17T02:00:00Z");
    const week = currentWeekDays(sundayEvening, "America/Chicago");
    expect(week[0].dateKey).toBe("2026-08-10");
    expect(week[4].dateKey).toBe("2026-08-14");
  });

  it("moves to the new week once the family's Monday actually arrives", () => {
    // Monday 2026-08-17, 08:00 America/Chicago = 13:00 UTC.
    const mondayMorning = new Date("2026-08-17T13:00:00Z");
    const week = currentWeekDays(mondayMorning, "America/Chicago");
    expect(week[0].dateKey).toBe("2026-08-17");
  });

  it("honours a family in a different zone", () => {
    // 2026-08-17T02:00Z is already Monday in London and still Sunday in Chicago.
    const t = new Date("2026-08-17T02:00:00Z");
    expect(currentWeekDays(t, "Europe/London")[0].dateKey).toBe("2026-08-17");
    expect(currentWeekDays(t, "America/Chicago")[0].dateKey).toBe("2026-08-10");
  });

  it("still returns exactly five labelled weekdays", () => {
    const week = currentWeekDays(new Date("2026-08-12T12:00:00Z"), "America/Chicago");
    expect(week.map((d) => d.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
    expect(week.map((d) => d.dateKey)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });
});

describe("civilDateInZone (Codex P2, PR #1667)", () => {
  it("returns the civil date in the named zone, YYYY-MM-DD", () => {
    expect(civilDateInZone(new Date("2026-08-17T02:00:00Z"), "America/Chicago")).toBe(
      "2026-08-16",
    );
    expect(civilDateInZone(new Date("2026-08-17T02:00:00Z"), "Europe/London")).toBe(
      "2026-08-17",
    );
  });

  it("falls back instead of throwing on a bad profile value", () => {
    // A malformed timeZone on the family doc must not take the whole chat down.
    expect(civilDateInZone(new Date("2026-08-12T12:00:00Z"), "Not/AZone")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

// ── FEAT-143. The chat can edit the curriculum ──────────────────────
//
// Slice 2 of the chat arc. Nathan: "chat with it on where Lincoln is in a topic
// … what curriculum to add for Lincoln on the tablet — ok let's add this one."
// Two things had to change on this side: the ACTIVITIES section had to carry
// enough to HAVE that conversation (type + position), and the model needed a
// grammar for the three writes Shelly makes by hand at Progress → Curriculum.

describe("formatChatActivities — the FEAT-143 widening", () => {
  const ROWS: ChatActivityRow[] = [
    {
      id: "cfg_gatb",
      name: "GATB Math 3",
      subjectBucket: "Math",
      defaultMinutes: 20,
      frequency: "daily",
      childId: "lincoln1",
      type: "workbook",
      currentPosition: 98,
      totalUnits: 140,
      unitLabel: "lesson",
    },
    {
      id: "cfg_morning",
      name: "Morning formation",
      subjectBucket: "Other",
      defaultMinutes: 10,
      frequency: "daily",
      childId: "both",
      type: "routine",
    },
  ];

  it("carries the activity TYPE, so the model knows what the owner rule applies to", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("workbook");
    expect(out).toContain("routine");
  });

  it("carries the position — the whole subject of 'where is Lincoln in this topic'", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("on lesson 98 of 140");
  });

  it("says plainly when an activity has no position to set", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    const morningLine = out.split("\n").find((l) => l.includes("cfg_morning")) ?? "";
    expect(morningLine).toContain("no position tracked");
  });

  it("renders a position in the config's own unit noun", () => {
    const out = formatChatActivities(
      [{ ...ROWS[0], unitLabel: "chapter", currentPosition: 4, totalUnits: 42 }],
      ["Lincoln"],
    );
    expect(out).toContain("on chapter 4 of 42");
  });

  it("handles a position with no known total, and a total with no position", () => {
    expect(
      formatChatActivities(
        [{ ...ROWS[0], currentPosition: 12, totalUnits: undefined }],
        ["Lincoln"],
      ),
    ).toContain("on lesson 12");
    expect(
      formatChatActivities(
        [{ ...ROWS[0], currentPosition: undefined, totalUnits: 140 }],
        ["Lincoln"],
      ),
    ).toContain("140 lessons, position not set");
  });

  // Characterization — FEAT-135's consumers must be unaffected by the widening.
  it("still carries everything FEAT-135 put there", () => {
    const out = formatChatActivities(ROWS, ["Lincoln", "London"]);
    expect(out).toContain("ACTIVITIES");
    expect(out).toContain("GATB Math 3");
    expect(out).toContain("20 min");
    expect(out).toContain("daily");
    expect(out).toContain("Math");
    expect(out).toContain("(id: cfg_gatb)");
    expect(out).toContain("shared: Lincoln and London");
    expect(out).toContain("exactly");
  });

  it("still excludes completed activities and still omits an empty section", () => {
    const done: ChatActivityRow = { ...ROWS[0], id: "cfg_done", name: "Done Book", completed: true };
    const out = formatChatActivities([...ROWS, done], ["Lincoln"]);
    expect(out).not.toContain("Done Book");
    expect(out).not.toContain("cfg_done");
    expect(formatChatActivities([done], ["Lincoln"])).toBe("");
  });

  it("tolerates a row with no widened fields at all (a pre-FEAT-143 doc)", () => {
    const bare: ChatActivityRow = {
      id: "cfg_bare",
      name: "Old Activity",
      defaultMinutes: 15,
      frequency: "daily",
      childId: "lincoln1",
    };
    const out = formatChatActivities([bare], ["Lincoln"]);
    expect(out).toContain("Old Activity");
    expect(out).toContain("(id: cfg_bare)");
    expect(out).toContain("no position tracked");
  });
});

describe("buildCurriculumActionAddendum (FEAT-143)", () => {
  const OUT = buildCurriculumActionAddendum("lincoln123", "Lincoln");

  it("returns empty string on the general (no-child) tab — no curriculum actions there", () => {
    expect(buildCurriculumActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildCurriculumActionAddendum("", "")).toBe("");
  });

  it("emits all three grammars bound to the active childId", () => {
    expect(OUT).toContain('"kind":"addActivity"');
    expect(OUT).toContain('"kind":"markActivityComplete"');
    expect(OUT).toContain('"kind":"setActivityPosition"');
    expect(OUT).toContain('"childId":"lincoln123"');
    expect(OUT).not.toContain("${");
  });

  it("states every enum the parser rejects outside of", () => {
    for (const type of ["workbook", "routine", "app", "activity", "formation", "evaluation"]) {
      expect(OUT, `type=${type}`).toContain(type);
    }
    for (const freq of ["daily", "3x", "2x", "1x", "as-needed"]) {
      expect(OUT, `frequency=${freq}`).toContain(freq);
    }
    expect(OUT).toContain("between 5 and 120");
  });

  it("teaches the DATA-08 owner rule — a workbook is never shared", () => {
    expect(OUT).toContain("WORKBOOKS BELONG TO ONE CHILD");
    expect(OUT).toContain('"shared":true');
    expect(OUT).toContain("rejected outright");
  });

  it("says a completion is irreversible, in both places it could be undone", () => {
    expect(OUT).toContain("THERE IS NO UNDO");
    expect(OUT).toContain("Progress → Curriculum");
    expect(OUT).toContain("Everything already logged against it stays");
  });

  it("forbids deleting an activity and offers completion instead", () => {
    expect(OUT).toContain("CANNOT delete");
    expect(OUT).toContain("retires programs");
  });

  it("rejects rather than clamps a position past the end", () => {
    expect(OUT).toContain("cannot be past");
    expect(OUT).toContain("rather than trimmed");
  });

  it("forbids inventing an activity id and points at the ACTIVITIES section", () => {
    expect(OUT).toContain("ACTIVITIES");
    expect(OUT).toContain("NEVER invent");
    expect(OUT).toContain("ask which one");
  });

  it("keeps the model out of picking a sort order", () => {
    expect(OUT).toContain("Do NOT pick an ordering");
  });

  // The conservatism rail the run prompt names explicitly: the "where is he in
  // this topic" conversation is a READ, not a write.
  it("says discussing where the child is in a topic is not a write", () => {
    expect(OUT).toContain("TALKING about where Lincoln is in a topic is NOT a write");
    expect(OUT).toContain("Be conservative");
    expect(OUT).toContain("NEVER say it's done");
  });

  // The failure mode this rail exists for: reaching for the wrong capability.
  // "Make math 30 minutes" is the minutes action, not a curriculum add.
  it("stays distinct from its three neighbouring capabilities", () => {
    expect(OUT).toContain("setActivityMinutes");
    expect(OUT).toContain('"make math 30 minutes" is that action, not this one');
    expect(OUT).toContain("THIS week");
    expect(OUT).toContain("NEXT week");
  });
});

describe("NAVIGATION HONESTY after FEAT-143", () => {
  const CHILD = buildShellyChatRoleSection("Lincoln");
  const GENERAL = buildShellyChatRoleSection(undefined);

  it("moves curriculum edits out of the 'coming' list and into what it CAN do", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("adding an activity, marking one finished");
      // The old promise is gone — the capability shipped.
      expect(out).not.toContain(
        "adding or completing a curriculum activity or changing its position",
      );
    }
  });

  it("has no 'coming' slice left — FEAT-150 shipped the last one", () => {
    // The list shrank with each slice (three → two → one) and this run empties
    // it. What replaced it is stricter than the bound ever was: the rule now
    // forbids the ending outright, because a promise the model cannot verify is
    // one a parent plans around.
    for (const out of [CHILD, GENERAL]) {
      expect(out).not.toContain("finding videos on the web and planning them");
      expect(out).not.toContain("reshaping NEXT week from here");
      expect(out).not.toContain('Say "that\'s coming" only for that one');
      expect(out).not.toContain("do not promise anything else is on the way");
      expect(out).toContain('NOTHING is "coming"');
      // The real screens are still named — that half of the rule is unchanged.
      expect(out).toContain("Watch Library");
      expect(out).toContain("Plan My Week");
    }
  });

  it("states the two things that remain impossible — delete, and un-finish", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("CANNOT DELETE an activity");
      expect(out).toContain("cannot be un-finished");
      expect(out).toContain("Never offer a way to undo it");
    }
  });

  it("still names only real screens, and still forbids inventing one", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("Progress → Curriculum");
      expect(out).toContain("NEVER describe a screen");
      // The FEAT-135 bug is still called out by name as the thing NOT to do.
      // (The invented phrase appears only inside that prohibition, and Settings
      // is explicitly ruled out as a destination for it.)
      expect(out).toContain("Inventing a plausible-sounding location");
      expect(out).toContain(
        "Settings does NOT contain any schedule, subject-duration, or time-block screen",
      );
    }
  });
});

// ── FEAT-149: the chat can vet in a found video and plan it ──────────────────

describe("plannableWatchDays (FEAT-149)", () => {
  it("runs from today through next Friday, labelled for a card", () => {
    // Wednesday. Monday and Tuesday have already happened.
    const days = plannableWatchDays(new Date("2026-08-12T12:00:00Z"), "America/Chicago");
    expect(days.map((d) => d.dateKey)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(days[0].label).toBe("Wednesday");
    expect(days[4].label).toBe("next Tuesday");
  });

  it("drops elapsed weekdays but keeps TODAY (Codex P2, PR #1676)", () => {
    // The addendum tells the model "not a past day". If the list it is handed
    // still contained one, the prompt would be contradicting its own data — and
    // the client gate would refuse a proposal the prompt invited.
    const friday = plannableWatchDays(new Date("2026-08-14T15:00:00Z"), "America/Chicago");
    expect(friday[0].dateKey).toBe("2026-08-14");
    expect(friday.map((d) => d.dateKey)).not.toContain("2026-08-10");
    expect(friday).toHaveLength(6);
  });

  it("is a prefix-trimmed currentWeekDays — the two windows cannot drift apart", () => {
    // On a Monday nothing has elapsed, so the head is exactly the current week.
    const monday = new Date("2026-08-10T14:00:00Z");
    expect(plannableWatchDays(monday, "America/Chicago").slice(0, 5)).toEqual(
      currentWeekDays(monday, "America/Chicago"),
    );
  });

  it("uses the family's CIVIL date, not the runtime's — the #1667 rail", () => {
    // Sunday 23:30 in Chicago is already Monday in UTC. Read in the family's
    // zone it is still Sunday, so the whole current week has elapsed and the
    // window is next week alone. Read in UTC it is Monday, so that Monday is
    // itself plannable — a different answer from the same instant, which is
    // exactly the divergence the client gate would refuse.
    const sundayNight = new Date("2026-08-17T04:30:00Z"); // Sun 23:30 CDT
    const chicago = plannableWatchDays(sundayNight, "America/Chicago");
    expect(chicago).toHaveLength(5);
    expect(chicago[0]).toEqual({ dateKey: "2026-08-17", label: "next Monday" });
    const utc = plannableWatchDays(sundayNight, "UTC");
    expect(utc[0]).toEqual({ dateKey: "2026-08-17", label: "Monday" });
  });

  it("agrees with the client's plannableWatchDayKeys on the same date", () => {
    // The client's copy in `useChatWeekDays.ts` is what the confirm gate accepts;
    // this is what the model is told about. Both sides pin these pairs.
    const days = plannableWatchDays(new Date("2026-08-12T12:00:00Z"), "America/Chicago");
    expect(days[0]).toEqual({ dateKey: "2026-08-12", label: "Wednesday" });
    expect(days[3]).toEqual({ dateKey: "2026-08-17", label: "next Monday" });
    expect(days[7]).toEqual({ dateKey: "2026-08-21", label: "next Friday" });
  });

  it("crosses a month boundary as calendar arithmetic", () => {
    const days = plannableWatchDays(new Date("2026-08-26T12:00:00Z"), "America/Chicago");
    expect(days.map((d) => d.dateKey)).toEqual([
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });
});

describe("formatWatchLibrary (FEAT-149) — the section that makes a video plannable", () => {
  const LIBRARY: WatchLibraryRow[] = [
    {
      id: "vid_glacier",
      title: "How Glaciers Move",
      plannedMinutes: 9,
      subjectBucket: "Science",
      childId: "lincoln1",
      why: "He asked how the big rocks got there",
    },
    {
      id: "vid_volcano",
      title: "Inside a Volcano",
      plannedMinutes: 12,
      subjectBucket: "Science",
      childId: "both",
      status: "retired",
    },
  ];

  it("lists each video with the doc id the action must copy", () => {
    const out = formatWatchLibrary(LIBRARY, "Lincoln");
    expect(out).toContain("WATCH LIBRARY");
    expect(out).toContain("How Glaciers Move");
    expect(out).toContain("(watchVideoId: vid_glacier)");
    expect(out).toContain("9 min");
    expect(out).toContain("Science");
  });

  it("marks a retired entry as unplannable rather than hiding it", () => {
    // Hidden, the model would propose vetting it in again — refused at the gate,
    // but only after spending the parent's attention.
    const out = formatWatchLibrary(LIBRARY, "Lincoln");
    expect(out).toContain("Inside a Volcano");
    expect(out).toContain("RETIRED — cannot be planned");
    expect(out).toContain("Archive tab of Watch Library");
  });

  it("says who a shared video is for", () => {
    const out = formatWatchLibrary(LIBRARY, "Lincoln");
    expect(out).toContain("for both boys");
    expect(out).toContain("for this child");
  });

  it("carries the parent's own framing when there is one", () => {
    expect(formatWatchLibrary(LIBRARY, "Lincoln")).toContain(
      '"He asked how the big rocks got there"',
    );
  });

  it("omits itself entirely when the library is empty", () => {
    // An empty section reads as "there is no such thing as a library".
    expect(formatWatchLibrary([], "Lincoln")).toBe("");
  });

  it("tolerates a half-written document without crashing the chat", () => {
    const out = formatWatchLibrary([{ id: "vid_x" }], "Lincoln");
    expect(out).toContain("Untitled");
    expect(out).toContain("(watchVideoId: vid_x)");
  });
});

describe("buildWatchActionAddendum (FEAT-149)", () => {
  const DAYS = [
    { dateKey: "2026-08-17", label: "Monday" },
    { dateKey: "2026-08-24", label: "next Monday" },
  ];
  const OUT = buildWatchActionAddendum("lincoln1", "Lincoln", DAYS);

  it("is emitted only on a child-scoped tab", () => {
    // General mode emits no actions at all — the same rail every other grammar
    // holds. A kid-scoped or general chat therefore cannot even propose one.
    expect(buildWatchActionAddendum(undefined, "Lincoln", DAYS)).toBe("");
    expect(buildWatchActionAddendum("", undefined, DAYS)).toBe("");
    expect(OUT).toContain("WATCH ACTIONS");
  });

  it("teaches both kinds with the child's real id", () => {
    expect(OUT).toContain('"kind":"vetInVideo","childId":"lincoln1"');
    expect(OUT).toContain('"kind":"planVideoOnDay","childId":"lincoln1"');
  });

  it("forbids inventing a youtube id, and requires the URL it came from", () => {
    expect(OUT).toContain("NEVER invent, guess, or recall a YouTube id");
    expect(OUT).toContain('"suggestedFromUrl" MUST be the real URL your search returned');
    expect(OUT).toContain("do not propose it");
  });

  it("keeps presenting candidates in prose — searching is not a write", () => {
    expect(OUT).toContain("Presenting candidates is NOT a write");
    expect(OUT).toContain("When the parent CHOOSES one");
  });

  it("refuses a batch card — five adds are five taps", () => {
    expect(OUT).toContain("never batch them into one card");
    expect(OUT).toContain("ONE video per action block");
  });

  it("lists the plannable days explicitly, and rules out everything else", () => {
    expect(OUT).toContain("Monday = 2026-08-17");
    expect(OUT).toContain("next Monday = 2026-08-24");
    expect(OUT).toContain("not a weekend, not the week after next, not a past day");
  });

  it("states that vet-in is the ONLY library change it can make", () => {
    expect(OUT).toContain("CANNOT retire, un-retire, edit, or delete");
    expect(OUT).toContain("Adding is the only library change you can make");
  });

  it("tells it a duplicate is already there, and a retired one is in the Archive", () => {
    expect(OUT).toContain("already in the WATCH LIBRARY section");
    expect(OUT).toContain("Archive tab of Watch Library");
  });

  it("keeps the two id spaces apart", () => {
    // A youtubeId in a `watchVideoId` field is the likeliest confusion here.
    expect(OUT).toContain("never use a YouTube id here — they are different things");
  });

  it("never claims a video is added, safe, or approved", () => {
    expect(OUT).toContain("NEVER say a video is added, safe, or approved");
    expect(OUT).toContain("The parent is the curator, not you");
  });

  it("says a plan changes nothing already on the day", () => {
    expect(OUT).toContain("It changes nothing already on the day");
    expect(OUT).toContain("touches no hours");
  });
});

describe("NAVIGATION HONESTY after FEAT-149", () => {
  const CHILD = buildShellyChatRoleSection("Lincoln");
  const GENERAL = buildShellyChatRoleSection(undefined);

  it("moves video find-and-add out of 'coming' and into what it CAN do", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("adding one you found on the web to the Watch Library");
      expect(out).toContain("planning a vetted one onto a day of this week or next");
    }
  });

  it("still says retiring and un-retiring live on the Watch Library surface", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("cannot RETIRE a video, un-retire one, edit one, or delete one");
      expect(out).toContain("Retiring and putting back live in Watch Library");
    }
  });

  it("keeps Watch Library out of Settings, as FEAT-132 left it", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("it is NOT inside Settings");
    }
  });
});

describe("nextWeekDays (FEAT-150) — the CF's half of 'next week'", () => {
  const CT = "America/Chicago";

  it("returns the following Mon–Fri on a weekday", () => {
    // Tue 2026-08-18 18:00Z = 13:00 CT.
    expect(
      nextWeekDays(new Date("2026-08-18T18:00:00Z"), CT).map((d) => d.dateKey),
    ).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
  });

  it("labels the days by name, for the span the model says out loud", () => {
    expect(nextWeekDays(new Date("2026-08-18T18:00:00Z"), CT).map((d) => d.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
  });

  it("means the week about to start, on a Saturday and on a Sunday alike", () => {
    for (const iso of ["2026-08-22T18:00:00Z", "2026-08-23T18:00:00Z"]) {
      expect(nextWeekDays(new Date(iso), CT)[0].dateKey, iso).toBe("2026-08-24");
    }
  });

  it("keeps every weekday — unlike the watch window, none of next week is elapsed", () => {
    // `plannableWatchDays` drops elapsed days of the CURRENT week; next week has
    // none by definition, so a Friday still sees all five.
    expect(nextWeekDays(new Date("2026-08-21T18:00:00Z"), CT)).toHaveLength(5);
  });

  it("uses the family's civil date, not the runtime clock", () => {
    // 2026-08-24T02:00Z is Monday in UTC but still Sunday 21:00 in Chicago, so
    // the family's "next week" is the one starting 2026-08-24 — the same answer
    // the client reaches. Getting this wrong shifts a whole week by one.
    expect(nextWeekDays(new Date("2026-08-24T02:00:00Z"), CT)[0].dateKey).toBe("2026-08-24");
  });

  it("agrees with plannableWatchDays' next-week half — one definition, two windows", () => {
    const now = new Date("2026-08-18T18:00:00Z");
    const watchNext = plannableWatchDays(now, CT)
      .filter((d) => d.label.startsWith("next "))
      .map((d) => d.dateKey);
    expect(nextWeekDays(now, CT).map((d) => d.dateKey)).toEqual(watchNext);
  });
});

describe("formatWeekSpan (FEAT-150)", () => {
  it("reads as a span a parent can check, never as date keys", () => {
    const span = formatWeekSpan(nextWeekDays(new Date("2026-08-18T18:00:00Z"), "America/Chicago"));
    expect(span).toBe("Aug 24–28");
    expect(span).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("spans a month boundary readably", () => {
    expect(
      formatWeekSpan(nextWeekDays(new Date("2026-08-25T18:00:00Z"), "America/Chicago")),
    ).toBe("Aug 31 – Sep 4");
  });

  it("degrades to plain words rather than throwing on an empty week", () => {
    expect(formatWeekSpan([])).toBe("next week");
  });
});

describe("buildDraftNextWeekAddendum (FEAT-150)", () => {
  const DAYS = nextWeekDays(new Date("2026-08-18T18:00:00Z"), "America/Chicago");
  const OUT = buildDraftNextWeekAddendum("lincoln", "Lincoln", DAYS);

  it("is omitted on the general (no-child) branch — a week belongs to a boy", () => {
    expect(buildDraftNextWeekAddendum(undefined, undefined, DAYS)).toBe("");
  });

  it("pins the childId into the grammar so the model cannot address another child", () => {
    expect(OUT).toContain('"childId":"lincoln"');
  });

  it("teaches the one kind, carrying only instructions", () => {
    expect(OUT).toContain('"kind":"draftNextWeek"');
    expect(OUT).toContain('"instructions"');
    // No week, no plan, no apply — the payload has nowhere to put them. Matched
    // as JSON KEYS (`"name":`), not as bare quoted words: the prose legitimately
    // says a separate "apply" tap follows, and that sentence is the point.
    for (const key of ['"weekStart":', '"targetWeek":', '"days":', '"apply":', '"plan":']) {
      expect(OUT, key).not.toContain(key);
    }
  });

  it("forbids writing out a plan, and says why the model cannot", () => {
    expect(OUT).toContain("Do NOT write out a plan");
    expect(OUT).toContain("workbook positions");
    expect(OUT).toContain("any week you compose would be made up");
  });

  it("forbids claiming it is done — the first tap writes nothing", () => {
    expect(OUT).toContain("Do NOT say it's done");
    expect(OUT).toContain("writes nothing");
    expect(OUT).toContain("Two taps");
  });

  it("names the week span it targets, in the same words the card shows", () => {
    expect(OUT).toContain("Aug 24–28");
  });

  it("rules out every week except next week", () => {
    expect(OUT).toContain("always the NEXT school week");
    expect(OUT).toContain("cannot target the current week, the week after next");
  });

  it("routes this-week changes and durations to the actions that own them", () => {
    expect(OUT).toContain("TODAY / THIS WEEK actions");
    expect(OUT).toContain("setActivityMinutes");
  });

  it("caps the instruction length the parser enforces", () => {
    expect(OUT).toContain("600 characters");
  });

  it("stays conservative — talking about next week is not a proposal", () => {
    expect(OUT).toContain("Only propose when she clearly wants it changed");
  });

  it("does not require the parent to be upset, the FEAT-135 trigger lesson", () => {
    expect(OUT).toContain("does NOT have to be upset");
  });
});

describe("NAVIGATION HONESTY after FEAT-150 — the arc is complete", () => {
  const CHILD = buildShellyChatRoleSection("Lincoln");
  const GENERAL = buildShellyChatRoleSection(undefined);

  it("moves reshaping next week out of 'coming' and into what it CAN do", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("reshaping NEXT week");
      expect(out).toContain("drafting the whole week");
    }
  });

  it("says the next-week draft takes TWO taps, unlike every other action", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("the next-week draft takes two");
    }
  });

  it("keeps the plan-adjustment handoff as a real alternative, not a fallback", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("two real routes");
      expect(out).toContain("Offer that as a choice, not a fallback");
    }
  });

  it("still reserves THIS week's reshaping for Plan My Week", () => {
    for (const out of [CHILD, GENERAL]) {
      expect(out).toContain("THIS week is reshaped there");
    }
  });

  it("no longer promises a removal/downgrade capability is coming either", () => {
    // The snapshot grammar carried the same forbidden ending; the rule is global
    // now, so that one had to go with it.
    const snapshot = buildSnapshotActionAddendum("lincoln", "Lincoln");
    expect(snapshot).not.toContain("coming later");
    expect(snapshot).toContain("can't be done from here");
  });
});
