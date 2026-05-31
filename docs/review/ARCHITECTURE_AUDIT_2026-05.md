# Architecture Audit — May 2026

**Date:** 2026-05-29  
**Auditor:** Claude Code (monthly scheduled run)  
**Branch:** `claude/sleepy-mccarthy-eazsk`  
**Repo scale at audit time:** 160,831 TS lines · 135 commits · 124 test files · 2,038 tests · 393 functions tests

---

## Baseline (Step 0)

| Check | Result | Notes |
|---|---|---|
| `npm run lint` | ✅ PASS | 3 warnings — `react-hooks/exhaustive-deps` for `sessionTimer`. Same 3 as LINT-01. 0 errors. |
| `npx tsc -b` | ✅ PASS | Clean |
| `npx vitest run` | ✅ PASS | 124 files, 2,038 tests |
| `cd functions && npm run lint` | ✅ PASS | Clean |
| `cd functions && npx tsc --noEmit` | ✅ PASS | Clean |
| `cd functions && npm test` | ✅ PASS | 21 files, 393 tests |

**Baseline: GREEN.** Audit proceeds in full.

---

## Band 1 — Architecture & Tech Debt

### 1.1 Largest files (over 1,500L)

| File | Lines | Change since seed | Assessment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 | **TANGLED** — state machine + wizard + chat + plan phases are one mass. Clear seams: `WizardPhase` subtree, `PlanReviewPhase` subtree, `ApplyPhase` state. Decomposition is risky because wizard → plan → apply state is deeply shared. Leave as-is; track as ARCH-02. |
| `functions/src/ai/chat.ts` | 2,466 | +0 | **TANGLED** — `buildQuestPrompt` alone is 400+L. Multiple independent prompt builders (story, quest, comprehension, fluency, evaluation) share the file only by historical accident. Each builder is self-contained and importable. Highest-leverage ARCH item. ARCH-01. |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 | **COHESIVE-BUT-BIG** — sketch/drawing, voice, sticker, page management, and print flows interleave but are section-bounded. Could extract `useSketchHandlers`, `useStickerHandlers`, `usePrintHandlers`. Not urgent. ARCH-03. |
| `src/features/quest/useQuestSession.ts` | 1,870 | +0 | **TANGLED** — phonics quest, comprehension quest, fluency quest, math quest in one hook with ~4 separate state machines. Seams: `usePhonicsQuest`, `useComprehensionQuest`, `useFluencyQuest`, `useMathQuest` — each branch is nearly independent once session init/end are shared. ARCH-04. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +0 | **COHESIVE-BUT-BIG** — forge/portal/ceremony flow are phase-based and mostly independent. Stable per CLAUDE.md. Not a decomposition priority. |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | +0 | **TANGLED** — 23+ useState hooks, image generation, thread management, follow-up suggestions, image refinement. Could extract `useShellyChatState`, `useShellyImageFlow`. Defer until usage patterns stabilize. New ARCH-09. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +0 | **COHESIVE-BUT-BIG** — phase-based rendering delegates to sub-components. Three game types share `currentGame` state but the phase transitions are clean. Not urgent. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,562 | +0 | **COHESIVE-BUT-BIG** — Three.js render loop; splitting is risky per CLAUDE.md. Leave as-is. |

**Standing candidates unchanged: ARCH-01 (highest), ARCH-04 (next), ARCH-02 (stable/risky), ARCH-03 (low urgency).**  
No files grew >150L since the 2026-05-29 seed audit. No silent drift detected.

---

### 1.2 Bundle (ARCH-05)

**Confirmed sizes:** main chunk `3,841 kB / 1,133 kB gzip` (up 1 kB from health report — rounding). All other chunks trivial (`html2canvas.esm` 201 kB, `purify.es` 26 kB).

**Root cause of the zero-split situation:**  
`src/app/router.tsx` eagerly imports all 30+ page components at the top of the file. No `React.lazy` anywhere. Every route's component (and its entire import tree) loads on the first hit of any page.

**The Three.js blocker:**  
`AvatarThumbnail.tsx` imports Three.js (`from 'three'`) and is statically imported by `AppShell.tsx` (the layout shell rendered on every route), `ContextBar.tsx`, `ChildSelector.tsx`, and `ProfileMenu.tsx`. This means Three.js is **forced into the initial bundle regardless of route**. Lazy-loading `MyAvatarPage.tsx` would only help if `AvatarThumbnail` is first decoupled from Three.js.

**Proposed split plan (architectural decision — not auto-applied):**

| Priority | Action | Estimated gzip saving |
|---|---|---|
| **1 (prerequisite)** | Refactor `AvatarThumbnail.tsx` to use a lightweight CSS/image fallback (no Three.js) for the nav/shell thumbnail. Three.js-backed thumbnail becomes a lazy-loaded enhancement only. | Unlocks all below |
| **2** | `React.lazy` for `MyAvatarPage`, `VoxelCharacter`, `BrothersVoxelScene` — the full 3D scene | ~350–450 kB gzip |
| **3** | `React.lazy` for `BookEditorPage`, `BookReaderPage`, `BookshelfPage` — all three statically import `printBook.ts` which loads jsPDF | ~80–100 kB gzip |
| **4** | `React.lazy` for `WorkshopPage`, `KnowledgeMinePage` (large feature slices) | ~50–80 kB gzip |

**Estimated combined initial-load reduction (all 4 steps):** 480–630 kB gzip (42–56% of current 1,133 kB gzip). Requires step 1 first.

Evidence: `router.tsx:1–90`; `AppShell.tsx:15`; `ContextBar.tsx:14`; `AvatarThumbnail.tsx` (Three.js imports).

**Severity:** Medium. App still loads fast enough on broadband. On mobile 3G (Shelly's use case) the 1.1 MB gzip parse hit is noticeable. Deferred until Design Pass v1 work stabilizes.

---

### 1.3 Test coverage (TEST-01)

Current: 124 test files, 2,038 tests (root), 393 functions tests.

| Feature area | Test files | Assessment |
|---|---|---|
| `shelly-chat/` | **0** | ShellyChatPage is 1,653L with 23+ useState hooks and image-generation flow. High-value logic: thread creation, follow-up suggestion routing, image refinement state. Testable in isolation with mocked API. |
| `dad-lab/` | **0** | DadLabPage.tsx 969L. Report form, lifecycle phases, AI suggestions. Mostly UI but the phase-transition logic and `useDadLabReports` hook have real logic. |
| `progress/` | **0 component tests** | DispositionProfile (inline edit + override + revert), CurriculumTab (activity config management), LearningMap — all contain non-trivial state. The `effectiveDispositionText()` logic is testable. |
| `weekly-review/` | 1 (`WeekInEvidence.test.tsx`) | Only evidence-display component tested. `WeeklyReviewPage.tsx` itself has 0 tests. |
| `records/` | 1 (`records.logic.test.ts` — 1,225L, thorough) | Logic well-covered. `RecordsPage.tsx` (1,136L) has 0 component tests. |

**Highest-value additions (proposal):**
1. `src/features/shelly-chat/shellyChat.logic.test.ts` — extract and test thread-creation, follow-up-generation, and image-refinement state machine from `ShellyChatPage.tsx`. Estimated 15–20 tests. High value: the most complex untested feature.
2. `src/features/progress/DispositionProfile.test.tsx` — test `effectiveDispositionText()` override resolution, revert logic, "newer AI available" detection. ~8 tests. Already has exported helpers.

---

### 1.4 Migrations & deprecations

**WorkbookConfig → ActivityConfig (ARCH-06)**

Ref counts (current vs. ledger):
- `workbookConfig` refs: **34** (ledger said 27 — grew 7 refs, primarily from `PlannerChatPage.tsx`, `PlannerCompactSetup.tsx`, and `PlannerSetupWizard.tsx`)
- `activityConfig` refs: **105** (ledger said 66 — strong growth, healthy)

Files still actively reading `workbookConfigs` collection:
- `src/core/firebase/firestore.ts:247–263` — collection helper + converter (must stay until all readers removed)
- `src/features/planner-chat/PlannerChatPage.tsx:295,898,978,1397,1399` — active reads; fallback when no activityConfigs exist
- `src/features/planner-chat/PlannerSetupWizard.tsx` — reads for wizard setup
- `src/features/planner-chat/PlannerCompactSetup.tsx` — reads for compact setup
- `src/features/planner-chat/PhotoLabelForm.tsx` — minor ref
- `functions/src/ai/workbookActivityConfigBackfill.ts:138` — backfill utility

**Assessment:** Migration is **not safe yet**. `PlannerChatPage` still has active reads from the `workbookConfigs` collection at 5 call sites, used as the source for workbook chips in the planner UI. The `activityConfigs` path has grown but the planner fallback path keeps legacy reads alive. The quest starting-level check was previously a concern; current grep shows no `workbookConfig` refs in `useQuestSession.ts` — that dependency was resolved. Completion requires migrating the planner workbook-chip UI from `workbookConfigs` → `activityConfigs`, then removing the collection helper.

**Ladder deprecation (ARCH-07)**

3 files with active TODO removal markers:
- `src/features/ladders/LaddersPage.tsx:1` — "Remove after disposition system is fully live"
- `src/features/today/LadderQuickLog.tsx:1` — same
- `src/features/today/TodayPage.tsx:168` — same

The disposition system IS live (`DispositionProfile.tsx` + `dispositionCache` on child docs). However, `LaddersPage` is still registered as a route at `/ladders` in `router.tsx`. **Removal requires:** (1) confirming no nav links point to `/ladders`, (2) removing the route, (3) removing `LadderQuickLog` from `TodayPage`. Not safe to auto-remove — needs a deliberate PROMPT_FIX run to trace all consumers. Mark as READY-FOR-FIX.

---

### 1.5 Drift since last audit

**No files grew >150L** since the 2026-05-29 seed audit. All large files are at +0. The Story Gen V2 Phase 2 / Monthly Review PRs merged immediately before the seed, so their growth is already counted in the baseline. No silent growth detected.

---

## Band 2 — Functional / UX Loop

### 2.1 FUNC-01 — "Where is Lincoln" (six truth surfaces)

| Surface | Collection | Written by | Read by | Can disagree with others? |
|---|---|---|---|---|
| **Skill Snapshot** | `skillSnapshots/{childId}` | eval apply (`EvaluateChatPage`), quest end (`useQuestSession`), curriculum scan (`useUnifiedCapture`), backfill script | plan, quest, disposition, shellyChat, weeklyReview AI tasks | Yes — updates come from 4 independent writers |
| **Working Levels** | Inside `skillSnapshots/{childId}.workingLevels` | Same writers as above + manual parent adjust | Plan task, Quest (starting level), Skill Snapshot UI | Yes — quest can update after eval without re-running eval |
| **Ladders** | `ladderProgress/{childId}` | `LaddersPage.tsx` (manual only) | Portfolio scoring (via `scoreArtifactsForPortfolio`), ladder UI | Yes — deprecated, not kept in sync with skillSnapshot |
| **Milestones** | Implicit — derived at render time in progress UI | Not written to Firestore | Progress → Milestones tab | N/A — computed not stored |
| **Learning Map** | `childSkillMaps/{childId}` | `updateSkillMapFromFindings` (scan → curriculum) | Learning Map UI, curriculum context in `scan` task | Yes — updated by scan only, not by eval |
| **Curriculum position** | `activityConfigs/{childId}` (position field) | `updateActivityPosition` (scan advance), planner setup | Quest (starting level via `workbookPaces` slice), planner, curriculum UI | Yes — scan advances position; eval does NOT advance position |
| **Disposition** | `children/{childId}.dispositionCache` | `DispositionProfile.tsx` AI generation (manual trigger) | Disposition UI, `shellyChat` context | Yes — regenerated on demand, lags behind recent data |

**The authority problem:** skillSnapshot is the closest to authoritative (most frequently updated, most widely consumed by AI tasks) but it contains two distinct signal types that disagree on different cadences: **working levels** (updated by every quest/eval) vs. **conceptual blocks** (updated by eval + scan + mastery chips) vs. **priority skills** (updated by eval apply only). The Learning Map tracks curriculum *mastery* independently from working levels in a way that's never reconciled with the skillSnapshot.

**Proposed authority hierarchy (design proposal — not implemented):**

1. **Primary authority: `skillSnapshots/{childId}`** — working levels, conceptual blocks, priority skills. Every other surface should derive from or defer to this.
2. **Curriculum position authority: `activityConfigs/{childId}`** — lesson numbering stays there. Plan task and quest already read it via `workbookPaces` slice.
3. **Learning Map authority: `childSkillMaps/{childId}`** — curriculum node mastery (separate concern from working levels). Already read by curriculum context slice.
4. **Ladders: deprecate** — disposition replaces it; nothing authoritative lives here.
5. **Disposition: cache** — AI-generated summary of skillSnapshot data. Not authoritative; regenerated on demand.

**The key missing piece:** when `updateSkillMapFromFindings` advances a curriculum skill node, it should also write-through to `skillSnapshots` conceptual blocks (marking ADDRESS_NOW blocks as RESOLVING). Currently the two systems don't communicate. This is the highest-leverage integration point.

**Options and trade-offs:**

| Option | Trade-off |
|---|---|
| A. Write-through from Learning Map to Skill Snapshot on scan | Clean authority chain. Risk: two writes per scan, possible race condition. |
| B. Derive skill snapshot blocks from Learning Map at read time | No sync issue. Risk: increases read cost for AI context loading. |
| C. Status quo — accept divergence, document it | Zero risk. Cost: AI gets inconsistent signals across tasks. |

**Recommendation:** Option A as a PROMPT_FIX proposal. Not auto-applied here.

---

### 2.2 Loop integrity trace

**Path: evaluation finding → skillSnapshot → plan → checklist → weekly review**

1. **Eval → skillSnapshot:** `EvaluateChatPage.handleSaveAndApply` calls `updateDoc` with `{ merge: true }` on skillSnapshots. Conceptual blocks are merged (not overwritten). ✓ Working.
2. **SkillSnapshot → plan:** `TASK_CONTEXT.plan` includes `skillSnapshot` slice. `applySnapshotSuggestions()` in `chatPlanner.logic.ts:198` applies skip/modify suggestions from the snapshot. ✓ Working.
3. **Plan → today checklist:** `handleApplyPlan` writes `dailyPlans` to Firestore; `TodayChecklist` reads from the active plan + rollover. Budget enforcement trims overflow. ✓ Working.
4. **Checklist → weekly review:** `assembleWeekContext` in `evaluate.ts` reads actual `dayLogs` for completion/minutes data. `TASK_CONTEXT.weeklyReview` loads `skillSnapshot` so the review sees current working levels. ✓ Working.

**The loop is intact for the core path.** No dead ends or silent drops in the primary evaluation→plan→execute→review cycle.

**One gap:** the weekly review reads `skillSnapshot` slices (working levels, blocks) but does NOT read `childSkillMaps` (Learning Map mastery). A child who mastered curriculum nodes via scan-advance gets no credit in the weekly review narrative unless a separate eval was run. Low-severity, confirmed dead end in the curriculum context.

---

### 2.3 Shelly's path — shame and friction points

| Step | Current behavior | Risk |
|---|---|---|
| Energy selector | Energy toggle (normal/mvd) on Today page; MVD halves the budget | ✓ No shame — clear framing |
| Plan generation | Compact setup for returning users; wizard for first-timers | ✓ Low friction |
| Bad day | MVD path available; deferred items shown/hidden toggle | ✓ Floor exists |
| Checklist | "N items deferred to fit today's schedule" (low-key wording) | ✓ No shame |
| Records compliance | `ComplianceDashboard.tsx:134` — "Core hours (Nh) are **tracking under** the 600h target" | ⚠️ Mild pressure — the no-judge copy pass (Design Pass v1 step 1) hasn't touched Records yet |
| Weekly review | AI uses anti-pressure language per system prompt | ✓ |
| Monthly review | Parent tone correction appended to system prompt | ✓ |

**One flag:** `ComplianceDashboard.tsx:133–134` still uses "tracking under" language in the compliance items list. The Design Pass v1 "no-judge copy pass" (step 1) scopes `features/today/`, `features/records/`, `features/avatar/` — this file IS in scope. Worth including in the no-judge pass.

---

### 2.4 Kid voice-first check

- `KidTodayView.tsx` — large tap targets, no typing required for core actions. ✓
- `KidChapterPool.tsx` — audio-first, no text entry. ✓
- `KidTeachBack.tsx` — audio recording primary. ✓
- `KidConundrumResponse.tsx` — audio recording. ✓
- `KidExtraLogger.tsx` — "Did extra work on your tablet?" — copy is fine; audio recording supported. ✓
- `UnifiedCaptureCard` (kid variant) — chip-required, +/- stepper, no text entry, audio-only note tab. ✓

No regressions in voice-first posture. Lincoln's Whisper integration is wired.

---

## Band 3 — Pedagogy & Ethos

### 3.1 Charter preamble coverage

The `CHARTER_PREAMBLE` constant from `contextSlices.ts` is confirmed to reach **12 of 17** task types. Five task types do **not** include the charter:

| Task type | Where handled | Charter? | Risk |
|---|---|---|---|
| `quest` | `tasks/quest.ts` | ❌ Explicitly omitted ("no charter, no enriched") | Medium — quest generates encouragement, question framing |
| `generateStory` | `tasks/generateStory.ts` | ❌ Not in context slice | Medium — generates content for kids to read |
| `reviseStory` | `tasks/reviseStory.ts` | ❌ Not in context slice | Low — revises existing content |
| `revisePage` | `tasks/revisePage.ts` | ❌ Not in context slice | Low — surgical page revision |
| `scan` | `tasks/scan.ts` | ❌ Not in context slice | Low — curriculum classification, not narrative |

**Finding ETHOS-01 (new):** The story generation trio (`generateStory`, `reviseStory`, `revisePage`) produces content children read and own. It has a `COPYRIGHT_BLOCK` but no charter values injection — no family-values filter on character behavior, conflict resolution, or language. `generateStory` uses `buildStoryPrompt` from `chat.ts` which has no `CHARTER_PREAMBLE`. Medium severity: kids are the primary audience for this output.

**Quest omission** is intentional per comment ("no charter, no enriched") and defensible (quest is diagnostic, not narrative). However, quest generates encouragement messages on correct/incorrect answers — those could benefit from the no-shame framing in the charter. Low-medium.

---

### 3.2 Pace/pressure language in prompts

Scanned all task handlers and `chat.ts` for banned vocabulary.

**One instance found:** `src/features/today/scanBlocker.ts:52`:
```ts
const evidence = `Scan of ${contentRef} identified ${s.skill} as challenging (${s.level}, behind snapshot)`
```
This string is written to Firestore as a conceptual block's `evidence` field and flows into AI prompts via `formatConceptualBlocks()` in `contextSlices.ts`. "behind snapshot" is the vocabulary the CLAUDE.md data-field audit queued (Design Pass v1 step 11). Not urgent (not kid-facing), but it seeds AI prompts with deficit framing for Lincoln's blockers.

No other pace/pressure language found in task handler system prompts.

---

### 3.3 Diamonds not scores

Confirmed: no numeric score displays on kid-facing quest UI. Charter audit (Sprint "Charter: Remove Quest Scores") was applied. Progress bar retained without numbers. ✓

Disposition-over-mastery framing confirmed in DispositionProfile.tsx and monthly review system prompt. ✓

---

## Band 4 — Data Integrity & Compliance

### 4.1 DATA-01 (compliance, time-sensitive — June 30 deadline)

**Status: UNCHANGED.** The divergence between `MonthlyTrend` and `computeHoursSummary()` is documented in code (comment at `MonthlyTrend.tsx:33–42`), in `HEALTH_REPORT.md`, and in the ledger. The fix has not been applied.

**Authoritative figure:** `computeHoursSummary()` = **598.73h core** for Lincoln.  
**Gap to MO 600-core line:** ~1.3h (approximately 80 minutes of core subjects needed before June 30, 2026).  
**MonthlyTrend over-count:** reads completed checklist estimated minutes instead of block actual minutes.

**Urgency is real:** June 30 is 32 days away. The fix proposal (route MonthlyTrend through per-month buckets from `computeHoursSummary`) is documented. This should be the **next PROMPT_FIX run**.

No new views added since last audit break the additive-hours invariant. `DraftReadyCard`, `WeekInEvidence`, `BookReviewChat` are all display-only.

---

### 4.2 DATA-02

Status: **NEEDS-DATA.** Requires live Firestore export to de-dupe `hoursAdjustments` on `(date, subject, minutes, reason)`. No change.

---

### 4.3 Additive-hours invariant — new surfaces check

Checked all surfaces added since the seed audit (Story Gen V2 Phase 2, Monthly Review v1.3–v1.6, Hero Hub Phase 1B, DraftReadyCard, WeekInEvidence):
- None write to `hoursCollection`, `hoursAdjustments`, or `dayLogs` checklist minutes.
- All are read-only display components or AI-generation functions.

**Invariant remains intact** on all new surfaces. ✓

---

## Summary of New and Updated Findings

| ID | Band | Status | Title | Evidence / location |
|---|---|---|---|---|
| **ARCH-01** | 1 | OPEN | `chat.ts` CF 2,466L; `buildQuestPrompt` 400+L | `functions/src/ai/chat.ts` — multiple independent prompt builders, no growth |
| **ARCH-02** | 1 | OPEN | `PlannerChatPage.tsx` 2,620L; ~1,700L interconnected state | `src/features/planner-chat/PlannerChatPage.tsx` |
| **ARCH-03** | 1 | OPEN | `BookEditorPage.tsx` 2,278L | `src/features/books/BookEditorPage.tsx` — section-bounded, low urgency |
| **ARCH-04** | 1 | OPEN | `useQuestSession.ts` 1,870L — 4 quest domains in one hook | `src/features/quest/useQuestSession.ts` |
| **ARCH-05** | 1 | OPEN | Main bundle 3.84MB / 1.13MB gzip, zero code-splitting | `router.tsx` — all routes eagerly imported; AvatarThumbnail blocks Three.js split |
| **ARCH-06** | 1 | OPEN | WorkbookConfig → ActivityConfig migration incomplete | `PlannerChatPage.tsx:295,898,978,1397,1399`; `firestore.ts:247`; workbookConfig refs grew to 34 |
| **ARCH-07** | 1 | READY-FOR-FIX | Ladder deprecation — 3 files with TODO markers; disposition system is live | `LaddersPage.tsx:1`, `LadderQuickLog.tsx:1`, `TodayPage.tsx:168`; `/ladders` route still active |
| **ARCH-08** | 1 | OPEN (new) | `AvatarThumbnail.tsx` imports Three.js; used in AppShell — blocks bundle splitting | `AppShell.tsx:15`, `ContextBar.tsx:14`, `ChildSelector.tsx:10`, `ProfileMenu.tsx:15` |
| **ARCH-09** | 1 | OPEN (new) | `ShellyChatPage.tsx` 1,653L — 23+ useState, image generation, thread management | `src/features/shelly-chat/ShellyChatPage.tsx` — defer until usage patterns stabilize |
| **TEST-01** | 1 | OPEN | `shelly-chat`, `progress`, `dad-lab` have 0 test files | Confirmed — propose `shellyChat.logic.test.ts` and `DispositionProfile.test.tsx` next |
| **FUNC-01** | 2 | OPEN | No authoritative source for "where is Lincoln" — 6 overlapping truth surfaces | skillSnapshot (closest to auth), childSkillMaps, activityConfigs, ladderProgress (deprecated), dispositionCache — no reconciliation |
| **FUNC-02** | 2 | **FIXED** | Scan → Skill Snapshot write-through landed (`b60c3d6`) | New `skillSnapshotWrites.ts` central writer wired into both scan paths (certificate + worksheet); additive/idempotent reducer + 17 tests. Inline-writer migration deferred to ARCH-12. |
| **ETHOS-01** | 3 | OPEN (new) | Charter preamble absent from 5/17 task types | `generateStory`, `reviseStory`, `revisePage`, `quest`, `scan` — story trio is highest concern |
| **DATA-01** | 4† | OPEN | `MonthlyTrend` over-counts core; Lincoln ~1.3h under MO 600-core (June 30 deadline) | `MonthlyTrend.tsx:48–63` vs `records.logic.ts:85–115`; fix documented, not applied |
| **DATA-02** | 4 | NEEDS-DATA | Possible duplicate backfill — 2025-07-15 & 2025-08-15 | Requires live Firestore export |
| **DOC-01** | 1 | OPEN | Claude.ai project still points at MASTER_OUTLINE v14 | This audit's loaded context is v15; repoint to `PROJECT_CONTEXT.md` |
| **LINT-01** | 1 | WONTFIX? | 3 `react-hooks/exhaustive-deps` warnings — intentional timer-ref pattern | `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679,1760` |

† DATA-01 promoted to top of queue — June 30 compliance deadline.

---

## Recommended PROMPT_FIX order

1. **DATA-01** — Fix MonthlyTrend to route through `computeHoursSummary`-compatible per-month aggregation. June 30 deadline. Touches additive-hours invariant; requires careful review.
2. **ARCH-07** — Remove ladder deprecation: `LaddersPage.tsx`, `LadderQuickLog.tsx`, and `TodayPage.tsx:168`. Disposition system is live. Route needs removing from `router.tsx`.
3. **ETHOS-01** — Add `CHARTER_PREAMBLE` to `generateStory`, `reviseStory`, `revisePage` context. Mechanical change; story trio should carry family values.
