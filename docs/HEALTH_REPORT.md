# Code Health Report — 2026-04-06

## Metrics
- **Total lines:** 119,626 (+6,209 from last report)
- **Total files:** 467 (+17)
- **Total commits:** 106 (note: rebased from 108 last report)
- **Test files:** 57 (+1)
- **Test lines:** 12,445 (+161)
- **Firestore collections:** 33 collection helpers (+2 from last report)
- **Cloud Functions:** 19 exported (healthCheck, chat, analyzeEvaluationPatterns, weeklyReview, generateWeeklyReviewNow, generateActivity, + 12 image functions + enhanceSketch)
- **AI task types:** 13 (plan, chat, generate, evaluate, quest, generateStory, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat)
- **Tests:** 1,025 passing across 56 test files (+34 tests, +1 test file)

## Largest Files (over 500 lines)

| File | Lines | Change from last report |
|------|-------|------------------------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,252 | +68 |
| `src/features/books/BookEditorPage.tsx` | 1,886 | +428 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | +125 |
| `src/features/workshop/WorkshopPage.tsx` | 1,606 | — |
| `functions/src/ai/chat.ts` | 1,599 | +10 |
| `src/features/quest/useQuestSession.ts` | 1,545 | +87 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,386 | — |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,293 | +119 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,242 | -48 |
| `src/features/records/RecordsPage.tsx` | 1,127 | +3 |
| `src/features/today/KidTodayView.tsx` | 1,083 | +1 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,060 | +5 |
| `src/features/records/records.logic.test.ts` | 1,053 | — |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,051 | — |
| `src/features/books/BookshelfPage.tsx` | 1,006 | — |
| `src/features/settings/AvatarAdminTab.tsx` | 997 | — |
| `src/features/today/TodayPage.tsx` | 982 | +83 |
| `src/features/today/TodayChecklist.tsx` | 973 | +225 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 | — |
| `src/features/books/printBook.ts` | 937 | — |
| `functions/src/ai/contextSlices.ts` | 914 | +160 |
| `src/features/avatar/BrothersVoxelScene.tsx` | 865 | — |
| `src/features/quest/ReadingQuest.tsx` | 830 | — |
| `src/features/dad-lab/LabReportForm.tsx` | 797 | +21 |
| `src/core/types/planning.ts` | 795 | +111 |
| `src/features/workshop/GamePlayView.tsx` | 772 | — |
| `src/features/books/BookReaderPage.tsx` | 772 | — |
| `src/features/books/useBook.ts` | 754 | +12 |
| `src/features/progress/ArmorTab.tsx` | 745 | — |
| `src/core/data/seed.ts` | 704 | — |
| `src/features/workshop/workshopUtils.ts` | 675 | — |
| `src/features/progress/CurriculumTab.tsx` | 670 | new |
| `src/features/ladders/lincolnLadders.ts` | 670 | — |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | 651 | — |
| `src/features/records/records.logic.ts` | 640 | — |
| `src/features/records/EvaluationHistoryTab.tsx` | 635 | — |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 629 | — |
| `functions/src/ai/evaluate.ts` | 609 | — |
| `src/features/books/StickerPicker.tsx` | 599 | — |
| `src/features/today/ReadingRoutineItems.tsx` | 584 | new |
| `src/features/avatar/voxel/buildCharacter.ts` | 575 | new |
| `functions/src/ai/generate.ts` | 561 | — |
| `src/features/dad-lab/KidLabView.tsx` | 555 | new |
| `src/features/evaluation/SkillSnapshotPage.tsx` | 550 | -528 (decomposed) |
| `src/features/weekly-review/WeeklyReviewPage.tsx` | 548 | new |
| `src/core/data/gatbCurriculum.ts` | 545 | new |
| `src/features/workshop/MyGamesGallery.tsx` | 538 | new |
| `functions/src/ai/tasks/workshop.ts` | 533 | — |
| `src/features/avatar/voxel/minecraftSkin.ts` | 528 | new |
| `src/features/today/KidChecklist.tsx` | 524 | new |
| `src/features/quest/KnowledgeMinePage.tsx` | 524 | new |
| `src/features/books/SketchScanner.tsx` | 524 | new |
| `src/features/workshop/workshopArt.ts` | 523 | new |
| `functions/src/ai/data/gatbCurriculum.ts` | 519 | new |
| `src/features/workshop/CollectingPlayView.tsx` | 516 | new |
| `src/features/workshop/BattlePlayView.tsx` | 509 | new |
| `src/features/workshop/AdventurePlayView.tsx` | 504 | new |

## Files Changed This Week

529 files changed total (foundational week — entire codebase established). Top areas by change volume:

| Feature Area | Files Changed |
|---|---|
| `src/features/avatar/` | 37 |
| `src/features/books/` | 37 |
| `src/features/workshop/` | 33 |
| `src/features/today/` | 33 |
| `src/features/planner-chat/` | 32 |
| `src/components/` | 23 |
| `src/features/avatar/voxel/` | 20 |
| `src/core/types/` | 16 |
| `src/core/hooks/` | 14 |
| `src/features/workshop/steps/` | 12 |
| `src/features/progress/` | 12 |
| `src/core/utils/` | 12 |
| `src/features/quest/` | 10 |
| `src/features/records/` | 10 |
| `src/features/ladders/` | 9 |
| `src/core/xp/` | 9 |
| `src/features/settings/` | 7 |
| `src/core/firebase/` | 7 |
| `src/core/curriculum/` | 7 |
| `src/features/shelly-chat/` | 6 |
| `src/features/dad-lab/` | 5 |

## Auto-Fixes Applied
- Unused imports removed: **0** (codebase is clean — TypeScript `noUnusedLocals` enforces this)
- Lint issues fixed: **0** (ESLint `--fix` found no auto-fixable issues in `src/`; `functions/src/` uses separate ESLint config not resolvable from root)
- Inline handlers extracted: **0** (no inline JSX arrow functions over 20 lines found — all handlers are properly short)
- Files split: **none** (PlannerChatPage at 2,252 is the only file over 2,000 lines; per CLAUDE.md, its interconnected state makes splitting complex)
- Dead exports removed: **0** (14 dead exports were removed in previous report; no new dead exports found this week)

## Issues Found (Not Auto-Fixed)

### High Priority
- **None.** Build, lint, and all 1,025 tests pass cleanly.

### Medium Priority
- **PlannerChatPage.tsx (2,252 lines)** continues growing (+68 from last report). The only file over 2,000 lines. Setup wizard remains the best extraction candidate but shares chat/plan/apply state.
- **BookEditorPage.tsx (1,886 lines)** grew +428 since last report — largest single-file growth. Now approaching 2,000 lines. Sketch scanner, voice, and sticker panels are extraction candidates.
- **ESLint does not cover `functions/src/`** from the root project — still unresolved from last report. Consider adding a lint script in `functions/package.json`.
- **TodayChecklist.tsx (973 lines)** grew +225 — rapid growth. Monitor for continued expansion.
- **contextSlices.ts (914 lines)** grew +160. As more context slices are added for new task types, this file will keep growing. Consider grouping slices by domain.

### Low Priority
- **Vite chunk warning:** Main bundle is 3,589 KB (1,057 KB gzipped) — slightly up from 3,520/1,038. Dynamic imports or manual chunks for Three.js, jsPDF would help.
- **Major version upgrades available:** ESLint 10, TypeScript 6, Vite 8, Vitest 4 — all major bumps requiring migration effort. Not urgent but worth tracking.
- **Deprecated ladder system** — CLAUDE.md still notes 5 files with TODO comments for ladder removal. Disposition system is the replacement.

## Decomposition Candidates

| File | Lines | Notes |
|------|-------|-------|
| `PlannerChatPage.tsx` | 2,252 | Setup wizard is the best extraction candidate. Shares chat/plan/apply state — needs careful prop design. Growing steadily. |
| `BookEditorPage.tsx` | 1,886 | **Watch item** — grew +428 this week. Sketch/voice/sticker panels could extract. Approaching decomposition threshold. |
| `ShellyChatPage.tsx` | 1,653 | 23+ useState hooks. Image generation flow, thread management, follow-up suggestions could be separate hooks. Growing (+125). |
| `WorkshopPage.tsx` | 1,606 | Phase-based rendering. Handlers share `currentGame` state across 3 game types. Stable. |
| `functions/src/ai/chat.ts` | 1,599 | Task dispatcher + prompt builders. Could extract prompt building per-task into the tasks/ directory. |
| `useQuestSession.ts` | 1,545 | Quest session state machine. Could split into phase-specific hooks. Growing (+87). |
| `MyAvatarPage.tsx` | 1,386 | Stable. 3D scene, equip panel could separate further. |
| `chatPlanner.logic.ts` | 1,293 | Growing (+119). Pure logic file — watch for continued expansion. |

## Charter Alignment Check

### Tasks using `buildContextForTask` (shared context with charter):
- `plan` — charter + childProfile + wordMastery + generatedContent + workshopGames
- `chat` / `generate` — charter + childProfile
- `evaluate` — charter + childProfile + sightWords + wordMastery
- `quest` — childProfile + sightWords + recentEval + wordMastery
- `generateStory` — childProfile + sightWords + wordMastery
- `workshop` — charter + childProfile + workshopGames
- `analyzeWorkbook` — charter + childProfile
- `disposition` — charter + childProfile + engagement + gradeResults
- `scan` — childProfile + recentEval
- `shellyChat` — charter + childProfile + sightWords + weekFocus + wordMastery

### Tasks using `CHARTER_PREAMBLE` only (direct import):
- `weeklyFocus` — family-level generator, not child-specific
- `conundrum` — family-level generator, not child-specific

### Standalone charter consumers (outside task system):
- `generate.ts` (activity generation) — uses CHARTER_PREAMBLE directly
- `evaluate.ts` (weekly review) — uses CHARTER_PREAMBLE + addendum; noted in CLAUDE.md as separate from task system

### Tasks with no charter context:
- `analyzePatterns` — pattern analysis from evaluation sessions (uses evaluation data only)

### Drift detected: **No**
All child-specific tasks use `buildContextForTask` which injects charter values consistently. Family-level tasks use `CHARTER_PREAMBLE` directly. No new tasks have been added without appropriate charter context.

## Test Coverage Gaps

| Feature Directory | Test Files | Status |
|---|---|---|
| `src/features/auth/` | 0 | Gap — client auth guard untested |
| `src/features/dad-lab/` | 0 | Gap — dad lab lifecycle untested |
| `src/features/evaluation/` | 0 | Gap — skill snapshot page untested |
| `src/features/login/` | 0 | Gap — profile selection untested |
| `src/features/not-found/` | 0 | Trivial — 404 page |
| `src/features/planner/` | 0 | Gap — TeachHelperDialog untested |
| `src/features/progress/` | 0 | Gap — progress tabs (7 sub-tabs) untested |
| `src/features/settings/` | 0 | Gap — settings tabs untested |
| `src/features/shelly-chat/` | 0 | Gap — high-usage feature, high priority for testing |
| `src/features/weekly-review/` | 0 | Gap — weekly review page untested |

**Recently improved (2026-04-19 test run):**
- `records.logic` — added mixed blocks, checklist fallback, all-3-sources aggregation tests
- `addXpEvent` — added dedup, zero/empty guard, source bucketing, negative clamp, default avatar tests
- `time.ts` — added getWeekRange tests (Sun/Sat/Mon start, month/year boundaries)
- `functions/src/ai/authGuard` — new test file: email auth, allowlist, rate limiting (15 tests)

**Well-tested areas:** planner-chat (8 tests), avatar (5), books (4), today (3), quest (2), workshop (2), engine (1), evaluate (1), kids (1), ladders (1), records (1)

## Dependency Notes
- `npm audit --production`: **0 vulnerabilities** found
- **Major version upgrades available:**
  - ESLint 9.39 → 10.2 (major)
  - TypeScript 5.9 → 6.0 (major)
  - Vite 7.3 → 8.0 (major)
  - Vitest 3.2 → 4.1 (major)
  - jsdom 27.4 → 29.0 (major)
  - `@types/three` and `three` 0.128 → 0.183 (major — pinned intentionally for VoxelCharacter stability)
- **Minor updates available:** react-router-dom 7.13→7.14, typescript-eslint 8.57→8.58, @types/node 24.12.0→24.12.2
- Bundle size: 3,589 KB (1,057 KB gzipped) — slight increase from last report's 3,520/1,038
