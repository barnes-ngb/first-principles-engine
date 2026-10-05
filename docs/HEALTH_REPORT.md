# Code Health Report — 2026-10-05

## Metrics

| Metric | Value | Change from last report (2026-09-21) |
|--------|-------|--------------------------------------|
| **Total lines** | **387,489** | +8,409 |
| **Commits** | **3,791** | +34 |
| **Test files** | **733** | +16 |
| **Tests passing** | **10,633** (root combined suite, 733 files, 1 skipped by design, 0 failing) | +422 |
| **Firestore collections** | **47** | +0 |
| **Cloud Functions** | **29** | +0 (CLAUDE.md count; not re-derived this run) |
| **Chat task types** | **21** | +0 |
| **Routes** | **39** | +0 |
| **Bundle size** | **4,240.63 kB / 1,267.98 kB gzip** (main chunk) | −379 kB (jspdf split out, FIX-253) |

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| Build | ✅ PASS | `tsc -b && vite build` clean |
| Lint | ⚠️ 3 warnings, 0 errors | Same 3 `react-hooks/exhaustive-deps` (`EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `:2129`, all `sessionTimer`). Not mechanically fixable. |
| Tests (root) | ✅ PASS | 10,633 passed, 1 skipped, 0 failed |
| Tests (functions/ own suite) | ⏭️ not run this cycle | Root combined suite covers `functions/src` |
| `npm run docs:check` | ✅ HARD checks pass | 13 SOFT warnings, incl. 3 `[ledger-status]` rows (FIX-258, FIX-259, FEAT-201) reading "REVIEWED (PR #1883; awaiting owner merge)" — flip to MERGED form when #1883 merges |
| npm audit (prod) | ⚠️ moderate only | Non-breaking `npm audit fix` available; not applied (policy: moderate → note) |

## Doc Accuracy

| Claim | Doc value (before) | Computed | Status |
|---|---|---|---|
| TypeScript lines | 379,080 | 387,489 | DRIFT 2.2% → auto-fixed |
| Commits | 3,757 | 3,791 | auto-fixed (needed `git fetch --unshallow`) |
| Test files | 717 | 733 | auto-fixed |
| Collections | 47 | 47 | OK |
| Cloud Functions | 29 | 29 | OK (per CLAUDE.md) |
| Chat task types | 21 | 21 | OK |
| Routes | 39 | 39 | OK |

- Unindexed docs: none.
- Referenced-file existence, nav comparison and dead-export scan were not re-run this cycle (time budget); `docs:check` HARD index/anchor checks passed.
- Stale docs: see prior report's list (43 `CURRENT` docs untouched >30 days, oldest `ENGINE_V2.md`). STALE-CHECK: human to verify accuracy or mark STALE. Not re-derived this cycle.

## Largest Files / Decomposition Candidates (>1,500 lines, non-test)

PlannerChatPage.tsx 3,942 · chat.ts 3,108 · BookEditorPage.tsx 2,433 · useQuestSession.ts 2,275 · evaluate.ts 2,106 · TodayPage.tsx 1,952 · WorkshopPage.tsx 1,928 · shellyChat.ts 1,919 · MyAvatarPage.tsx 1,897 · CurriculumTab.tsx 1,857 · TodayChecklist.tsx 1,841 · dataReviewExport.logic.ts 1,776 · chatPlanner.logic.ts 1,682 · contextSlices.ts 1,638 · RecordsPage.tsx 1,614 · VoxelCharacter.tsx 1,606 · DevAdminTab.tsx 1,530 · useShellyChatActions.ts 1,506. No file newly crossed 2,000 lines versus the CLAUDE.md debt list.

## Issues Found

### Auto-Fixed
- `docs/MASTER_OUTLINE.md` scale block: lines 379,080 → 387,489; commits 3,757 → 3,791; test files 717 → 733.

### Needs Human Attention
- 3 lint warnings (`sessionTimer` deps) — needs timer-semantics review.
- 3 ledger rows await flip to MERGED when PR #1883 lands (SOFT now, HARD on `main`).
- Moderate npm audit findings (prod): non-breaking fix available.
- Bundle main chunk 4.24 MB — Three.js split still blocked on ARCH-08.

## Test Coverage by Feature
Features with 0 test files: `auth`, `login`, `not-found`, `planner`, `ui-preview` (unchanged; all thin wrappers).
