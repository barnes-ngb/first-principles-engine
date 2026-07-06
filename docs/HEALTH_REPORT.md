# Code Health Report — 2026-07-06

## Metrics

| Metric | Value | Change from last report (2026-06-13) |
|--------|-------|--------------------------------------|
| **Total lines** | **202,914** | +23,700 |
| **Commits** | **166** | +47 (shallow-clone HEAD depth in this sandboxed environment, not full repo history — see note below) |
| **Test files** | **236** | +34 |
| **Tests passing** | **3,303** | +298 |
| **Tests total** | **3,303** | 0 skipped, 0 failing |
| **Firestore collections** | **43** | +6 |
| **Cloud Functions** | **26** | +1 |
| **Chat task types** | **21** | +2 |
| **Routes** | **36** | +2 |
| **Bundle size** | **4,069 kB / 1,204 kB gzip** | +153 kB / +48 kB gzip |

> **Note on "Commits":** `git rev-list --count HEAD` in this run's environment returns the depth of a shallow clone, not the true repository history (PR numbers visible in `git log` already exceed #1500, so full history is far larger). This has apparently been true for every prior audit run too — the metric has tracked shallow-clone depth consistently across reports, not real commit count. Treat this row as directionally informative only.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in ~14s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-06-13) |
| **Tests** | ✅ PASS | 3,303 passing, 0 skipped, 0 failing (236 test files) |
| **TypeScript** | ✅ PASS | `npx tsc -b` clean |
| **npm audit (prod, root)** | ✅ CLEAN | 0 production vulnerabilities after fix (see Auto-Fixed below) |
| **npm audit (prod, functions)** | ⚠️ 9 MODERATE | Was 1 critical + 6 high + 14 moderate/low before fix; all remaining require a `firebase-admin` major bump |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 201,422 | 202,914 | ⚠️ DRIFT +1,492 — **AUTO-FIXED** |
| Commits | 161 | 166 | ⚠️ DRIFT +5 (shallow-clone metric, see note above) — **AUTO-FIXED** |
| Test files | 231 | 236 | ⚠️ DRIFT +5 — **AUTO-FIXED** |
| Firestore collections | 43 | 43 | ✅ OK |
| Cloud Functions | 25 | 26 | ⚠️ ERROR — missing `generateLearnerSynthesisNow` (FEAT-57) — **AUTO-FIXED** |
| Chat task types | 21 | 21 | ✅ OK (header stat was already correct — see internal inconsistency below) |
| Routes | 36 | 36 | ✅ OK |

> **Internal inconsistency found and fixed:** `MASTER_OUTLINE.md`'s own stats header already said "Chat task types: 21" (correct), but two places further down the same document (the AI Context Pipeline section and the Key Files Reference table) said "17 total" / "(17 task types)" and listed only 17 of the 21 names — missing `foundationsReview`, `bookLookup`, `lessonVideo`, `helpCard`. Both auto-fixed to 21 with the full name list.

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06 |

No new missing file references.

### Nav Accuracy

`AppShell.tsx` has a `Barnes Bros` nav item (`/business`) in **both** the parent and kid nav arrays that `MASTER_OUTLINE.md`'s Navigation line was missing entirely — the business feature (FEAT-29/30) shipped without a doc update. **AUTO-FIXED**: both nav lines updated to match `AppShell.tsx` exactly, including item order (`Settings` before `Ask AI` in the parent nav, which the doc had reversed).

### Unindexed Docs

✅ All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`.

### Stale Docs

All docs marked CURRENT were updated within the last 30 days. ✅ No stale docs flagged.

### Task Type / Collection / CF Coverage

Found a cluster of related drift, all stemming from four features that shipped without doc updates: the Barnes Bros business tab (FEAT-29/30), the Learner Model synthesis pilot (FEAT-57), the Foundations Review Chat (FEAT-51), and the Today Help Card (FEAT-43).

**Auto-fixed in `CLAUDE.md`:**
- Cloud Functions header `(25 exported)` → `(26 exported)`; added `generateLearnerSynthesisNow` to the list
- Firestore Collections table: added 6 missing rows — `conceptArcs`, `helpCards`, `learnerModels`, `learnerReviewSessions`, `businessLog`, `businessGoals`
- Chat task registry comment `19 task types` → `21 task types`; added `foundationsReview` + `helpCard` to the `chat` CF's task list and the Cloud Functions Structure task-handler list
- Project Structure: added missing directory entries for `src/features/business/`, `src/features/foundations-review/`, `src/core/foundations/`, `src/core/compliance/`
- `src/core/types/` line: added `business.ts`, `learnerModel.ts` (both existed, neither was listed)

**Auto-fixed in `docs/SYSTEM_PROMPTS.md`:**
- Task Dispatch Flow diagram + Model Selection table: added `foundationsReview` → `handleFoundationsReview` and `helpCard` → `handleHelpCard`
- Standalone Cloud Functions table: added 7 missing rows — `generateLearnerSynthesisNow`, `generateMonthlyReview`, `generateMonthlyReviewNow`, `publishMonthlyReview`, `unpublishMonthlyReview`, `auditMonthlyReviewSources`, `fileFeatureRequests`
- Task → Slice Mapping table: added 4 missing rows — `bookLookup`, `lessonVideo`, `foundationsReview`, `helpCard`

**Not auto-fixed (needs human attention):** Section 4 ("Task Handlers") of `SYSTEM_PROMPTS.md` still has no dedicated write-up for 7 task types (`reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`). Writing accurate per-task prompt-behavior prose is a judgment call, not a mechanical list fix — left for a human/dedicated pass. The doc's own header note already flagged this as known lag; updated the note to name the specific gaps.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 2,745 | `src/features/planner-chat/PlannerChatPage.tsx` | +76 |
| 2,641 | `functions/src/ai/chat.ts` | +93 |
| 2,215 | `src/features/quest/useQuestSession.ts` | +54 |
| 2,103 | `src/features/books/BookEditorPage.tsx` | −175 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,733 | `src/features/records/records.logic.test.ts` | +179 (test file) |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +51 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,269 | `src/features/records/RecordsPage.tsx` | +21 |
| 1,169 | `src/features/today/TodayChecklist.tsx` | +1 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | new to this table |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,113 | `src/features/today/TodayPage.tsx` | new to this table |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | new to this table |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,065 | `functions/src/ai/evaluate.ts` | new to this table |
| 1,055 | `src/features/today/KidTodayView.tsx` | new to this table |
| 1,052 | `src/features/dad-lab/DadLabPage.tsx` | new to this table |
| 1,031 | `src/core/types/planning.ts` | new to this table |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | new to this table |
| 1,014 | `src/features/books/BookshelfPage.tsx` | new to this table |

---

## Decomposition Candidates

No files crossed 2,000 lines for the first time this cycle — all four files already above that line were already tracked as KNOWN in `CLAUDE.md`'s Known Technical Debt section.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,745 | KNOWN — state management ~1,700L, complex interconnected state. +76 growth since last audit; trending upward for 2 cycles running. |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage decomposition target. +93 growth. |
| `useQuestSession.ts` | 2,215 | KNOWN — quest/comprehension/fluency/encoding all in one hook. +54 growth. |
| `BookEditorPage.tsx` | 2,103 | KNOWN — handlers interleaved but clear section boundaries. **Shrank 175L** since last audit — some cleanup landed. |

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 201,422→202,914; Commits 161→166; Test files 231→236; Cloud Functions 25→26
- **`docs/MASTER_OUTLINE.md` nav:** added missing `Barnes Bros` item to both Parent and Kid nav lines, matching `AppShell.tsx` order
- **`docs/MASTER_OUTLINE.md` task-type count:** two "17 total"/"(17 task types)" mentions corrected to 21, with the full name list restored
- **`CLAUDE.md`:** added 6 missing Firestore collection rows, 1 missing Cloud Function, 2 missing chat task types (to 3 different lists), 4 missing Project Structure directory entries, 2 missing `src/core/types/` file mentions, and corrected the CF/task-type counts in the headers directly above the lists being fixed
- **`docs/SYSTEM_PROMPTS.md`:** added `foundationsReview`/`helpCard` to the dispatch diagram and model table, added 7 missing rows to the Standalone Cloud Functions table, added 4 missing rows to the Task → Slice Mapping table, updated the "Last updated" note
- **npm audit (root):** non-breaking `npm audit fix` resolved 5 vulnerabilities (14→9 total; production tree now 0 vulnerabilities, was 2 moderate — dompurify, protobufjs)
- **npm audit (functions):** non-breaking `npm audit fix` resolved the critical (protobufjs) and all 6 high-severity findings (grpc-js, fast-xml-parser/builder, form-data, node-forge, path-to-regexp) — production tree went from 21 vulnerabilities (1 critical, 6 high, 13 moderate, 1 low) down to 9 moderate, all in the same `firebase-admin` dependency chain
- Verified build + `tsc -b` + full test suite (3,303 tests) still pass after both dependency fixes

### Needs Human Attention

- **`docs/SYSTEM_PROMPTS.md` Section 4 prose gap:** 7 task types (`reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`) have no dedicated "Task Handlers" write-up. Registry/model-table/slice-mapping entries are now complete and accurate; the prose descriptions need a human or dedicated pass since they require judgment about what's worth documenting per handler.
- **Remaining `firebase-admin` vulnerabilities (9 moderate, both root and functions):** all trace to `firebase-admin` 12.x/13.x pulling in a vulnerable `uuid` via `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`. Full fix requires `firebase-admin@14.1.0`, a breaking major version bump — architectural decision, left for human review.
- **Bundle size 4,069 kB (1,204 kB gzip), +153 kB since last report:** Route-level `React.lazy` splitting would reduce initial load. Heaviest imports unchanged: Three.js (avatar), jsPDF (print), curriculum map data.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:812`, `useQuestSession.ts:2080` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **`PlannerChatPage.tsx` and `chat.ts` (CF) still trending upward:** +76L and +93L respectively this cycle, second consecutive cycle of growth for `PlannerChatPage.tsx`. Neither is urgent but both are worth a decomposition pass before they compound further.
- **Dead-export scan skipped this cycle** (time budget) — no claim either way; run it standalone if wanted.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (including the 2 that were missing from the docs — `foundationsReview` and `helpCard` both wire charter context correctly in code, they just weren't documented).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 26 | books |
| 20 | today |
| 16 | quest |
| 14 | planner-chat |
| 14 | avatar |
| 11 | settings |
| 10 | shelly-chat |
| 9 | dad-lab |
| 8 | evaluate |
| 4 | records |
| 3 | foundations-review |
| 3 | evaluation |
| 2 | workshop |
| 2 | monthly-review |
| 2 | business |
| 1 | weekly-review |
| 1 | progress |
| 1 | engine |
| 0 | ui-preview *(dev-only gallery — ok)* |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | auth |

Improved since last report: `dad-lab` (0→9), `progress` (0→1). Remaining 0-test features: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only).

---

## Dependency Notes

- **npm audit (production, root):** ✅ 0 vulnerabilities (post-fix)
- **npm audit (all, root):** 9 vulnerabilities (1 low, 8 moderate) — all trace to the `firebase-admin` dependency chain, need a major-version bump
- **npm audit (production, functions):** 9 moderate (post-fix, down from 21 including 1 critical + 6 high)
- **Major version updates available (not applied — architectural decisions):** `firebase-admin` 13.10.0 → 14.1.0 (would clear remaining audit findings), `@mui/material`/`@mui/icons-material` 7.3.9 → 9.2.0, `three` 0.128.0 → 0.185.1 (+ matching `@types/three`), `eslint` 9.39.4 → 10.6.0, npm 10.9.7 → 11.18.0
