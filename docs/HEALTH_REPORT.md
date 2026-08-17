# Code Health Report — 2026-08-17

## Metrics

| Metric | Value | Change from last report (2026-08-03) |
|--------|-------|--------------------------------------|
| **Total lines** | **270,088** | +22,968 |
| **Commits** | **3,047** | **First cycle with true full git history.** This sandbox's clone was unshallowed (`git fetch --unshallow`) before counting; every prior cycle (including 2026-08-03's "219, unverifiable") was reading a shallow-clone artifact. 3,047 is a real `git rev-list --count HEAD`, spanning 2026-02-06 → 2026-08-16. Not comparable to any prior report's number. |
| **Test files** | **394** | +32 |
| **Tests passing** | **5,905** | +1,038 |
| **Tests total** | **5,905** | 0 skipped, 0 failing |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,337.66 kB / 1,292.15 kB gzip** | +60.93 kB / +18.82 kB gzip |

> **Note on "Commits":** `git rev-parse --is-shallow-repository` returned `false` after unshallowing — this is the first cycle in the report's history where the commit count is verified ground truth rather than a shallow-fetch-depth artifact. The jump from the last reported "219" is not real drift; it's the first accurate measurement. Recommend future cycles unshallow before computing this metric (`git fetch --unshallow origin` if `git rev-parse --is-shallow-repository` is `true`).

> **Note on stale-doc detection (Phase 3h):** for the same reason, this is also the first cycle where the 30-day-staleness check is authoritative rather than floor-capped by a shallow clone boundary. See "Stale Docs" below — the results are real this time.

> **Note on total-lines / test growth:** +22,968 lines and +1,038 tests over 14 days is a large jump for a single cycle but is consistent with `docs/review/ARCHITECTURE_AUDIT_2026-08-16.md`'s own finding of "a real feature week" (Ask AI edit capability, Today live-week-edit, Watch history, monthly-review reliability fixes) landing between the last two health-report dates — not measurement noise.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~17s). `node_modules` had to be installed fresh in this sandbox (`npm ci` at root and in `functions/`) — not a repo issue. |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`). `npm run lint -- --fix` made no changes — not mechanically fixable. |
| **Tests (root)** | ✅ PASS | 5,905 passing, 0 skipped, 0 failing (394 test files, `src/` + `functions/src/` combined via root `vitest.config.ts`) |
| **Tests (functions/)** | ✅ PASS | 976 passing, 0 failing (39 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs), re-run after the dependency bump below |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` (Phase 3g orphaned-import check) both clean; `functions`' `tsc` also clean |
| **npm audit (prod, root)** | ✅ **FIXED — 0 vulnerabilities** | Was 2 high + 1 moderate (`react-router` RSC CSRF bypass, `dompurify` detached-subtree XSS). `npm audit fix` resolved all three via lockfile-only transitive patch bumps (`react-router` 7.18.1→7.18.2, `dompurify` 3.4.12→3.4.13, plus `js-yaml`/`nanoid`/`brace-expansion` dev-dep bumps) — **`package.json` untouched**, no breaking change. Build/lint/typecheck/tests re-verified green after. |
| **npm audit (prod, functions)** | ⚠️ IMPROVED, not clean | Was 13 (1 low, 9 moderate, 3 high); now **10 (9 moderate, 1 high)** after the same non-breaking `npm audit fix` (fixed `body-parser` DoS, `brace-expansion` DoS, `fast-xml-parser` DOCTYPE-reset — all high). Remaining: `sharp` (high, libvips CVEs — fix needs `sharp@0.35.3`, breaking) and the `uuid`→`gaxios`/`google-gax`/`teeny-request`→`firebase-admin` chain (9 moderate — fix needs `firebase-admin@14.2.0`, breaking). `npm audit fix --dry-run` confirms no further non-breaking resolution. Left for human, per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 262,479 | 270,088 | DRIFT +2.9% — **AUTO-FIXED** |
| Commits | 219 | 3,047 (first real count — see note above) | **AUTO-FIXED**, annotated as non-comparable to prior cycles |
| Test files | 381 | 394 | DRIFT +3.4% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; walking every block — or `node`-parsing the file — confirms 29, matching the doc) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

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

Code (`AppShell.tsx`) and docs (`MASTER_OUTLINE.md` §Navigation) match exactly for both Parent (12 items, in order) and Kid (9 items, in order).

### Collection Coverage

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection, `chapterBooksCollection` → the Global Collections table). No CLAUDE.md edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md` (§1 dispatch diagram, §2 model table), both directions — no gap either way.

**Found and fixed a stale cross-reference:** `docs/DOCUMENT_INDEX.md`'s own description of `SYSTEM_PROMPTS.md` still said "19 task types" with a list missing `foundationsReview` and `helpCard`, and cited a stale "(v4, updated 2026-06-09)" — the file itself was correctly updated to 21 task types and 2026-07-06 back in the 2026-07-06 auto-fix cycle, but the index's own summary of it was never refreshed. Corrected to 21 / the full list / the real date.

### Unindexed Docs

None — every file in `docs/*.md` (top-level, except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`.

### Stale Docs (Phase 3h — first authoritative run)

With real full history, 56 docs are marked `**CURRENT**` in `DOCUMENT_INDEX.md`. **48 have not been touched in over 30 days; 8 have.**

**Not stale (≤30 days):**

| Doc | Last touched | Age |
|---|---|---|
| `MASTER_OUTLINE.md` | 2026-08-17 (this cycle) | 0d |
| `review/ARCHITECTURE_AUDIT_2026-08-16.md` | 2026-08-17 | 0d |
| `DOCUMENT_INDEX.md` | 2026-08-16 (this cycle) | 0d |
| `review/SCAN_CURRICULUM_DIAGNOSIS.md` | 2026-08-11 | 5d |
| `HEALTH_REPORT.md` | 2026-08-03 (superseded by this cycle) | 13d |
| `PROCESS_OVERVIEW.md` | 2026-07-26 | 21d |
| `RUNBOOK_FIRESTORE_PITR.md` | 2026-07-20 | 27d |
| `PROJECT_CONTEXT.md` | 2026-07-18 | 29d |

**Stale (>30 days), oldest 15 of 48** (full list computed, available on request — not reproduced in full here to keep this report readable):

| Doc | Last touched | Age |
|---|---|---|
| `ENGINE_V2.md` | 2026-03-03 | 166d |
| `KNOWLEDGE_MINE_BRIEF.md` | 2026-03-22 | 147d |
| `barnes-story-game-workshop-design.md` | 2026-03-23 | 146d |
| `WEEKLY_CONUNDRUM_ARC.md` | 2026-03-28 | 141d |
| `STONEBRIDGE_BIBLE.md` | 2026-04-07 | 131d |
| `HERO_HUB_ANIMATION_TUNING.md` | 2026-04-07 | 131d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 2026-04-07 | 131d |
| `first-principles-system-review.md` | 2026-04-07 | 131d |
| `SCRIPT_CONVENTIONS.md` | 2026-04-11 | 127d |
| `investigations/backend-reliability-assessment.md` | 2026-04-12 | 126d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 2026-04-21 | 117d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 2026-05-16 | 92d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 2026-05-17 | 91d |
| `PROFILE_LIMITS_AUDIT.md` | 2026-05-25 | 83d |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 2026-05-26 | 82d |

Most of the remaining 33 cluster in the June/early-July range (57d–50d old): `GARDEN_DEFENSE_QUEST_PLAN.md`, `BUSINESS_TAB_DESIGN.md`, `STICKER_CHARACTER_STUDIO.md`, `LONDON_BACKLOG.md`, `SEED_VAULT_V1_RUNBOOK.md`, `ECONOMY_AUDIT_PART1/2.md`, `GAME_WORLD_ECONOMY.md`, `SHELLY_PORTAL_CONTEXT.md`, `SHELLY_PORTAL_FEEDBACK_LOOP.md`, `barnes-shelly-chat-portal-design.md`, `08_RUNBOOK.md`, `SYSTEM_PROMPTS.md` (31d, just over), and 10 `review/*.md` audit/decision docs (`INTEGRATION_MAP.md`, `PER_CHILD_DELINEATION_AUDIT.md`, `DECISION_FUNC-01_source_of_truth.md`, `STATE_COMPLIANCE_DESIGN.md`, `UI_CONSISTENCY_AUDIT.md`, `UI_BATCH2_HEX_RECONCILIATION.md`, `DATA_COMPONENT_TRACE.md`, `LONDON_EVAL_READINESS.md`, `LEARNING_MAP_DIAGNOSIS.md`, `HOURS_UNDERCOUNT_DIAGNOSIS.md`, `ALIGNMENT_AUDIT_2026-06-20.md`, `LOOP_CLOSING_REVIEW_2026-07-15.md`, `CHARTER_ALIGNMENT_SWEEP_2026-07-16.md`).

**This is not necessarily a problem.** Several of these are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md` narrative bible, `ENGINE_V2.md` framework doc, `ECONOMY_AUDIT_PART1/2.md`) that don't need frequent edits to stay accurate. Others are point-in-time audits correctly marked `CURRENT` for their findings rather than `HISTORICAL`. Per policy this is not auto-fixed — flagged below for a human spot-check, since this is the first cycle the check has had real data to work with.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,292 | `src/features/planner-chat/PlannerChatPage.tsx` | **+200** |
| 2,764 | `src/features/records/records.logic.test.ts` | +0 (test file) |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,218 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,211 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | **NEW to >1,000 table** (test file) |
| 2,113 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,072 | `functions/src/ai/tasks/shellyChat.test.ts` | **NEW to >1,000 table** (test file) |
| 1,896 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 (test file) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,719 | `functions/src/ai/tasks/shellyChat.ts` | **NEW to >1,000 table** (production) |
| 1,713 | `src/features/records/dataReviewExport.logic.ts` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,591 | `src/features/today/TodayChecklist.tsx` | +93 |
| 1,544 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | **NEW to >1,000 table** (production) |
| 1,464 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,365 | `src/features/today/TodayPage.tsx` | +147 |
| 1,233 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,207 | `src/features/records/records.logic.ts` | +0 |
| 1,156 | `src/features/today/KidTodayView.tsx` | +0 |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | **NEW to >1,000 table** (test file) |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,122 | `functions/src/ai/tasks/monthlyReviewData.ts` | +91 |
| 1,112 | `src/features/shelly-chat/useShellyChatActions.ts` | **NEW to >1,000 table** (production) |
| 1,112 | `functions/src/ai/evaluate.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,101 | `functions/src/ai/chat.test.ts` | +93 (test file) |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,078 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,075 | `src/core/types/planning.ts` | +16 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,057 | `src/features/shelly-chat/parseChatActions.test.ts` | **NEW to >1,000 table** (test file) |
| 1,046 | `src/features/settings/DevAdminTab.tsx` | +0 |
| 1,002 | `src/features/books/printBook.ts` | +0 |

"NEW to >1,000 table" means the file wasn't in the previous report's (>1,000-line) table — it was either below 1,000 lines last cycle or just wasn't visible below the table's cutoff. The previous report's own methodology only tracked files already over 1,000 lines, so an exact delta isn't available for these; they're flagged here so the next cycle has a real baseline.

---

## Decomposition Candidates

No production file crossed 2,000 lines for the first time this cycle. The four known >2,000-line production files are unchanged in status:

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,292 | KNOWN, **growing again** (+200 this cycle) after a two-cycle flat window noted in the last report. `CLAUDE.md`'s "Known Technical Debt" entry still says "2,669L ... Stable as-is" — now stale by 623 lines. Not auto-fixed (`CLAUDE.md` prose is out of this audit's write scope). |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. No growth. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. No growth. |

**New watch-list entry:** `functions/src/ai/tasks/shellyChat.ts` at 1,719 lines is the largest **production** file not currently named in `CLAUDE.md`'s Known Technical Debt list. It's well below the 2,000-line auto-flag threshold, so not a DECOMPOSITION CANDIDATE yet, but it's the closest unlisted file to that line and paired with a 2,072-line test file (`shellyChat.test.ts`) and a 1,112-line client-side sibling (`useShellyChatActions.ts`) — the shelly-chat surface as a whole grew the most of any feature this cycle (see Test Coverage by Feature below, shelly-chat: 11→23 test files). Worth a human look next cycle if it keeps growing.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 262,479→270,088; Commits 219→3,047 (first real count, annotated as non-comparable to prior cycles); Test files 381→394. Firestore collections, Cloud Functions, Chat task types, and Routes were already correct.
- **`docs/DOCUMENT_INDEX.md`:** corrected its own stale description of `SYSTEM_PROMPTS.md` — "19 task types" (missing `foundationsReview`/`helpCard`) and a "(v4, updated 2026-06-09)" citation → "21 task types" (full list) and "(v4, updated 2026-07-06)", matching the actual file.
- **`npm audit fix` (root, non-breaking):** resolved all 3 production vulnerabilities (2 high `react-router`, 1 moderate `dompurify`) via lockfile-only patch bumps. `package.json` untouched. Build/lint/typecheck/5,905 tests re-verified green after.
- **`npm audit fix` (functions/, non-breaking):** resolved 3 of 13 vulnerabilities (`body-parser`, `brace-expansion`, `fast-xml-parser` — all high) via lockfile-only patch bumps. `functions/package.json` untouched. `tsc`, `eslint src/`, and 976 functions tests re-verified green after.
- Ran `npm run lint -- --fix` (root): no auto-fixable issues found (0 file changes); the 3 pre-existing `react-hooks/exhaustive-deps` warnings require dependency-array judgment calls and were left as-is.

### Needs Human Attention

- **`CLAUDE.md`'s `PlannerChatPage.tsx` tech-debt note is stale and the file is growing again.** Reads "PlannerChatPage.tsx (2,669L) ... Stable as-is" — actual is 3,292L (+623), and it grew +200L this cycle after two flat cycles. Recommend updating the note's number or revisiting the decomposition plan. Not auto-fixed — `CLAUDE.md` prose is excluded from this audit's write scope.
- **`functions/src/ai/tasks/shellyChat.ts` (1,719L) and `src/features/shelly-chat/useShellyChatActions.ts` (1,112L) are unlisted, growing shelly-chat files** — see Decomposition Candidates above. Not yet over the 2,000-line auto-flag threshold; noted for the next cycle's baseline.
- **Remaining `sharp` HIGH vulnerability (functions, prod):** libvips CVEs, fix needs `sharp@0.35.3` — `npm audit fix --force` territory, breaking. Architectural decision, left for human review.
- **Remaining `firebase-admin`/`uuid` chain (functions, prod), 9 moderate:** same `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`→`uuid` chain as every prior cycle, now needs `firebase-admin@14.2.0` (major bump, breaking). `npm audit fix --dry-run` confirms no non-breaking path. Left for human review.
- **Bundle size 4,337.66 kB (1,292.15 kB gzip), +60.93 kB / +18.82 kB gzip since last report:** modest growth, consistent with the feature-week line-count jump above. Heaviest single chunk is still the main `index-*.js` bundle (Three.js avatar, jsPDF print, curriculum map data, and now more shelly-chat/chat surface). Route-level `React.lazy` splitting (Avatar/VoxelCharacter, records PDF export, workshop) would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **48 of 56 `CURRENT`-marked docs are >30 days untouched** (first cycle this check has had real data — see Stale Docs above). Most look like legitimately-stable reference/design docs rather than drifted ones, but this audit can't judge accuracy, only age. Recommend a human skim pass, prioritizing the ones nearest active feature areas (`SYSTEM_PROMPTS.md` at 31d, `barnes-shelly-chat-portal-design.md` at 41d given the shelly-chat growth noted above, `DESIGN_MONTHLY_REVIEW_BOOK.md` at 82d given the monthly-review reliability fixes mentioned in the 2026-08-16 architecture audit).
- **Dead-export scan skipped this cycle.** Budget went to unshallowing git history (a first, and worth doing again next cycle), installing dependencies from scratch, the full build/lint/5,905+976-test double run (root + functions, re-verified after the audit-fix dependency bump), and the now-authoritative stale-doc check. Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic used in older cycles, whenever it's picked back up.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 46 | today | +4 |
| 35 | books | +2 |
| 23 | business | +0 |
| 23 | shelly-chat | **+12** |
| 21 | planner-chat | +2 |
| 20 | watch | +4 |
| 17 | quest | +0 |
| 17 | avatar | +0 |
| 13 | settings | +0 |
| 11 | dad-lab | +0 |
| 9 | records | +0 |
| 9 | evaluate | +0 |
| 6 | foundations-review | +0 |
| 6 | monthly-review | +2 |
| 5 | progress | +0 |
| 3 | evaluation | +0 |
| 2 | workshop | +0 |
| 1 | weekly-review | +0 |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). The standout this cycle is **shelly-chat (+12 test files)**, consistent with it also being the feature with the most new large files (see Decomposition Candidates).

---

## Dependency Notes

- **Root (prod):** **0 vulnerabilities** — fixed this cycle (was 2 high + 1 moderate). See Auto-Fixed.
- **Functions (prod):** 10 vulnerabilities (9 moderate, 1 high) — down from 13 this cycle (see Auto-Fixed). Remaining `sharp` (high) and `firebase-admin`/`uuid` chain (moderate) both require breaking major bumps; left for human review per policy.
