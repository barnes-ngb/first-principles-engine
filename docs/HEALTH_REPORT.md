# Code Health Report — 2026-09-21

## Metrics

| Metric | Value | Change from last report (2026-09-14) |
|--------|-------|--------------------------------------|
| **Total lines** | **379,080** | +9,237 |
| **Commits** | **3,757** | +67 |
| **Test files** | **717** | +30 |
| **Tests passing** | **10,211** (root combined suite, 717 files, 1 skipped by design, 0 failing) + **1,509** (functions/ own suite, 68 files, real deps) | +434 root, +23 functions |
| **Firestore collections** | **47** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **39** | +0 |
| **Bundle size** | **4,619.20 kB / 1,392.23 kB gzip** | +48.77 kB / +16.76 kB gzip |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~16s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129`, all involving `sessionTimer`). Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | **10,211 passing, 0 failing, 1 skipped** (717 test files, `src/` + `functions/src/` combined via root `vite.config.ts`'s test block). The one skip is the opt-in `docs:ledger-sweep` probe (does not run in `npx vitest run` by design). |
| **Tests (functions/)** | ✅ PASS | 1,509 passing, 0 failing (68 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` both clean; no orphaned imports |
| **`npm run docs:check`** | ✅ PASS | All HARD checks pass (ledger IDs, index resolution, ledger anchors, collection-count spans, evidence kinds, day-write routing, ledger-status, ledger-status-contradiction). 10 SOFT warnings — see **docs:check findings** below, unchanged shape from last cycle. |
| **npm audit (prod, root)** | ⚠️ 1 moderate | `fflate` (ReDoS-adjacent infinite-loop on malformed ZIP64) — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (Rule 8: moderate-only → note, don't fix). |
| **npm audit (prod, functions)** | ⚠️ 3 moderate | `qs`/`body-parser`/`express` transitive chain — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy. |
| **npm audit (full, root)** | ⚠️ 16 vulnerabilities (1 low, 13 moderate, 2 high) | **Flat vs. last cycle** (was 16, up from 12 the cycle before) — no new growth this cycle. The 2 high are dev-dependency-only (confirmed by the `--production` scan above showing only 1 moderate). Fix requires `--force` (breaking) for the dev-only remainder. Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 11 vulnerabilities (9 moderate, 2 high) | **Flat vs. last cycle** (was 11, up from 7 the cycle before) — no new growth this cycle. Same pattern — highs are dev-only (`firebase-functions-test` chain). Requires `--force` (breaking). Low priority per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 369,843 | 379,080 | +2.5% — **AUTO-FIXED** (under the 5% DRIFT threshold, but synced anyway since nobody hand-maintains this number) |
| Commits | 3,690 | 3,757 | +1.8% — **AUTO-FIXED** (see shallow-clone note below) |
| Test files | 687 | 717 | +4.4% — **AUTO-FIXED** |
| Firestore collections | 47 | 47 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; a `node -e` script parsing every `export { ... } from` block confirms 29 — same caveat as every prior cycle) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 39 | 39 | ✅ OK |

**Shallow-clone caveat, repeated from last cycle:** the session again started from a **shallow clone** (`git rev-parse --is-shallow-repository` → `true`, `git rev-list --count HEAD` → 260, not the true count). `git fetch --unshallow` was run before trusting the number; the real count is 3,757. This is now the second consecutive cycle this step was necessary — every future cycle should run it before reading the commit count.

Growth this cycle (2.5% lines / 1.8% commits / 4.4% test files) is much smaller than the prior two cycles' large jumps (16.6%/27.9% two cycles ago) — consistent with the week's work being dominated by the Books/Stickers reliability arc (FIX-246 through FIX-252: sticker cleanup, book transforms, background/layer preservation, sticker result identity), which is heavier on test coverage in already-large files than on new surface area.

`npm run docs:check` independently confirms the collection count (`PASS [collection-count] all spans == 47`).

### Missing File References

Same eight expected carry-overs as every prior cycle (all explicitly documented as removed/superseded/never-existed in their own surrounding context), **plus one new this cycle**:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` / `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in `DOCUMENT_INDEX.md` |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` / `CreativeTimeLog.tsx` | Referenced only in `MASTER_OUTLINE.md`'s historical UX P1.04/P2.06 changelog entries, which explicitly say the files were removed by a later change |
| `AGENTS.md` | `DOCUMENT_INDEX.md`'s own row for `review/AI_DEVELOPMENT_REVIEW_20260905.md` documents that this file was never pushed to any branch |
| `components/ChildSelector.tsx` | `CLAUDE.md`'s own `AppShell` narrative states in the same sentence that this file "is deleted" (FEAT-237/UX-425) |
| `scanAdvance.ts` | `CLAUDE.md`'s own Curriculum-tab narrative states it "was removed rather than left standing" (UX-403/FIX-235) |
| **`today/captureRowWrite.ts`** *(NEW this cycle)* | **Not found under this name anywhere in the repo.** `CLAUDE.md`'s Today section (UX-404 narrative) says `today/captureRowWrite.ts` "is the lane: find the row by `checklistItemKey`, patch it, write `checklist` alone…" — the function it describes (`writeCaptureRow`, alongside `patchDayChecklistGuarded`) actually lives in **`src/features/today/dayChecklistRowWrite.ts`**. Either the file was renamed after the prose was written, or the prose was drafted with a working title that never matched the landed filename. **Not auto-fixed** — a filename mismatch in prose could reflect a real rename that needs a deliberate CLAUDE.md pass, not a mechanical substitution, and CLAUDE.md prose is out of scope for this audit's auto-fix policy either way. |

### Navigation

`src/app/AppShell.tsx`'s parent nav (13 items: Today, Plan My Week, Curriculum, Review, Progress, Records, Books, Watch Library, Barnes Bros, Game Workshop, Dad Lab, Settings, Ask AI) and kid nav (8 items: Today, Knowledge Mine, My Books, Books About Me, My Hero, Barnes Bros, Game Workshop, Dad Lab) both match `docs/MASTER_OUTLINE.md`'s Navigation line exactly — no drift this cycle (last cycle's mismatch, caught and fixed on PR #1867's predecessor cycle, has held).

### Collection Coverage

All 47 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table. Two helper **function names** don't literally match their Firestore **path** (`catalogOrdersCollection` → path `orders`; `errorLogsCollection` → path `errorLog`) — checked against source, both are documented correctly under their true path names (`orders`, `errorLog` rows in the table), so this is a JS naming-convention quirk, not a doc gap. No edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`, both directions — no gap either way.

### Unindexed Docs

None among top-level `docs/*.md`.

### Stale Docs (Phase 3h)

**80 unique docs are marked `**CURRENT**`** in `DOCUMENT_INDEX.md` (+6 vs. last cycle's 74). **43 have not been touched in over 30 days** — the same absolute count as last cycle (the 6 newly-added `CURRENT` docs are all recent).

**Oldest 15 of the 43 stale:**

| Doc | Age |
|---|---|
| `ENGINE_V2.md` | 202d |
| `KNOWLEDGE_MINE_BRIEF.md` | 183d |
| `WEEKLY_CONUNDRUM_ARC.md` | 177d |
| `first-principles-system-review.md` | 167d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 167d |
| `STONEBRIDGE_BIBLE.md` | 167d |
| `HERO_HUB_ANIMATION_TUNING.md` | 167d |
| `SCRIPT_CONVENTIONS.md` | 163d |
| `investigations/backend-reliability-assessment.md` | 162d |
| `DESIGN_SKIP_SYSTEM_2026-04-09.md` | 160d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 153d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 128d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 127d |
| `PROFILE_LIMITS_AUDIT.md` | 119d |
| `design-pass-v1/copy-pass-audit.md` | 118d |

Same shape as last cycle — ages incremented by ~7 days each, no anomalies. Several of the oldest are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`). Not auto-fixed (requires reading each doc to assess, per policy). Flagged for a human spot-check if those surfaces are still active.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report (2026-09-14) |
|-------|------|--------------------------------------|
| 3,942 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 (flat) |
| 3,108 | `functions/src/ai/chat.ts` | +0 (flat) |
| 3,027 | `src/features/records/records.logic.test.ts` | +0 (flat, test file) |
| 2,936 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | +0 (flat, test file) |
| 2,437 | `src/features/books/BookEditorPage.tsx` | +23 |
| 2,350 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 (flat, test file) |
| 2,296 | `functions/src/ai/tasks/shellyChat.test.ts` | +0 (flat, test file) |
| 2,275 | `src/features/quest/useQuestSession.ts` | +0 (flat) |
| 1,951 | `src/features/today/TodayPage.tsx` | **+121** |
| 1,928 | `src/features/workshop/WorkshopPage.tsx` | +0 (flat) |
| 1,919 | `functions/src/ai/tasks/shellyChat.ts` | +0 (flat) |
| 1,897 | `src/features/avatar/MyAvatarPage.tsx` | +0 (flat) |
| 1,857 | `src/features/progress/CurriculumTab.tsx` | +0 (flat) |
| 1,841 | `src/features/today/TodayChecklist.tsx` | +21 |
| 1,776 | `src/features/records/dataReviewExport.logic.ts` | +15 |
| 1,736 | `functions/src/ai/evaluate.ts` | +0 (flat) |
| 1,682 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 (flat) |
| 1,638 | `functions/src/ai/contextSlices.ts` | +0 (flat) |
| 1,614 | `src/features/records/RecordsPage.tsx` | +2 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 (flat) |
| 1,530 | `src/features/settings/DevAdminTab.tsx` | +0 (flat) |
| 1,506 | `src/features/shelly-chat/useShellyChatActions.ts` | +0 (flat) |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 (flat) |
| 1,425 | `src/features/books/useBookGenerateChat.ts` | +36 |
| 1,338 | `src/core/types/planning.ts` | +0 (flat) |
| 1,307 | `src/features/shelly-chat/parseChatActions.test.ts` | +0 (flat, test file) |
| 1,302 | `functions/src/ai/tasks/monthlyReviewData.test.ts` | +0 (flat, test file) |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +0 (flat) |
| 1,268 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 (flat) |
| 1,266 | `src/features/books/printBook.ts` | +0 (flat) |
| 1,255 | `src/features/today/KidTodayView.tsx` | −17 (shrank) |
| 1,246 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 (flat) |
| 1,241 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 (flat) |
| 1,225 | `src/features/books/SketchScanner.tsx` | **new to >1,000L table** |
| 1,180 | `src/features/books/BookshelfPage.tsx` | +0 (flat) |
| 1,166 | `src/features/settings/AvatarAdminTab.tsx` | +0 (flat) |
| 1,154 | `src/features/records/records.logic.ts` | +0 (flat) |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | +0 (flat, test file) |
| 1,149 | `src/features/shelly-chat/ActionConfirmCard.test.tsx` | +0 (flat, test file) |
| 1,138 | `functions/src/ai/chat.test.ts` | +0 (flat, test file) |
| 1,114 | `src/features/shelly-chat/ActionConfirmCard.tsx` | +0 (flat) |
| 1,114 | `src/features/dad-lab/DadLabPage.tsx` | +0 (flat) |
| 1,080 | `src/features/settings/StickerLibraryTab.tsx` | +0 (flat) |
| 1,072 | `functions/src/ai/contextSlices.test.ts` | +0 (flat, test file) |
| 1,067 | `src/features/quest/ReadingQuest.tsx` | +0 (flat) |
| 1,060 | `functions/src/ai/evaluate.test.ts` | +0 (flat, test file) |
| 1,047 | `src/features/today/useUnifiedCapture.workbook.test.tsx` | +0 (flat, test file) |

(Table at >1,000L; 47 files total exceed 1,000 lines this cycle — a much quieter cycle than last report's "151 files exceed 500 lines, up from 130.")

---

## Decomposition Candidates

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,942 | KNOWN, flat this cycle — still within ~60 lines of 4,000. `CLAUDE.md`'s tech-debt note reads 3,950L, close enough (−8) to not need correction, but watch: it will cross both 4,000 and the doc's stated figure on its next growth cycle. |
| `TodayPage.tsx` | 1,951 | **+121 this cycle, now within ~50 lines of the 2,000L threshold.** Not yet flagged in `CLAUDE.md`'s Known Technical Debt section — the fastest-growing large file this cycle. |
| `CurriculumTab.tsx` | 1,857 | KNOWN CANDIDATE (flagged last cycle), flat this cycle — still not in `CLAUDE.md`'s Known Technical Debt list, still within ~150 lines of 2,000L. |
| `functions/src/ai/evaluate.ts` | 1,736 | Flagged last cycle (+434 that cycle), flat this cycle. Not yet in `CLAUDE.md`'s Known Technical Debt section. |
| `DevAdminTab.tsx` | 1,530 | Flagged last cycle (+391 that cycle), flat this cycle. Not yet in `CLAUDE.md`'s Known Technical Debt section. |
| `chat.ts` (CF) | 3,108 | KNOWN, flat this cycle — `buildQuestPrompt` alone was already flagged 400+ lines. `CLAUDE.md`'s note reads 3,051L (−57 vs. actual); CLAUDE.md prose is outside this audit's auto-fix scope. |
| `BookEditorPage.tsx` | 2,437 | KNOWN, **+23 this cycle** — first movement since it was flagged flat two cycles running. `CLAUDE.md`'s note reads 2,414L (−23 vs. actual, drifting again). |
| `useQuestSession.ts` | 2,275 | KNOWN, flat this cycle. `CLAUDE.md`'s note already reads 2,275L — exact match. |

`SketchScanner.tsx` (1,225L, `src/features/books/`) crossed the 1,000L threshold this cycle and is worth watching if it keeps growing, though it is well short of the 2,000L decomposition trigger.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 369,843→379,080; Commits 3,690→3,757; Test files 687→717. (Firestore collections, Cloud Functions, Chat task types, and Routes were already correct — no change.)
- Ran `npm run lint` (0 auto-fixable issues — same 3 pre-existing `react-hooks/exhaustive-deps` warnings, left as-is) and `npm run docs:check` (all HARD checks pass; no auto-fix script exists separate from the stats-block edit above — this audit made no other changes).

### Needs Human Attention

- **`today/captureRowWrite.ts` is referenced in `CLAUDE.md`'s Today section but the file is actually named `src/features/today/dayChecklistRowWrite.ts`.** See Missing File References above. Worth a one-line CLAUDE.md correction, but it's prose (out of this audit's auto-fix scope) and might indicate the rename happened after the paragraph was written without updating it.
- **`TodayPage.tsx` grew +121 lines this cycle (1,830→1,951L)** and is now within ~50 lines of the 2,000L threshold this repo treats as a first-class decomposition trigger. Not yet in `CLAUDE.md`'s Known Technical Debt list. Worth watching — one more cycle like this and it crosses.
- **`CurriculumTab.tsx` (1,857L), `functions/src/ai/evaluate.ts` (1,736L), and `DevAdminTab.tsx` (1,530L)** — all flagged as growing fast two cycles ago, all flat this cycle, all still absent from `CLAUDE.md`'s Known Technical Debt section. Worth a decision on whether to add them now that growth has paused, or wait and see if it resumes.
- **`src/features/shelly-chat/ShellyChatPage.tsx` is still 874 lines** (flat this cycle, was flagged growing two cycles running before that) — `CLAUDE.md`'s Known Technical Debt section still describes it as "ARCH-09 FIXED (1,632→647L)… Stable." It remains +227 lines (+35%) above that figure. Not auto-fixed (`CLAUDE.md` prose out of scope); flagged again for a human to decide whether "Stable" still applies, now that growth has at least paused.
- **`npm audit` vulnerability counts are flat this cycle** (root: 16/16 full, functions: 11/11 full) after growing the prior two cycles — no action needed, noting for trend continuity. Production-tree moderate counts also flat (root 1, functions 3), non-breaking fixes available via `npm audit fix`, not applied per policy (Rule 8).
- **Dead-export scan skipped this cycle**, same as every prior cycle — budget went to the full unshallow + fresh-sandbox install + the double build/lint/test run (root 10,211 tests + functions 1,509 tests). Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic whenever this is picked back up.
- **Bundle size 4,619.20 kB (1,392.23 kB gzip), +48.77 kB / +16.76 kB gzip since last report:** modest growth, tracking the smaller line-count delta this cycle. Main chunk (Three.js avatar, jsPDF print, curriculum map data, shelly-chat/chat surface) is still unsplit. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **43 of 80 unique `CURRENT`-marked docs are >30 days untouched** (up from 74 unique docs last cycle, same absolute stale count of 43 — the 6 newly-added `CURRENT` docs are all recent). Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster (`ENGINE_V2.md` at 202d, `KNOWLEDGE_MINE_BRIEF.md` at 183d) if those surfaces are still active.

---

## docs:check findings (SOFT warnings, informational)

`npm run docs:check` surfaced 10 SOFT warnings, identical shape and count to last cycle:

- **2 raw Firestore refs outside the allowlist** (unchanged): `src/features/progress/ArmorTab.tsx` (raw `xpLedger` ref) and `src/features/settings/DevAdminTab.tsx` (raw `days` ref). SOFT, not HARD — flagged for review, not auto-fixed (code change, outside this audit's scope).
- **7 files with `httpsCallable` missing a timeout/AbortController or `finally` in reach** (unchanged list): `AvatarPhotoUpload.tsx`, `generateFace.ts`, `DiagnosticPanel.tsx`/`GenerateNowDialog.tsx`/`MonthlyReviewReader.tsx` (monthly-review), `FoundationsDiagPanel.tsx`, `AvatarAdminTab.tsx`.
- **1 file with an image file-input and no visible downscale/compress call:** `src/features/records/PortfolioPage.tsx` (unchanged).
- **105 swallowed `catch()` blocks across 58 files** (report-only census, **flat vs. last cycle's ending count of 105/58** — the prior cycle's own growth from 98/54 has not continued).

None of these are new-this-cycle regressions (the census is cumulative and flat), surfaced because `docs:check` ran clean on all HARD checks and these are its only open SOFT items. Not fixed — code changes, outside this audit's read-only/doc-only scope.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 105 | books | +15 |
| 92 | today | +7 |
| 41 | progress | +0 |
| 40 | planner-chat | +0 |
| 33 | shelly-chat | +0 |
| 26 | business | +0 |
| 21 | settings | +0 |
| 20 | watch | +0 |
| 20 | avatar | +0 |
| 19 | quest | +0 |
| 16 | weekly-review | +2 |
| 16 | dad-lab | +0 |
| 15 | records | +2 |
| 11 | evaluate | +0 |
| 8 | workshop | +0 |
| 8 | foundations-review | +0 |
| 7 | monthly-review | +0 |
| 7 | evaluation | +0 |
| 1 | review | +0 |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). `books` (+15) and `today` (+7) dominate this cycle's test growth, consistent with the Books/Stickers reliability arc (FIX-246 through FIX-252) landing in the ~1 week since the last audit.

---

## Dependency Notes

- **Root (prod):** 1 moderate (`fflate`) — unchanged from last cycle. Non-breaking fix available (`npm audit fix`), not applied per policy. Full audit (including dev deps): 16 (1 low, 13 moderate, 2 high) — flat vs. last cycle. The highs are dev-only; the remainder needs `--force` (breaking). Left for human review.
- **Functions (prod):** 3 moderate (`qs`/`body-parser`/`express` chain) — unchanged from last cycle. Non-breaking fix available, not applied per policy. Full audit: 11 (9 moderate, 2 high) — flat vs. last cycle. Highs dev-only; fix needs `--force` (breaking) for the remainder. Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three` 0.128→0.186, `@types/node` 24.x→26.x. No action taken — major-version bumps are a human decision per policy.
