# Code Health Report — 2026-06-14

## Metrics

| Metric | Value | Change from last report (2026-06-13) |
|--------|-------|--------------------------------------|
| **Total lines** | **179,214** | +0 |
| **Commits (main)** | **118** | −1 (doc said 119; previous audit over-counted by including its own branch commit) |
| **Test files (vitest root)** | **177** | −1 (doc said 178; corrected to actual vitest run count) |
| **Tests passing** | **2,682 (root) + 458 (functions)** | +0 / +0 |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **19** | +0 |
| **Routes** | **34** | +0 |
| **Bundle size** | **3,916 kB / 1,156 kB gzip** | +0 |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 15.87s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29) |
| **Tests (root)** | ✅ PASS | 2,682 passing, 0 failing (177 test files via root vitest) |
| **Tests (functions)** | ✅ PASS | 458 passing, 0 failing (23 test files via functions vitest) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 179,214 | 179,214 | ✅ OK |
| Commits | 119 | 118 | ⚠️ DRIFT −1 — **AUTO-FIXED** |
| Test files (vitest) | 178 | 177 | ⚠️ DRIFT −1 — **AUTO-FIXED** |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 19 | 19 | ✅ OK |
| Routes | 34 | 34 | ✅ OK |

> **Note on commit count:** `git rev-list --count HEAD` = 118 = `git rev-list --count origin/main`. The June 13 audit reported 119; this was the branch HEAD count (including the audit commit itself), not the origin/main baseline. Corrected to 118.

> **Note on test files:** Root vitest ran 177 test files (2,682 tests). Functions vitest runs 23 additional test files (458 tests). MASTER_OUTLINE tracks the root vitest count. Total files matching `*.test.*` in the repo: 251 (155 in src/, 96 in functions/src/ — functions vitest only picks up 23 due to its config).

### Missing File References

No new missing file references. Previously flagged carry-overs (PARENT_EXPERIENCE_AUDIT.md, QuickCaptureSection.tsx, etc.) remain as expected.

### Nav Accuracy

Code nav (`AppShell.tsx`) matches MASTER_OUTLINE exactly:
- **Parent:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Ask AI, Game Workshop, Dad Lab, Settings
- **Kid:** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

✅ No discrepancies.

### Unindexed Docs

✅ All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`.

### Stale Docs

All docs marked CURRENT were updated within the last 11 days (most recently: 2026-06-03). ✅ No stale docs flagged.

### Task Type Coverage (SYSTEM_PROMPTS.md)

All 19 task types present in `tasks/index.ts` are documented in `SYSTEM_PROMPTS.md`:

`plan` `chat` `generate` `evaluate` `quest` `generateStory` `reviseStory` `revisePage` `workshop` `analyzeWorkbook` `disposition` `conundrum` `weeklyFocus` `scan` `shellyChat` `chapterQuestions` `bookLookup` `lessonVideo` `monthlyReview`

✅ No gaps.

### Collection Documentation

All 37 collection helpers match CLAUDE.md table entries. ✅ No gaps.

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report |
|-------|------|------------------------|
| 2,669 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 |
| 2,548 | `functions/src/ai/chat.ts` | +0 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 |
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

---

## Decomposition Candidates

No files crossed 2,000 lines this cycle. All known candidates unchanged.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,669 | KNOWN — state management ~1,700L, complex interconnected state. Stable. |
| `chat.ts` (CF) | 2,548 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage target. Stable. |
| `BookEditorPage.tsx` | 2,278 | KNOWN — handlers interleaved but clear section boundaries. Stable. |
| `useQuestSession.ts` | 2,161 | KNOWN — quest/comprehension/fluency/encoding all in one hook. Stable. |

---

## Issues Found

### Auto-Fixed

- **MASTER_OUTLINE.md stats corrected:** Commits 119→118; Test files 178→177

### Needs Human Attention

- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, `useQuestSession.ts:2026` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **Bundle size 3,916 kB / 1,156 kB gzip:** Route-level React.lazy splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.
- **Dev dependencies — 13 vulnerabilities (8 moderate, 5 high):** All dev-only (not in production bundle). `npm audit fix --force` required — involves breaking changes. Low priority.

---

## Charter Alignment

All 19 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`. ✅ No charter gaps.

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

- **npm audit (production):** ✅ 0 vulnerabilities
- **npm audit (all):** 13 vulnerabilities (8 moderate, 5 high) — all dev-only; `esbuild` Windows dev-server file-read issue is highest severity but dev-only
- **npm update available:** npm 10.9.7 → 11.17.0 (major version, low priority)
