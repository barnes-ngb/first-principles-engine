# Code Health Report — 2026-05-30

## Metrics

| Metric | Value | Change from last report |
|--------|-------|------------------------|
| **Total lines** | **160,852** | +34 |
| **Commits (main)** | **135** | +0 |
| **Test files** | **125** | +0 |
| **Tests passing** | **2,431** | +393 (all pass) |
| **Test files running** | **145** | +21 |
| **Firestore collections** | **34** | +0 |
| **Cloud Functions** | **24** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,841 kB / 1,133 kB gzip** | +0 |

> **Commit note:** `git rev-list --count HEAD` on the audit branch shows 105 (audit branch commits don't merge to main via squash). Main branch count is 135 (used for stats).

> **CF count note:** The grep pattern `export \{ \K[^}]+` undercounts multi-line export blocks (returns 19). Perl cross-line match returns 24, which matches CLAUDE.md. Always use the perl method or count manually when verifying CF count.

> **Bundle note:** 3,841 kB main chunk (1,133 kB gzip) — unchanged from last report. Dynamic/static import conflicts for firebase, compressImage, and sightWordMastery flagged by Vite but not blocking.

> **Test growth:** +21 test files and +393 tests since last report. All 2,431 pass across 145 files.

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 12.52s |
| **Lint** | ✅ PASS | 0 errors, 0 warnings |
| **Tests** | ✅ PASS | 2,431 tests across 145 files |
| **TypeScript** | ✅ PASS | `tsc -b` clean |

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 160,818 | 160,852 | **DRIFT** — auto-fixed → 160,852 |
| Commits | 135 | 135 (main) | ✅ OK |
| Test files | 125 | 125 | ✅ OK |
| Firestore collections | 34 | 34 | ✅ OK |
| Cloud Functions | 24 | 24 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

The grep scan flagged 5 files as missing:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX, referenced only in historical PR log in MASTER_OUTLINE |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — same as above |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06, referenced in historical PR log |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06, referenced in historical PR log |

All are historical PR log references, not live path references. No action needed.

### Nav Accuracy

**Code nav (AppShell.tsx):**
- Parent: Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI
- Kid: Today, Knowledge Mine, My Books, Books About Me, My Hero, **My Stuff**, Game Workshop, Dad Lab

**Doc nav (MASTER_OUTLINE before fix):**
- Kid nav was missing **"My Stuff"** (`/records/portfolio`)

**Auto-fixed:** Added "My Stuff" to Kid nav in MASTER_OUTLINE.

### Task Types in Code vs Docs

Registry (`tasks/index.ts`) — 17 tasks: `analyzeWorkbook`, `chapterQuestions`, `chat`, `conundrum`, `disposition`, `evaluate`, `generate`, `generateStory`, `monthlyReview`, `plan`, `quest`, `revisePage`, `reviseStory`, `scan`, `shellyChat`, `weeklyFocus`, `workshop`

`chat` and `generate` tasks don't have standalone files in `tasks/` — handled in `chat.ts` and `generate.ts` respectively. Charter check marks them FILE NOT FOUND (expected — charter context injected at the CF layer via context slices).

All 17 documented in `SYSTEM_PROMPTS.md`. ✅ OK

### Unindexed Docs

None. All 48 docs in `docs/` are indexed in `DOCUMENT_INDEX.md`. ✅ OK

### Stale Doc Check

No CURRENT-marked docs flagged as stale. ✅ OK

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
| `src/features/records/records.logic.test.ts` | 1,225 | +0 |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | +0 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 1,156 | +0 |
| `src/features/records/RecordsPage.tsx` | 1,136 | +0 |
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

No files crossed 2,000 lines for the first time. All large files stable (no growth).

| File | Lines | Growth | Priority |
|------|-------|--------|----------|
| `functions/src/ai/chat.ts` | 2,466 | +0 | **HIGH** — `buildQuestPrompt` alone is 400+ lines; extract prompt builders to separate files |
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 | **MEDIUM** — stable, noted in CLAUDE.md tech debt |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 | **MEDIUM** — stable growth, noted in CLAUDE.md |

## Issues Found

### Auto-Fixed (this run)
- MASTER_OUTLINE TypeScript lines: 160,818 → 160,852
- MASTER_OUTLINE Kid nav: added "My Stuff" (`/records/portfolio`) between My Hero and Game Workshop

### Needs Human Attention
- **Bundle size:** 3,841 kB main chunk (1,133 kB gzip). Route-level `React.lazy` splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Noted in CLAUDE.md tech debt — architectural decision required.
- **Potential dead exports in `src/core/`:** Grep-based scan found these candidates (may be false positives — could be used in tests or dynamic imports):
  - `isPieceForged` in `src/core/xp/forgeArmorPiece.ts`
  - `ensureNewProfileStructure` in `src/core/xp/checkAndUnlockArmor.ts`
  - `SKIN_REGIONS`, `FORGE_COSTS`, `getTierTotalCost` in `src/core/xp/armorTiers.ts` / `forgeCosts.ts`
  - `ReadingTags`, `ReadingTag`, `WritingTags`, `WritingTag`, `MathTags`, `MathTag`, `RegulationTag`, `ALL_SKILL_TAGS` in `src/core/types/skillTags.ts`
  - Verify before removing — grep excludes test files and dynamic imports.
- **`chat.ts` CF (2,466L)** — `buildQuestPrompt` is 400+ lines; extracting to separate prompt builder files would improve maintainability. Noted in CLAUDE.md tech debt.

## Charter Alignment

Task types checked against charter context:
- `chat` and `generate`: handled at CF layer (not in `tasks/`); charter context injected via context slices ✅
- All 15 other task handler files: include `buildContextForTask` or direct charter context ✅

No charter gaps found.

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

Features with 0 test files: shelly-chat, progress, planner, not-found, login, evaluation, dad-lab, auth. These are pure UI renderers or auth wrappers with limited pure logic to test. Unchanged from last report.

## Dependency Notes

- **npm audit:** 0 vulnerabilities (production) ✅
- No major version upgrades pending that affect production
