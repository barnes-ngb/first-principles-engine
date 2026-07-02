# Code Health Report — 2026-06-13

## Metrics

| Metric | Value | Change from last report (2026-06-09) |
|--------|-------|--------------------------------------|
| **Total lines** | **179,214** | +221 |
| **Commits (main)** | **119** | −6 (prior report counted branch commits; 119 is correct origin/main baseline) |
| **Test files** | **202** | +21 since 2026-06-13 |
| **Tests passing** | **3,005** | +261 since 2026-06-13 |
| **Tests total** | **3,005** | 0 skipped, 0 failing |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **19** | +0 |
| **Routes** | **34** | +0 |
| **Bundle size** | **3,916 kB / 1,156 kB gzip** | +0 |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 12.73s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29) |
| **Tests** | ✅ PASS | 3,005 passing, 0 skipped, 0 failing (202 test files) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities after fix (see Auto-Fixed below) |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 178,993 | 179,214 | ⚠️ DRIFT +221 — **AUTO-FIXED** |
| Commits | 125 | 119 | ⚠️ CORRECTION (prior count included branch commits) — **AUTO-FIXED** |
| Test files | 177 | 178 | ⚠️ DRIFT +1 — **AUTO-FIXED** |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 19 | 19 | ✅ OK |
| Routes | 34 | 34 | ✅ OK |

> **Note on CF count method:** The multi-line export block for `generateMonthlyReview / generateMonthlyReviewNow / publishMonthlyReview / unpublishMonthlyReview / auditMonthlyReviewSources` in `functions/src/index.ts` requires parsing the full export block, not just single-line grep. Verified at 25 by Python parser.

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
| 2,669 | `src/features/planner-chat/PlannerChatPage.tsx` | +42 |
| 2,548 | `functions/src/ai/chat.ts` | +0 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +1 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,566 | `functions/src/ai/contextSlices.ts` | +7 |
| 1,554 | `src/features/records/records.logic.test.ts` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,248 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,168 | `src/features/today/TodayChecklist.tsx` | +0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |

---

## Decomposition Candidates

No new files crossed 2,000 lines this cycle.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,669 | KNOWN — state management ~1,700L, complex interconnected state. Stable. (+42 growth, watch.) |
| `chat.ts` (CF) | 2,548 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage target. Stable. |
| `BookEditorPage.tsx` | 2,278 | KNOWN — handlers interleaved but clear section boundaries. Stable. |
| `useQuestSession.ts` | 2,161 | KNOWN — quest/comprehension/fluency/encoding all in one hook. Stable. |

---

## Issues Found

### Auto-Fixed

- **MASTER_OUTLINE.md stats updated:** Lines 178,993→179,214; Commits 125→119; Test files 177→178
- **npm audit fix applied:** `@grpc/grpc-js` high-severity crash vulnerabilities (GHSA-5375-pq7m-f5r2, GHSA-99f4-grh7-6pcq) resolved by patching `package-lock.json`. Production audit now clean (0 vulnerabilities).

### Needs Human Attention

- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` warnings in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, `useQuestSession.ts:2026` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **Bundle size 3,916 kB:** Route-level React.lazy splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.
- **Dev dependencies — 13 vulnerabilities (8 moderate, 5 high):** All are dev-only (not in production bundle). `npm audit fix --force` required for remaining dev deps — involves breaking changes. Low priority.
- **PlannerChatPage.tsx growing:** +42 lines this cycle (2,627→2,669). Still KNOWN/stable but trending upward. Worth watching over next 2–3 audits.

---

## Charter Alignment

All 19 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`:

- `chat` and `generate` tasks are handled in `tasks/chatHandler.ts` (not standalone files) — both verified to have charter context via `buildContextForTask`. ✅

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
| 8 | evaluate |
| 4 | records |
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

- **npm audit (production):** ✅ 0 vulnerabilities (post-fix)
- **npm audit (all):** 13 vulnerabilities (8 moderate, 5 high) — all dev-only
- **npm update available:** npm 10.9.7 → 11.17.0 (major version, low priority)
