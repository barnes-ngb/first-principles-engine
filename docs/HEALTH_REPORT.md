# Code Health Report — 2026-06-20

## Metrics

| Metric | Value | Change from last report (2026-06-13) |
|--------|-------|--------------------------------------|
| **Total lines** | **180,429** | +1,215 |
| **Commits (main)** | **117** | −2 |
| **Test files (source)** | **182** | +1 |
| **Test files (vitest run)** | **204** | +23 (includes compiled functions/lib JS) |
| **Tests passing** | **3,204** | +460 |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **19** | +0 |
| **Routes** | **34** | +0 |
| **Bundle size** | **3,916 kB / 1,156 kB gzip** | +0 |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 15.28s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29) |
| **Tests** | ✅ PASS | 3,204 passing, 0 skipped, 0 failing (204 test files via vitest) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities after fix (see Auto-Fixed below) |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 179,214 | 180,429 | ⚠️ DRIFT +1,215 — **AUTO-FIXED** |
| Commits | 119 | 117 | ⚠️ DRIFT −2 — **AUTO-FIXED** |
| Test files | 178 | 182 | ⚠️ DRIFT +4 — **AUTO-FIXED** |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 19 | 19 | ✅ OK |
| Routes | 34 | 34 | ✅ OK |

> **Note on CF count method:** The grep pattern only matches 20 due to the multi-line export block for `generateMonthlyReview / generateMonthlyReviewNow / publishMonthlyReview / unpublishMonthlyReview / auditMonthlyReviewSources`. Manual count of `functions/src/index.ts` confirms 25.

> **Note on test file count:** `find src functions -name '*.test.*'` returns 182 source test files. Vitest runs 204 (includes compiled `.js` test files in `functions/lib/`). MASTER_OUTLINE tracks source test files (182).

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

Code nav (`AppShell.tsx`) matches MASTER_OUTLINE exactly:
- **Parent:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Ask AI, Game Workshop, Dad Lab, Settings
- **Kid:** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

✅ No discrepancies.

### Unindexed Docs

✅ All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`.

### Stale Docs

All docs marked CURRENT were updated within the last 30 days. ✅ No stale docs flagged.

### Task Type Coverage (SYSTEM_PROMPTS.md)

All 19 task types present in `tasks/index.ts` are documented in `SYSTEM_PROMPTS.md`:

`plan` `chat` `generate` `evaluate` `quest` `generateStory` `reviseStory` `revisePage` `workshop` `analyzeWorkbook` `disposition` `conundrum` `weeklyFocus` `scan` `shellyChat` `chapterQuestions` `bookLookup` `lessonVideo` `monthlyReview`

✅ No gaps.

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report |
|-------|------|------------------------|
| 2,669 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 |
| 2,548 | `functions/src/ai/chat.ts` | +0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,103 | `src/features/books/BookEditorPage.tsx` | **−175** (was 2,278) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,566 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,554 | `src/features/records/records.logic.test.ts` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,248 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,168 | `src/features/today/TodayChecklist.tsx` | +0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,094 | `src/features/today/TodayPage.tsx` | +0 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,055 | `src/features/today/KidTodayView.tsx` | +0 |
| 1,050 | `functions/src/ai/evaluate.ts` | +0 |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | NEW ENTRANT |

---

## Decomposition Candidates

`BookEditorPage.tsx` shrank 2,278→2,103 (−175 lines). Still above 2,000 but trending down.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,669 | KNOWN — state management ~1,700L. Stable. (No change this cycle.) |
| `chat.ts` (CF) | 2,548 | KNOWN — `buildQuestPrompt` alone 400+ lines. Stable. |
| `BookEditorPage.tsx` | 2,103 | KNOWN — shrank −175 this cycle. Positive trend. |
| `useQuestSession.ts` | 2,161 | KNOWN — quest/comprehension/fluency/encoding all in one hook. Stable. |
| `monthlyReviewData.ts` | 1,031 | NEW ENTRANT — functions-side data assembly for monthly review. Watch. |

---

## Issues Found

### Auto-Fixed

- **MASTER_OUTLINE.md stats updated:** Lines 179,214→180,429; Commits 119→117; Test files 178→182
- **npm audit fix applied:** `protobufjs` moderate-severity vulnerability resolved. Production audit now clean (0 vulnerabilities).

### Needs Human Attention

- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` warnings in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, `useQuestSession.ts:2026` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **Bundle size 3,916 kB:** Route-level React.lazy splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.
- **Dev dependencies — 9 vulnerabilities (1 low, 8 moderate):** All are dev-only (not in production bundle). `npm audit fix --force` required for remaining dev deps — involves breaking changes. Low priority.
- **CLAUDE.md Known Technical Debt section:** `BookEditorPage.tsx` listed as 2,278L but is now 2,103L (−175). Consider updating the listed value on next intentional CLAUDE.md edit pass.

---

## Charter Alignment

All 19 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`:

- `chat` and `generate` tasks are handled via the dispatch table in `functions/src/ai/chat.ts` (not standalone task files) — both verified to have charter context via `buildContextForTask` (line 1995 in chat.ts). ✅

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 17 | today |
| 15 | quest |
| 14 | planner-chat |
| 14 | avatar |
| 9 | shelly-chat |
| 6 | settings |
| 6 | evaluate |
| 3 | records |
| 2 | workshop |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | evaluation |
| 1 | engine |
| 0 | ui-preview *(dev-only gallery — ok)* |
| 0 | progress |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | dad-lab |
| 0 | auth |

Features with 0 tests: `progress`, `planner`, `dad-lab`, `auth` — unchanged from last report.

---

## Dependency Notes

- **npm audit (production):** ✅ 0 vulnerabilities (post-fix; protobufjs patched this cycle)
- **npm audit (all):** 9 vulnerabilities (1 low, 8 moderate) — all dev-only
- **npm update available:** npm 10.9.7 → 11.17.0 (major version, low priority)
