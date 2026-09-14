# Code Health Report — 2026-09-14

## Metrics

| Metric | Value | Change from last report (2026-09-07) |
|--------|-------|--------------------------------------|
| **Total lines** | **369,843** | +52,739 |
| **Commits** | **3,690** | +287 |
| **Test files** | **687** | +150 |
| **Tests passing** | **9,777** (root combined suite, 687 files, 1 skipped by design, 0 failing) + **1,486** (functions/ own suite, 67 files, real deps) | +1,764 root, +115 functions |
| **Firestore collections** | **47** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **39** | +3 (new top-level `/curriculum` and `/review` routes, plus the nested `/review/monthly-books/:reviewId` reader route — see Navigation below) |
| **Bundle size** | **4,570.43 kB / 1,375.47 kB gzip** | +141.93 kB / +49.25 kB gzip |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~17s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129`, all involving `sessionTimer`). Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | **9,777 passing, 0 failing, 1 skipped** (687 test files, `src/` + `functions/src/` combined via root `vite.config.ts`'s test block). The one skip is the opt-in `docs:ledger-sweep` probe (does not run in `npx vitest run` by design). |
| **Tests (functions/)** | ✅ PASS | 1,486 passing, 0 failing (67 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` both clean; no orphaned imports |
| **`npm run docs:check`** | ✅ PASS | All HARD checks pass (ledger IDs, index resolution, ledger anchors, collection-count spans, evidence kinds, day-write routing, ledger-status, ledger-status-contradiction). 10 SOFT warnings — see **docs:check findings** below. `--fix` made no changes beyond this run's own hand edits. |
| **npm audit (prod, root)** | ⚠️ 1 moderate | `fflate` (ReDoS-adjacent infinite-loop on malformed ZIP64) — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (Rule 8: moderate-only → note, don't fix). |
| **npm audit (prod, functions)** | ⚠️ 3 moderate | `qs`/`body-parser`/`express` transitive chain — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy. |
| **npm audit (full, root)** | ⚠️ 16 vulnerabilities (1 low, 13 moderate, 2 high) | Up from 12 last cycle; the 2 high are dev-dependency-only (confirmed by the `--production` scan above showing only 1 moderate). Fix requires `--force` (breaking) for the dev-only remainder. Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 11 vulnerabilities (9 moderate, 2 high) | Up from 7 last cycle. Same pattern — highs are dev-only (`firebase-functions-test` chain). Requires `--force` (breaking). Low priority per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 317,104 | 369,843 | DRIFT +16.6% — **AUTO-FIXED** |
| Commits | 3,403 | 3,690 | DRIFT +8.4% — **AUTO-FIXED** |
| Test files | 537 | 687 | DRIFT +27.9% — **AUTO-FIXED** |
| Firestore collections | 47 | 47 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; hand-walking every block confirms 29 — same caveat as every prior cycle) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 39 | DRIFT +8.3% — **AUTO-FIXED** (real growth: `/curriculum` and `/review` are new top-level parent routes, plus the nested `/review/monthly-books/:reviewId` reader route — see Navigation) |

**Commit-count caveat, resolved this cycle:** the session started from a **shallow clone** (`git rev-parse --is-shallow-repository` → `true`, `git rev-list --count HEAD` → 266, not the true count). `git fetch --unshallow` was run before trusting the number; the real count is 3,690. Any future cycle that skips this step will under-report commits by roughly an order of magnitude.

This cycle's line/test-file drift (16.6% / 27.9%) is larger than the prior cycle's already-large drift (12.7% / 27.6%) — consistent with very high feature velocity: the Curriculum-tab arc (UX-354/UX-363/FIX-235/UX-415/UX-416), the FIX-236/UX-409/UX-410 weekly-review snapshot-before-narrative rework, and the FEAT-237/UX-425→UX-429 "one place to choose the child" consolidation all landed in the ~1 week since the last audit. No anomalies beyond volume.

`npm run docs:check` independently confirms the collection count (`PASS [collection-count] all spans == 47`).

### Missing File References

Same eight expected carry-overs as every prior cycle — checked individually, every one is explicitly documented as removed/superseded/never-existed in its own surrounding context, not a real gap:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` / `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in `DOCUMENT_INDEX.md` |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` / `CreativeTimeLog.tsx` | Referenced only in `MASTER_OUTLINE.md`'s historical UX P1.04/P2.06 changelog entries, which explicitly say the files were removed by a later change |
| `AGENTS.md` | `DOCUMENT_INDEX.md`'s own row for `review/AI_DEVELOPMENT_REVIEW_20260905.md` documents that this file was never pushed to any branch |
| `components/ChildSelector.tsx` | `CLAUDE.md`'s own `AppShell` narrative states in the same sentence that this file "is deleted" (FEAT-237/UX-425) |
| `scanAdvance.ts` | `CLAUDE.md`'s own Curriculum-tab narrative states it "was removed rather than left standing" (UX-403/FIX-235) |

### Navigation — MISMATCH FOUND AND FIXED

`src/app/AppShell.tsx`'s parent `navItems` array now reads: Today, Plan My Week, **Curriculum**, **Review**, Progress, Records, Books, Watch Library, Barnes Bros, Game Workshop, Dad Lab, Settings, Ask AI — two entries (`/curriculum` → `CurriculumTab`, `/review` → the new `ReviewPage`, which combines the former Weekly Review content and Monthly Books into Week/Month tabs, plus the nested reader route `/review/monthly-books/:reviewId`) that `docs/MASTER_OUTLINE.md`'s Navigation line did not have. The doc's line still read "Today, Plan My Week, **Weekly Review**, Progress (**Foundations** · **Monthly Books** · Learning Map · ...)" with no standalone Curriculum entry, and it still listed Monthly Books as a *Progress* tab.

**Auto-fixed** per the companion prompt's Rule 4, in two passes (the second following a Codex review finding on this same PR — see below): inserted `Curriculum` before `Review`, renamed `Weekly Review` → `Review`, added a parenthetical noting Review absorbs the Progress tab's former Monthly Books tab, and **removed `Monthly Books` from the Progress tab list** — `ProgressPage.tsx`'s own `TABS` array (Foundations, Learning Map, Curriculum, Skill Snapshot, Word Wall) no longer has a Monthly Books entry, and its `?tab=monthly-books` query param now redirects to Review's Month view (`ProgressPage.tsx:59-60`). Every other annotation (the Watch Library parenthetical) was left untouched. Kid Nav (8 items) already matched code exactly — no change needed there.

**Codex review round 1 on this PR (commit `945b5fe`) caught both of the above** — the stale Progress tab list (P2) and the incomplete route accounting one paragraph up (P2, this section's own route count was missing the third new route). Both were real, verified against source, and fixed in a follow-up commit on this same PR rather than left for a human, since they were mechanical corrections squarely within this audit's stated scope (nav accuracy, route accounting) — not a design judgment call.

**Not fixed, flagged for a human:** neither `CLAUDE.md`'s route list under `src/app/` nor its `src/features/` project-structure notes mention `/curriculum` or `/review` as standalone routes, or the `ReviewPage` component (`src/features/review/ReviewPage.tsx`, which composes `WeeklyReviewContent` + `MonthlyBooksTab` under Week/Month tabs, reading `UX-425`/`UX-426` in its own source comments). This looks like real, already-shipped, undocumented-in-`CLAUDE.md` structure — out of this audit's auto-fix scope (`CLAUDE.md` prose is excluded by policy) and worth a deliberate doc pass rather than a mechanical one.

### Collection Coverage

All 47 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table. No edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`, both directions — no gap either way.

### Unindexed Docs

None among top-level `docs/*.md`. `docs/archive/*.md` files not individually named in `DOCUMENT_INDEX.md` are covered by its existing catch-all rows (`archive/01–07_*.md` and a trailing `archive/` → HISTORICAL row) — by design, not a gap.

### Stale Docs (Phase 3h)

**74 unique docs are marked `**CURRENT**`** in `DOCUMENT_INDEX.md` (+10 vs. last cycle's 64). **43 have not been touched in over 30 days.**

**Oldest 15 of the 43 stale:**

| Doc | Age |
|---|---|
| `ENGINE_V2.md` | 195d |
| `KNOWLEDGE_MINE_BRIEF.md` | 176d |
| `WEEKLY_CONUNDRUM_ARC.md` | 170d |
| `STONEBRIDGE_BIBLE.md` | 160d |
| `HERO_HUB_ANIMATION_TUNING.md` | 160d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 160d |
| `first-principles-system-review.md` | 160d |
| `SCRIPT_CONVENTIONS.md` | 156d |
| `investigations/backend-reliability-assessment.md` | 155d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 146d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 121d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 120d |
| `PROFILE_LIMITS_AUDIT.md` | 112d |
| `design-pass-v1/copy-pass-audit.md` | 111d |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 111d |

Same pattern, same absolute count (43) as last cycle — the doc-index grew by 10 new `CURRENT` entries but none of them are old enough yet to join the stale list. Several of the oldest are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`). Not auto-fixed (requires reading each doc to assess, per policy). Flagged for a human spot-check if those surfaces are still active.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report (2026-09-07) |
|-------|------|--------------------------------------|
| 3,942 | `src/features/planner-chat/PlannerChatPage.tsx` | **+477** |
| 3,108 | `functions/src/ai/chat.ts` | +57 |
| 3,027 | `src/features/records/records.logic.test.ts` | +85 (test file) |
| 2,936 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | +266 (test file) |
| 2,414 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,350 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +51 (test file) |
| 2,296 | `functions/src/ai/tasks/shellyChat.test.ts` | +30 (test file) |
| 2,275 | `src/features/quest/useQuestSession.ts` | +57 |
| 1,928 | `src/features/workshop/WorkshopPage.tsx` | +112 |
| 1,919 | `functions/src/ai/tasks/shellyChat.ts` | −30 (shrank) |
| 1,897 | `src/features/avatar/MyAvatarPage.tsx` | +21 |
| 1,857 | `src/features/progress/CurriculumTab.tsx` | **+737** |
| 1,830 | `src/features/today/TodayPage.tsx` | **+443** |
| 1,820 | `src/features/today/TodayChecklist.tsx` | +215 |
| 1,761 | `src/features/records/dataReviewExport.logic.ts` | +49 |
| 1,736 | `functions/src/ai/evaluate.ts` | **+434** |
| 1,682 | `src/features/planner-chat/chatPlanner.logic.ts` | +27 |
| 1,638 | `functions/src/ai/contextSlices.ts` | +11 |
| 1,612 | `src/features/records/RecordsPage.tsx` | +148 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,530 | `src/features/settings/DevAdminTab.tsx` | **+391** |
| 1,506 | `src/features/shelly-chat/useShellyChatActions.ts` | +146 |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 |
| 1,389 | `src/features/books/useBookGenerateChat.ts` | +0 |
| 1,338 | `src/core/types/planning.ts` | +185 |
| 1,307 | `src/features/shelly-chat/parseChatActions.test.ts` | +0 (test file) |
| 1,302 | `functions/src/ai/tasks/monthlyReviewData.test.ts` | +0 (test file) |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,272 | `src/features/today/KidTodayView.tsx` | +74 |
| 1,268 | `functions/src/ai/tasks/monthlyReviewData.ts` | +17 |
| 1,266 | `src/features/books/printBook.ts` | +0 |
| 1,246 | `src/features/shelly-chat/useShellyChatFlows.ts` | +50 |
| 1,241 | `src/features/evaluate/EvaluateChatPage.tsx` | −1 |
| 1,180 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,166 | `src/features/settings/AvatarAdminTab.tsx` | +62 |
| 1,154 | `src/features/records/records.logic.ts` | +52 |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | +0 (test file) |
| 1,149 | `src/features/shelly-chat/ActionConfirmCard.test.tsx` | new to table (test file) |
| 1,138 | `functions/src/ai/chat.test.ts` | +0 (test file) |
| 1,114 | `src/features/shelly-chat/ActionConfirmCard.tsx` | new to table |
| 1,114 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,080 | `src/features/settings/StickerLibraryTab.tsx` | +0 |
| 1,072 | `functions/src/ai/contextSlices.test.ts` | below last cycle's ~1,080L truncation cutoff (test file) |
| 1,067 | `src/features/quest/ReadingQuest.tsx` | below last cycle's cutoff — flat vs. `CLAUDE.md`'s tracked figure |
| 1,060 | `functions/src/ai/evaluate.test.ts` | below last cycle's cutoff (test file) |
| 1,047 | `src/features/today/useUnifiedCapture.workbook.test.tsx` | below last cycle's cutoff (test file) |

(Table at >1,000L; 151 files total exceed 500 lines, up from 130 last cycle.)

---

## Decomposition Candidates

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,942 | KNOWN, **+477 this cycle** — the fastest-growing large file, now within ~60 lines of 4,000. `CLAUDE.md`'s tech-debt note reads 3,950L — accurate, no drift, but the number is about to go stale. |
| `CurriculumTab.tsx` | 1,857 | **NEW CANDIDATE, not yet in `CLAUDE.md`'s Known Technical Debt list at all** — grew +737 lines this cycle (was already flagged "new to >1,000 table" at 1,120L last cycle) and is now within ~150 lines of the 2,000L threshold this repo treats as a first-class decomposition trigger. Tracks with the heavy Curriculum-tab feature arc (UX-354/UX-363/FIX-235/UX-403–405/UX-415/UX-416) described in `CLAUDE.md`'s own project-structure notes for this directory. |
| `functions/src/ai/evaluate.ts` | 1,736 | +434 this cycle (was already the largest single jump last cycle at +190). Tracks with FIX-236/UX-409/UX-410 (record-before-narrative rework, `promptHours.ts` extraction). Not yet flagged in `CLAUDE.md`'s Known Technical Debt section. |
| `TodayPage.tsx` | 1,830 | +443 this cycle. Not yet flagged in `CLAUDE.md`'s Known Technical Debt section. |
| `DevAdminTab.tsx` | 1,530 | +391 this cycle. Not yet flagged in `CLAUDE.md`'s Known Technical Debt section. |
| `chat.ts` (CF) | 3,108 | KNOWN, +57 this cycle — `buildQuestPrompt` alone was already flagged 400+ lines. |
| `BookEditorPage.tsx` | 2,414 | KNOWN, flat this cycle. `CLAUDE.md`'s note reads 2,414L — exact match. |
| `useQuestSession.ts` | 2,275 | KNOWN, **+57 this cycle** (2,218→2,275, per this report's own Largest Files table above) — **not flat**, correcting this row from an earlier draft of this report. `CLAUDE.md`'s note already reads 2,275L, so it matches the *current* value but was stale relative to last cycle's 2,218L until now. |

`functions/src/ai/tasks/shellyChat.ts` (1,919L) **shrank 30 lines this cycle** — the first time this file has moved in the opposite direction across the reports checked so far, still short of the 2,000L threshold.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 317,104→369,843; Commits 3,403→3,690; Test files 537→687; Routes 36→39. (Firestore collections, Cloud Functions, and Chat task types were already correct — no change.)
- **`docs/MASTER_OUTLINE.md` Navigation line:** inserted `Curriculum` and renamed `Weekly Review`→`Review` in the Parent nav list to match `src/app/AppShell.tsx`'s current `navItems` array exactly; removed `Monthly Books` from the Progress tab list (moved to Review's Month view — caught by Codex review round 1 on this PR, verified against `ProgressPage.tsx`, fixed same-PR). See Navigation section above.
- **`docs/HEALTH_REPORT.md`'s own route-count explanation:** named the third new route, `/review/monthly-books/:reviewId`, alongside `/curriculum` and `/review` (also caught by Codex review round 1, verified against `router.tsx`).
- Ran `npm run lint` (0 auto-fixable issues — same 3 pre-existing `react-hooks/exhaustive-deps` warnings, left as-is) and `npm run docs:fix` (made no further changes — nothing else to auto-fix, all HARD checks already passing).

### Needs Human Attention

- **`ReviewPage` (`src/features/review/ReviewPage.tsx`) and the standalone `/curriculum` route are undocumented in `CLAUDE.md`.** `ReviewPage.tsx` landed **2026-09-11** (`git log`, commit `52d0e359`, "Unify parent Review with Week and Month views") — squarely inside this audit cycle's window (between the 2026-09-07 and 2026-09-14 reports), not before it; this report's own Navigation and Test Coverage sections already count it as a this-cycle addition. Both it and `/curriculum` (referencing `UX-425`/`UX-426` in `ReviewPage`'s own source comments) are real, shipped features absent from `CLAUDE.md`'s route/structure notes. Out of this audit's auto-fix scope (`CLAUDE.md` prose excluded by policy) — needs a deliberate doc pass, not a mechanical one.
- **`CurriculumTab.tsx` grew +737 lines this cycle (1,120→1,857L)** and is not in `CLAUDE.md`'s Known Technical Debt list at all. **Correction:** it is not among the five largest non-test source files — this report's own Largest Files table shows seven larger ones (`PlannerChatPage.tsx` 3,942, `chat.ts` 3,108, `BookEditorPage.tsx` 2,414, `useQuestSession.ts` 2,275, `WorkshopPage.tsx` 1,928, `shellyChat.ts` 1,919, `MyAvatarPage.tsx` 1,897), so `CurriculumTab.tsx` is the 8th-largest. It is still within ~150 lines of the 2,000L threshold the repo otherwise treats as a decomposition trigger, and its growth rate (+737 in one cycle, the largest single-cycle jump of any file this report tracked) is the more load-bearing fact than its absolute rank.
- **`functions/src/ai/evaluate.ts` (+434L), `TodayPage.tsx` (+443L), and `DevAdminTab.tsx` (+391L)** all had large single-cycle jumps and are likewise absent from `CLAUDE.md`'s Known Technical Debt section. Worth a look at whether any belong there.
- **`src/features/shelly-chat/ShellyChatPage.tsx` is 874 lines** (was 846 last cycle, flagged then too) — `CLAUDE.md`'s Known Technical Debt section still describes it as "ARCH-09 FIXED (1,632→647L)… Stable." It has now grown +227 lines (+35%) since that figure was written and has grown in both of the last two cycles. Not auto-fixed (`CLAUDE.md` prose out of scope); flagged again for a human to decide whether "Stable" still applies.
- **`npm audit` vulnerability counts grew on both projects** (root: 12→16 full / 1→1 moderate-in-prod unchanged; functions: 7→11 full / 3→3 moderate-in-prod unchanged). The production-tree moderate counts are flat — same `fflate` and `qs`/`body-parser`/`express` findings as last cycle, non-breaking fixes available via `npm audit fix`, not applied per policy (Rule 8). The growth is entirely in the dev-only tree (confirmed by the `--production` scans showing no count change) and requires `--force` (breaking) — left for human review, same recommendation as every prior cycle.
- **Dead-export scan skipped this cycle**, same as every prior cycle — budget went to the full unshallow + fresh-sandbox install + the double build/lint/test run (root 9,777 tests + functions 1,486 tests). Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic whenever this is picked back up.
- **Bundle size 4,570.43 kB (1,375.47 kB gzip), +141.93 kB / +49.25 kB gzip since last report:** growth roughly tracks the +52,739 line-count delta. Main chunk (Three.js avatar, jsPDF print, curriculum map data, shelly-chat/chat surface) is still unsplit. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **43 of 74 unique `CURRENT`-marked docs are >30 days untouched** (up from 64 unique docs last cycle, same absolute stale count of 43 — the 10 newly-added `CURRENT` docs are all recent). Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster (`ENGINE_V2.md` at 195d, `KNOWLEDGE_MINE_BRIEF.md` at 176d) if those surfaces are still active.

---

## docs:check findings (SOFT warnings, informational)

`npm run docs:check` surfaced 10 SOFT warnings, same shape as last cycle:

- **2 raw Firestore refs outside the allowlist** (unchanged): `src/features/progress/ArmorTab.tsx` (raw `xpLedger` ref) and `src/features/settings/DevAdminTab.tsx` (raw `days` ref). SOFT, not HARD — flagged for review, not auto-fixed (code change, outside this audit's scope).
- **7 files with `httpsCallable` missing a timeout/AbortController or `finally` in reach** (unchanged list): `AvatarPhotoUpload.tsx`, `generateFace.ts`, `DiagnosticPanel.tsx`/`GenerateNowDialog.tsx`/`MonthlyReviewReader.tsx` (monthly-review), `FoundationsDiagPanel.tsx`, `AvatarAdminTab.tsx`.
- **1 file with an image file-input and no visible downscale/compress call:** `src/features/records/PortfolioPage.tsx` (unchanged).
- **105 swallowed `catch()` blocks across 58 files** (report-only census, up from 98/54 last cycle) — heaviest in `PlannerChatPage.tsx`, `RecordsPage.tsx`, `useShellyChatFlows.ts` (5 each).

None of these are new-this-cycle regressions per se (the census is cumulative), but they're surfaced because `docs:check` ran clean on all HARD checks and these are its only open SOFT items. Not fixed — code changes, outside this audit's read-only/doc-only scope.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 90 | books | +4 |
| 85 | today | +21 |
| 41 | progress | **+28** |
| 40 | planner-chat | **+13** |
| 33 | shelly-chat | +6 |
| 26 | business | +3 |
| 21 | settings | +4 |
| 20 | watch | +0 |
| 20 | avatar | +2 |
| 19 | quest | +2 |
| 16 | dad-lab | +0 |
| 14 | weekly-review | +3 |
| 13 | records | +4 |
| 11 | evaluate | +2 |
| 8 | workshop | +2 |
| 8 | foundations-review | +1 |
| 7 | monthly-review | +1 |
| 7 | evaluation | +4 |
| 1 | review | **new feature directory** |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). **`review` is a new feature directory this cycle** (the `ReviewPage` combining Weekly Review + Monthly Books — see Navigation above) with 1 test file so far; worth watching as it's exercised more. `progress` (+28) and `planner-chat` (+13) dominate this cycle's test growth, consistent with the Curriculum-tab and weekly-review-rework feature arcs.

---

## Dependency Notes

- **Root (prod):** 1 moderate (`fflate`) — unchanged from last cycle. Non-breaking fix available (`npm audit fix`), not applied per policy. Full audit (including dev deps): 16 (1 low, 13 moderate, 2 high, up from 12) — the highs are dev-only; the remainder needs `--force` (breaking). Left for human review.
- **Functions (prod):** 3 moderate (`qs`/`body-parser`/`express` chain) — unchanged from last cycle. Non-breaking fix available, not applied per policy. Full audit: 11 (9 moderate, 2 high, up from 7) — highs dev-only; fix needs `--force` (breaking) for the remainder. Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three`/`three` 0.128→0.186, `typescript` 5.9→7.0, `vite` 7.3→8.x, `vitest` 3.2→5.0. No action taken — major-version bumps are a human decision per policy.
