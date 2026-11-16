# Code Health Report — 2026-11-16

Scheduled routine run (health audit + companion fix). Revision audited: **1f12b4b5adc4ada433e3dbdacda8cbe9219383c2** (`origin/main` at run start, PR #1968 merge). The previous report covered `12ad312b1586437979a6a46cf9d91eb0288aa74b` as of 2026-09-28.

## Reproducible snapshot

Derived by the committed census, not hand-counted (Node 22, full history):

```text
node scripts/health-census.mjs --rev=1f12b4b5adc4ada433e3dbdacda8cbe9219383c2 --as-of=2026-11-16
```

Tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec test filenames. CURRENT Markdown rows deduplicated by path; age from last reachable commit timestamp, UTC midnight; age is not proof of staleness.

| Metric | Value | Previous (2026-09-28) |
| --- | ---: | ---: |
| TypeScript lines (src and functions/src) | 489529 | 382731 |
| Commits reachable from pinned revision | 4204 | 3783 |
| Test source files in those roots | 866 | 724 |
| Unique CURRENT Markdown documents | 81 | 74 |
| CURRENT documents last touched more than 30 days earlier | 69 | 42 |

Counts outside the census, each from the command named (run at the same revision):

| Metric | Value | Source |
| --- | ---: | --- |
| Collection helpers in `firestore.ts` | 52 | `grep -c "export const.*Collection\|export function.*Collection" src/core/firebase/firestore.ts`; `[collection-count]` agrees (all spans == 52) |
| Cloud Functions exported | 29 | names in `functions/src/index.ts`, matching CLAUDE.md's list one-for-one (the routine's `grep -oP 'export \{ …'` one-liner prints 22 because it misses multi-line export blocks) |
| Chat task types | 22 | keys of `CHAT_TASKS` in `functions/src/ai/tasks/index.ts` |
| `path:` entries in `src/app/router.tsx` | 40 | `grep -c 'path:' src/app/router.tsx` |
| Main JS chunk | 4,564.88 kB (1,368.30 kB gzip) | `npm run build` output |

## Build status (this run, at the revision above)

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build`, built in 16.59s. Fresh container — `npm ci` at root and in `functions/` first. |
| **Lint** | ⚠️ 2 WARNINGS, 0 errors | `StickerLibraryTab.tsx:374` — `stickers` conditional changes `useCallback` deps every render (`react-hooks/exhaustive-deps`); `usePlannerAskHandoff.ts:731` — unused `eslint-disable` directive (`--fix` would remove it). The three `sessionTimer` warnings from prior cycles are gone. |
| **Tests (root)** | ✅ PASS | `npx vitest run`: **865 test files passed, 13,190 tests passing, 0 failing, 1 skipped** (800s). |
| **TypeScript** | ✅ PASS | `tsc -b` inside the build is clean, so there are no orphaned imports. |
| **`check-docs-alignment.mjs`** | ✅ HARD PASS | 11 SOFT warnings (`raw-refs`, `remote-timeout-finally`, `image-downscale` — same families as last cycle). `[ledger-status]`: no row claims an open PR. Run after this run's doc edits. |
| **npm audit (prod, root)** | ❌ 7: 1 critical, 5 high, 1 moderate | `dompurify` critical; `firebase`, `@firebase/firestore`, `@firebase/firestore-compat`, `@grpc/grpc-js`, `zod` high; `fflate` moderate. **Worse than last cycle (was 1 moderate).** |
| **npm audit (prod, functions)** | ❌ 12: 1 critical, 4 high, 6 moderate, 1 low | `proxy-addr` critical; `@fastify/busboy`, `@grpc/grpc-js`, `body-parser`, `brace-expansion` high. **Worse than last cycle (was 3 moderate).** |
| **npm audit (full)** | root 36 (3 critical, 12 high) · functions 38 (3 critical, 8 high) | Dev-only remainder includes `vitest`/`tinypool`/`vite` chains, which need `--force`. |

## Doc accuracy

### Stats (MASTER_OUTLINE scale block)

The block was pinned to the 2026-09-28 revision. Every value had drifted more than 5% (lines +28%, test files +20%, commits +11%, stale-CURRENT count 42 → 69). **Auto-fixed** — see below.

### Referenced files

No real missing references. Every unresolved name in `MASTER_OUTLINE.md` / `DOCUMENT_INDEX.md` / `CLAUDE.md` is one the prose itself says is gone: `ChildSelector.tsx` and `scanAdvance.ts` (deleted, CLAUDE.md says so), `QuickCaptureSection.tsx` / `CreativeTimeLog.tsx` (folded into Unified Capture, in sprint history), and the two `PARENT_EXPERIENCE_*` docs (marked REMOVED in the index). `AGENTS.md` is named inside one index row's description and does not exist. Last cycle's `captureRowWrite.ts` finding is **resolved** — CLAUDE.md names `dayChecklistRowWrite.ts`, which exists.

### Navigation

`AppShell.tsx` now has a **Stonebridge** entry (`/stonebridge`) in both the parent nav (after Books) and the kid nav (after My Hero). MASTER_OUTLINE did not mention it. **Auto-fixed** — see below. Every other label and its order match.

### Collections

All 52 helpers appear in CLAUDE.md's tables. Three helper names differ from the documented collection names, and all three are documented: `catalogOrders` → `orders`, `errorLogs` → `errorLog`, `shellyChatMessages` → the `shellyChatThreads/{threadId}/messages` subcollection.

### Task types

`pageCheck` (the before-work prospective page check) is in `CHAT_TASKS` and was missing from `SYSTEM_PROMPTS.md`. **Auto-fixed.** It is also missing from CLAUDE.md's `chat` dispatch list, its model-selection list and its task-handler list. CLAUDE.md is hand-written, so this run did not edit it; see *Needs human attention*.

### Index

`[index-fs]`: 155 index rows resolve; all 147 docs are indexed. The routine's own sweep of `docs/*.md` also found nothing unindexed.

### Stale CURRENT docs

69 of 81 CURRENT docs were last touched more than 30 days ago. The 15 oldest:

| Document | Age in whole days |
| --- | ---: |
| `ENGINE_V2.md` | 257 |
| `KNOWLEDGE_MINE_BRIEF.md` | 238 |
| `WEEKLY_CONUNDRUM_ARC.md` | 232 |
| `HERO_HUB_ANIMATION_TUNING.md` | 222 |
| `STONEBRIDGE_BIBLE.md` | 222 |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 222 |
| `first-principles-system-review.md` | 222 |
| `SCRIPT_CONVENTIONS.md` | 218 |
| `investigations/backend-reliability-assessment.md` | 217 |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 208 |
| `EVALUATION_METHODOLOGY_2026-04.md` | 183 |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 182 |
| `PROFILE_LIMITS_AUDIT.md` | 174 |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 173 |
| `design-pass-v1/copy-pass-audit.md` | 173 |

STALE-CHECK: these are marked CURRENT but haven't been touched in the number of days shown. Someone needs to check whether each one is still accurate, or mark it STALE. Age alone doesn't make a doc wrong: stable references can sit untouched for a long time.

## Largest TypeScript files, including tests (census top 15)

| File | Lines | 2026-09-28 | Δ |
| --- | ---: | ---: | ---: |
| `src/features/planner-chat/PlannerChatPage.tsx` | 4049 | 3942 | +107 |
| `src/features/quest/useQuestSession.ts` | 3958 | 2275 | **+1683** |
| `functions/src/ai/chat.ts` | 3131 | 3108 | +23 |
| `src/features/records/records.logic.test.ts` | 3027 | 3027 | 0 |
| `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | 2936 | 2936 | 0 |
| `src/features/shelly-chat/plannerAskHandoff.route.test.tsx` | 2585 | — | new to list |
| `src/features/books/BookEditorPage.tsx` | 2505 | 2433 | +72 |
| `src/features/quest/useQuestSession.saveRecovery.test.tsx` | 2371 | — | new to list |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 2350 | 2350 | 0 |
| `functions/src/ai/tasks/shellyChat.test.ts` | 2296 | 2296 | 0 |
| `src/features/avatar/stonebridge/useStonebridgeProgress.recovery.test.ts` | 2136 | — | new to list |
| `functions/src/ai/evaluate.ts` | 2106 | 2106 | 0 |
| `src/features/quest/KnowledgeMinePage.tsx` | 2068 | — (< 1841) | crossed 2,000 |
| `src/features/records/dataReviewExport.logic.ts` | 2052 | — (< 1841) | crossed 2,000 |
| `src/features/avatar/MyAvatarPage.tsx` | 1983 | 1897 | +86 |

"— (< 1841)" means the file was not in last cycle's top 15, whose smallest entry was 1841 lines, so it must have been under that. `TodayPage.tsx`, `WorkshopPage.tsx`, `tasks/shellyChat.ts`, `CurriculumTab.tsx` and `TodayChecklist.tsx` dropped out of the top 15, so each is now under 1983 lines.

## Decomposition candidates

- **`useQuestSession.ts` — 3958 lines, +1683 since the last report** (+74%). This is the largest single-cycle growth in the repo, and CLAUDE.md's tech-debt note still says 2,275L. It's the second-largest production file, after PlannerChatPage.
- **`KnowledgeMinePage.tsx` (2068)** and **`dataReviewExport.logic.ts` (2052)** both crossed 2,000 lines for the first time.
- `PlannerChatPage.tsx` (4049, ARCH-02), `chat.ts` (3131), `BookEditorPage.tsx` (2505) and `evaluate.ts` (2106) are still growing or holding steady.

## Issues found

### Auto-fixed (this run)

- `docs/MASTER_OUTLINE.md` scale block re-pinned to `1f12b4b…` / 2026-11-16 with the census values above, and its derivation command updated to match.
- `docs/MASTER_OUTLINE.md` Navigation: added **Stonebridge** to both lists, in `AppShell.tsx` order.
- `docs/SYSTEM_PROMPTS.md`: added `pageCheck` to the dispatch diagram, the model table (`claude-sonnet-5`, via `modelForTask("plan")`), the Task → Slice table (the same slices as `scan`), and a handler section written from `tasks/pageCheck.ts`.

### Needs human attention

- **npm audit got worse in production dependencies.** The root has a critical (`dompurify`) and several highs (the `firebase` SDK chain, `@grpc/grpc-js`, `zod`). Functions has a critical (`proxy-addr`, via express) and highs. A non-forced `npm audit fix --omit=dev --dry-run` at the root would change **134 packages**, including minor bumps across the `@firebase/*` SDK (e.g. `@firebase/messaging` 0.12 → 0.13, `@firebase/remote-config` 0.8 → 0.9). **Not applied.** The companion's Rule 8 allows non-breaking fixes, but a firebase-SDK lockfile change is a runtime change, and an unattended docs run shouldn't ship one. **Recommend a dedicated run** that applies `npm audit fix` in both projects, then re-runs build, the full test suite, and `npm run test:rules`.
- **CLAUDE.md is missing `pageCheck`** from the `chat` dispatch list, the model-selection list and the task-handler list. Those lists also name `analyzePatterns`, which is not a chat task: it backs the standalone `analyzeEvaluationPatterns` CF. The "22 task types" count is correct. This run didn't edit CLAUDE.md, which is hand-written.
- **CLAUDE.md tech-debt sizes are stale:** PlannerChatPage says 3,942L (now 4049), useQuestSession 2,275L (now 3958), MyAvatarPage 1,897L (now 1983), BookEditorPage 2,437L (now 2505), chat.ts 3,108L (now 3131). The bundle note says 4.23MB / 4,225.96 kB, but this build's main chunk is 4,564.88 kB, about 339 kB larger.
- **MASTER_OUTLINE "Top 5 Largest Files (Current)"** is hand-typed and well out of date: it lists PlannerChatPage at 2,620 and still includes ShellyChatPage. It mixes numbers with status prose, so this run left it alone. Either regenerate it from the census or drop the numbers.
- **Charter alignment — `analyzePatterns`** (the standalone `analyzeEvaluationPatterns` CF) has no `buildContextForTask` / `CHARTER_PREAMBLE` / `charterContext`, and `SYSTEM_PROMPTS.md` lists its slices as `childProfile` only. Project rule 3 says charter values are injected into every system prompt. Whether this one counts is a decision for the owner, not a mechanical fix.
- **Lint warnings (2):** `StickerLibraryTab.tsx:374` needs a `useMemo` decision. The unused directive at `usePlannerAskHandoff.ts:731` would be removed by `eslint --fix`, but that's feature code, which this routine doesn't change.
- **Bundle:** the main chunk is 4,564.88 kB. Route-level `React.lazy` splitting would reduce initial load. The heaviest remaining import is Three.js (avatar, blocked on ARCH-08); jsPDF is already split.
- **Dead exports:** not surveyed this cycle (the grep heuristic can't see test-only or dynamic-import use). No dead-code cleanup is claimed.

## Charter alignment

All 22 `CHAT_TASKS` handlers reach charter context through `buildContextForTask` or `CHARTER_PREAMBLE`. The only module under `functions/src/ai/tasks/` without it is `analyzePatterns.ts`, covered above.

## Test coverage by feature (test files per `src/features/*`)

books 130 · today 111 · planner-chat 50 · avatar 50 · progress 48 · shelly-chat 38 · quest 30 · business 26 · settings 23 · watch 20 · dad-lab 19 · weekly-review 18 · records 17 · evaluate 14 · foundations-review 9 · workshop 8 · monthly-review 7 · evaluation 7 · review 1 · engine 1 · **0:** ui-preview, planner, not-found, login, auth.

The zero-test directories are a dev-only gallery, `TeachHelperDialog`, the 404 page, profile selection and the auth guard. Of these, `auth` (the route guard) is the only one where a test would protect a real rule.

## Dependency notes

See the npm audit rows above. Nothing was upgraded.

No application behavior, stored records, permissions, protected calculations, ledger rows, merge policy or deployment changed in this run. Only `docs/HEALTH_REPORT.md`, `docs/MASTER_OUTLINE.md` and `docs/SYSTEM_PROMPTS.md` were edited.
