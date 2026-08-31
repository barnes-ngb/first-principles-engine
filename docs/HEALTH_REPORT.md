# Code Health Report — 2026-08-31

## Metrics

| Metric | Value | Change from last report (2026-08-24) |
|--------|-------|--------------------------------------|
| **Total lines** | **283,223** | +7,651 |
| **Commits** | **3,150** | +47 |
| **Test files** | **431** | +26 |
| **Tests passing** | **6,425** (root) + **1,064** (functions/ own suite) | +300 root, +50 functions |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,364.16 kB / 1,301.75 kB gzip** | +12.08 kB / +4.55 kB gzip |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~19s). Fresh sandbox — root + `functions/` `npm install` required first (not a repo issue); the repo also arrived as a **shallow clone** this cycle (`git rev-list --count HEAD` read 197 before `git fetch --unshallow`, vs. the true 3,150) — unshallowed before computing the commit stat so it isn't reported low. |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:295`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`). Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | 6,425 passing, 0 skipped, 0 failing (431 test files, `src/` + `functions/src/` combined via root `vitest.config.ts`) |
| **Tests (functions/)** | ✅ PASS | 1,064 passing, 0 failing (41 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` (Phase 3g orphaned-import check) both clean; `functions`' `tsc --noEmit` also clean — no orphaned imports |
| **npm audit (prod, root)** | ✅ **0 vulnerabilities** | Clean, same as last cycle |
| **npm audit (prod, functions)** | ✅ **0 vulnerabilities** | Clean, same as last cycle |
| **npm audit (full, root)** | ⚠️ 9 vulnerabilities (1 low, 8 moderate), dev-only | Unchanged from last cycle — `uuid`/`gaxios`/`google-gax`/`@google-cloud/*` transitive chain, not in the production dependency tree. Fix requires `--force` (breaking). Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 2 moderate, dev-only | Unchanged — `ts-deepmerge` via `firebase-functions-test`. Not in production tree. Fix requires `--force` (breaking, downgrades `firebase-functions-test`). Low priority per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 281,460 | 283,223 | DRIFT +0.6% — **AUTO-FIXED** |
| Commits | 3,129 | 3,150 | DRIFT +0.7% — **AUTO-FIXED** |
| Test files | 421 | 431 | DRIFT +2.4% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; hand-walking every block confirms 29, matching the doc) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

All drift this cycle is small (<3%) and consistent with a normal week of feature work — no anomalies. `docs/MASTER_OUTLINE.md` was already touched twice since the last health audit (a 2026-08-30 monthly architecture audit had partially refreshed the block), so this cycle's drift is smaller than the raw days-elapsed would suggest.

### Missing File References

Same four expected carry-overs as every prior cycle, all correctly marked as removed/superseded in their source docs — not real gaps:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` | Referenced only in MASTER_OUTLINE's historical UX P1.04/P2.06 changelog entries, which explicitly say the file was removed by a later change |
| `CreativeTimeLog.tsx` | Same UX P2.06 changelog entry, same reason |

No new missing-reference findings this cycle.

### Navigation

Code (`AppShell.tsx`) and docs (`MASTER_OUTLINE.md` §Navigation) match exactly for both Parent (12 items, in order) and Kid (9 items, in order). No drift.

### Collection Coverage

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection, `chapterBooksCollection` → the documented global `chapterBooks` table). No CLAUDE.md edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced somewhere in `docs/SYSTEM_PROMPTS.md` (model table §2, slice-mapping table §3, dispatch-flow diagram §1) — no registry entry is entirely undocumented. However, **Section 4 ("Task Handlers") prose write-ups are still missing for 7 of the 21**: `reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`. This is not new drift — the doc's own changelog line (`SYSTEM_PROMPTS.md:5`, dated 2026-08-28) already self-flags exactly this gap from a prior validation pass, and it is unchanged since then. Not auto-fixed: writing 7 accurate prose sections describing each handler's prompt structure requires reading each task file closely enough to risk getting the details wrong under a mechanical pass — a judgment call, left for a human-assigned run.

### Unindexed Docs

None — every top-level file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`. (73 top-level docs.)

### Stale Docs (Phase 3h)

Using the same per-CURRENT-row backtick-filename extraction as prior cycles (see the 2026-08-24 report's methodology-correction note for the known false-positive risk of this heuristic — a full per-row status-column parse was not re-run this cycle for time-budget reasons): **62 unique `.md` filenames appear on a row marked `CURRENT`; 52 have not been touched in git history in over 30 days.** This is consistent with the last cycle's more carefully-parsed 59/51 split — no material change, same long-tail of stable reference/design docs (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`, `ECONOMY_AUDIT_PART1/2.md`, etc.) and point-in-time audits correctly marked `CURRENT` for their findings. No new stale-doc anomaly this cycle; flagged for the same human spot-check as before if those surfaces are still active.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,295 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 |
| 2,891 | `src/features/records/records.logic.test.ts` | +127 (test file) |
| 2,670 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | +253 (test file) |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,266 | `functions/src/ai/tasks/shellyChat.test.ts` | +0 (test file) |
| 2,218 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,166 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 (test file) |
| 2,113 | `src/features/books/BookEditorPage.tsx` | +0 |
| 1,938 | `functions/src/ai/tasks/shellyChat.ts` | +0 (production — flat this cycle, see Decomposition Candidates) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,712 | `src/features/records/dataReviewExport.logic.ts` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,597 | `src/features/today/TodayChecklist.tsx` | +5 |
| 1,544 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 |
| 1,464 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,372 | `src/features/today/TodayPage.tsx` | +7 |
| 1,354 | `src/features/shelly-chat/useShellyChatActions.ts` | +112 |
| 1,302 | `functions/src/ai/tasks/monthlyReviewData.test.ts` | **NEW to >1,000 table** (test file) |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,287 | `src/features/shelly-chat/parseChatActions.test.ts` | +0 (test file) |
| 1,251 | `functions/src/ai/tasks/monthlyReviewData.ts` | +129 |
| 1,242 | `src/features/evaluate/EvaluateChatPage.tsx` | +9 |
| 1,217 | `src/features/records/records.logic.ts` | +10 |
| 1,181 | `src/features/today/KidTodayView.tsx` | +0 |
| 1,177 | `src/features/shelly-chat/useShellyChatFlows.ts` | +43 |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | +0 |
| 1,114 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,112 | `functions/src/ai/evaluate.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,101 | `functions/src/ai/chat.test.ts` | +0 (test file) |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,075 | `src/core/types/planning.ts` | +0 |
| 1,067 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,067 | `functions/src/ai/contextSlices.test.ts` | +0 (test file) |
| 1,046 | `src/features/settings/DevAdminTab.tsx` | +0 |
| 1,002 | `src/features/books/printBook.ts` | +0 |

*(Deltas computed against the 2026-08-24 report's table where the file appeared there; files new to the >1,000-line table this cycle are marked NEW.)*

---

## Decomposition Candidates

No production file crossed 2,000 lines for the first time this cycle. The four known >2,000-line production files are unchanged in status:

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,295 | KNOWN, flat this cycle. `CLAUDE.md`'s tech-debt note reads 3,295L — accurate. |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. No growth. `CLAUDE.md` note reads 2,641L — accurate. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth. `CLAUDE.md` note reads 2,218L — accurate. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. No growth. `CLAUDE.md` note reads 2,113L — accurate. |

`CLAUDE.md`'s size notes for all four files are now in sync with the code (the 2026-08-30 monthly architecture audit appears to have corrected the staleness flagged in the last health report).

**Watch-list update:** `functions/src/ai/tasks/shellyChat.ts`, flagged over the last two cycles for approaching the 2,000-line threshold (1,719L → 1,938L), **stayed flat at 1,938L this cycle** — no further growth. It is still not named in `CLAUDE.md`'s Known Technical Debt list; recommend adding it if it resumes growth toward 2,000L. The bigger movers this cycle were in the monthly-review and shelly-chat surfaces instead: `monthlyReviewData.ts` (+129L, 1,122→1,251), `useShellyChatActions.ts` (+112L, 1,242→1,354), `records.logic.test.ts` (+127L) and `useShellyChatActions.logic.test.ts` (+253L, both test files) — consistent with continued feature work on monthly review curation and the Shelly portal.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 281,460→283,223; Commits 3,129→3,150; Test files 421→431. Firestore collections, Cloud Functions, Chat task types, and Routes were already correct.
- Verified via `npm run lint`: no auto-fixable issues found; the 3 pre-existing `react-hooks/exhaustive-deps` warnings require dependency-array judgment calls and were left as-is.

### Auto-Fixed (by companion)

Companion pass found nothing to fix this cycle: Phase 3 turned up zero gaps against companion Rules 1–5 (no undocumented task-registry entries, no undocumented Cloud Functions, no missing collections, no nav mismatch, no unindexed docs — all were already clean). The Section-4 prose gap in `SYSTEM_PROMPTS.md` (7 task types missing a dedicated write-up) is a documentation-depth gap, not a "missing from docs entirely" gap the companion's Rule 1 is scoped to fix, and it requires reading each handler closely enough that a mechanical pass risks inaccuracy — left for human-assigned follow-up.

### Needs Human Attention

- **`SYSTEM_PROMPTS.md` §4 is missing dedicated prose write-ups for 7 task handlers** (`reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`) — self-flagged by the doc's own 2026-08-28 changelog line, unchanged since. All 7 are still covered in the model-selection and slice-mapping tables, so this is a depth gap, not a correctness gap.
- **Dead-export scan skipped again this cycle**, same as last two — budget went to unshallowing git history (repo arrived as a shallow clone), installing dependencies from scratch in a fresh sandbox, and the full build/lint/6,425+1,064-test double run (root + functions). Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic used in older cycles, whenever it's picked back up.
- **Dev-dependency-only npm audit findings remain** (9 on root, 2 in functions — see Build Status table). Both require `--force`/breaking upgrades and are outside the production dependency tree. Low priority per policy, unchanged assessment from prior cycles.
- **Bundle size 4,364.16 kB (1,301.75 kB gzip), +12.08 kB / +4.55 kB gzip since last report:** modest growth, consistent with the +7,651 line-count delta. Heaviest single chunk is still the main `index-*.js` bundle (Three.js avatar, jsPDF print, curriculum map data, shelly-chat/chat surface, monthly-review). Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:295`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **~52 of ~62 `CURRENT`-marked docs remain >30 days untouched** (same heuristic-caveat as last cycle — see Stale Docs section above). Consistent with the last cycle's 51/59; no new anomaly. Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster if those surfaces are still active.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 52 | today | +4 |
| 43 | books | +8 |
| 27 | shelly-chat | +2 |
| 23 | business | +0 |
| 21 | planner-chat | +0 |
| 20 | watch | +0 |
| 17 | quest | +0 |
| 17 | avatar | +0 |
| 15 | settings | +2 |
| 15 | dad-lab | +0 |
| 10 | progress | +4 |
| 9 | records | +0 |
| 9 | evaluate | +0 |
| 7 | foundations-review | +0 |
| 6 | monthly-review | +0 |
| 3 | evaluation | +0 |
| 2 | workshop | +0 |
| 2 | weekly-review | +1 |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). Biggest movers this cycle: `books` (+8), `today` (+4), `progress` (+4).

---

## Dependency Notes

- **Root (prod):** **0 vulnerabilities** — same as last cycle. Full audit (including dev deps) shows 9 (1 low, 8 moderate) in a `uuid`/`gaxios`/`google-gax` transitive chain; fix needs `--force` (breaking). Left for human review.
- **Functions (prod):** **0 vulnerabilities** — same as last cycle. Full audit shows 2 moderate (dev-only, `ts-deepmerge` via `firebase-functions-test`); fix needs `--force` (breaking). Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three` 0.128→0.185. No action taken — major-version bumps are a human decision per policy.
