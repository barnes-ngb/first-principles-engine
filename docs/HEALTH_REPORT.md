# Code Health Report — 2026-04-04

## Metrics
- **Total lines:** 109,442
- **Total files:** 439
- **Total commits:** 111
- **Test files:** 56
- **Test lines:** 12,315
- **Firestore collections:** 29 (exported collection helpers)
- **Cloud Functions:** 18 (healthCheck, chat, analyzeEvaluationPatterns, weeklyReview, generateWeeklyReviewNow, generateActivity, + 12 image functions)
- **AI task types:** 13 (plan, chat, generate, evaluate, quest, generateStory, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat)
- **Production vulnerabilities:** 0

## Largest Files (over 500 lines)

| File | Lines | Notes |
|------|-------|-------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,094 | Reduced from 2,184 this session (-90 lines) |
| `src/features/workshop/WorkshopPage.tsx` | 1,606 | Stable — phase-based rendering |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,456 | New feature, decomposition candidate |
| `src/features/books/BookEditorPage.tsx` | 1,419 | Stable |
| `src/features/avatar/MyAvatarPage.tsx` | 1,386 | Previously decomposed from 1,862 |
| `functions/src/ai/chat.ts` | 1,318 | Server-side task dispatch |
| `src/features/avatar/VoxelCharacter.tsx` | 1,290 | Three.js — risky to split |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,254 | Grew from utility extraction (+80 lines) |
| `src/features/quest/useQuestSession.ts` | 1,141 | Hook with complex state |
| `src/features/records/RecordsPage.tsx` | 1,124 | Multi-tab records view |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,055 | AI evaluation chat |
| `src/features/records/records.logic.test.ts` | 1,053 | Test file |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,051 | Test file |
| `src/features/today/KidTodayView.tsx` | 1,022 | Kid-facing daily view |
| `src/features/settings/AvatarAdminTab.tsx` | 997 | Admin settings |
| `src/features/books/BookshelfPage.tsx` | 981 | Book library |
| `src/features/dad-lab/DadLabPage.tsx` | 969 | Lab lifecycle |
| `src/features/evaluation/SkillSnapshotPage.tsx` | 956 | Skill snapshots |
| `src/features/avatar/BrothersVoxelScene.tsx` | 865 | Shared 3D scene |
| `src/features/books/printBook.ts` | 864 | Print generation |
| `src/features/today/TodayPage.tsx` | 832 | Parent today shell |
| `src/features/quest/ReadingQuest.tsx` | 830 | Knowledge Mine UI |
| `src/features/dad-lab/LabReportForm.tsx` | 776 | Form component |
| `src/features/workshop/GamePlayView.tsx` | 772 | Game play routing |
| `src/features/progress/ArmorTab.tsx` | 745 | Armor progress tab |
| `src/features/today/TodayChecklist.tsx` | 744 | Checklist component |
| `functions/src/ai/contextSlices.ts` | 737 | Context assembly |
| `src/core/data/seed.ts` | 704 | Seed data |
| `src/features/books/useBook.ts` | 692 | Book hook |
| `src/core/types/planning.ts` | 677 | Type definitions |
| `src/features/workshop/workshopUtils.ts` | 675 | Workshop utilities |
| `src/features/ladders/lincolnLadders.ts` | 670 | Ladder definitions |
| `src/features/books/BookReaderPage.tsx` | 666 | Reader page |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | 651 | Test file |
| `src/features/records/records.logic.ts` | 640 | Records logic |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 629 | Voxel mesh builder |
| `src/features/books/StickerPicker.tsx` | 599 | Sticker selection UI |
| `src/features/today/ReadingRoutineItems.tsx` | 584 | Routine items |
| `src/features/avatar/voxel/buildCharacter.ts` | 575 | Character mesh builder |
| `functions/src/ai/evaluate.ts` | 564 | Weekly review CF |
| `functions/src/ai/generate.ts` | 561 | Activity generation CF |
| `src/features/weekly-review/WeeklyReviewPage.tsx` | 548 | Weekly review page |
| `src/core/data/gatbCurriculum.ts` | 545 | Curriculum data |
| `src/features/workshop/MyGamesGallery.tsx` | 538 | Game gallery |
| `functions/src/ai/tasks/workshop.ts` | 533 | Workshop task handler |
| `src/features/avatar/voxel/minecraftSkin.ts` | 528 | Minecraft skin logic |
| `src/features/books/SketchScanner.tsx` | 524 | Sketch scanning |
| `src/features/workshop/workshopArt.ts` | 523 | Workshop art |
| `functions/src/ai/data/gatbCurriculum.ts` | 519 | Curriculum data (server) |
| `src/features/workshop/CollectingPlayView.tsx` | 516 | Card game view |
| `src/features/workshop/BattlePlayView.tsx` | 509 | Battle game view |
| `src/features/workshop/AdventurePlayView.tsx` | 504 | Adventure game view |

## Files Changed This Week
Very active week with 111 commits across 503 files. Key areas of change:

- **Avatar/XP economy:** Two-currency system (XP + Diamonds), portal moments, tier biomes, armor forging, XP progress bar
- **Scan feature:** Firestore scan fixes, dual camera/gallery buttons, storage rules
- **Gallery/tier display:** Tier-based gallery display, certificate scan visibility
- **Game economy:** Armor equip routing through forge system
- **Cloud Functions:** Various AI task handler updates, context slice improvements
- **Documentation:** Multiple doc updates (MASTER_OUTLINE, DOCUMENT_INDEX, economy docs)

## Auto-Fixes Applied
- Unused imports removed: **0** (codebase already clean)
- Lint issues fixed: **0** (ESLint reports zero issues)
- Inline handlers extracted: **0** (no JSX inline functions > 20 lines found)
- Files split: **none** (only PlannerChatPage.tsx over 2,000L — extracted utility functions instead, reducing by 90 lines)
- Dead exports removed: **3** (ARMOR_PIECE_SHEET_INDEX, PIECE_POSITIONS, XpEventLogEntry from xp.ts)
- Utility functions extracted: **5** (looksLikePlanJson, subjectToDayBlockType, photoLabelsToAssignments, buildPhotoContextSection, formatSkillLabel moved from PlannerChatPage.tsx to chatPlanner.logic.ts)
- Duplicate code eliminated: **2** instances of formatSkillLabel (was defined 3 times, now 1)

## Issues Found (Not Auto-Fixed)

### High Priority
- **No critical issues found.** Build passes, all 1,128 tests pass, zero lint errors, zero production vulnerabilities.

### Medium Priority
- **PlannerChatPage.tsx still at 2,094 lines** — State management is deeply interconnected (32 useState hooks). The setup wizard already has 27 props. Further decomposition would require architectural changes (context-based state) that are not safe to automate.
- **ShellyChatPage.tsx at 1,456 lines with 23+ useState hooks** — New feature; decomposition candidate after usage patterns stabilize. Noted in CLAUDE.md as tech debt.
- **Bundle size warning:** Main chunk is 3,430 kB (1,014 kB gzipped). Code splitting via dynamic imports could improve initial load.
- **`sightWordMastery.ts` dual import warning:** Dynamically imported by `useSightWordProgress.ts` but also statically imported by `CreateSightWordBook.tsx` and `SightWordDashboard.tsx`. Vite warns the dynamic import won't create a separate chunk.

### Low Priority
- **Zod schemas unused:** `src/core/types/zod.ts` exports 10 schemas and 10 type aliases that are never imported anywhere. They serve as schema documentation but add dead code to the bundle.
- **13 routine log interfaces** in `planning.ts` (HandwritingLog, SpellingLog, etc.) are only referenced as property types within parent interfaces in the same file. They work correctly but could be inlined if the file needs thinning.
- **functions/src/ ESLint configuration** doesn't work from the root — requires running from `functions/` directory or adjusting the config.

## Decomposition Candidates

| File | Lines | Candidate Extraction | Feasibility |
|------|-------|---------------------|-------------|
| `PlannerChatPage.tsx` | 2,094 | State management cluster | Low — 32 hooks are interconnected |
| `ShellyChatPage.tsx` | 1,456 | Image generation flow, thread management | Medium — wait for usage stabilization |
| `WorkshopPage.tsx` | 1,606 | Per-game-type handlers | Medium — share `currentGame` state |
| `BookEditorPage.tsx` | 1,419 | Sketch/voice/sticker panels | Medium — clear section boundaries |
| `VoxelCharacter.tsx` | 1,290 | N/A | Do not split — Three.js render loop |
| `chatPlanner.logic.ts` | 1,254 | Plan generation vs parsing | Low — tightly coupled |
| `useQuestSession.ts` | 1,141 | Word/sentence phase logic | Medium |
| `RecordsPage.tsx` | 1,124 | Per-tab components | Medium — tab components could be lazy |
| `KidTodayView.tsx` | 1,022 | Activity-type renderers | Medium |

## Charter Alignment Check

### Tasks using `buildContextForTask` (shared context with charter):
- plan, chat, generate, evaluate, quest, generateStory, workshop, analyzeWorkbook, disposition, shellyChat, scan

### Tasks using `CHARTER_PREAMBLE` directly:
- weeklyFocus, conundrum (both family-level, not child-specific — intentionally bypass buildContextForTask)

### Tasks using CHARTER_PREAMBLE via other paths:
- `generate.ts` (generateActivity CF) — uses CHARTER_PREAMBLE directly
- `evaluate.ts` (weeklyReview CF) — uses CHARTER_PREAMBLE + WEEKLY_REVIEW_ADDENDUM

### Tasks with no charter context:
- `analyzePatterns` — pattern analysis from evaluation data, no charter needed (data-only)

### Drift detected: **No**
All user-facing AI tasks include charter context. The `analyzePatterns` task is a data aggregation task that doesn't generate user-facing content, so omitting charter is appropriate.

## Test Coverage Gaps

| Feature Directory | Test Files | Coverage Status |
|---|---|---|
| `src/features/auth/` | 0 | Gap — auth guard wrapper |
| `src/features/avatar/` | 5 | Good |
| `src/features/books/` | 4 | Good |
| `src/features/dad-lab/` | 0 | **Gap — complex lifecycle** |
| `src/features/engine/` | 1 | OK |
| `src/features/evaluate/` | 1 | OK |
| `src/features/evaluation/` | 0 | Gap — skill snapshots |
| `src/features/kids/` | 1 | OK |
| `src/features/ladders/` | 1 | OK |
| `src/features/login/` | 0 | Gap — minimal logic |
| `src/features/not-found/` | 0 | Trivial, no test needed |
| `src/features/planner-chat/` | 8 | Excellent |
| `src/features/planner/` | 0 | Gap — TeachHelperDialog |
| `src/features/progress/` | 0 | Gap — progress tabs |
| `src/features/quest/` | 2 | OK |
| `src/features/records/` | 1 | OK |
| `src/features/settings/` | 0 | Gap — settings tabs |
| `src/features/shelly-chat/` | 0 | **Gap — new feature with complex logic** |
| `src/features/today/` | 3 | Good |
| `src/features/weekly-review/` | 0 | Gap |
| `src/features/workshop/` | 2 | OK |

**Priority test gaps:** `dad-lab/` (complex lifecycle), `shelly-chat/` (new feature, heavy logic), `progress/` (armor tab has complex calculations).

## Dependency Notes
- **npm audit:** 0 vulnerabilities in production dependencies
- **Node.js:** v22.22.2, npm 10.9.7
- **Vite:** v7.3.1
- **TypeScript:** strict mode enabled with `erasableSyntaxOnly` and `verbatimModuleSyntax`
- **ESLint:** v9.39.4 — zero issues across `src/`
