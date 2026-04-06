# Code Health Report — 2026-04-06

## Metrics
- **Total lines:** ~119,605
- **Total files:** 466
- **Total commits:** 106
- **Test files:** 56
- **Test lines:** 12,206
- **Firestore collections:** 32 (via `firestore.ts` collection helpers + 2 subcollections)
- **Cloud Functions:** 18 exported (healthCheck, chat, analyzeEvaluationPatterns, weeklyReview, generateWeeklyReviewNow, generateActivity, generateImage, generateAvatarPiece, generateStarterAvatar, transformAvatarPhoto, generateArmorPiece, generateBaseCharacter, generateArmorSheet, generateArmorReference, extractFeatures, generateMinecraftSkin, generateMinecraftFace, enhanceSketch)
- **AI task types:** 13 (analyzePatterns, analyzeWorkbook, chat, conundrum, disposition, evaluate, generateStory, plan, quest, scan, shellyChat, weeklyFocus, workshop)
- **Tests:** 1,025 passing across 56 test files

## Largest Files (over 500 lines)

| File | Lines |
|------|-------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,252 |
| `src/features/books/BookEditorPage.tsx` | 1,886 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 |
| `src/features/workshop/WorkshopPage.tsx` | 1,606 |
| `functions/src/ai/chat.ts` | 1,599 |
| `src/features/quest/useQuestSession.ts` | 1,545 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,386 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,293 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,242 |
| `src/features/records/RecordsPage.tsx` | 1,127 |
| `src/features/today/KidTodayView.tsx` | 1,083 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,060 |
| `src/features/records/records.logic.test.ts` | 1,053 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,051 |
| `src/features/books/BookshelfPage.tsx` | 1,006 |
| `src/features/settings/AvatarAdminTab.tsx` | 997 |
| `src/features/today/TodayPage.tsx` | 982 |
| `src/features/today/TodayChecklist.tsx` | 973 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 |
| `src/features/books/printBook.ts` | 937 |
| `functions/src/ai/contextSlices.ts` | 914 |
| `src/features/avatar/BrothersVoxelScene.tsx` | 865 |
| `src/features/quest/ReadingQuest.tsx` | 830 |
| `src/features/dad-lab/LabReportForm.tsx` | 797 |
| `src/core/types/planning.ts` | 795 |
| `src/features/workshop/GamePlayView.tsx` | 772 |
| `src/features/books/BookReaderPage.tsx` | 772 |
| `src/features/books/useBook.ts` | 754 |
| `src/features/progress/ArmorTab.tsx` | 745 |
| `src/core/data/seed.ts` | 704 |
| `src/features/workshop/workshopUtils.ts` | 675 |
| `src/features/progress/CurriculumTab.tsx` | 670 |
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
- Files split: **none** (no files over 2,000-line threshold requiring extraction — PlannerChatPage at 2,252 is the only candidate; see Decomposition Candidates)
- Dead exports removed: **14** (4 interfaces, 1 const, 1 deprecated interface, 10 unused zod inferred types — see below)

## Issues Found (Not Auto-Fixed)

### High Priority
- **None.** Build, lint, and all 1,025 tests pass cleanly.

### Medium Priority
- **PlannerChatPage.tsx (2,252 lines)** is the only file over 2,000 lines. The setup wizard section remains a candidate for extraction but shares state with the chat flow.
- **BookEditorPage.tsx (1,886 lines)** grew from themes + drawing flows. Second largest component file.
- **ESLint does not cover `functions/src/`** — the `functions/` directory has its own eslint config that isn't resolvable from the root project's eslint. Consider adding a lint script in `functions/package.json`.
- **`functions/src/ai/chat.ts` (1,599 lines)** — large task dispatcher with implicit `any` parameters (visible in TSC output). Type annotations for callback parameters would improve safety.
- **`functions/src/ai/contextSlices.ts` (914 lines)** — grew significantly; context assembly logic is expanding with each new task type.

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
| `PlannerChatPage.tsx` | 2,252 | Setup wizard is the best extraction candidate. Shares chat/plan/apply state — needs careful prop design. Wizard state (`wizardStep`, `selectedChild`, etc.) is somewhat isolated. |
| `BookEditorPage.tsx` | 1,886 | Grew from themes + drawing flows. Sketch/voice/sticker panels could extract. |
| `ShellyChatPage.tsx` | 1,653 | 23+ useState hooks. Image generation flow, thread management, follow-up suggestions could be separate hooks. |
| `WorkshopPage.tsx` | 1,606 | Phase-based rendering. Handlers share `currentGame` state across 3 game types. Not urgent. |
| `functions/src/ai/chat.ts` | 1,599 | Task dispatcher + prompt builders. Could extract prompt building per-task into the tasks/ directory. |
| `useQuestSession.ts` | 1,545 | Large hook. Quest session state machine could split into phase-specific hooks. |
| `MyAvatarPage.tsx` | 1,386 | Decomposed from ~2,445. 3D scene, equip panel could separate further. |
| `chatPlanner.logic.ts` | 1,293 | Core planner logic. Growing with each planning improvement. |

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
