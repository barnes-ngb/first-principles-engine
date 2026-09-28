# Code Health Report — 2026-09-28

## Metrics

| Metric | Value | Change from last report (2026-09-21) |
|--------|-------|--------------------------------------|
| **Total lines** | **382,731** | +3,651 |
| **Commits** | **3,783** | +26 |
| **Test files** | **725** | +8 |
| **Tests passing** | **10,391** (root combined suite, 725 files, 1 skipped by design, 0 failing) + **1,538** (functions/ own suite, 69 files, real deps) | +180 root, +29 functions (+1 file) |
| **Firestore collections** | **47** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **39** | +0 |
| **Bundle size** | **4,231.15 kB / 1,265.19 kB gzip** | **−388.05 kB / −127.04 kB gzip** |

Bundle size dropped rather than grew this cycle — consistent with `CLAUDE.md`'s Known Technical Debt note on FIX-253 (jspdf split into its own point-of-use-imported chunk, measured there as −393.24 kB / −128.82 kB against `origin/main`; the small residual gap from that note's figures is normal chunk-hash noise between builds).

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~20s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129`, all involving `sessionTimer`). `eslint . --fix` made no changes. Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | **10,391 passing, 0 failing, 1 skipped** (725 test files, `src/` + `functions/src/` combined via root `vite.config.ts`'s test block). The one skip is the opt-in `docs:ledger-sweep` probe (does not run in `npx vitest run` by design). |
| **Tests (functions/)** | ✅ PASS | 1,538 passing, 0 failing (69 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` both clean; no orphaned imports |
| **`npm run docs:check`** | ✅ PASS | All HARD checks pass (ledger IDs, index resolution, ledger anchors, collection-count spans, evidence kinds, day-write routing, ledger-status, ledger-status-contradiction). 10 SOFT warnings — see **docs:check findings** below, identical shape to last cycle. |
| **npm audit (prod, root)** | ⚠️ 1 moderate | `fflate` (ReDoS-adjacent infinite-loop on malformed ZIP64) — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (Rule 8: moderate-only → note, don't fix). |
| **npm audit (prod, functions)** | ⚠️ 3 moderate | `qs`/`body-parser`/`express` transitive chain — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy. |
| **npm audit (full, root)** | ⚠️ 16 vulnerabilities (1 low, 13 moderate, 2 high) | **Flat vs. last cycle.** The 2 high are dev-dependency-only (confirmed by the `--omit=dev` scan above showing only 1 moderate). Fix requires `--force` (breaking) for the dev-only remainder. Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 11 vulnerabilities (9 moderate, 2 high) | **Flat vs. last cycle.** Same pattern — highs are dev-only (`firebase-functions-test` chain). Requires `--force` (breaking). Low priority per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 379,080 | 382,731 | +1.0% — **AUTO-FIXED** |
| Commits | 3,757 | 3,783 | +0.7% — **AUTO-FIXED** (see shallow-clone note below) |
| Test files | 717 | 725 | +1.1% — **AUTO-FIXED** |
| Firestore collections | 47 | 47 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts because 2 of the 11 `export {...}` blocks span multiple lines; enumerating every named export across all `export { ... } from` blocks gives 29 — same caveat as every prior cycle) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 39 | 39 | ✅ OK |

**Shallow-clone caveat, repeated from every prior cycle:** the session again started from a **shallow clone** (`git rev-parse --is-shallow-repository` → `true`, `git rev-list --count HEAD` → 240 before unshallowing). `git fetch --unshallow` was run before trusting the number; the real count is 3,783. This is now at least the third consecutive cycle this step was necessary — every future cycle should run it before reading the commit count.

Growth this cycle (1.0% lines / 0.7% commits / 1.1% test files) is smaller than last cycle's already-modest growth (2.5%/1.8%/4.4%), consistent with a normal one-week gap with no major new feature arc landing (the biggest single-file mover was `functions/src/ai/evaluate.ts`, +370 lines from the FIX-255/FIX-256 weekly-review reliability work already narrated in `CLAUDE.md`).

`npm run docs:check` independently confirms the collection count (`PASS [collection-count] all spans == 47`).

### Missing File References

Same file-reference gaps as last cycle, all either explicitly documented as removed/superseded/never-existed in their own surrounding context, or a known prose/filename mismatch:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` / `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in `DOCUMENT_INDEX.md` |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` / `CreativeTimeLog.tsx` | Referenced only in `MASTER_OUTLINE.md`'s historical UX P1.04/P2.06 changelog entries, which explicitly say the files were removed by a later change |
| `AGENTS.md` | `DOCUMENT_INDEX.md`'s own row for `review/AI_DEVELOPMENT_REVIEW_20260905.md` documents that this file was never pushed to any branch |
| `components/ChildSelector.tsx` | `CLAUDE.md`'s own `AppShell` narrative states in the same sentence that this file "is deleted" (FEAT-237/UX-425) |
| `scanAdvance.ts` | `CLAUDE.md`'s own Curriculum-tab narrative states it "was removed rather than left standing" (UX-403/FIX-235) |
| `today/captureRowWrite.ts` | **Still not found under this name.** Confirmed again this cycle: `src/features/today/dayChecklistRowWrite.ts` exists and holds the function `CLAUDE.md`'s UX-404 narrative describes (`writeCaptureRow` alongside `patchDayChecklistGuarded`); the prose still names the wrong filename. Not auto-fixed — CLAUDE.md prose is out of scope for this audit's auto-fix policy, and a filename correction there deserves a deliberate pass rather than a mechanical substitution. |

### Navigation

`src/app/AppShell.tsx`'s parent nav (13 items: Today, Plan My Week, Curriculum, Review, Progress, Records, Books, Watch Library, Barnes Bros, Game Workshop, Dad Lab, Settings, Ask AI) and kid nav (8 items: Today, Knowledge Mine, My Books, Books About Me, My Hero, Barnes Bros, Game Workshop, Dad Lab) both match `docs/MASTER_OUTLINE.md`'s Navigation line exactly — no drift this cycle.

### Collection Coverage

All 47 collection path names in `firestore.ts` (checked against the actual Firestore path each helper opens, not just its JS function name) are documented as rows in `CLAUDE.md`'s Firestore Collections table. No gap.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`, both directions — no gap either way.

### Cloud Function Coverage

All 29 named exports resolved from `functions/src/index.ts`'s `export { ... } from` blocks are named in `CLAUDE.md`'s Cloud Functions list. No gap.

### Unindexed Docs

None among top-level `docs/*.md` — every file matched a reference in `docs/DOCUMENT_INDEX.md`.

### Stale Docs

**74 unique docs matched the strict `| \`file.md\` | **CURRENT** |` table-row pattern** in `DOCUMENT_INDEX.md` this cycle (a stricter regex than last cycle's count of 80, so the two numbers are not directly comparable — see caveat below). **42 of those have not been touched in over 30 days.**

**Oldest 15 (of the 42 stale, this cycle's extraction):**

| Doc | Age |
|---|---|
| `ENGINE_V2.md` | 209d |
| `KNOWLEDGE_MINE_BRIEF.md` | 190d |
| `WEEKLY_CONUNDRUM_ARC.md` | 184d |
| `first-principles-system-review.md` | 174d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 174d |
| `STONEBRIDGE_BIBLE.md` | 174d |
| `HERO_HUB_ANIMATION_TUNING.md` | 174d |
| `SCRIPT_CONVENTIONS.md` | 170d |
| `investigations/backend-reliability-assessment.md` | 169d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 160d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 135d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 134d |
| `PROFILE_LIMITS_AUDIT.md` | 126d |
| `design-pass-v1/copy-pass-audit.md` | 125d |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 125d |

Every doc that appears in both this cycle's and last cycle's oldest-15 lists aged by **exactly +7 days**, which is the expected one-week gap between audits and is a good cross-check that the underlying `git log` dates are being read correctly even though the total CURRENT-doc count moved. **Caveat, stated rather than silently carried forward:** this cycle's extraction used a stricter regex (`^| \`file.md\` | **CURRENT**`) than is confirmed to have been used last cycle, and it reads exactly 74 unique files against a raw `grep -c "CURRENT"` count of 81 in the same file (the gap is duplicate/near-duplicate rows and a handful of non-`.md` or differently-formatted CURRENT rows this pattern intentionally excludes to stay precise). Not auto-fixed either way (requires reading each doc to assess staleness, per policy). Flagged for a human spot-check on the oldest cluster if those surfaces are still active — several are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`).

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report (2026-09-21) |
|-------|------|--------------------------------------|
| 3,942 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 (flat) |
| 3,108 | `functions/src/ai/chat.ts` | +0 (flat) |
| 3,027 | `src/features/records/records.logic.test.ts` | +0 (flat, test file) |
| 2,936 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | +0 (flat, test file) |
| 2,433 | `src/features/books/BookEditorPage.tsx` | −4 |
| 2,350 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 (flat, test file) |
| 2,296 | `functions/src/ai/tasks/shellyChat.test.ts` | +0 (flat, test file) |
| 2,275 | `src/features/quest/useQuestSession.ts` | +0 (flat) |
| 2,106 | `functions/src/ai/evaluate.ts` | **+370** |
| 1,952 | `src/features/today/TodayPage.tsx` | +1 |
| 1,928 | `src/features/workshop/WorkshopPage.tsx` | +0 (flat) |
| 1,919 | `functions/src/ai/tasks/shellyChat.ts` | +0 (flat) |
| 1,897 | `src/features/avatar/MyAvatarPage.tsx` | +0 (flat) |
| 1,857 | `src/features/progress/CurriculumTab.tsx` | +0 (flat) |
| 1,841 | `src/features/today/TodayChecklist.tsx` | +0 (flat) |
| 1,776 | `src/features/records/dataReviewExport.logic.ts` | +0 (flat) |
| 1,682 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 (flat) |
| 1,638 | `functions/src/ai/contextSlices.ts` | +0 (flat) |
| 1,614 | `src/features/records/RecordsPage.tsx` | +0 (flat) |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 (flat) |
| 1,530 | `src/features/settings/DevAdminTab.tsx` | +0 (flat) |
| 1,506 | `src/features/shelly-chat/useShellyChatActions.ts` | +0 (flat) |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 (flat) |
| 1,425 | `src/features/books/useBookGenerateChat.ts` | +0 (flat) |
| 1,368 | `src/core/types/planning.ts` | +30 |
| 1,307 | `src/features/shelly-chat/parseChatActions.test.ts` | +0 (flat, test file) |
| 1,302 | `functions/src/ai/tasks/monthlyReviewData.test.ts` | +0 (flat, test file) |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +0 (flat) |
| 1,268 | `src/features/books/printBook.ts` | +0 (flat) |
| 1,268 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 (flat) |
| 1,255 | `src/features/today/KidTodayView.tsx` | +0 (flat) |
| 1,246 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 (flat) |
| 1,241 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 (flat) |
| 1,225 | `src/features/books/SketchScanner.tsx` | +0 (flat) |
| 1,176 | `src/features/books/BookshelfPage.tsx` | −4 |
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

(Table at >1,000L; 47 files total exceed 1,000 lines this cycle — flat count vs. last cycle, but with one large single-file mover: `functions/src/ai/evaluate.ts` grew +370L from the FIX-255/FIX-256 weekly-review reliability work (`recordWeekBeforeAssembly`, per-child positions-first pass, `runStartedAt`/timeout handling) already narrated in `CLAUDE.md`'s Cloud Functions section — a documented, intentional change, not drift.)

---

## Decomposition Candidates

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,942 | KNOWN, flat again this cycle — still within ~60 lines of 4,000. `CLAUDE.md`'s tech-debt note reads 3,942L — exact match. |
| `functions/src/ai/evaluate.ts` | 2,106 | **+370 this cycle** — the fastest-growing large file, from documented FIX-255/FIX-256 work. Not yet in `CLAUDE.md`'s Known Technical Debt section; worth a decision given it crossed 2,000L this cycle. |
| `TodayPage.tsx` | 1,952 | Flat this cycle (+1) after last cycle's +121 — still within ~50 lines of the 2,000L threshold this repo treats as a first-class decomposition trigger. Not yet in `CLAUDE.md`'s Known Technical Debt list. |
| `CurriculumTab.tsx` | 1,857 | KNOWN CANDIDATE (flagged two cycles ago), flat again — still not in `CLAUDE.md`'s Known Technical Debt list, still within ~150 lines of 2,000L. |
| `DevAdminTab.tsx` | 1,530 | Flagged two cycles ago, flat again. Not yet in `CLAUDE.md`'s Known Technical Debt section. |
| `chat.ts` (CF) | 3,108 | KNOWN, flat this cycle — `buildQuestPrompt` alone was already flagged 400+ lines. `CLAUDE.md`'s note reads 3,051L (−57 vs. actual, unchanged gap from last cycle); CLAUDE.md prose is outside this audit's auto-fix scope. |
| `BookEditorPage.tsx` | 2,433 | KNOWN, −4 this cycle. `CLAUDE.md`'s note reads 2,437L (+4 vs. actual now, drifted the other direction from last cycle). |
| `useQuestSession.ts` | 2,275 | KNOWN, flat this cycle. `CLAUDE.md`'s note already reads 2,275L — exact match. |

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 379,080→382,731; Commits 3,757→3,783; Test files 717→725. (Firestore collections, Cloud Functions, Chat task types, and Routes were already correct — no change.)
- Ran `npm run lint -- --fix` (0 auto-fixable issues — same 3 pre-existing `react-hooks/exhaustive-deps` warnings, left as-is) and `npm run docs:check` (all HARD checks pass; no other doc gaps found to auto-fix this cycle — collections, task types, Cloud Functions, and nav all already matched code).
- Re-ran `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run docs:check` after the `MASTER_OUTLINE.md` edit — all still pass. No auto-fix needed reverting.

### Needs Human Attention

- **`today/captureRowWrite.ts` is referenced in `CLAUDE.md`'s Today section but the file is actually named `src/features/today/dayChecklistRowWrite.ts`.** Unchanged from last cycle. See Missing File References above. Worth a one-line CLAUDE.md correction, but it's prose (out of this audit's auto-fix scope).
- **`functions/src/ai/evaluate.ts` grew +370 lines this cycle (1,736→2,106L)**, crossing 2,000L, from the documented FIX-255/FIX-256 weekly-review reliability work. Not yet in `CLAUDE.md`'s Known Technical Debt list — worth a decision on whether to add it now that it has crossed the threshold this repo otherwise treats as a decomposition trigger.
- **`TodayPage.tsx` (1,952L), `CurriculumTab.tsx` (1,857L), and `DevAdminTab.tsx` (1,530L)** — all previously flagged as growing fast, all flat or near-flat this cycle, all still absent from `CLAUDE.md`'s Known Technical Debt section. Worth a decision on whether to add them now that growth has paused, or wait and see if it resumes.
- **`src/features/shelly-chat/ShellyChatPage.tsx`** was not re-measured this cycle (budget went to the larger drift/stale-doc checks); last cycle it stood at 874 lines against `CLAUDE.md`'s stated 647L ("ARCH-09 FIXED... Stable"), a gap that has not been corrected. Flagged again for a human to confirm current size and decide whether "Stable" still applies.
- **`npm audit` vulnerability counts are flat this cycle** (root: 16/16 full, 1/3 prod; functions: 11/11 full, 3/3 prod) — no action needed, noting for trend continuity. Non-breaking fixes available via `npm audit fix`, not applied per policy (Rule 8).
- **Dead-export scan skipped this cycle**, same as every prior cycle — budget went to the full unshallow + fresh-sandbox install + the double build/lint/test run (root 10,391 tests + functions 1,538 tests) plus the doc cross-reference sweep. Recommend a real dead-code tool (`ts-prune` or `knip`) over a grep heuristic whenever this is picked back up.
- **Stale-doc count methodology changed slightly this cycle** (74 unique CURRENT docs found vs. last cycle's reported 80) due to a stricter extraction regex — see the Stale Docs section above for the full caveat. The per-doc ages that overlap between cycles check out exactly (+7 days each), so the dates themselves are trustworthy; only the total-CURRENT-doc count is not directly comparable cycle-to-cycle without harmonizing the extraction method. Recommend a human decide on (or this routine standardize) one canonical regex for future cycles.
- **Bundle size dropped to 4,231.15 kB (1,265.19 kB gzip), −388.05 kB / −127.04 kB gzip since last report** — this is the FIX-253 jspdf code-split landing, not new work this cycle; the main chunk (Three.js avatar, curriculum map data, shelly-chat/chat surface) is otherwise still unsplit. Route-level `React.lazy` splitting would reduce initial load further. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **42 of 74 (this cycle's strict count) `CURRENT`-marked docs are >30 days untouched.** Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster (`ENGINE_V2.md` at 209d, `KNOWLEDGE_MINE_BRIEF.md` at 190d) if those surfaces are still active.

---

## docs:check findings (SOFT warnings, informational)

`npm run docs:check` surfaced 10 SOFT warnings, identical shape and count to last cycle:

- **2 raw Firestore refs outside the allowlist** (unchanged): `src/features/progress/ArmorTab.tsx` (raw `xpLedger` ref) and `src/features/settings/DevAdminTab.tsx` (raw `days` ref). SOFT, not HARD — flagged for review, not auto-fixed (code change, outside this audit's scope).
- **7 files with `httpsCallable` missing a timeout/AbortController or `finally` in reach** (unchanged list): `AvatarPhotoUpload.tsx`, `generateFace.ts`, `DiagnosticPanel.tsx`/`GenerateNowDialog.tsx`/`MonthlyReviewReader.tsx` (monthly-review), `FoundationsDiagPanel.tsx`, `AvatarAdminTab.tsx`.
- **1 file with an image file-input and no visible downscale/compress call:** `src/features/records/PortfolioPage.tsx` (unchanged).
- **105 swallowed `catch()` blocks across 58 files** (report-only census, **flat vs. last cycle** — no growth this cycle).

None of these are new-this-cycle regressions (the census is cumulative and flat), surfaced because `docs:check` ran clean on all HARD checks and these are its only open SOFT items. Not fixed — code changes, outside this audit's read-only/doc-only scope.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 110 | books | +5 |
| 92 | today | +0 |
| 41 | progress | +0 |
| 40 | planner-chat | +0 |
| 33 | shelly-chat | +0 |
| 26 | business | +0 |
| 21 | settings | +0 |
| 20 | watch | +0 |
| 20 | avatar | +0 |
| 19 | quest | +0 |
| 18 | weekly-review | +2 |
| 16 | dad-lab | +0 |
| 15 | records | +0 |
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

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). `books` (+5) and `weekly-review` (+2) account for essentially all this cycle's test growth — a much quieter cycle than the Books/Stickers reliability arc that dominated last report.

---

## Dependency Notes

- **Root (prod):** 1 moderate (`fflate`) — unchanged from last cycle. Non-breaking fix available (`npm audit fix`), not applied per policy. Full audit (including dev deps): 16 (1 low, 13 moderate, 2 high) — flat vs. last cycle. The highs are dev-only; the remainder needs `--force` (breaking). Left for human review.
- **Functions (prod):** 3 moderate (`qs`/`body-parser`/`express` chain) — unchanged from last cycle. Non-breaking fix available, not applied per policy. Full audit: 11 (9 moderate, 2 high) — flat vs. last cycle. Highs dev-only; fix needs `--force` (breaking) for the remainder. Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three` 0.128→0.186, `@types/node` 24.x→26.x. Unchanged set from last cycle. No action taken — major-version bumps are a human decision per policy.
