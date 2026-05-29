# Code Health Report — 2026-05-29

## Metrics

| Metric | Value | Change from last report |
|--------|-------|------------------------|
| **Total lines** | **160,818** | +2,228 |
| **Commits** | **122** | −15 (health audit branches not squash-merged to main) |
| **Test files** | **125** | +4 |
| **Tests passing** | **2,038** | all pass |
| **Test files running** | **124** | — |
| **Firestore collections** | **34** | +0 |
| **Cloud Functions** | **24** | +0 |
| **Chat task types** | **17** | +1 |
| **Routes** | **33** | +1 |
| **Bundle size (main chunk)** | **3.7 MB / 1.13 MB gzip** | +0 |

> **Commit note:** `git rev-list --count HEAD` shows 122 on the fresh audit branch (branched off main). Previous report's 137 included commits on that audit branch. Not a regression.

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `vite build` clean in 11.87s |
| **Lint** | ✅ PASS (0 errors) | 3 warnings — `react-hooks/exhaustive-deps` for `sessionTimer` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679`, `useQuestSession.ts:1760` |
| **Tests** | ✅ PASS | 2,038 tests across 124 files in 49.58s |
| **TypeScript** | ✅ PASS | `tsc --noEmit` clean |

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 158,590 | 160,818 | **DRIFT** (+1.4%) — auto-fixed |
| Commits | 137 | 122 | **DRIFT** — auto-fixed |
| Test files | 121 | 125 | **DRIFT** (+3.3%) — auto-fixed |
| Firestore collections | 34 | 34 | ✅ OK |
| Cloud Functions | 24 | 24 | ✅ OK |
| Chat task types | 16 | 17 | **DRIFT** — auto-fixed |
| Routes | 32 | 33 | **DRIFT** — auto-fixed |

### Missing File References

The following files are referenced in docs but not found in the repo:

| File | Referenced in |
|------|--------------|
| `CreativeTimeLog.tsx` | docs |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | docs |
| `PARENT_EXPERIENCE_AUDIT.md` | docs |
| `QuickCaptureSection.test.tsx` | docs |
| `QuickCaptureSection.tsx` | docs |

> These may be planned files mentioned in design docs, or files that were renamed/removed.

### Nav Accuracy

Code nav labels (`AppShell.tsx`) match documented nav structure — no discrepancies.

**Parent nav:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI

**Kid nav:** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Unindexed Docs (7)

The following docs in `docs/` are not listed in `DOCUMENT_INDEX.md` — auto-fixed by companion:

| File | Status assigned |
|------|----------------|
| `DESIGN_SKIP_SYSTEM_2026-04-09.md` | HISTORICAL (superseded by V2) |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | CURRENT (Phase 1 landed, Phase 2 proposed) |
| `DOC_INDEX_UPDATES_FOR_STORY_GEN_V2.md` | HISTORICAL (already applied) |
| `REVIEW_INTENT_2026-04-09.md` | HISTORICAL (read-only audit doc) |
| `REVIEW_INTENT_ACTIONS.md` | HISTORICAL (action items from April audit) |
| `SKIP_INVENTORY_2026-04-09.md` | HISTORICAL (investigation, April 2026) |
| `WORKINGLEVELS_INSPECTION_2026-04-09.md` | HISTORICAL (investigation, April 2026) |

### Stale CURRENT Docs

No docs marked CURRENT were last updated more than 30 days ago. ✅

## Largest Files (over 500 lines)

| File | Lines | Change from last report |
|------|-------|------------------------|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 |
| `functions/src/ai/chat.ts` | 2,466 | **+123** |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +15 |
| `src/features/quest/useQuestSession.ts` | 1,870 | +0 |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +0 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | +0 |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +0 |
| `src/features/avatar/VoxelCharacter.tsx` | 1,562 | +0 |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | +0 |
| `functions/src/ai/contextSlices.ts` | 1,325 | +1 |
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

Files over 1,500 lines:

| File | Lines | Growth | Priority |
|------|-------|--------|----------|
| `functions/src/ai/chat.ts` | 2,466 | +123 this run | **HIGH** — `buildQuestPrompt` alone is 400+ lines; extract prompt builders to separate files |
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 | **MEDIUM** — stable, noted in CLAUDE.md tech debt |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +15 | **MEDIUM** — stable growth, noted in CLAUDE.md |

## Issues Found

### Auto-Fixed (Phase 5/6 — audit)
- MASTER_OUTLINE stats updated: lines 158,590→160,818, commits 137→122, test files 121→125, chat task types 16→17, routes 32→33

### Auto-Fixed (companion)
- Added `reviseStory` task type row to `SYSTEM_PROMPTS.md` model table
- Added `monthlyReview` task type row to `SYSTEM_PROMPTS.md` model table
- Added `chapterQuestions` task type row to `SYSTEM_PROMPTS.md` model table
- Added `reviseStory` to `SYSTEM_PROMPTS.md` Task → Slice Mapping table
- Updated `SYSTEM_PROMPTS.md` stale notice header
- Added `monthlyReviews` collection to `CLAUDE.md` Firestore Collections table
- Fixed `CLAUDE.md` CF count: 23→24, added `auditMonthlyReviewSources` to list
- Fixed `CLAUDE.md` tasks/index.ts description: 15→17 task types
- Indexed 7 unindexed docs in `DOCUMENT_INDEX.md`

### Needs Human Attention

1. **Missing file references** (5 files) — referenced in docs but not in repo. May be planned files from design docs or renamed:
   - `CreativeTimeLog.tsx`, `QuickCaptureSection.tsx`, `QuickCaptureSection.test.tsx`
   - `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md`, `PARENT_EXPERIENCE_AUDIT.md`

2. **3 lint warnings** (`react-hooks/exhaustive-deps`) — `sessionTimer` missing from deps in:
   - `EvaluateChatPage.tsx:282`
   - `useQuestSession.ts:679` and `:1760`
   These are likely intentional (sessionTimer is a stable ref), but could suppress with `// eslint-disable-next-line` if confirmed safe.

3. **Bundle size 3.7 MB** — Route-level `React.lazy` splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Noted in CLAUDE.md tech debt.

4. **npm vulnerabilities (dev-only)** — 3 vulnerabilities in `protobufjs` and `dompurify` (transitive dev deps via Firebase tools). `npm audit --omit=dev` shows 0 production vulns. `npm audit fix --force` required for resolution (breaking changes). Low priority.

5. **`SYSTEM_PROMPTS.md` stale prose** — The companion fixed missing task table entries, but the full doc prose (sections 4+, task handler descriptions) should be reviewed for accuracy against current implementations (`reviseStory`, `monthlyReview`, `chapterQuestions`).

6. **`weeklyReview` in `TASK_CONTEXT`** — `contextSlices.ts` has a `weeklyReview` entry in `TASK_CONTEXT`, but the `weeklyReview` CF is a dedicated scheduled function (not routed through chat dispatch). Verify whether `buildContextForTask('weeklyReview', ...)` is ever called, or if the TASK_CONTEXT entry is vestigial.

## Charter Alignment

All task handlers import `CHARTER_PREAMBLE` or `buildContextForTask` (which injects charter slice). ✅

| Task | Status |
|------|--------|
| analyzeWorkbook | ✅ charter via buildContextForTask |
| chapterQuestions | ✅ charter preamble |
| conundrum | ✅ charter preamble |
| disposition | ✅ charter via buildContextForTask |
| evaluate | ✅ charter via buildContextForTask |
| generateStory | ✅ charter via buildContextForTask |
| monthlyReview | ✅ CHARTER_PREAMBLE imported directly |
| plan | ✅ charter via buildContextForTask |
| quest | ✅ charter via buildContextForTask |
| revisePage | ✅ charter via buildContextForTask |
| reviseStory | ✅ charter via buildContextForTask |
| scan | ✅ charter via buildContextForTask |
| shellyChat | ✅ charter via buildContextForTask |
| weeklyFocus | ✅ charter preamble |
| workshop | ✅ charter via buildContextForTask |

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

**Features with 0 tests:** auth, dad-lab, evaluation, login, not-found, planner, progress, shelly-chat — consistent with previous reports; these are navigation/shell/login flows that are harder to unit-test.

## Dependency Notes

- `npm audit --omit=dev`: **0 vulnerabilities** (production clean) ✅
- `npm audit` (all): 3 vulnerabilities (2 moderate, 1 critical) — all transitive via Firebase dev tools (`protobufjs`, `dompurify`). Require `--force` to fix (breaking changes). No action needed.
- npm major version available (10.9.7 → 11.16.0) — low priority.

## Dead Export Candidates (src/core — sample)

The following exports in `src/core` have no non-test references. **Verify before removing** — may be used in tests, dynamic imports, or consumed by `functions/`:

- `isPieceForged` — `src/core/xp/forgeArmorPiece.ts`
- `ensureNewProfileStructure` — `src/core/xp/checkAndUnlockArmor.ts`
- `SKIN_REGIONS`, `FORGE_COSTS`, `getTierTotalCost` — `src/core/xp/armorTiers.ts` / `forgeCosts.ts`
- `effectiveStatus`, `RESOLVING_THRESHOLD`, `RESOLVED_THRESHOLD`, `RESOLVED_MIN_SESSIONS`, `TARGETED_EVIDENCE_WEIGHT` — `src/core/utils/blockerLifecycle.ts`
- `IDLE_THRESHOLD_MS`, `MAX_SESSION_SECONDS` — `src/core/utils/sessionTimer.ts`
- `inferMoSubjects`, `resolveSubjectBucket`, `inferThemeSubjects`, `autoTagBlocks` — `src/core/utils/complianceMapping.ts`
- `normalizeDateString`, `parseDateInput` — `src/core/utils/format.ts`
