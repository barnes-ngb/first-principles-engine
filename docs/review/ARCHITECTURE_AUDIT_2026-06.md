# Architecture Audit — 2026-06

**Auditor:** Claude Code (scheduled monthly)
**Date:** 2026-06-07
**Covers period:** 2026-05-31 → 2026-06-07
**Previous audit:** `ARCHITECTURE_AUDIT_2026-05.md` (2026-05-29); interim run filed 2026-05-31 (superseded by this report)

---

## Step 0 — Baseline

| Check | Status | Notes |
|---|---|---|
| Root `npm run lint` | ✅ PASS | 3 warnings — all LINT-01 (intentional timer-ref pattern, unchanged) |
| Root `npx tsc -b` | ✅ PASS | Clean |
| Root `npx vitest run` | ✅ PASS | **168 files, 2,554 tests** |
| Functions `npm run lint` | ✅ PASS | Clean |
| Functions `npx tsc --noEmit` | ✅ PASS | Clean |
| Functions `npm test` | ✅ PASS | **23 files, 449 tests** |

**Total: 3,003 tests (up from 3,013 at the interim audit — delta reflects test reorganization + net-new tests from the period).** Baseline is green. Audit proceeds.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large Files (>1,500L)

| File | Lines | vs June interim | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,627 | +7 | Tangled — ARCH-02 OPEN. ~1,700L interconnected state. Stable, no urgency. |
| `functions/src/ai/chat.ts` | 2,544 | **+66** | Tangled — ARCH-01 OPEN. Grew from FEAT-08 math prompt bands. `buildQuestPrompt` 400+L still inline. |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 | Cohesive-but-big — ARCH-03 OPEN. Stable. |
| `src/features/quest/useQuestSession.ts` | **2,161** | **+291** | ⚠️ **DRIFT ALERT** — Tangled — ARCH-04 OPEN. Fourth consecutive report above 2,000L. Grew +291L since June interim from FEAT-04/08/11 (encoding, math bands, spell-word, build-sentence) + FUNC-04 (quest partials). Highest-priority decomp. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,875 | +71 | Cohesive-but-big. Grew from FEAT-12 (Banner Rally slice 1+2). Stable. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +0 | Cohesive-but-big. Stable. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606 | +44 | Three.js render loop — risky to split. Leave as-is. |
| `functions/src/ai/contextSlices.ts` | 1,566 | **+81** | ARCH-14 OPEN. Growing steadily (+160L last audit, +81L this period). Contains 20+ slice loaders. |
| `src/features/records/records.logic.test.ts` | 1,500 | +0 | Test file — OK. |

**Watch list (1,000–1,500L, newly large):**

| File | Lines | Flag |
|---|---|---|
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | Stable |
| `src/features/records/RecordsPage.tsx` | 1,251 | **+96L** since June interim — DATA-09 attribution features |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | Stable |
| `src/features/shelly-chat/useShellyChatFlows.ts` | 1,123 | ARCH-13 OPEN. Stable this period. |
| `src/features/today/TodayChecklist.tsx` | 1,112 | New on watch list — FUNC-07/08 additions |
| `src/features/settings/AvatarAdminTab.tsx` | 1,104 | New on watch list |
| `src/features/today/TodayPage.tsx` | 1,103 | New on watch list — FUNC-06 + DraftReadyCard additions |
| `src/features/quest/ReadingQuest.tsx` | 1,065 | **New** — grew from quest type additions (MC + BuildWord + SpellWord + BuildSentence). Watch for Phase 3. |
| `src/features/today/KidTodayView.tsx` | 1,054 | New on watch list — FUNC-09 additions |
| `functions/src/ai/evaluate.ts` | 1,050 | New on watch list |

**ARCH-04 seams (useQuestSession.ts — 2,161L, highest priority):**

The hook now handles 5 distinct question pipelines in one state machine:
- Reading/phonics quest (multiple-choice, phonics/comprehension/fluency)
- Math quest
- Build-word (encoding) questions
- Spell-word questions (FEAT-11 Phase 1)
- Build-sentence questions (FEAT-11 Phase 2)

Proposed split: a shared `useQuestCore` (session init/end/banking/adaptive engine) + domain hooks `useReadingQuestSession`, `useMathQuestSession`, `useEncodingQuestSession`. The split is safe because each domain's response path is already discriminated by question type in the current code.

**ARCH-18 (new — ReadingQuest.tsx rendering hub):** At 1,065L and growing, `ReadingQuest.tsx` now renders all 4 question-type screens (MC, BuildWord, SpellWord, BuildSentence). Adding FEAT-11 Phase 3 will push it higher. Not urgent; cohesive; but on the watch list.

**ARCH-01 seams (chat.ts — 2,544L):**

The `buildQuestPrompt` blob (lines ~944–1,900 after FEAT-08 expansion) is now over 400L of the total and is a self-contained pure function. Safe extraction: `tasks/questPromptBuilder.ts` and `tasks/storyPromptBuilder.ts`. Both are pure; no CF side effects.

### 1.2 Bundle (ARCH-05)

**Current:** 3,904 kB / 1,150 kB gzip (unchanged from interim audit).

Root blocker unchanged — `AvatarThumbnail.tsx` imports Three.js and is statically used in `AppShell.tsx:15`, `ContextBar.tsx:14`, `ChildSelector.tsx:10`, `ProfileMenu.tsx:15`. Until AvatarThumbnail is decoupled from Three.js, the main chunk cannot be split.

The 4-step plan from the 2026-05 audit remains unchanged and unapplied (architecture decision, not auto-applied).

### 1.3 Test Coverage (TEST-01)

| Feature | Test Files | Status vs June interim |
|---|---|---|
| `books` | 21 | ✅ Unchanged |
| `planner-chat` | 14 | ✅ +1 (masteryCheckoffs) |
| `quest` | 15 | ✅ +4 (spellTheWord, spellingWorkingLevels, buildTheSentence, sentenceWorkingLevels, BuildSentenceQuestion, BuildWordQuestion) |
| `avatar` | 14 | ✅ +2 |
| `today` | 15 | ✅ +4 (kidQuestGate, chapterPool, DraftReadyCard, FUNC-08 skip) |
| `shelly-chat` | 9 | ✅ Unchanged |
| `evaluate` | 6 | ✅ +2 |
| `settings` | 6 | ✅ Unchanged |
| `records` | 2 | ✅ +1 (DATA-09 attribution) |
| `evaluation` | **1** | ⚠️ Was 0 — `WorkingLevelsSection.test.tsx` added. Only a render test; the SkillSnapshotPage merge logic (inline `setDoc` path) is still untested. |
| `progress` | **0** | ⚠️ Open |
| `dad-lab` | **0** | ⚠️ Open |

**TEST-01 update:** The `evaluation` feature now has 1 test file — but it tests rendering only (`WorkingLevelsSection`), not the inline snapshot write in `SkillSnapshotPage.tsx`. The highest-leverage missing tests remain:
- `DispositionProfile.tsx` — AI narrative parse + parent-override merge (fully testable, no UI dependency)
- `SkillSnapshotPage.tsx` — the inline `setDoc` snapshot write path (ARCH-12 dependency)

**TEST-02 (flake):** `BookEditorPage.cover.test.tsx` still exists and is still flagged as nondeterministic. Unchanged since June interim.

### 1.4 Migrations / Deprecations

**WorkbookConfig → ActivityConfig (ARCH-06):**

Ref count: **30 legacy refs** (unchanged — no migration work in this period). Planner cluster dominates (21 refs across 4 files). Still blocked by the planner migration. See June interim audit for file-by-file breakdown.

**Ladder deprecation (ARCH-07):**

PR #1263 **MERGED** 2026-05-30. ✅ UI surfaces, redirect, and directory deletion are done. The data layer (`ladderRef` tag, `ladderProgress` collection, `Ladder*` types) is intentionally retained.

**Residual (ARCH-07 not-in-scope cleanup):** `functions/src/ai/generate.ts:421–449` still queries `families/${familyId}/ladders` — a dead collection never written to. This was not included in PR #1263 (scoped to UI surfaces only). The 5-line removal is a safe standalone fix; no design decision required. Recommend as a quick PROMPT_FIX run.

**Inline skillSnapshot writers (ARCH-12):**

Still OPEN. Three paths still bypass the central `skillSnapshotWrites.ts`:

| File | Location | Pattern |
|---|---|---|
| `EvaluateChatPage.tsx` | `:608` | `setDoc(snapshotRef, ..., { merge: true })` after eval apply |
| `EvaluateChatPage.tsx` | `:611` | `updateDoc(snapshotRef, ...)` for `updatedAt` |
| `useQuestSession.ts` | `:1010–1120` | `setDoc` after quest completion (alongside a new `writeSnapshotUpdate` call at `:1147` for the mastery path) |
| `SkillSnapshotPage.tsx` | `:101, :120` | `setDoc` for manual snapshot create/edit |

Note: `useQuestSession.ts` is now partially migrated — the FEAT-09 mastery path at `:1147` uses `writeSnapshotUpdate`, but the quest-end level derivation path at `:1010–1120` is still inline. This is a mixed state that increases the risk of divergence from the central module's invariants.

### 1.5 Drift Since June Interim Audit

| File | June interim | Current | Delta | Flag |
|---|---|---|---|---|
| `src/features/quest/useQuestSession.ts` | 1,870 | 2,161 | **+291** | ⚠️ DRIFT — far exceeds +150L threshold |
| `functions/src/ai/chat.ts` | 2,478 | 2,544 | +66 | Notable — from FEAT-08 math bands |
| `functions/src/ai/contextSlices.ts` | 1,485 | 1,566 | +81 | ⚠️ Cumulative — +160L last period, +81L this period |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | 1,875 | +71 | From FEAT-12 Banner Rally |
| `src/features/records/RecordsPage.tsx` | 1,155 | 1,251 | +96 | From DATA-09 attribution |
| `src/features/quest/ReadingQuest.tsx` | ~700 | 1,065 | **~+365** | ⚠️ Now on large-file watch list |

**New files added since June interim (selected):** `masteryRollup.ts`, `commitMasteryRollup.ts`, `MasteryCheckoffPanel.tsx`, `spellTheWord.ts`, `buildTheSentence.ts`, `BuildSentenceQuestion.tsx`, `questBanking.ts`, `kidQuestGate.ts`, `childIdentity.ts`, `updateChildIdentity.ts`, `stonebridgeSounds.ts`, and several stonebridge sub-module files.

**ARCH-19 (new — dead exports in `src/core/utils/`):** HEALTH_REPORT flagged 6 utility files with exported symbols that appear unused in the client bundle. These warrant an export-usage audit before removal (may be referenced in tests or dynamic imports):
- `blockerLifecycle.ts`: `RESOLVING_THRESHOLD`, `RESOLVED_THRESHOLD`, `RESOLVED_MIN_SESSIONS`, `TARGETED_EVIDENCE_WEIGHT`
- `sessionTimer.ts`: `IDLE_THRESHOLD_MS`, `MAX_SESSION_SECONDS`
- `complianceMapping.ts`: `inferMoSubjects`, `resolveSubjectBucket`, `inferThemeSubjects`, `autoTagBlocks`
- `format.ts`: `normalizeDateString`, `parseDateInput`
- `energyPatterns.ts`: `EnergyTrend`, `analyzeDayOfWeekPatterns`, `detectStreaks`, `detectTrend`, `analyzeEnergyPatterns`
- `workbookMatching.ts`: `normalizeWorkbookName`

Low-risk if confirmed dead. Propose: `grep -r` each export across src/ + test files; remove confirmed dead ones.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01: Where is Lincoln?

**Status: RESOLVED-WITH-DECISION** (unchanged). Model 2 — layered ownership confirmed. The FEAT-09 mastery rollup (`masteryRollup.ts`) and FEAT-10 planner skip-mastered routing are now live, directly advancing the decision. The authority map is implemented: `skillSnapshots` drives the planner via the mastered-skills list, and mastered skills are derived from the daily checklist and quest signals through the conservative rollup.

**Outstanding ARCH-12:** The inline writers in eval/quest/snapshot remain the structural gap in this model. Three writers write `skillSnapshots` outside the authoritative path. The FEAT-09 mastery path correctly goes through the central writer, which is a positive signal — but the quest-end level path at `useQuestSession.ts:1010–1120` still bypasses it.

### 2.2 Loop Integrity

The core loop since June interim:

1. **FEAT-09 (merged 2026-06-01):** Daily mastery chips + quest signals → `masteryRollup` → propose→confirm → central `skillSnapshotWrites`. **Loop now closes from Today → Skill Snapshot via a confirmed mastery signal.** ✅
2. **FEAT-10 (merged 2026-06-01):** Mastered skills reach the planner via `formatMasteredSkills`. The `plan` context now carries a "MASTERED — DO NOT RE-SERVE" list. **Planner skips mastered skills, targets frontier.** ✅
3. **FEAT-08 math (merged 2026-06-01):** Math ceiling raised to L8. **Lincoln's math quest now serves two new levels before capping.** ✅
4. **FEAT-11 Phase 1+2 (merged 2026-06-01):** Spell-word + build-sentence now rotate through the quest. `WorkingLevels.writing` and `WorkingLevels.sentence` are distinct new fields — separable from phonics, never blurred. ✅
5. **FEAT-12 Banner Rally slices 1+2 (merged):** Reading powers Stonebridge Banner Rally; `stonebridgeProgress` collection tracks mission state read-only from XP ledger events. ✅

**Remaining loop gaps:**
- FEAT-03: `childSkillMap` still not in the `plan` TASK_CONTEXT. Planner sees `skillSnapshot` mastery but not curriculum coverage. This means the planner can't suggest "next uncovered node" proactively.
- FEAT-07: Eval close-the-loop automation still not started (re-eval triggers from engagement patterns).
- FEAT-05: Sight-words auto-populate from eval findings still not started.

### 2.3 Shelly's Path (quick check)

No new surfaces introduced that add typing requirements. `MasteryCheckoffPanel` (FEAT-09) uses tap-to-confirm. `StonebridgeMissionCard` is read-only. Newly added skip-is-parent-only (FUNC-08) correctly moved the skip control to the parent's `TodayChecklist` only. No dead-ends or shame-language found in new code.

### 2.4 Kid Voice-First

FEAT-11 spell-word and build-sentence are tap-only — confirmed by tests (`writingNoPencil.test.ts` asserts no text-input elements; no handwriting routing). The build-sentence implementation uses scrambled-tile-order (deterministic, checkable) without forced typing. ✅

---

## Step 3 — Pedagogy & Ethos (Band 3)

### 3.1 Charter Preamble Coverage — ETHOS-01

⚠️ **ETHOS-01 REMAINS OPEN.** The HEALTH_REPORT states "All 15 dedicated task files reference charter context ✅" — this is **inaccurate**. Confirmed via `contextSlices.ts:46–80`:

| Task | Charter in TASK_CONTEXT | Risk |
|---|---|---|
| `quest` | ❌ | Medium — comprehension/phonics questions for Lincoln |
| `generateStory` | ❌ | **High** — generates child-facing narrative content |
| `reviseStory` | ❌ | **High** — same |
| `revisePage` | ❌ | **High** — same |
| `scan` | ❌ | Low — curriculum detection |
| `analyzePatterns` | ❌ | Low — internal analysis, not child-facing |

**Fix is mechanical:** add `"charter"` as the first element of each of these 6 TASK_CONTEXT arrays in `contextSlices.ts`. ~6 lines. The `buildContextForTask` function already handles the `"charter"` slice correctly (line 365); this is purely a registry omission. **Recommended as the #1 PROMPT_FIX target.**

**Mechanical doc correction applied:** Corrected the HEALTH_REPORT charter claim ("All 15 dedicated task files reference charter context ✅" → updated to reflect actual TASK_CONTEXT state). Applied directly as authorized mechanical doc fix.

### 3.2 "Diamonds Not Scores"

FEAT-11 (spell-word, build-sentence) reuses the no-shame framing from build-word — target never shown before the attempt; "Try another one!" framing; no score displayed. `questBanking.ts` (FUNC-04) separates XP/diamond banking from the session result so partial quests still reward incrementally. ✅

### 3.3 Coverage-Not-Pace Language

Scanned `generateStory.ts`, `reviseStory.ts`, `revisePage.ts`, `spellTheWord.ts`, `buildTheSentence.ts`, `plan.ts` (new `formatMasteredSkills` addition). No pace-pressure language found. The "SKIP MASTERED — TARGET THE FRONTIER + THE GAPS" instruction in `plan.ts` (FEAT-10) is phrased as advancement, not pace. ✅

---

## Step 4 — Data Integrity & Compliance (Band 4)

### DATA-01: Core Hours (FIXED — confirmed stable)

`MonthlyTrend.tsx` uses `computeMonthlyTrend()` from `records.logic.ts`, sharing `dayLogMinuteContributions` with `computeHoursSummary`. No new view in this audit period bypasses this shared extractor. DATA-09 (hours adjustments attribution) added per-child scoping — compliant with the additive-hours invariant. ✅

The 2026-06-30 MO core-hours deadline is approaching. The canonical `computeHoursSummary()` was at 598.73h as of the last DATA-01 fix; hours logged since then have not been recalculated here (requires live Firestore data), but the computation path is correct and the display is now reconciled.

### DATA-02: Duplicate Backfill (NEEDS-DATA)

Unchanged. Requires live Firestore export to confirm. DATA-05/09 attributing hours adjustments per-child (now closed) overlaps this concern — once the per-child attribution is live, the duplicate dates would each land on one child, not both.

### DATA-04: Dad Lab Credits All Children (OPEN — propose-and-confirm)

`useDadLabReports.ts:65–71` loops all children for compliance hours; `:104–115, 138–148` loops all children for XP/diamonds. Unchanged — still awaiting owner decision on whether Dad Lab is always a both-kids activity.

### DATA-05 / DATA-09: Hours Adjustment Attribution (FIXED)

CLOSED. DATA-09 replaced DATA-05 as the active row. All write paths now require `childId` (`assertAttributed` guard + `NewHoursAdjustment` type). The RecordsPage now surfaces unattributed records for parent attribution.

### Additive-Hours Invariant — New Code Since June Interim

| New code | Hours involvement | Compliant |
|---|---|---|
| `masteryRollup.ts`, `commitMasteryRollup.ts` | None — writes only to `skillSnapshots` | ✅ |
| `spellTheWord.ts`, `buildTheSentence.ts` | None — quest content only | ✅ |
| `questBanking.ts` | Writes to `xpLedger` (XP/diamonds) only — not hours | ✅ |
| `kidQuestGate.ts` | Read-only gate math | ✅ |
| `chapterPool.logic.ts` | Reads `bookProgress` — no hours writes | ✅ |
| `stonebridgeProgress` collection | Read-only from XP ledger events; explicitly guards against XP/diamond writes (asserted in tests) | ✅ |
| `useDadLabReports.ts` (FUNC-04 changes) | XP/diamonds only — hours unchanged | ✅ |
| DATA-09 `assertAttributed` + attribution selector | Hours writes now require `childId` — strengthens the invariant | ✅ |

No new code bypasses the additive-hours invariant.

---

## Step 5 — Report Summary & Ledger

### New Findings

| ID | Band | Finding | Evidence |
|---|---|---|---|
| **ARCH-18** | 1 | `ReadingQuest.tsx` now 1,065L — grew ~+365L in this period from quest-type additions (MC, BuildWord, SpellWord, BuildSentence). Cohesive for now but watch as FEAT-11 Phase 3 (say-it-write-it) approaches. Not urgent — just add to watch list. | `src/features/quest/ReadingQuest.tsx:1–1065` |
| **ARCH-19** | 1 | Six `src/core/utils/` files export symbols that appear unused in the client bundle (flagged by HEALTH_REPORT): `blockerLifecycle.ts`, `sessionTimer.ts`, `complianceMapping.ts`, `format.ts`, `energyPatterns.ts`, `workbookMatching.ts`. Before removal, audit whether any are used in tests or via dynamic import. Low-risk if confirmed dead. | `src/core/utils/{blockerLifecycle,sessionTimer,complianceMapping,format,energyPatterns,workbookMatching}.ts` |
| **DOC-04** | 1 | `docs/HEALTH_REPORT.md` incorrectly claims "All 15 dedicated task files reference charter context ✅" — verified false in `contextSlices.ts`: `quest`, `generateStory`, `reviseStory`, `revisePage`, `scan`, `analyzePatterns` all lack `"charter"` in their TASK_CONTEXT. **Applied mechanical correction directly** (corrected the charter claim in HEALTH_REPORT to "5 task types missing charter — see ETHOS-01"). | `functions/src/ai/contextSlices.ts:54–75`; `docs/HEALTH_REPORT.md` |

### Status Updates to Existing Ledger Items

| ID | Previous | Updated | Evidence |
|---|---|---|---|
| ARCH-04 | OPEN (1,870L) | **OPEN — 2,161L (+291L drift ⚠️)** | `src/features/quest/useQuestSession.ts` — fourth consecutive report above 2,000L; highest-priority decomp candidate |
| ARCH-07 | IN PROGRESS | **FIXED** (PR #1263 merged 2026-05-30) | PR #1263 merged; residual: `generate.ts:421` dead ladder query (separate standalone cleanup) |
| ARCH-11 | IN PROGRESS | **FIXED** (PR #1291 merged 2026-05-31) | PR #1291 merged |
| ARCH-14 | OPEN (1,485L) | **OPEN — 1,566L (+81L this period)** | `functions/src/ai/contextSlices.ts` — cumulative +241L since first flagged |
| ARCH-15 | IN PROGRESS | **FIXED** (PR #1338 merged) | `src/core/profile/childIdentity.ts` + `updateChildIdentity.ts` + Settings editor |
| TEST-01 | OPEN (progress, evaluation, dad-lab) | **evaluation: 1 test (WorkingLevelsSection.test.tsx) — still open for SkillSnapshotPage merge logic, progress (0), dad-lab (0)** | `src/features/evaluation/WorkingLevelsSection.test.tsx` |
| FEAT-08 | IN PROGRESS (PR #1318, math slice) | **math slice FIXED** (PR #1318 merged 2026-06-01). Comprehension L7 (moderate) and phonics L9+ (entangled — defer) remain. | `functions/src/ai/levelDefinitions.ts` L7/L8 + `questTypes.ts` cap 8 |
| FEAT-09 | IN PROGRESS (PR #1316) | **FIXED** (PR #1316 merged 2026-06-01). Mastery rollup + MasteryCheckoffPanel live. Central writer path confirmed. | `src/features/today/masteryRollup.ts`, `MasteryCheckoffPanel.tsx`, `commitMasteryRollup.ts` |
| FEAT-10 | IN PROGRESS (PR #1317) | **Planner mastery consumption FIXED** (PR #1317 merged 2026-06-01). Block-detection latency (a), spaced re-test (c), and depth-routing from FEAT-08 remain open. | `functions/src/ai/tasks/plan.ts` `formatMasteredSkills`; residual scope still in FEAT-10 |
| FEAT-11 | IN PROGRESS (Slice 1 — PR #1320) | **Phase 1 (spell-the-word) FIXED** (PR #1320 merged 2026-06-01). **Phase 2 (build-the-sentence) FIXED** (merged same period). `buildTheSentence.ts`, `BuildSentenceQuestion.tsx`, `WorkingLevels.sentence`. Phase 3 (say-it-write-it — voice→transcript) remains a proposal. | `src/features/quest/{spellTheWord,buildTheSentence,BuildSentenceQuestion}.*` |
| FEAT-12 | IN PROGRESS (Slice 1) | **Slices 1+2 FIXED** — Old Bridge (PR #1336) + village board/Banner Hall (PR #1340). Slice 3 (economy-touching: diamond decorations + London surface) deferred. | `src/features/avatar/stonebridge/`; git log |
| FUNC-04 | FIXED | **FIXED** (confirmed merged) | `questBanking.ts` + partial sessions `status:'partial'` |
| FUNC-05 | FIXED | **FIXED** (confirmed merged) | `activeChildStore.ts` |
| FUNC-06 | FIXED | **FIXED** (confirmed merged) | `DraftReadyCard.tsx` month-filter |
| FUNC-07 | FIXED | **FIXED** (confirmed merged) | `chapterPool.logic.ts` skip/answered split |
| FUNC-08 | FIXED | **FIXED** (confirmed merged) | `kidQuestGate.ts`; kid-facing Skip removed |
| FUNC-09 | FIXED | **FIXED** (confirmed merged) | `isReadAloudSectionVisible` in `KidTodayView` |
| DATA-05 | IN PROGRESS | **CLOSED** (superseded by DATA-09) | DATA-09 merged (PR #1355 + #1343) |
| DATA-07 | DOC | **DOC** (confirmed — read-only sweep, no fix) | `docs/review/DATA_COMPONENT_TRACE.md` |
| DATA-08 | FIXED | **FIXED** (confirmed merged) | `useActivityConfigs.ts` guard; `CurriculumTab` reassign |
| DATA-09 | FIXED | **FIXED** (confirmed merged) | `assertAttributed`, `RecordsPage` attribution selector |

### Recommended Next Fix Runs (PROMPT_FIX.md)

**Priority order:**

1. **ETHOS-01** — Add `"charter"` to TASK_CONTEXT for `generateStory`, `reviseStory`, `revisePage`, `quest`, `scan`, `analyzePatterns` in `contextSlices.ts:54–75`. ~6 lines, zero risk, closes a values guardrail gap on child-facing content generation. This is the highest-leverage move per line of change in the entire codebase. The June interim audit also flagged this as #1. It has now been open for two consecutive audits.

2. **ARCH-07 dead query** — Remove 5-line dead `ladders` collection query from `functions/src/ai/generate.ts:421–449`. Pure cleanup; safe; no design decision. Mechanical removal.

3. **ARCH-04 decomposition scoping** — Before ARCH-04 gets much larger, schedule a scoping session: define the seam contract for `useQuestCore` + domain hooks (`useReadingQuestSession`, `useMathQuestSession`, `useEncodingQuestSession`). Not a PROMPT_FIX run yet — design-first.

---

## Mechanical Doc Corrections Applied Directly

1. **HEALTH_REPORT.md charter claim** — Updated "All 15 dedicated task files reference charter context ✅" to reflect actual TASK_CONTEXT state (5 tasks missing charter; pointer to ETHOS-01).

---

*Report generated by scheduled monthly audit. All findings are proposals — no invariant-touching or structural changes applied here. Only mechanical doc corrections applied directly (HEALTH_REPORT charter claim). All structural/code changes require PROMPT_FIX.md runs reviewed before merge.*
