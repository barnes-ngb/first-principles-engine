# Code Health Report — 2026-03-31

## Metrics
- **Total lines:** 100,088
- **Total files:** 408
- **Total commits:** 116
- **Test files:** 52
- **Test lines:** 11,806
- **Firestore collection refs:** 27
- **Cloud Functions:** 18
- **AI task types:** 12 (plan, evaluate, quest, workshop, generateStory, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, chat, analyzePatterns)

## Largest Files (over 500 lines)

| File | Lines |
|------|-------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,112 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,863 |
| `src/features/workshop/WorkshopPage.tsx` | 1,549 |
| `src/features/books/BookEditorPage.tsx` | 1,419 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,264 |
| `functions/src/ai/chat.ts` | 1,179 |
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
| `src/features/today/TodayPage.tsx` | 816 |
| `src/features/today/KidTodayView.tsx` | 805 |
| `src/features/dad-lab/LabReportForm.tsx` | 776 |
| `src/features/evaluation/SkillSnapshotPage.tsx` | 774 |
| `src/features/progress/ArmorTab.tsx` | 745 |
| `src/features/workshop/GamePlayView.tsx` | 729 |
| `src/features/today/TodayChecklist.tsx` | 720 |
| `src/features/quest/ReadingQuest.tsx` | 711 |
| `src/core/data/seed.ts` | 704 |
| `src/features/books/useBook.ts` | 692 |
| `src/features/workshop/workshopUtils.ts` | 675 |
| `src/features/ladders/lincolnLadders.ts` | 670 |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | 651 |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 650 |
| `src/features/books/printBook.ts` | 642 |
| `src/features/records/records.logic.ts` | 640 |
| `src/core/types/planning.ts` | 626 |
| `functions/src/ai/contextSlices.ts` | 612 |
| `src/features/books/BookReaderPage.tsx` | 592 |
| `src/features/today/ReadingRoutineItems.tsx` | 584 |
| `functions/src/ai/evaluate.ts` | 567 |
| `functions/src/ai/generate.ts` | 564 |
| `src/features/avatar/voxel/buildCharacter.ts` | 562 |
| `src/features/weekly-review/WeeklyReviewPage.tsx` | 548 |
| `src/features/workshop/MyGamesGallery.tsx` | 538 |
| `functions/src/ai/tasks/workshop.ts` | 533 |
| `src/features/avatar/voxel/minecraftSkin.ts` | 528 |
| `src/features/books/SketchScanner.tsx` | 524 |
| `src/features/workshop/workshopArt.ts` | 523 |
| `src/features/workshop/AdventurePlayView.tsx` | 504 |

## Files Changed This Week

**Avatar system (18 files)** — Major decomposition + Minecraft Legends proportions overhaul:
- `MyAvatarPage.tsx`, `VoxelCharacter.tsx`, `BrothersVoxelScene.tsx`, `PoseButtons.tsx`
- Extracted: `ArmorPieceGallery.tsx`, `ArmorVerseCard.tsx`, `AvatarPhotoUpload.tsx`, `speakVerse.ts`
- Voxel: `buildCharacter.ts`, `buildArmorPiece.ts`, `buildAccessory.ts`, `buildCape.ts`, `buildHair.ts`, `buildHelmetCrest.ts`, `tierMaterials.ts`

**Planner-chat (11 files)** — Decomposition into display components:
- `PlannerChatPage.tsx`, `PlannerSetupWizard.tsx`, `PlanDayCards.tsx`, `PlanPreviewCard.tsx`
- `PlanSummaryPanel.tsx`, `PlannerChatMessages.tsx`, `WeekFocusPanel.tsx`, `ContextDrawer.tsx`
- Logic: `chatPlanner.logic.ts`, `chatPlanner.logic.test.ts`, `generateMaterials.ts`

**Kid Today (11 files)** — Decomposed KidTodayView:
- `KidTodayView.tsx`, `KidChecklist.tsx`, `KidCelebration.tsx`, `KidTeachBack.tsx`
- `KidChapterResponse.tsx`, `KidConundrumResponse.tsx`, `KidExtraLogger.tsx`
- `TodayPage.tsx`, `TodayChecklist.tsx`, `TeachBackSection.tsx`, `WeekFocusCard.tsx`

**Cloud Functions (all AI tasks)** — Context slices refactor across all task handlers

**Other:** `App.tsx`, `EnginePage.tsx`, `RecordsPage.tsx`, auth, types, engine logic

## Auto-Fixes Applied
- Unused imports removed: 0 (none found — TypeScript + ESLint already clean)
- Lint issues fixed: 1 (react-refresh/only-export-components in ArmorVerseCard — extracted `speakVerse` to own module)
- Inline handlers extracted: 0 (no handlers exceeded 20-line threshold)
- Files split: none (only PlannerChatPage at 2,112 lines; setup wizard already extracted; remaining bulk is handler logic)
- Dead exports removed: 4 (`PlannerSessionStatus`, `ARMOR_PIECE_SHEET_INDEX`, `PIECE_POSITIONS`, `XpEventLogEntry`)

## Issues Found (Not Auto-Fixed)

### High Priority
- **None.** Build, lint, and all 958 tests pass cleanly.

### Medium Priority
- **PlannerChatPage.tsx (2,112L)** remains the largest file. The setup wizard is already extracted, and subcomponents exist for display. The remaining bulk is ~30 handler functions and state declarations that share scope heavily. Further decomposition would require a custom hook extraction (`usePlannerChat`) but touches >15 shared state variables — risky for automated change.
- **functions/ has 15 npm vulnerabilities** (9 low, 1 moderate, 5 high) — all in dev dependencies (vite, vitest, picomatch). Production audit is clean (0 vulnerabilities). Consider `npm audit fix` in functions/ when convenient.
- **3.2 MB main JS bundle** — `index-*.js` is 3,204 KB (946 KB gzipped). Code-splitting via dynamic imports would help. The Vite build already warns about this.

### Low Priority
- **Ladder system partially deprecated** — 5 files have TODO comments marking ladder references for removal as disposition system replaces it.
- **evaluate.ts (weekly review)** has separate prompt construction outside the task registry pattern.
- **XP ledger** full-collection recompute on every award remains a performance concern at scale.

## Decomposition Candidates

| File | Lines | Notes |
|------|-------|-------|
| `PlannerChatPage.tsx` | 2,112 | Extract `usePlannerChat` hook (30+ handlers, 15+ state vars). Complex shared state makes this risky for automation. Setup wizard already extracted. |
| `MyAvatarPage.tsx` | 1,863 | Photo upload, gallery, and verse card already extracted this week. Remaining: 3D scene controls, equip logic, admin panel. Admin panel (~200L) could be a separate route. |
| `WorkshopPage.tsx` | 1,549 | Wizard steps, generation, and game play views. `GamePlayView` is already separate. Wizard step content could extract. |
| `BookEditorPage.tsx` | 1,419 | Page editor, toolbar, preview. Toolbar + page list are candidates. |
| `VoxelCharacter.tsx` | 1,264 | Three.js scene setup, armor equip, animation. Tightly coupled to refs and Three.js lifecycle. |

## Charter Alignment Check

**Tasks using `buildContextForTask` (shared context with charter):**
- analyzeWorkbook, disposition, quest, evaluate, chat, generateStory, workshop, plan, scan

**Tasks using `CHARTER_PREAMBLE` only (direct import):**
- weeklyFocus, conundrum

**Tasks with no charter context:**
- analyzePatterns (pattern analysis from evaluation data — no generation, charter not needed)

**Drift detected:** No. All generative tasks include charter context. `analyzePatterns` is data analysis only (no content generation), so omission is appropriate.

## Test Coverage Gaps

| Feature | Test Files | Status |
|---------|-----------|--------|
| `auth/` | 0 | Gap — login flow untested |
| `dad-lab/` | 0 | Gap — lab lifecycle untested |
| `evaluation/` | 0 | Gap — skill snapshot untested |
| `login/` | 0 | Gap — profile selection untested |
| `not-found/` | 0 | Trivial — 404 page |
| `planner/` | 0 | Minimal — TeachHelperDialog only |
| `progress/` | 0 | Gap — progress tabs untested |
| `settings/` | 0 | Gap — settings panels untested |
| `weekly-review/` | 0 | Gap — review page untested |
| **Well-tested:** | | |
| `planner-chat/` | 8 | Strong coverage |
| `avatar/` | 5 | Good coverage |
| `books/` | 4 | Good coverage |
| `today/` | 3 | Moderate coverage |

**Critical untested paths:** Dad Lab lifecycle, evaluation/skill snapshot, and weekly review all involve Firestore writes + AI calls.

## Dependency Notes

**Root (`npm audit --production`):** 0 vulnerabilities — clean.

**Functions (`npm audit`):** 15 vulnerabilities (9 low, 1 moderate, 5 high) — all in dev dependencies (vite, vitest, picomatch transitive). No production exposure. Run `npm audit fix` when convenient.
