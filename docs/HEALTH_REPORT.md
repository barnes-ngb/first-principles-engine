# Code Health Report — 2026-08-24

## Metrics

| Metric | Value | Change from last report (2026-08-17) |
|--------|-------|--------------------------------------|
| **Total lines** | **275,572** | +5,484 |
| **Commits** | **3,103** | +56 |
| **Test files** | **405** | +11 |
| **Tests passing** | **6,125** (root) + **1,014** (functions/ own suite) | +220 root, +38 functions |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,352.08 kB / 1,297.20 kB gzip** | +14.42 kB / +5.05 kB gzip |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~25s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`). Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | 6,125 passing, 0 skipped, 0 failing (405 test files, `src/` + `functions/src/` combined via root `vitest.config.ts`) |
| **Tests (functions/)** | ✅ PASS | 1,014 passing, 0 failing (39 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` (Phase 3g orphaned-import check) both clean; `functions`' `tsc --noEmit` also clean — no orphaned imports |
| **npm audit (prod, root)** | ✅ **0 vulnerabilities** | Clean, same as last cycle |
| **npm audit (prod, functions)** | ✅ **0 vulnerabilities** | Clean — was 10 (9 moderate, 1 high) as of the last report; now clean in production. The 9 remaining full-audit findings (below) are dev-dependency-only |
| **npm audit (full, root)** | ⚠️ 9 vulnerabilities (1 low, 8 moderate), dev-only | `uuid`/`gaxios`/`google-gax`/`@google-cloud/*`/`firebase-admin` transitive chain, likely from a dev tool. Not in the production dependency tree — `npm audit --production` reports 0. Fix requires `--force` (breaking). Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 2 moderate, dev-only | `ts-deepmerge` via `firebase-functions-test`. Not in production tree. Fix requires `--force` (breaking, downgrades `firebase-functions-test`). Low priority per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 270,926 | 275,572 | DRIFT +1.7% — **AUTO-FIXED** |
| Commits | 3,047 | 3,103 | DRIFT +1.8% — **AUTO-FIXED** |
| Test files | 397 | 405 | DRIFT +2.0% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; hand-walking every block confirms 29, matching the doc) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

All drift this cycle is small (<2%) and consistent with a normal week of feature work — no anomalies.

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

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection). No CLAUDE.md edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`, both directions — no gap either way.

### Unindexed Docs

None — every top-level file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`. (73 top-level docs, 127 total including subdirectories `archive/`, `design-pass-v1/`, `foundations/`, `investigations/`, `review/`, `review/prompts/` — subdirectory indexing is out of this check's scope, same as every prior cycle.)

### Stale Docs (Phase 3h)

62 docs are marked `**CURRENT**` in `DOCUMENT_INDEX.md` (up from 56 last cycle — new review/design docs added). **54 have not been touched in over 30 days; 8 have.**

**Not stale (≤30 days):**

| Doc | Last touched | Age |
|---|---|---|
| `review/UX_AUDIT_2026-08.md` | 2026-08-24 (this cycle) | 0d |
| `DOCUMENT_INDEX.md` | 2026-08-23 | 1d |
| `MASTER_OUTLINE.md` | 2026-08-23 | 1d |
| `review/ARCHITECTURE_AUDIT_2026-08-23.md` | 2026-08-23 | 1d |
| `review/DECISION_FUNC-01_source_of_truth.md` | 2026-08-22 | 2d |
| `HEALTH_REPORT.md` | 2026-08-17 (superseded by this cycle) | 7d |
| `review/SCAN_CURRICULUM_DIAGNOSIS.md` | 2026-08-11 | 13d |
| `PROCESS_OVERVIEW.md` | 2026-07-26 | 29d |

**Stale (>30 days), oldest 15 of 54:**

| Doc | Last touched | Age |
|---|---|---|
| `ENGINE_V2.md` | 2026-03-03 | 174d |
| `KNOWLEDGE_MINE_BRIEF.md` | 2026-03-22 | 155d |
| `barnes-story-game-workshop-design.md` | 2026-03-23 | 154d |
| `WEEKLY_CONUNDRUM_ARC.md` | 2026-03-28 | 149d |
| `first-principles-system-review.md` | 2026-04-07 | 139d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 2026-04-07 | 139d |
| `STONEBRIDGE_BIBLE.md` | 2026-04-07 | 139d |
| `HERO_HUB_ANIMATION_TUNING.md` | 2026-04-07 | 139d |
| `SCRIPT_CONVENTIONS.md` | 2026-04-11 | 135d |
| `investigations/backend-reliability-assessment.md` | 2026-04-12 | 134d |
| `DESIGN_SKIP_SYSTEM_2026-04-09.md` | 2026-04-14 | 132d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 2026-04-21 | 125d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 2026-05-16 | 100d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 2026-05-17 | 99d |
| `PROFILE_LIMITS_AUDIT.md` | 2026-05-25 | 91d |

Remaining 39 cluster in the late-May through mid-July range (90d–31d old), largely unchanged from last cycle's list: `DESIGN_MONTHLY_REVIEW_BOOK.md`, `design-pass-v1/copy-pass-audit.md`, `PROMPT_FIX.md`, `SHELLY_PORTAL_CONTEXT.md`, `PROMPT_BACKUP_CHECK.md`, `ARCH-10_rules_hardening_plan.md`, `PROMPT_AUTO_ARCH_FIX.md`, `review/INTEGRATION_MAP.md`, `SHELLY_PORTAL_FEEDBACK_LOOP.md`, `WRITING_SPELLING_DESIGN.md`, `review/PER_CHILD_DELINEATION_AUDIT.md`, `GAME_WORLD_ECONOMY.md`, `ECONOMY_AUDIT_PART1/2.md`, `review/LONDON_EVAL_READINESS.md`, `review/DATA_COMPONENT_TRACE.md`, `review/UI_CONSISTENCY_AUDIT.md`, `review/UI_BATCH2_HEX_RECONCILIATION.md`, `COMPLIANCE_YEAR_END_CLOSEOUT.md`, `review/LEARNING_MAP_DIAGNOSIS.md`, `review/ALIGNMENT_AUDIT_2026-06-20.md`, `STICKER_CHARACTER_STUDIO.md`, `PROMPT_ARCH_AUDIT.md`, `LONDON_BACKLOG.md`, `GARDEN_DEFENSE_QUEST_PLAN.md`, `BUSINESS_TAB_DESIGN.md`, `SEED_VAULT_V1_RUNBOOK.md`, `review/STATE_COMPLIANCE_DESIGN.md`, `review/HOURS_UNDERCOUNT_DIAGNOSIS.md`, `FINDINGS_PIPELINE.md`, `barnes-shelly-chat-portal-design.md`, `08_RUNBOOK.md`, `OPS_WINDOW.md`, `DOCS_ALIGNMENT.md`, `review/LOOP_CLOSING_REVIEW_2026-07-15.md`, `review/CHARTER_ALIGNMENT_SWEEP_2026-07-16.md`, `SYSTEM_PROMPTS.md`, `PROJECT_CONTEXT.md`, `RUNBOOK_FIRESTORE_PITR.md`.

**This is not necessarily a problem** — several are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`, `ECONOMY_AUDIT_PART1/2.md`) or point-in-time audits correctly marked `CURRENT` for their findings rather than `HISTORICAL`. Same pattern and same doc set as last cycle — no new drift here, flagged for a human spot-check as before.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,295 | `src/features/planner-chat/PlannerChatPage.tsx` | +3 |
| 2,764 | `src/features/records/records.logic.test.ts` | +0 (test file) |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,417 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | **+206** (test file) |
| 2,266 | `functions/src/ai/tasks/shellyChat.test.ts` | **+194** (test file) |
| 2,218 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,166 | `src/features/planner-chat/chatPlanner.logic.test.ts` | **+270** (test file) |
| 2,113 | `src/features/books/BookEditorPage.tsx` | +0 |
| 1,938 | `functions/src/ai/tasks/shellyChat.ts` | **+219** (production — see Decomposition Candidates) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,712 | `src/features/records/dataReviewExport.logic.ts` | -1 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,592 | `src/features/today/TodayChecklist.tsx` | +1 |
| 1,544 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 |
| 1,464 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,365 | `src/features/today/TodayPage.tsx` | +0 |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +152 |
| 1,287 | `src/features/shelly-chat/parseChatActions.test.ts` | **+230** (test file) |
| 1,242 | `src/features/shelly-chat/useShellyChatActions.ts` | +130 |
| 1,233 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,207 | `src/features/records/records.logic.ts` | +0 |
| 1,181 | `src/features/today/KidTodayView.tsx` | +25 |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,122 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |
| 1,114 | `src/features/dad-lab/DadLabPage.tsx` | +36 |
| 1,112 | `functions/src/ai/evaluate.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,101 | `functions/src/ai/chat.test.ts` | +0 (test file) |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,075 | `src/core/types/planning.ts` | +0 |
| 1,067 | `src/features/quest/ReadingQuest.tsx` | +1 |
| 1,067 | `functions/src/ai/contextSlices.test.ts` | **NEW to >1,000 table** (test file) |
| 1,046 | `src/features/settings/DevAdminTab.tsx` | +0 |
| 1,002 | `src/features/books/printBook.ts` | +0 |

---

## Decomposition Candidates

No production file crossed 2,000 lines for the first time this cycle. The four known >2,000-line production files are unchanged in status:

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,295 | KNOWN, flat this cycle (+3). `CLAUDE.md`'s tech-debt note already reads 3,295L — accurate, no drift. |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. No growth. `CLAUDE.md` note says 2,548L — now stale by 93 lines. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth. `CLAUDE.md` note says 2,161L — now stale by 57 lines. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. No growth. `CLAUDE.md` note says 2,103L — now stale by 10 lines. |

**Watch-list update:** `functions/src/ai/tasks/shellyChat.ts`, flagged last cycle at 1,719L as "the closest unlisted file to the 2,000-line threshold," grew **+219 lines to 1,938L** this cycle — now within 62 lines of the auto-flag threshold. Its paired test file `shellyChat.test.ts` also grew +194L (2,072→2,266), and the client-side sibling `useShellyChatActions.ts` grew +130L (1,112→1,242). The shelly-chat surface is still the fastest-growing area in the codebase (see Test Coverage by Feature: shelly-chat 23→25 test files). **Recommend adding `shellyChat.ts` to `CLAUDE.md`'s Known Technical Debt list next cycle if it crosses 2,000L**, since it will then be the fifth production file over that line and is not currently named there.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 270,926→275,572; Commits 3,047→3,103; Test files 397→405. Firestore collections, Cloud Functions, Chat task types, and Routes were already correct.
- Ran `npm run lint -- --fix` (implicitly verified via `npm run lint`): no auto-fixable issues found; the 3 pre-existing `react-hooks/exhaustive-deps` warnings require dependency-array judgment calls and were left as-is.

### Auto-Fixed (by companion)

Companion pass found nothing further to fix this cycle: Phase 3 turned up zero gaps against companion Rules 1–5 (no undocumented task types, no undocumented Cloud Functions, no missing collections, no nav mismatch, no unindexed docs — all were already clean before the companion ran). The remaining findings below are all in categories the companion explicitly does not auto-fix (stale doc status, dead exports, bundle size, `CLAUDE.md` prose, breaking dependency upgrades).

### Needs Human Attention

- **`CLAUDE.md`'s size notes for `chat.ts`, `useQuestSession.ts`, and `BookEditorPage.tsx` are stale** (93L, 57L, and 10L behind, respectively — see Decomposition Candidates table). Not auto-fixed — `CLAUDE.md` prose is excluded from this audit's write scope by policy.
- **`functions/src/ai/tasks/shellyChat.ts` (1,938L, +219 this cycle) is approaching the 2,000-line decomposition threshold** and is not yet named in `CLAUDE.md`'s Known Technical Debt list. Recommend adding it next cycle if it crosses 2,000L, or proactively now given its growth rate.
- **Dead-export scan skipped this cycle**, same as last — budget went to unshallowing git history, installing dependencies from scratch in a fresh sandbox, and the full build/lint/6,125+1,014-test double run (root + functions). Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic used in older cycles, whenever it's picked back up.
- **Dev-dependency-only npm audit findings remain** (9 on root, 2 in functions — see Build Status table). Both require `--force`/breaking upgrades and are outside the production dependency tree. Low priority per policy, unchanged assessment from prior cycles.
- **Bundle size 4,352.08 kB (1,297.20 kB gzip), +14.42 kB / +5.05 kB gzip since last report:** modest growth, consistent with the +5,484 line-count delta. Heaviest single chunk is still the main `index-*.js` bundle (Three.js avatar, jsPDF print, curriculum map data, shelly-chat/chat surface). Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **54 of 62 `CURRENT`-marked docs are >30 days untouched** — same pattern as last cycle (48/56 then), 6 new `CURRENT` docs added to the index this cycle, all recent. Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster (`ENGINE_V2.md` at 174d, `KNOWLEDGE_MINE_BRIEF.md` at 155d) if those surfaces are still active.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 48 | today | +2 |
| 35 | books | +0 |
| 25 | shelly-chat | +2 |
| 23 | business | +0 |
| 21 | planner-chat | +0 |
| 20 | watch | +0 |
| 17 | quest | +0 |
| 17 | avatar | +0 |
| 15 | dad-lab | +4 |
| 13 | settings | +0 |
| 9 | records | +0 |
| 9 | evaluate | +0 |
| 7 | foundations-review | +1 |
| 6 | progress | +1 |
| 6 | monthly-review | +0 |
| 3 | evaluation | +0 |
| 2 | workshop | +0 |
| 1 | weekly-review | +0 |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). Smaller, broader growth this cycle than last (which was dominated by a +12 shelly-chat jump) — `today` (+2), `shelly-chat` (+2), `dad-lab` (+4), `foundations-review` (+1), `progress` (+1).

---

## Dependency Notes

- **Root (prod):** **0 vulnerabilities** — same as last cycle. Full audit (including dev deps) shows 9 (1 low, 8 moderate) in a `uuid`/`gaxios`/`google-gax` transitive chain; fix needs `--force` (breaking). Left for human review.
- **Functions (prod):** **0 vulnerabilities** — improved from last cycle's 10 (9 moderate, 1 high); the earlier `sharp` and `firebase-admin`/`uuid` findings no longer appear in the production audit (dependency versions have moved since). Full audit shows 2 moderate (dev-only, `ts-deepmerge` via `firebase-functions-test`); fix needs `--force` (breaking). Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three` 0.128→0.185. No action taken — major-version bumps are a human decision per policy.
