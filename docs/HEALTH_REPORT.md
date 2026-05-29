# Code Health Report — 2026-05-29

## Metrics

| Metric | Value | Change from last report (2026-04-06) |
|--------|-------|--------------------------------------|
| TypeScript lines (src + functions) | **158,590** | +38,964 (+32.6%) |
| Commits | **137** | +31 |
| Test files | **121** | +64 |
| Tests passing | **1,983** across 120 test files | +958 tests, +64 test files |
| Firestore collection helpers | **34** | +1 |
| Cloud Functions | **24** | +5 |
| Chat task types | **16** | +3 |
| Routes | **32** | +2 |
| Bundle size (main chunk) | **3.7 MB / 1.13 MB gzip** | +0.3 MB / +0.13 MB gzip |

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| Build (`npm run build`) | **PASS** | Clean in 19s |
| Lint (`npm run lint`) | **PASS** | 3 warnings, 0 errors |
| Tests (`vitest run`) | **PASS** | 1,983 passing, 120 test files, 63.9s |

### Lint Warnings (0 errors, 3 warnings)
- `src/features/evaluate/EvaluateChatPage.tsx:282` — `useEffect` missing `sessionTimer` dependency
- `src/features/quest/useQuestSession.ts:679` — `useCallback` missing `sessionTimer` dependency
- `src/features/quest/useQuestSession.ts:1760` — `useCallback` missing `sessionTimer` dependency

All three are the same pattern (`sessionTimer` excluded from deps array). Low risk — `sessionTimer` is a ref or stable value.

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Metric | Doc value | Computed | Status | Action |
|--------|-----------|----------|--------|--------|
| TypeScript lines | 126,034 | 158,590 | **DRIFT** +25.8% | Auto-fixed |
| Commits | 112 | 137 | **DRIFT** +22.3% | Auto-fixed |
| Test files | 69 | 121 | **DRIFT** +75.4% | Auto-fixed |
| Collection helpers | 33 | 34 | **DRIFT** +3% | Auto-fixed |
| Cloud Functions | 23 | 24 | **DRIFT** | Auto-fixed |
| Chat task types | 15 | 16 | **DRIFT** | Auto-fixed |
| Routes | 30 | 32 | **DRIFT** | Auto-fixed |

All stats in MASTER_OUTLINE `**Scale (current)**` block updated to computed values.

### Missing File References

Files mentioned by name in docs that cannot be found in the repo:

| File | Referenced in | Notes |
|------|--------------|-------|
| `QuickCaptureSection.tsx` | `CLAUDE.md` (today/ structure) | May have been renamed or removed |
| `QuickCaptureSection.test.tsx` | `CLAUDE.md` (today/ structure) | Same as above |
| `CreativeTimeLog.tsx` | docs (exact source unclear) | Cannot locate in src/ |

> `PARENT_EXPERIENCE_AUDIT.md` and `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` appear as MISSING but are correctly marked REMOVED in `DOCUMENT_INDEX.md` — expected false positives.

### Nav Discrepancy

Kid nav in MASTER_OUTLINE: `Today, Knowledge Mine, My Books, Books About Me, My Hero, Game Workshop, Dad Lab`

Kid nav in code (`AppShell.tsx`): `Today, Knowledge Mine, My Books, Books About Me, My Hero, **My Stuff**, Game Workshop, Dad Lab`

**"My Stuff" is in code but not in MASTER_OUTLINE.** Needs human review.

### New Task Type Not Documented

`reviseStory` is registered in `functions/src/ai/tasks/index.ts` and has a handler at `functions/src/ai/tasks/reviseStory.ts`, but is **not listed** in `SYSTEM_PROMPTS.md` (which documents 15 task types) or in `MASTER_OUTLINE.md`. The `chat` dispatch description in `CLAUDE.md` also omits it.

### New Cloud Function Not in CLAUDE.md

`auditMonthlyReviewSources` is exported from `functions/src/index.ts` but **not listed** in `CLAUDE.md`'s Cloud Functions section (which still says 23).

### Missing Collection in CLAUDE.md

`monthlyReviews` collection helper exists in `firestore.ts` but is **not listed** in the `CLAUDE.md` Firestore collections table.

### Unindexed Docs

7 files in `docs/` not listed in `DOCUMENT_INDEX.md`:

| File | Status |
|------|--------|
| `DESIGN_SKIP_SYSTEM_2026-04-09.md` | Not indexed |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | Not indexed |
| `DOC_INDEX_UPDATES_FOR_STORY_GEN_V2.md` | Not indexed |
| `REVIEW_INTENT_2026-04-09.md` | Not indexed |
| `REVIEW_INTENT_ACTIONS.md` | Not indexed |
| `SKIP_INVENTORY_2026-04-09.md` | Not indexed |
| `WORKINGLEVELS_INSPECTION_2026-04-09.md` | Not indexed |

### Stale Docs

No docs marked CURRENT have gone 30+ days without a commit. All clear.

## Largest Files (over 500 lines)

| File | Lines | Change from last report |
|------|-------|------------------------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +368 |
| `functions/src/ai/chat.ts` | 2,343 | **+744** ⚠️ |
| `src/features/books/BookEditorPage.tsx` | 2,263 | +377 |
| `src/features/quest/useQuestSession.ts` | 1,870 | +325 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +418 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | +0 |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +17 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,562 | +320 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | +70 |
| `functions/src/ai/contextSlices.ts` | 1,324 | **+410** ⚠️ |
| `src/features/records/RecordsPage.tsx` | 1,127 | +0 |
| `src/features/records/records.logic.test.ts` | 1,222 | +169 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | +102 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,156 | +105 |
| `src/features/today/TodayPage.tsx` | 1,104 | +122 |
| `src/features/settings/AvatarAdminTab.tsx` | 1,106 | +109 |
| `src/features/today/TodayChecklist.tsx` | 1,070 | +97 |
| `functions/src/ai/evaluate.ts` | 1,050 | +441 (new entry) |
| `src/features/today/KidTodayView.tsx` | 1,030 | -53 |
| `src/features/books/BookshelfPage.tsx` | 960 | -46 |
| `src/features/dad-lab/DadLabPage.tsx` | 969 | +0 |
| `src/features/books/printBook.ts` | 952 | +15 |
| `src/core/types/planning.ts` | 941 | +146 |
| `functions/src/ai/tasks/monthlyReviewData.ts` | 918 | new |
| `src/features/avatar/voxel/buildArmorPiece.ts` | 913 | new |
| `src/features/books/useBook.ts` | 877 | +123 |
| `functions/src/ai/tasks/monthlyReview.ts` | 887 | new |
| `src/features/progress/CurriculumTab.tsx` | 900 | +230 |

## Decomposition Candidates

Files over 1,500 lines with notable growth since last report:

| File | Lines | Growth | Priority |
|------|-------|--------|----------|
| `functions/src/ai/chat.ts` | 2,343 | +744 | **HIGH** — CLAUDE.md notes `buildQuestPrompt` alone is 400+ lines; extract prompt builders to separate files |
| `src/features/books/BookEditorPage.tsx` | 2,263 | +377 | **MEDIUM** — previously flagged, grew further |
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +368 | MEDIUM — already partially decomposed; state management still monolithic |
| `functions/src/ai/contextSlices.ts` | 1,324 | +410 | MEDIUM — growing fast, consider domain splits |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +418 | LOW — flagged in tech debt, stable otherwise |

## Issues Found

### Auto-Fixed
- MASTER_OUTLINE stats block updated: lines 126,034→158,590, commits 112→137, test files 69→121, collections 33→34, Cloud Functions 23→24, task types 15→16, routes 30→32

### Needs Human Attention

1. **`QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` missing** — Referenced in `CLAUDE.md` today/ structure but not found in repo. Update CLAUDE.md if renamed/removed.

2. **`reviseStory` task type undocumented** — Handler exists at `functions/src/ai/tasks/reviseStory.ts` and is in the registry but not in `SYSTEM_PROMPTS.md`, `CLAUDE.md` task lists, or `MASTER_OUTLINE`.

3. **`auditMonthlyReviewSources` CF undocumented** — Exported from `functions/src/index.ts` but missing from `CLAUDE.md` Cloud Functions list. Actual CF count is 24.

4. **`monthlyReviews` collection missing from CLAUDE.md** — Helper in `firestore.ts` but not in the Firestore collections table.

5. **Kid nav "My Stuff" not in MASTER_OUTLINE** — Code shows `My Stuff` nav item for kids; doc omits it. Intentional feature or doc lag?

6. **7 unindexed docs** — Add to `DOCUMENT_INDEX.md` or delete if obsolete: `DESIGN_SKIP_SYSTEM_2026-04-09.md`, `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md`, `DOC_INDEX_UPDATES_FOR_STORY_GEN_V2.md`, `REVIEW_INTENT_2026-04-09.md`, `REVIEW_INTENT_ACTIONS.md`, `SKIP_INVENTORY_2026-04-09.md`, `WORKINGLEVELS_INSPECTION_2026-04-09.md`.

7. **18 npm vulnerabilities** — 1 critical, 2 high, 14 moderate, 1 low. Run `npm audit` for package-level detail.

8. **Bundle size** — Main chunk 3.7 MB / 1.13 MB gzip (was 3.4 MB / 1.0 MB). CLAUDE.md tech debt note recommends code-splitting Three.js, jsPDF, and heavy features.

## Charter Alignment

All 16 registered task types have charter context (via `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`). **All clear.**

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 18 | books |
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
| **0** | **shelly-chat** ← no tests |
| **0** | **progress** ← no tests |
| **0** | **planner** ← no tests |
| **0** | **evaluation** ← no tests |
| **0** | **dad-lab** ← no tests |
| **0** | **auth** ← no tests |
| 0 | not-found / login (expected) |

Highest-risk untested features: **shelly-chat** (23+ useState hooks, flagged in tech debt), **dad-lab** (full lifecycle flow), **evaluation** (skill snapshot + quick check).

## Notable Dead Exports (src/core scan)

Exported symbols with no import sites outside tests or their own file. Candidates for cleanup:

- `skillTags.ts`: `ReadingTags`, `WritingTags`, `MathTags`, `ALL_SKILL_TAGS`
- `zod.ts`: all 8 schema exports (`subjectBucketSchema`, `engineStageSchema`, etc.) — may be intended for future form validation
- `evaluation.ts`: `ConceptualBlockSource`, `WorkingLevelSource`
- `enums.ts`: `PlannerSessionStatus`, `ScheduleBlockLabel`
- `workshop.ts`: `PlaytestReaction`, `CardDifficulty`
- `firestore.ts`: `workbookConfigDocId`, `monthlyReviewDocId`

## Dependency Notes

- **18 npm vulnerabilities** (1 critical, 2 high, 14 moderate, 1 low). `npm audit fix` may clear non-breaking ones.
- npm CLI: 10.9.7 → 11.16.0 available (cosmetic, not required).
