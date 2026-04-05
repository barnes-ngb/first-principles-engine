# Code Health Report — 2026-04-05

## Metrics
- **Total lines:** 113,417
- **Total files:** 450
- **Total commits:** 108
- **Test files:** 56
- **Test lines:** 12,284
- **Firestore collections:** 31 (via `firestore.ts` collection helpers)
- **Cloud Functions:** 19 exported (healthCheck, chat, analyzeEvaluationPatterns, weeklyReview, generateWeeklyReviewNow, generateActivity, generateImage, generateAvatarPiece, generateStarterAvatar, transformAvatarPhoto, generateArmorPiece, generateBaseCharacter, generateArmorSheet, generateArmorReference, extractFeatures, generateMinecraftSkin, generateMinecraftFace, enhanceSketch)
- **AI task types:** 13 (analyzePatterns, analyzeWorkbook, chat, conundrum, disposition, evaluate, generateStory, plan, quest, scan, shellyChat, weeklyFocus, workshop)
- **Tests:** 991 passing across 55 test files

## Largest Files (over 500 lines)

| File | Lines |
|------|-------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,184 |
| `src/features/workshop/WorkshopPage.tsx` | 1,606 |
| `functions/src/ai/chat.ts` | 1,589 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,528 |
| `src/features/quest/useQuestSession.ts` | 1,458 |
| `src/features/books/BookEditorPage.tsx` | 1,458 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,386 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,290 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,174 |
| `src/features/records/RecordsPage.tsx` | 1,124 |
| `src/features/today/KidTodayView.tsx` | 1,082 |
| `src/features/evaluation/SkillSnapshotPage.tsx` | 1,078 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,055 |
| `src/features/records/records.logic.test.ts` | 1,053 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,051 |
| `src/features/books/BookshelfPage.tsx` | 1,006 |
| `src/features/settings/AvatarAdminTab.tsx` | 997 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 |
| `src/features/books/printBook.ts` | 937 |
| `src/features/today/TodayPage.tsx` | 899 |
| `src/features/avatar/BrothersVoxelScene.tsx` | 865 |
| `src/features/quest/ReadingQuest.tsx` | 830 |
| `src/features/dad-lab/LabReportForm.tsx` | 776 |
| `src/features/workshop/GamePlayView.tsx` | 772 |
| `src/features/books/BookReaderPage.tsx` | 772 |
| `functions/src/ai/contextSlices.ts` | 754 |
| `src/features/today/TodayChecklist.tsx` | 748 |
| `src/features/progress/ArmorTab.tsx` | 745 |
| `src/features/books/useBook.ts` | 742 |
| `src/core/data/seed.ts` | 704 |
| `src/core/types/planning.ts` | 684 |
| `src/features/workshop/workshopUtils.ts` | 675 |
| `src/features/ladders/lincolnLadders.ts` | 670 |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | 651 |
| `src/features/records/records.logic.ts` | 640 |
| `src/features/records/EvaluationHistoryTab.tsx` | 635 |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 629 |
| `functions/src/ai/evaluate.ts` | 609 |
| `src/features/books/StickerPicker.tsx` | 599 |

## Files Changed This Week

515 files changed total (major refactoring week). Top areas by change volume:

| Feature Area | Files Changed |
|---|---|
| `src/features/avatar/` | 37 |
| `src/features/books/` | 34 |
| `src/features/workshop/` | 33 |
| `src/features/today/` | 33 |
| `src/features/planner-chat/` | 32 |
| `src/components/` | 23 |
| `src/features/avatar/voxel/` | 20 |
| `src/core/types/` | 16 |
| `src/features/workshop/steps/` | 12 |
| `src/core/utils/` | 12 |
| `src/core/hooks/` | 12 |
| `src/features/quest/` | 10 |
| `src/features/records/` | 9 |
| `src/features/progress/` | 9 |
| `src/features/ladders/` | 9 |
| `src/core/xp/` | 9 |
| `src/features/shelly-chat/` | 6 |
| `src/features/settings/` | 5 |
| `src/features/dad-lab/` | 5 |

## Auto-Fixes Applied
- Unused imports removed: **0** (codebase is clean — TypeScript `noUnusedLocals` enforces this)
- Lint issues fixed: **0** (ESLint `--fix` found no auto-fixable issues)
- Inline handlers extracted: **0** (no inline JSX arrow functions over 20 lines found)
- Files split: **none** (no files over 2,000-line threshold requiring extraction — PlannerChatPage at 2,184 is the only candidate; see Decomposition Candidates)
- Dead exports removed: **14** (4 interfaces, 1 const, 1 deprecated interface, 10 unused zod inferred types — see below)

## Issues Found (Not Auto-Fixed)

### High Priority
- **None.** Build, lint, and all 991 tests pass cleanly.

### Medium Priority
- **PlannerChatPage.tsx (2,184 lines)** is the only file over 2,000 lines. Down from ~2,617 noted in CLAUDE.md — decomposition is working. The setup wizard section remains a candidate for extraction but shares state with the chat flow.
- **ESLint does not cover `functions/src/`** — the `functions/` directory has its own eslint config that isn't resolvable from the root project's eslint. Consider adding a lint script in `functions/package.json`.
- **`functions/src/ai/chat.ts` (1,589 lines)** — large task dispatcher with implicit `any` parameters (visible in TSC output). Type annotations for callback parameters would improve safety.

### Low Priority
- **Vite chunk warning:** Main bundle `index-DnjdAqZ2.js` is 3,520 KB (1,038 KB gzipped). Dynamic imports or manual chunks could reduce initial load.
- **`isWorksheetScan` in `planning.ts`** — exported type guard function only referenced in its definition file. Consumers may use `isCertificateScan` instead. Verify and remove if unused.
- **Deprecated ladder system** — CLAUDE.md notes 5 files with TODO comments for ladder removal. Still present; disposition system is the replacement.

## Dead Type Exports

### Removed (14 total)
- `xp.ts`: `ARMOR_PIECE_SHEET_INDEX` (unused const), `XpEventLogEntry` (deprecated, never used)
- `dadlab.ts`: `LabStageCapture` (unused interface)
- `planning.ts`: `WeeklyPlanItem` (unused interface)
- `zod.ts`: 10 inferred schema types never imported (`SubjectBucketSchema`, `EngineStageSchema`, `EvidenceTypeSchema`, `DayBlockTypeSchema`, `ChecklistItemSchema`, `DayBlockSchema`, `DayLogSchema`, `ArtifactTagsSchema`, `ArtifactSchema`, `WeekPlanSchema`)

### Kept (Firestore schema documentation)
- `planning.ts`: 13 `*Log` interfaces extending `RoutineItem` (describe daily log routine items), `PlannedSession`, `PlanModification`
- `workshop.ts`: `ActiveSessionPlayer`, `GameRule`, `GameMetadata`, `AdventureNode`, `AdventureChoice`, `AdventureChallenge`, `ActiveCardGamePlayer`, `RevisionEntry`, `CardDifficulty`
- `common.ts`: `LadderRungDefinition` (deprecated ladder system)
- `family.ts`: `FamilySettings`
- `books.ts`: `getPresetTheme`, `SightWordList`
- `dadlab.ts`: `SessionLogEntry`
- `xp.ts`: `XpLedgerSources`, `AccessoryMeta`

## Decomposition Candidates

| File | Lines | Notes |
|------|-------|-------|
| `PlannerChatPage.tsx` | 2,184 | Setup wizard is the best extraction candidate. Shares chat/plan/apply state — needs careful prop design. Wizard state (`wizardStep`, `selectedChild`, etc.) is somewhat isolated. |
| `WorkshopPage.tsx` | 1,606 | Phase-based rendering. Handlers share `currentGame` state across 3 game types. Not urgent. |
| `functions/src/ai/chat.ts` | 1,589 | Task dispatcher + prompt builders. Could extract prompt building per-task into the tasks/ directory. |
| `ShellyChatPage.tsx` | 1,528 | 23+ useState hooks. Image generation flow, thread management, follow-up suggestions could be separate hooks. New feature — wait for patterns to stabilize. |
| `useQuestSession.ts` | 1,458 | Large hook. Quest session state machine could split into phase-specific hooks. |
| `BookEditorPage.tsx` | 1,458 | Stable. Sketch/voice/sticker panels could extract later. |
| `MyAvatarPage.tsx` | 1,386 | Down from ~2,445 noted in CLAUDE.md. Good progress. 3D scene, equip panel could separate further. |

## Charter Alignment Check

### Tasks using `buildContextForTask` (shared context with charter):
- `analyzeWorkbook` — charter + childProfile
- `disposition` — charter + childProfile + engagement + gradeResults
- `quest` — childProfile + sightWords + recentEval + wordMastery
- `shellyChat` — charter + childProfile + sightWords + weekFocus + wordMastery
- `evaluate` — charter + childProfile + sightWords + wordMastery
- `chatHandler` — charter + childProfile
- `generateStory` — childProfile + sightWords + wordMastery
- `workshop` — charter + childProfile + workshopGames
- `plan` — charter + childProfile + wordMastery + generatedContent + workshopGames
- `scan` — childProfile + recentEval

### Tasks using `CHARTER_PREAMBLE` only (direct import):
- `weeklyFocus` — family-level generator, not child-specific
- `conundrum` — family-level generator, not child-specific

### Tasks with no charter context:
- `analyzePatterns` — pattern analysis from evaluation sessions (likely uses evaluation data only)

### Drift detected: **No**
All child-specific tasks use `buildContextForTask` which injects charter values consistently. Family-level tasks use `CHARTER_PREAMBLE` directly. The `evaluate.ts` (weekly review) is noted in CLAUDE.md as separate from the task system — still uses `CHARTER_PREAMBLE` + addendum.

## Test Coverage Gaps

| Feature Directory | Test Files | Status |
|---|---|---|
| `src/features/auth/` | 0 | Gap — auth guard logic untested |
| `src/features/dad-lab/` | 0 | Gap — dad lab lifecycle untested |
| `src/features/evaluation/` | 0 | Gap — skill snapshot page untested |
| `src/features/login/` | 0 | Gap — profile selection untested |
| `src/features/not-found/` | 0 | Trivial — 404 page |
| `src/features/planner/` | 0 | Gap — TeachHelperDialog untested |
| `src/features/progress/` | 0 | Gap — progress tabs (7 sub-tabs) untested |
| `src/features/settings/` | 0 | Gap — settings tabs untested |
| `src/features/shelly-chat/` | 0 | Gap — new feature, high priority |
| `src/features/weekly-review/` | 0 | Gap — weekly review page untested |

**Well-tested areas:** planner-chat (8 tests), avatar (5), books (4), today (3), quest (2), workshop (2)

## Dependency Notes
- `npm audit --production`: **0 vulnerabilities** found
- No security issues detected
- Bundle size (3,520 KB unminified / 1,038 KB gzipped) is growing — consider code splitting for Three.js and heavy feature modules
