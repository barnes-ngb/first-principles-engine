# Code Health Report — 2026-07-13

## Metrics

| Metric | Value | Change from last report (2026-07-06) |
|--------|-------|--------------------------------------|
| **Total lines** | **205,891** | +2,977 |
| **Commits** | **185** | +19 (shallow-clone HEAD depth in this sandboxed environment, not full repo history — see note below) |
| **Test files** | **248** | +12 |
| **Tests passing** | **3,459** | +156 |
| **Tests total** | **3,459** | 0 skipped, 0 failing |
| **Firestore collections** | **43** | +0 |
| **Cloud Functions** | **26** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,080 kB / 1,208 kB gzip** | +11 kB / +4 kB gzip |

> **Note on "Commits":** `git rev-list --count HEAD` in this run's environment returns the depth of a shallow clone, not the true repository history (PR numbers visible in `git log` already exceed #1500). This has been true for every prior audit run — the metric tracks shallow-clone depth consistently, not real commit count. Treat this row as directionally informative only.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in ~14.6s (root `node_modules`/`functions/node_modules` were not present at session start — installed via `npm ci` in both; not a code issue, noted for completeness) |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-07-06); `eslint --fix` made no changes |
| **Tests** | ✅ PASS | 3,459 passing, 0 skipped, 0 failing (248 test files) |
| **TypeScript** | ✅ PASS | `npx tsc -b` clean |
| **npm audit (prod, root)** | ✅ CLEAN | 0 production vulnerabilities |
| **npm audit (prod, functions)** | ⚠️ 8 MODERATE | Same `firebase-admin` dependency chain as last cycle; requires a major bump — architectural decision, no fix applied (all low/moderate, per policy) |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 202,914 | 205,891 | ⚠️ DRIFT +1.5% — **AUTO-FIXED** |
| Commits | 166 | 185 | ⚠️ DRIFT +11.4% (shallow-clone metric, see note above) — **AUTO-FIXED** |
| Test files | 236 | 248 | ⚠️ DRIFT +5.1% — **AUTO-FIXED** |
| Firestore collections | 43 | 43 | ✅ OK |
| Cloud Functions | 26 | 26 | ✅ OK (verified by hand — see script note below) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

> **Script note:** the standard one-liner for counting Cloud Functions (`grep -oP 'export \{ \K[^}]+' functions/src/index.ts | tr ',' '\n' | ...`) undercounts by 5 (returns 21, not 26) because `functions/src/index.ts` has one multi-line `export { ... }` block (the 5 `monthlyReview.ts` functions, lines 9–15) that a single-line-anchored `grep -oP` pattern can't see. Manually counting every named export across all `export {...} from` statements gives 26, which matches `CLAUDE.md` / `MASTER_OUTLINE.md` exactly — **no doc drift**, but the audit one-liner should be fixed for future cycles to avoid a false CF-count alarm.

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06 |
| `foundations.ts` | **NEW** — `CLAUDE.md`'s Project Structure entry for `src/core/foundations/` lists a file named `foundations.ts` that does not exist; the actual barrel file is `index.ts` (see `src/core/foundations/index.ts`). Not auto-fixed — filename correction isn't covered by the mechanical fix rules; needs a human/dedicated pass. |

### Nav Accuracy

`AppShell.tsx`'s parent and kid nav arrays match `MASTER_OUTLINE.md`'s Navigation line exactly, including item order. ✅ No drift.

### Unindexed Docs

✅ All docs in `docs/` are indexed in `DOCUMENT_INDEX.md` (the `docs/archive/*.md` files are intentionally covered by the index's generic `archive/01–07_*.md` + `archive/` catch-all rows, not individually).

### Stale Docs

All docs marked CURRENT were updated within the last 30 days. ✅ No stale docs flagged.

### Task Type / Collection / CF Coverage

No new gaps this cycle — the 2026-07-06 audit already closed the Barnes Bros / Learner Model / Foundations Review / Today Help Card doc-lag cluster. `SYSTEM_PROMPTS.md`, `CLAUDE.md`, `tasks/index.ts`, `firestore.ts`, and `functions/src/index.ts` are all in sync.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 2,757 | `src/features/planner-chat/PlannerChatPage.tsx` | +12 |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,215 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,103 | `src/features/books/BookEditorPage.tsx` | +0 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,733 | `src/features/records/records.logic.test.ts` | +0 (test file) |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,287 | `src/features/today/TodayChecklist.tsx` | **+118** |
| 1,269 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +11 |
| 1,123 | `src/features/today/TodayPage.tsx` | +10 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,065 | `functions/src/ai/evaluate.ts` | +0 |
| 1,055 | `src/features/today/KidTodayView.tsx` | +0 |
| 1,052 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,046 | `src/core/types/planning.ts` | new to this table |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |
| 1,014 | `src/features/books/BookshelfPage.tsx` | +0 |

---

## Decomposition Candidates

No files crossed 2,000 lines for the first time this cycle — all four files already above that line were already tracked as KNOWN in `CLAUDE.md`'s Known Technical Debt section.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,757 | KNOWN — state management ~1,700L, complex interconnected state. +12 growth this cycle, continuing a multi-cycle upward trend. Worth a decomposition pass before it compounds further. |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage decomposition target. No growth this cycle. |
| `useQuestSession.ts` | 2,215 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth this cycle. |
| `BookEditorPage.tsx` | 2,103 | KNOWN — handlers interleaved but clear section boundaries. Stable this cycle. |

**Watch list:** `TodayChecklist.tsx` grew +118 lines this cycle (1,169 → 1,287) — the largest single-cycle jump of any file this run. Still well under the 2,000-line decomposition threshold, but worth a look before it compounds.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 202,914→205,891; Commits 166→185; Test files 236→248.
- Verified build + `tsc -b` + full test suite (3,459 tests) still pass after the stat fix (doc-only change, no product code touched).
- Ran `npm run lint -- --fix`: no auto-fixable issues found (0 file changes); the 3 pre-existing warnings require dependency-array judgment calls and were left as-is.
- `npm audit` (root + functions, production scope): confirmed clean / low-priority-only (root prod 0 vulnerabilities; functions prod 8 moderate, all requiring the same major `firebase-admin` bump as last cycle) — no fix needed or applied per policy (HIGH/CRITICAL-only trigger for `npm audit fix`).

### Needs Human Attention

- **`CLAUDE.md` Project Structure entry for `src/core/foundations/`** lists a file `foundations.ts` that doesn't exist — the barrel file is actually `index.ts`. Cosmetic inaccuracy, not covered by the mechanical fix rule set (no rule for correcting an existing-but-wrong filename mention); needs a human/dedicated pass.
- **`docs/SYSTEM_PROMPTS.md` Section 4 prose gap (carried over, unchanged):** 7 task types (`reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`) still have no dedicated "Task Handlers" write-up. Registry/model-table/slice-mapping entries are complete and accurate; the prose write-ups need a human/dedicated pass.
- **Remaining `firebase-admin` vulnerabilities (8–10 moderate/low depending on prod/dev scope, root + functions):** trace to a vulnerable `uuid` transitively via `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`. Full fix requires `firebase-admin@14.1.0`, a breaking major version bump — architectural decision, left for human review. Unchanged from last cycle.
- **Bundle size 4,080 kB (1,208 kB gzip), +11 kB since last report:** heaviest imports unchanged — Three.js (avatar), jsPDF (print), curriculum map data. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:812`, `useQuestSession.ts:2080` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **`PlannerChatPage.tsx` still trending upward:** +12L this cycle, continuing a multi-cycle growth trend. Not urgent but worth a decomposition pass before it compounds further.
- **`TodayChecklist.tsx` +118L this cycle (1,169→1,287):** the biggest single-cycle jump this run. Still far under the 2,000-line threshold; flagged for awareness, not urgent.
- **Dead-export scan (partial — sampled ~80 files under `src/core`, capped per time budget, not the full tree):** 20 possibly-dead exports flagged by a grep-based heuristic (no usage found outside the defining file). **Not removed** — a static grep pass can miss re-exports, dynamic imports, and test-only usage, so these need manual verification before any deletion:
  `EvidenceKind`, `SynthesisVehicle` (`types/learnerModel.ts`); `emptyLabBeat` (`types/dadlab.ts`); `WorkingLevelSource`, `QuestOutcome` (`types/evaluation.ts`); `subjectBucketSchema`, `engineStageSchema`, `evidenceTypeSchema`, `dayBlockTypeSchema`, `checklistItemSchema`, `dayBlockSchema`, `artifactTagsSchema`, `artifactSchema`, `dayLogSchema`, `weekPlanSchema` (`types/zod.ts`); `resolveBookCreator` (`types/books.ts`); `CardDifficulty` (`types/workshop.ts`); `PIECE_POSITIONS` (`types/xp.ts`); `SUPPORT_LEVEL_ORDER`, `PlannerSessionStatus` (`types/enums.ts`). Run a full-tree scan standalone if wanted — this cycle only covered a sample of `src/core`.
- **Audit script note:** the Phase-1 Cloud Functions one-liner undercounts (21 vs true 26) because it can't see the multi-line `export { ... }` block in `functions/src/index.ts`. No doc drift resulted (CLAUDE.md/MASTER_OUTLINE.md already say 26, verified correct by hand), but the one-liner itself should be fixed before the next cycle to avoid a false alarm.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`.

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 26 | books |
| 24 | today |
| 16 | quest |
| 15 | avatar |
| 14 | planner-chat |
| 11 | settings |
| 11 | shelly-chat |
| 9 | dad-lab |
| 8 | evaluate |
| 5 | foundations-review |
| 4 | records |
| 3 | evaluation |
| 2 | business |
| 2 | monthly-review |
| 2 | workshop |
| 1 | engine |
| 1 | progress |
| 1 | weekly-review |
| 0 | ui-preview *(dev-only gallery — ok)* |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | auth |

No change in the 0-test feature set since last report: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only).

---

## Dependency Notes

- **npm audit (production, root):** ✅ 0 vulnerabilities
- **npm audit (all, root):** 9 vulnerabilities (1 low, 8 moderate) — all trace to the `firebase-admin` dependency chain, need a major-version bump
- **npm audit (production, functions):** 8 moderate — same chain
- **npm audit (all, functions):** 10 moderate — same chain
- **Major version updates available (not applied — architectural decisions):** `firebase-admin` 13.10.0 → 14.1.0 (would clear remaining audit findings), `@mui/material`/`@mui/icons-material` 7.3.9 → 9.2.0, `three` 0.128.0 → 0.185.1 (+ matching `@types/three`), `eslint` 9.39.4 → 10.6.0, npm 10.9.7 → 12.0.1
