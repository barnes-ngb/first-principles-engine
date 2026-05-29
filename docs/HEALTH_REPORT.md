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

## Hours aggregation divergence (Records page) — 2026-05-29

Audit triggered by Lincoln's Records page showing a ~7.3h core discrepancy between
the **Monthly Trend** card (606h core) and every other view — Records summary, MO
Compliance, Hours-by-Subject (all 598.73h core). Non-core matched everywhere; the
entire gap was in core.

### Additive-hours invariant (the rule all views must obey)
Hours = **day logs + hours entries + hours adjustments**, summed additively. Each
minute is classified by `subjectBucket` into **core** (Reading, LanguageArts, Math,
Science, SocialStudies) or **non-core** (everything else). An unmapped/null
`subjectBucket` is treated as **non-core** in *every* path (`?? 'Other'` /
`?? ''`). The canonical implementation is `computeHoursSummary()` in
`src/features/records/records.logic.ts`; the summary card, MO Compliance dashboard,
and Hours-by-Subject table all read from it.

### Root cause (core-classification gap)
The reported hypothesis — that Monthly Trend defaults *unmapped* subjects to core —
is **incorrect**: both paths default unmapped→non-core, which is exactly why non-core
agrees across views. The real cause is that **Monthly Trend re-derives totals
independently and reads day logs differently** than the canonical path:

- `computeHoursSummary()` (`records.logic.ts:85-115`): per day log, if **any** block
  has `actualMinutes > 0` it counts **block actual minutes** and ignores the
  checklist; otherwise it falls back to **completed checklist items**.
- `MonthlyTrend.tsx` (`:48-63`): counts **only completed checklist items**, never
  reads block `actualMinutes`, and **skips any day log with no checklist**.

On days that have both tracked blocks and a checklist, the two disagree. Because the
canonical path only counts blocks that were actually tracked, **partially-tracked
days** (the documented "Hours partial-day edge" tech debt) make the checklist-based
trend read higher than the canonical block-based total — surfacing as the ~7.3h core
gap. Non-core stays aligned because non-core minutes come almost entirely from hours
entries + adjustments, which both paths read identically.

### Which view is correct
`computeHoursSummary()` is the source of truth: it backs 3 of the 4 cards plus the
CSV export and printable MO compliance report. **Monthly Trend is the outlier and
over-counts core.** Treat 598.73h core as authoritative → Lincoln is ~1.3h *under*
the MO 600-core line; log a little core before June 30 to be safe.

### Proposed fix (NOT yet applied — touches computation logic)
Route `MonthlyTrend` through the same aggregation as `computeHoursSummary()` (extract
a per-month variant, or compute monthly buckets from the same block-vs-checklist
preference logic) so all four views read identical sources and bucket identically.
This is the only change that closes the gap, and it touches the additive-hours
invariant, so it is flagged for review rather than auto-applied. A code comment now
marks the divergence at `MonthlyTrend.tsx`.

### Applied fix (targeted, display-only — does not touch the invariant)
The Hours-by-Subject **Total** row printed core-only home minutes (525.95h) under a
Home column whose per-subject rows summed all-subject home (577.12h). Added a derived
`homeMinutes` (all-subject home) to `HoursSummary`; the Total row now shows all-home
and a separate **"Core at home (MO ≥600)"** row shows the core-only figure. Same fix
applied to the CSV export and the printable HTML report. No existing computed value
changed.

### Data-integrity follow-ups (not code bugs — runtime Firestore data)
- **Possible duplicate backfill:** near-identical 5-subject estimate batches dated
  `2025-07-15` and `2025-08-15`. De-dupe `hoursAdjustments` on
  `(date, subject, minutes, reason)`. Requires live data access (see Prompt 2 export).
- **"Other" = 202h** (Zoo, Treehouse, etc.) is all non-core, so it doesn't affect the
  core question, but it inflates the reviewer-facing total.

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
