# Code Health Report — 2026-05-29

## Metrics

| Metric | Value | Change from last report |
|--------|-------|------------------------|
| **Total lines** | **160,818** | +0 |
| **Commits (main)** | **135** | +13 |
| **Test files** | **125** | +0 |
| **Tests passing** | **2,038** | all pass |
| **Test files running** | **124** | — |
| **Firestore collections** | **34** | +0 |
| **Cloud Functions** | **24** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size (main chunk)** | **3.84 MB / 1.13 MB gzip** | +0.14 MB |

> **Commit note:** `git rev-list --count HEAD` on the audit branch shows 113; main branch count is 135 (used for stats). Previous audit branches add commits that don't merge to main via squash.

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `vite build` clean in 20.41s |
| **Lint** | ✅ PASS (0 errors) | 3 warnings — `react-hooks/exhaustive-deps` for `sessionTimer` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679`, `useQuestSession.ts:1760` |
| **Tests** | ✅ PASS | 2,038 tests across 124 files in 83.93s |
| **TypeScript** | ✅ PASS | `tsc -b` clean |

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before) | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 160,818 | 160,818 | ✅ OK |
| Commits | 122 | 135 | **DRIFT** — auto-fixed → 135 |
| Test files | 125 | 125 | ✅ OK |
| Firestore collections | 34 | 34 | ✅ OK |
| Cloud Functions | 24 | 24 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

Confirmed-removed files referenced in historical PR log entries in MASTER_OUTLINE (expected — these are history entries, not current path references):

| File | Status |
|------|--------|
| `QuickCaptureSection.tsx` | Intentionally removed — UX P2.06 unified capture card PR |
| `CreativeTimeLog.tsx` | Intentionally removed — UX P2.06 unified capture card PR |

All other "missing" references from the grep scan are false positives: bare type filenames (`books.ts`, `common.ts`, etc.) appearing in descriptive text, not as actual file paths.

### Nav Accuracy

Code nav labels (`AppShell.tsx`) match documented nav in MASTER_OUTLINE — no discrepancies.

**Parent nav:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI  
**Kid nav:** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Task Types in Code vs Docs

Registry (`tasks/index.ts`) — 17 tasks: `analyzeWorkbook`, `chapterQuestions`, `chat`, `conundrum`, `disposition`, `evaluate`, `generate`, `generateStory`, `monthlyReview`, `plan`, `quest`, `revisePage`, `reviseStory`, `scan`, `shellyChat`, `weeklyFocus`, `workshop`

All 17 are documented in `SYSTEM_PROMPTS.md`. **Auto-fixed:** `reviseStory` and `revisePage` were missing from CLAUDE.md task handler lists and model selection — added.

### Unindexed Docs

| Doc | Action |
|-----|--------|
| `PROJECT_CONTEXT.md` | **Auto-fixed** — added to `DOCUMENT_INDEX.md` |

### Stale Doc Check

No docs marked CURRENT were flagged as stale (no output from 30-day check).

## Largest Files (over 500 lines)

| File | Lines | Change from last report |
|------|-------|------------------------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 |
| `functions/src/ai/chat.ts` | 2,466 | +0 |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 |
| `src/features/quest/useQuestSession.ts` | 1,870 | +0 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +0 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | +0 |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +0 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,562 | +0 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | +0 |
| `functions/src/ai/contextSlices.ts` | 1,325 | +0 |
| `src/features/records/records.logic.test.ts` | 1,222 | +0 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | +0 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,156 | +0 |
| `src/features/records/RecordsPage.tsx` | 1,127 | +0 |
| `src/features/settings/AvatarAdminTab.tsx` | 1,106 | +0 |
| `src/features/today/TodayPage.tsx` | 1,104 | +0 |
| `src/features/today/TodayChecklist.tsx` | 1,070 | +0 |
| `functions/src/ai/evaluate.ts` | 1,050 | +0 |
| `src/features/today/KidTodayView.tsx` | 1,030 | +0 |
| `src/features/quest/ReadingQuest.tsx` | 993 | +0 |
| `src/features/books/BookshelfPage.tsx` | 986 | +0 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 | +0 |
| `src/features/books/printBook.ts` | 952 | +0 |
| `src/features/settings/DevAdminTab.tsx` | 943 | +0 |
| `src/core/types/planning.ts` | 941 | +0 |
| `functions/src/ai/tasks/monthlyReviewData.ts` | 918 | +0 |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 913 | +0 |
| `src/features/progress/CurriculumTab.tsx` | 900 | +0 |
| `functions/src/ai/tasks/monthlyReview.ts` | 887 | +0 |
| `src/features/books/useBook.ts` | 877 | +0 |

## Decomposition Candidates

Files over 1,500 lines — all stable, no growth this run:

| File | Lines | Growth | Priority |
|------|-------|--------|----------|
| `functions/src/ai/chat.ts` | 2,466 | +0 | **HIGH** — `buildQuestPrompt` alone is 400+ lines; extract prompt builders to separate files |
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 | **MEDIUM** — stable, noted in CLAUDE.md tech debt |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 | **MEDIUM** — stable growth, noted in CLAUDE.md |

## Issues Found

### Auto-Fixed (audit)
- MASTER_OUTLINE commits count: 122→135

### Auto-Fixed (companion)
- Added `reviseStory` and `revisePage` to CLAUDE.md model selection (complex reasoning → Sonnet)
- Added `reviseStory` and `revisePage` to CLAUDE.md `chat` CF task dispatch list
- Added `reviseStory` and `revisePage` to CLAUDE.md `functions/src/ai/tasks/` handler list (both occurrences)
- Indexed `PROJECT_CONTEXT.md` in `DOCUMENT_INDEX.md`

### Needs Human Attention
- **Bundle size:** 3.84 MB main chunk (1.13 MB gzip). Route-level `React.lazy` splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Noted in CLAUDE.md tech debt — architectural decision required.
- **3 lint warnings** (`react-hooks/exhaustive-deps` for `sessionTimer` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679`, `useQuestSession.ts:1760`) — intentional timer-ref pattern, not auto-fixable.
- **`chat.ts` CF (2,466L)** — `buildQuestPrompt` is 400+ lines; extracting to separate prompt builder files would improve maintainability. Noted in CLAUDE.md tech debt.

## Charter Alignment

All task types checked: `chat` (`chatHandler.ts`) and `generate` (`generate.ts`) are not in `tasks/` directory but are handled elsewhere — no charter gap. All task handler files with a `.ts` in `functions/src/ai/tasks/` that are in the registry use either `buildContextForTask` or include charter context via context slices.

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 13 | planner-chat |
| 12 | avatar |
| 11 | today |
| 4 | settings |
| 4 | quest |
| 3 | evaluate |
| 2 | workshop |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | records |
| 1 | ladders |
| 1 | engine |
| 0 | shelly-chat |
| 0 | progress |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | evaluation |
| 0 | dad-lab |
| 0 | auth |

Features with 0 test files: shelly-chat, progress, planner, not-found, login, evaluation, dad-lab, auth. These are either pure UI renderers or auth wrappers with limited pure logic to test.

## Dependency Notes

- **npm audit:** 0 vulnerabilities (production)
- No major version upgrades pending that affect production
