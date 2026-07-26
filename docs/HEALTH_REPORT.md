# Code Health Report — 2026-07-20

## Metrics

| Metric | Value | Change from last report (2026-07-13) |
|--------|-------|--------------------------------------|
| **Total lines** | **229,428** | +23,537 |
| **Commits** | **221** | +36 (shallow-clone HEAD depth in this sandboxed environment, not full repo history — see note below) |
| **Test files** | **325** | +77 |
| **Tests passing** | **4,235** | +776 |
| **Tests total** | **4,235** | 0 skipped, 0 failing |
| **Firestore collections** | **48** | +5 |
| **Cloud Functions** | **27** | +1 |
| **Chat task types** | **21** | +0 |
| **Routes** | **35** | -1 |
| **Bundle size** | **4,207.93 kB / 1,249.93 kB gzip** | +128 kB / +42 kB gzip |

> **Note on "Commits":** `git rev-list --count HEAD` in this run's environment returns the depth of a shallow clone, not the true repository history (PR numbers visible in `git log` already exceed #1600). This has been true for every prior audit run — the metric tracks shallow-clone depth consistently, not real commit count. Treat this row as directionally informative only.

> **Note on "Total lines" jump (+23,537):** a large single-cycle jump, consistent with 77 new test files and the new Watch Vehicle feature (`src/features/watch/`, ~22 files) landing this cycle, plus normal feature growth across a week — not a measurement artifact.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in ~15s (root `node_modules`/`functions/node_modules` were not present at session start — installed via `npm ci` in both; not a code issue, noted for completeness, consistent with every prior cycle) |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-07-06); `eslint --fix` made no changes |
| **Tests** | ✅ PASS | 4,235 passing, 0 skipped, 0 failing (325 test files) |
| **TypeScript** | ✅ PASS | `npx tsc -b --force` clean |
| **npm audit (prod, root)** | ✅ FIXED | Was 1 CRITICAL (`websocket-driver` <=0.7.4, via `firebase` → `@firebase/database` → `faye-websocket`) — **auto-fixed** via non-breaking `npm audit fix` (0.7.4→0.7.5). Now 0 production vulnerabilities. |
| **npm audit (prod, functions)** | ✅ FIXED (critical) | Was 1 CRITICAL + 9 moderate — **auto-fixed** the critical the same way (websocket-driver 0.7.4→0.7.5). 8 moderate remain, same `firebase-admin` dependency chain as every prior cycle; requires a major bump — architectural decision, no fix applied (per policy: HIGH/CRITICAL only). |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 205,891 | 229,428 | ⚠️ DRIFT +11.4% — **AUTO-FIXED** |
| Commits | 185 | 221 | ⚠️ DRIFT +19.5% (shallow-clone metric, see note above) — **AUTO-FIXED** |
| Test files | 248 | 325 | ⚠️ DRIFT +31.0% — **AUTO-FIXED** |
| Firestore collections | 43 | 48 | ⚠️ DRIFT +11.6% — **AUTO-FIXED** (see `watchLibrary` finding below — this was the only actually-undocumented collection; the rest of the delta is the doc's stat line having lagged recent additions like `orders`/`artQuota`) |
| Cloud Functions | 26 | 27 | ⚠️ DRIFT (exact mismatch) — **AUTO-FIXED**. `CLAUDE.md`'s own header already said "27 exported" and listed all 27 by name — only `MASTER_OUTLINE.md`'s stat line was stale. |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 35 | ⚠️ DRIFT (exact mismatch) — **AUTO-FIXED**. Route count is genuinely 35 now (no route was removed from the app; the doc's prior count of 36 appears to have been off by one already). |

> **Script note (carried forward):** the naive one-liner for counting Cloud Functions (`grep -oP 'export \{ \K[^}]+' functions/src/index.ts | ...`) still undercounts (21 vs true 27) because `functions/src/index.ts` has one multi-line `export { ... }` block (the 5 `monthlyReview.ts` functions) that a single-line-anchored `grep -oP` pattern can't see. Manually counting every named export across all `export {...} from` statements gives 27, which matches `CLAUDE.md`'s own header exactly. No doc drift in `CLAUDE.md` — only `MASTER_OUTLINE.md`'s stat block was stale. The audit one-liner should be fixed for future cycles.

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06 |
| `foundations.ts` | **FIXED** — `CLAUDE.md`'s Project Structure entry for `src/core/foundations/` named a file `foundations.ts` that doesn't exist; the actual barrel file is `index.ts`. Flagged as needing a human pass in the 2026-07-13 report; corrected this cycle (one-word, unambiguous, verified against the directory listing — no judgment call). |

### New Doc Gap Found This Cycle — `watchLibrary` collection + `src/features/watch/`

A new feature landed on `main` this cycle that wasn't reflected in `CLAUDE.md` at all:

- **`watchLibraryCollection`** (FEAT-100, design FEAT-86) — Watch Vehicle curated video library. Was completely absent from the Firestore Collections table (48 collection helpers exist in code; only this one was undocumented — everything else in the +5 delta was the doc's stat number lagging, not additional undocumented rows).
- **`src/features/watch/`** — the feature directory (parent vet-in form, list tab, player + completion tracking, wired into Settings → Watch Library) was likewise missing from the Project Structure section.

**Both auto-fixed this cycle** (mechanical: verified against the actual directory listing, `WatchVideo` type, and how the components are wired into `SettingsPage.tsx` — no architectural judgment involved). See `docs/WATCH_VEHICLE_DESIGN.md` for the full design; `docs/review/REVIEW_HOME_BASE.md`'s FEAT-100 row currently reads "BUILT (PR open) — do not merge," which appears stale relative to what's on `main` (playback + completion tracking are already present, beyond the "slice 1: vet-in + list only" scope the ledger row describes) — **not fixed**, ledger rows are out of scope for this audit (owned by the home-base chat per `CLAUDE.md`'s "Two chats, split ownership" rule); flagged for human awareness only.

### Nav Accuracy

`AppShell.tsx`'s parent and kid nav arrays match `MASTER_OUTLINE.md`'s Navigation line exactly, including item order. ✅ No drift. (Watch Library is a Settings sub-tab, not a top-level nav item, so it correctly doesn't appear here.)

### Unindexed Docs

✅ All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`, including `WATCH_VEHICLE_DESIGN.md` (already indexed as "NEW (design)").

### Stale Docs

All docs marked CURRENT were updated within the last 30 days. ✅ No stale docs flagged.

### Task Type / Collection / CF Coverage

Aside from the `watchLibrary`/`src/features/watch/` gap above (now closed), `SYSTEM_PROMPTS.md`, `CLAUDE.md`, `tasks/index.ts`, `firestore.ts`, and `functions/src/index.ts` are in sync.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 2,941 | `src/features/planner-chat/PlannerChatPage.tsx` | **+184** |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,215 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,103 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,041 | `src/features/records/records.logic.test.ts` | **+308** (test file) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,521 | `src/features/planner-chat/chatPlanner.logic.test.ts` | **+365** (test file) |
| 1,508 | `src/features/planner-chat/chatPlanner.logic.ts` | **+145** |
| 1,391 | `src/features/today/TodayChecklist.tsx` | +104 |
| 1,325 | `src/features/records/RecordsPage.tsx` | +56 |
| 1,233 | `src/features/evaluate/EvaluateChatPage.tsx` | +71 |
| 1,162 | `src/features/today/TodayPage.tsx` | +39 |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,112 | `functions/src/ai/evaluate.ts` | +47 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +82 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,059 | `src/features/today/KidTodayView.tsx` | +4 |
| 1,055 | `src/core/types/planning.ts` | +9 |
| 1,052 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,031 | `src/features/records/records.logic.ts` | new to this table |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |
| 1,008 | `functions/src/ai/chat.test.ts` | new to this table (test file) |
| 1,003 | `src/features/books/printBook.ts` | new to this table |

---

## Decomposition Candidates

No **production** file crossed 2,000 lines for the first time this cycle. `records.logic.test.ts` crossed 2,000 lines, but it's a test file — decomposition pressure there is lower-priority than production code.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,941 | KNOWN — state management ~1,700L, complex interconnected state. **+184 growth this cycle — the largest single-cycle jump of any production file, and the third consecutive cycle of upward trend (2,757 → 2,941).** Approaching 3,000 lines. Worth prioritizing a decomposition pass before it compounds further. |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage decomposition target. No growth this cycle. |
| `useQuestSession.ts` | 2,215 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth this cycle. |
| `BookEditorPage.tsx` | 2,103 | KNOWN — handlers interleaved but clear section boundaries. Stable this cycle. |

**Watch list:** `chatPlanner.logic.ts` grew +145L (1,363→1,508) and its test file +365L (1,156→1,521) this cycle — both still well under the 2,000-line threshold but the largest growth outside `PlannerChatPage.tsx`. `TodayChecklist.tsx` (+104L) and `BookshelfPage.tsx` (+82L) also grew notably.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 205,891→229,428; Commits 185→221; Test files 248→325; Firestore collections 43→48; Cloud Functions 26→27; Routes 36→35.
- **`CLAUDE.md` Firestore Collections table:** added the missing `watchLibrary` row (FEAT-100).
- **`CLAUDE.md` Project Structure:** added the missing `src/features/watch/` entry.
- **`CLAUDE.md` `src/core/foundations/` entry:** corrected `foundations.ts` (doesn't exist) → `index.ts` (the actual barrel file) — carried over from the 2026-07-13 report's "needs human pass" note; on inspection this was a simple, unambiguous filename correction with no judgment call involved.
- **`npm audit fix` (root + functions, non-breaking):** resolved a new CRITICAL `websocket-driver` vulnerability (via `firebase` → `@firebase/database` → `faye-websocket`) in both `package-lock.json` and `functions/package-lock.json` — a clean 0.7.4→0.7.5 patch bump. Verified build + full test suite (4,235 tests) still pass after the fix.
- Ran `npm run lint -- --fix`: no auto-fixable issues found (0 file changes); the 3 pre-existing warnings require dependency-array judgment calls and were left as-is.

### Needs Human Attention

- **`docs/review/REVIEW_HOME_BASE.md`'s FEAT-100 row** reads "BUILT (PR open) — do not merge" but the code on `main` already includes playback + completion tracking, beyond the "slice 1" scope the row describes. Ledger rows are owned by the home-base chat, not this audit — flagged for awareness only, not touched.
- **`docs/SYSTEM_PROMPTS.md` Section 4 prose gap (carried over, unchanged):** 7 task types (`reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`) still have no dedicated "Task Handlers" write-up. Registry/model-table/slice-mapping entries are complete and accurate; the prose write-ups need a human/dedicated pass.
- **Remaining `firebase-admin` vulnerabilities (8 moderate prod / 11 moderate all-scope, functions; 8 moderate all-scope, root):** trace to a vulnerable `uuid` transitively via `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`. Full fix requires `firebase-admin@14.1.0`, a breaking major version bump — architectural decision, left for human review. Unchanged in nature from every prior cycle (only the now-fixed `websocket-driver` critical was new).
- **Bundle size 4,207.93 kB (1,249.93 kB gzip), +128 kB / +42 kB gzip since last report:** heaviest imports unchanged — Three.js (avatar), jsPDF (print), curriculum map data. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:812`, `useQuestSession.ts:2080` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **`PlannerChatPage.tsx` still trending upward, and accelerating:** +184L this cycle (vs. +12L last cycle) — the fastest single-cycle growth seen in recent audits, three consecutive cycles of growth. Recommend prioritizing a decomposition pass before the next cycle.
- **Dead-export scan (partial — sampled first 80 files under `src/core`, capped per time budget, not the full tree):** 30 possibly-dead exports flagged by a grep-based heuristic (no usage found outside the defining file) — 10 more than last cycle's sample turned up. **Not removed** — a static grep pass can miss re-exports, dynamic imports, and test-only usage, so these need manual verification before any deletion. New since last cycle's list: `ScheduleBlockLabel` (`types/enums.ts`), `conceptArcConverter`, `ladderProgressCollection`, `ladderProgressDocId`, `workbookConfigDocId`, `monthlyReviewDocId`, `monthlyReviewDoc`, `kitRosterConverter`, `catalogProductConverter`, `catalogOrderConverter` (all `firebase/firestore.ts`). Carried over: `EvidenceKind`, `SynthesisVehicle` (`types/learnerModel.ts`); `emptyLabBeat` (`types/dadlab.ts`); `WorkingLevelSource`, `QuestOutcome` (`types/evaluation.ts`); 9 zod schema exports (`types/zod.ts`); `resolveBookCreator` (`types/books.ts`); `CardDifficulty` (`types/workshop.ts`); `PIECE_POSITIONS` (`types/xp.ts`); `SUPPORT_LEVEL_ORDER`, `PlannerSessionStatus` (`types/enums.ts`). Run a full-tree scan standalone if wanted — this cycle only covered a sample of `src/core`.
- **Audit script note:** the Phase-1 Cloud Functions one-liner still undercounts (21 vs true 27). No doc drift resulted this cycle (fixed at the source — `MASTER_OUTLINE.md` now says 27, matching `CLAUDE.md`), but the one-liner itself should be fixed before the next cycle to avoid needing a manual recount every time.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/chat.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 33 | books |
| 30 | today |
| 22 | business |
| 18 | planner-chat |
| 17 | avatar |
| 16 | quest |
| 12 | settings |
| 11 | shelly-chat |
| 10 | watch |
| 9 | evaluate |
| 9 | dad-lab |
| 5 | foundations-review |
| 4 | records |
| 4 | progress |
| 3 | evaluation |
| 2 | workshop |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | engine |
| 0 | ui-preview *(dev-only gallery — ok)* |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | auth |

No change in the 0-test feature set since last report: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only). The new `watch` feature landed this cycle with solid coverage (10 test files) from the start.

---

## Dependency Notes

- **npm audit (production, root):** ✅ 0 vulnerabilities (was 1 critical — fixed this cycle)
- **npm audit (all, root):** 9 vulnerabilities (1 low, 8 moderate) — all trace to the `firebase-admin` dependency chain, need a major-version bump
- **npm audit (production, functions):** 8 moderate (was 1 critical + 9 moderate — critical fixed this cycle) — same chain
- **npm audit (all, functions):** 11 moderate — same chain
- **Major version updates available (not applied — architectural decisions):** `firebase-admin` 13.10.0 → 14.1.0 (would clear remaining audit findings), `@mui/material`/`@mui/icons-material` 7.3.9 → 9.2.0, `three` 0.128.0 → 0.185.1 (+ matching `@types/three`), `eslint` 9.39.4 → 10.6.0, npm 10.9.7 → 12.0.1
