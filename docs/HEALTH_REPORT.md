# Code Health Report — 2026-04-02

## Metrics
- **Total lines:** 104,778
- **Total files:** 425 (.ts/.tsx)
- **Total commits:** 109
- **Test files:** 52
- **Test lines:** 11,806
- **Firestore collections:** 29 (collection helpers in firestore.ts)
- **Cloud Functions:** 18 exported
- **AI task types:** 13 (12 unique handlers; `generate` maps to `handleChat`)

## Largest Files (over 500 lines)

| File | Lines |
|------|-------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,112 |
| `src/features/workshop/WorkshopPage.tsx` | 1,578 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,456 |
| `src/features/books/BookEditorPage.tsx` | 1,419 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,293 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,290 |
| `functions/src/ai/chat.ts` | 1,186 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,174 |
| `src/features/records/RecordsPage.tsx` | 1,124 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,055 |
| `src/features/records/records.logic.test.ts` | 1,053 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,051 |
| `src/features/settings/AvatarAdminTab.tsx` | 997 |
| `src/features/books/BookshelfPage.tsx` | 981 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 |
| `src/features/quest/useQuestSession.ts` | 954 |
| `src/features/avatar/BrothersVoxelScene.tsx` | 865 |
| `src/features/books/printBook.ts` | 864 |
| `src/features/today/TodayPage.tsx` | 830 |
| `src/features/today/KidTodayView.tsx` | 805 |
| `src/features/dad-lab/LabReportForm.tsx` | 776 |
| `src/features/evaluation/SkillSnapshotPage.tsx` | 774 |
| `src/features/workshop/GamePlayView.tsx` | 772 |
| `src/features/progress/ArmorTab.tsx` | 745 |
| `src/features/today/TodayChecklist.tsx` | 744 |
| `src/features/quest/ReadingQuest.tsx` | 711 |
| `src/core/data/seed.ts` | 704 |
| `src/features/books/useBook.ts` | 692 |
| `src/features/workshop/workshopUtils.ts` | 675 |
| `src/features/ladders/lincolnLadders.ts` | 670 |
| `src/features/books/BookReaderPage.tsx` | 655 |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | 651 |
| `src/features/records/records.logic.ts` | 640 |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 629 |
| `src/core/types/planning.ts` | 626 |
| `functions/src/ai/contextSlices.ts` | 612 |
| `src/features/books/StickerPicker.tsx` | 599 |
| `src/features/today/ReadingRoutineItems.tsx` | 584 |
| `src/features/avatar/voxel/buildCharacter.ts` | 575 |
| `functions/src/ai/evaluate.ts` | 567 |
| `functions/src/ai/generate.ts` | 564 |
| `src/features/weekly-review/WeeklyReviewPage.tsx` | 548 |
| `src/features/workshop/MyGamesGallery.tsx` | 538 |
| `functions/src/ai/tasks/workshop.ts` | 533 |
| `src/features/avatar/voxel/minecraftSkin.ts` | 528 |
| `src/features/books/SketchScanner.tsx` | 524 |
| `src/features/workshop/workshopArt.ts` | 523 |
| `src/features/workshop/CollectingPlayView.tsx` | 516 |
| `src/features/workshop/BattlePlayView.tsx` | 509 |
| `src/features/workshop/AdventurePlayView.tsx` | 504 |

## Files Changed This Week

Grouped by feature area (last ~30 commits):

**Core / Config**
- `CLAUDE.md`, `package.json`, `package-lock.json`
- `firestore.indexes.json`, `firestore.rules`, `storage.rules`

**AI / Cloud Functions**
- `functions/src/ai/chat.ts`
- `functions/src/ai/imageTasks/generateImage.ts`
- `functions/src/ai/tasks/index.ts`
- `functions/src/ai/tasks/shellyChat.ts`

**Core Libraries**
- `src/core/ai/useAI.ts`
- `src/core/firebase/firestore.ts`
- `src/core/types/books.ts`, `shellyChat.ts`, `workshop.ts`, `xp.ts`, `index.ts`
- `src/core/utils/compressImage.ts`
- `src/app/App.css`, `AppShell.tsx`, `router.tsx`

**Avatar**
- `MyAvatarPage.tsx`, `VoxelCharacter.tsx`, `AvatarCharacterDisplay.tsx`
- `AvatarCustomizer.tsx`, `CharacterTunerPanel.tsx`, `AccessoriesPanel.tsx`
- Voxel subsystem: `buildArmorPiece.ts`, `buildCharacter.ts`, `buildAccessory.ts`, `buildCape.ts`, `blockOutline.ts`
- `normalizeProfile.ts`, `BrothersVoxelScene.tsx` (not in diff but related)

**Books**
- `BookReaderPage.tsx`, `BookEditorPage.tsx`, `PageEditor.tsx`
- `StickerPicker.tsx`, `DraggableImage.tsx`, `draggableImageUtils.ts`
- `printBook.ts`

**Shelly Chat**
- `ShellyChatPage.tsx`, `ChatThreadDrawer.tsx`, `ChatMessageBubble.tsx`
- `formatRelativeTime.ts`, `openChatWithContext.ts`, `index.ts`

**Workshop**
- `WorkshopPage.tsx`, `GamePlayView.tsx`, `BattlePlayView.tsx`
- `CollectingPlayView.tsx`, `MatchingPlayView.tsx`, `BoardSpace.tsx`
- `GameBoard.tsx`, `WorldMap.tsx`, `steps/PlayersStep.tsx`

**Today / Planner**
- `TodayPage.tsx`, `TodayChecklist.tsx`
- `PlannerChatPage.tsx`, `TeachHelperDialog.tsx`

**Docs**
- `DOCUMENT_INDEX.md`, `MASTER_OUTLINE.md`, `SYSTEM_PROMPTS.md`

## Auto-Fixes Applied
- Unused imports removed: **0** (codebase is clean — `tsc --noUnusedLocals` reports nothing)
- Lint issues fixed: **0** (ESLint `--fix --quiet` produces no changes)
- Inline handlers extracted: **0** (no inline JSX handlers exceed 20 lines)
- Files split: **none** (only PlannerChatPage.tsx at 2,112 lines; interconnected state makes splitting risky per CLAUDE.md)
- Dead exports removed: **0** (all candidates are Firestore document shapes or internally-used types; see below)

## Issues Found (Not Auto-Fixed)

### High Priority
None. The app builds cleanly, all 958 tests pass, and there are 0 ESLint errors and 0 production dependency vulnerabilities.

### Medium Priority

1. **`functions/src/` lacks npm install in CI check context** — `tsc -b` fails in functions/ due to missing `node_modules`. The ~40 implicit `any` errors (TS7006) in functions/ indicate `strict: true` catches untyped callback params. Not blocking builds (functions have their own deploy pipeline), but worth addressing incrementally.

2. **Outdated dependencies with major version bumps available:**
   - `eslint` 9.39 → 10.1 (major)
   - `typescript` 5.9 → 6.0 (major)
   - `vite` 7.3 → 8.0 (major)
   - `vitest` 3.2 → 4.1 (major)
   - `three` / `@types/three` 0.128 → 0.183 (major — would affect VoxelCharacter)
   - `jsdom` 27.4 → 29.0 (major)

   Recommend: update `typescript-eslint` (8.57→8.58, minor) now. Schedule major bumps individually with testing.

3. **ShellyChatPage.tsx (1,456L)** — New this week with thread/tab features. Growing fast. Monitor for decomposition opportunity once feature set stabilizes.

### Low Priority

1. **Dead type exports (not removed — Firestore document shapes):**
   - `SightWordList` (books.ts:178) — Firestore doc shape
   - `LadderRungDefinition` (common.ts:86) — field type used internally
   - `SessionLogEntry` (dadlab.ts:11) — field type used internally
   - `LabStageCapture` (dadlab.ts:77) — Firestore sub-document shape
   - `PlannerSessionStatus` (enums.ts:177) — state machine enum, possibly for future planner state tracking
   - `FamilySettings` (family.ts:7) — field type used internally
   - `WeeklyPlanItem` (planning.ts:307) — Firestore doc shape
   - `SkillTagDefinition` (skillTags.ts:10) — types the publicly used SKILL_TAG_MAP/CATALOG
   - `AccessoryMeta` (xp.ts:292) — types the ACCESSORIES array
   - `ARMOR_PIECE_SHEET_INDEX` (xp.ts:435) — armor sprite-sheet mapping, may be used by image functions
   - `PIECE_POSITIONS` (xp.ts:454) — armor overlay positioning, may be used by image functions
   - `XpEventLogEntry` (xp.ts:470) — Firestore doc shape

2. **Entire `zod.ts` file (117 lines) is unused** — 10 Zod validation schemas + 10 inferred types, none imported anywhere. These document Firestore schemas via Zod but aren't actively used for validation. Candidate for removal if validation isn't planned.

3. **Ladder system partially deprecated** — CLAUDE.md notes 5 files with TODO comments marking ladder references for removal. Disposition system is replacing it.

## Decomposition Candidates

| File | Lines | Notes |
|------|-------|-------|
| `PlannerChatPage.tsx` | 2,112 | Only file over 2K. Setup wizard state is interleaved with chat/plan state. CLAUDE.md documents this as stable tech debt. Could extract top-level utility functions (lines 98–175) to a `plannerUtils.ts` but benefit is minimal. |
| `WorkshopPage.tsx` | 1,578 | Phase-based rendering with shared `currentGame` state across 3 game types. Not urgent — handlers are sectioned. |
| `ShellyChatPage.tsx` | 1,456 | Newest large file. Thread management + tab UI + message handling. Could extract thread management into a custom hook once feature stabilizes. |
| `BookEditorPage.tsx` | 1,419 | Stable. Sketch/voice/sticker panels could extract later. |
| `MyAvatarPage.tsx` | 1,293 | Decomposed from 1,862L recently. Remaining code is ceremony flow + state. |
| `VoxelCharacter.tsx` | 1,290 | Three.js render loop — splitting is risky. Leave as-is. |

## Charter Alignment Check

**Tasks using `buildContextForTask` (shared context system):**
- `analyzeWorkbook`, `disposition`, `quest`, `evaluate`, `chatHandler`, `generateStory`, `workshop`, `plan`, `scan`

**Tasks using `CHARTER_PREAMBLE` only (family-level, not child-specific):**
- `weeklyFocus`, `conundrum`

**Tasks with custom charter loading:**
- `shellyChat` — loads `charterSummary` from `families/{familyId}` document directly

**Tasks with no charter context:**
- `analyzePatterns` — pattern analysis from evaluation sessions (statistical, not generative)

**Any drift detected:** No. The charter context integration is consistent:
- Child-specific tasks use `buildContextForTask` which injects charter + child profile
- Family-level generators use `CHARTER_PREAMBLE` directly (appropriate for non-child-specific content)
- `shellyChat` uses its own loading path (charterSummary field) which is reasonable for a general chat
- `analyzePatterns` correctly omits charter (it's a data analysis task, not content generation)

## Test Coverage Gaps

| Feature Directory | Test Files | Risk |
|---|---|---|
| `auth/` | 0 | Low — thin wrapper |
| `dad-lab/` | 0 | **Medium** — lifecycle logic (plan→start→contribute→complete) |
| `evaluation/` | 0 | Medium — SkillSnapshotPage has complex rendering |
| `login/` | 0 | Low — profile selection UI |
| `not-found/` | 0 | Low — static page |
| `planner/` | 0 | Low — TeachHelperDialog only |
| `progress/` | 0 | Medium — multiple tabs with data aggregation |
| `settings/` | 0 | Low — admin/config UI |
| `shelly-chat/` | 0 | **Medium** — new feature, growing fast, has formatting logic |
| `weekly-review/` | 0 | Low — mostly display |

**Highest priority test gaps:** `dad-lab/` (lifecycle logic) and `shelly-chat/` (new, complex, growing).

**Well-tested areas:** `planner-chat/` (8 test files, 1,051 lines), `avatar/` (5 test files, 651 lines), `books/` (4 test files), `today/` (3 test files).

## Dependency Notes

- **0 production vulnerabilities** (`npm audit --production`)
- **Minor update available:** `typescript-eslint` 8.57.2 → 8.58.0 (safe to update)
- **Major updates available (schedule individually):**
  - `typescript` 5.9 → 6.0
  - `eslint` 9.39 → 10.1
  - `vite` 7.3 → 8.0
  - `vitest` 3.2 → 4.1
  - `three` 0.128 → 0.183 (affects VoxelCharacter — test carefully)
  - `jsdom` 27.4 → 29.0
  - `@types/node` 24.12 → 25.5
  - `eslint-plugin-react-refresh` 0.4 → 0.5
  - `globals` 16.5 → 17.4
