# Code Health Report — 2026-11-23

## Reproducible snapshot

Scheduled health audit. Revision **5ee7a7301e550b6f96252b05dd9332343421a3bd** (`origin/main` at audit time, PR #1989 merge); as-of **2026-11-23** at UTC midnight. The previous report pinned **12ad312b1586437979a6a46cf9d91eb0288aa74b** as-of 2026-09-28; both columns below come from the same committed script, so they are comparable.

Run from the repository using Node 22 (full Git history required — the script refuses a shallow clone):

```text
node scripts/health-census.mjs --rev=5ee7a7301e550b6f96252b05dd9332343421a3bd --as-of=2026-11-23
node scripts/health-census.mjs --rev=12ad312b1586437979a6a46cf9d91eb0288aa74b --as-of=2026-09-28
```

Tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec test filenames. CURRENT Markdown rows deduplicated by path; age from last reachable commit timestamp, UTC midnight; age is not proof of staleness.

| Metric | 2026-09-28 | 2026-11-23 |
| --- | ---: | ---: |
| TypeScript lines (src and functions/src) | 382731 | 523993 |
| Commits reachable from pinned revision | 3783 | 4270 |
| Test source files in those roots | 724 | 908 |
| Unique CURRENT Markdown documents | 74 | 81 |
| CURRENT documents last touched more than 30 days earlier | 42 | 74 |

Other counts at the pinned revision, each with the command that prints it:

| Metric | Value | Source |
| --- | ---: | --- |
| Chat task types (`CHAT_TASKS` entries) | 22 | `sed -n '/CHAT_TASKS/,/^}/p' functions/src/ai/tasks/index.ts \| grep -cE '^\s+[a-zA-Z]+[,:]'` |
| Cloud Functions exported | 29 | names inside `export { … }` blocks of `functions/src/index.ts` |
| `path:` entries in the router | 41 | `grep -c 'path:' src/app/router.tsx` |

### Largest TypeScript files, including tests

"Prior" is the same file's line count in the 2026-09-28 census; `–` means it was not in that census's top 15 (or did not exist).

| File | Lines | Prior |
| --- | ---: | ---: |
| `src/features/quest/useQuestSession.ts` | 4205 | 2275 |
| `src/features/planner-chat/PlannerChatPage.tsx` | 4049 | 3942 |
| `src/features/build-studio/BuildStudioEditor.tsx` | 3576 | – (new) |
| `functions/src/ai/chat.ts` | 3131 | 3108 |
| `src/features/records/records.logic.test.ts` | 3027 | 3027 |
| `src/features/build-studio/BuildStudioEditor.behavior.test.tsx` | 3025 | – (new) |
| `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | 2936 | 2936 |
| `src/features/quest/useQuestSession.saveRecovery.test.tsx` | 2801 | – |
| `src/features/shelly-chat/plannerAskHandoff.route.test.tsx` | 2585 | – |
| `src/features/books/BookEditorPage.tsx` | 2505 | 2433 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 2350 | 2350 |
| `functions/src/ai/tasks/shellyChat.test.ts` | 2296 | 2296 |
| `src/features/quest/KnowledgeMinePage.tsx` | 2227 | – |
| `src/features/avatar/stonebridge/useStonebridgeProgress.recovery.test.ts` | 2136 | – |
| `src/features/build-studio/arcadeBridge.test.ts` | 2127 | – |

### Oldest indexed CURRENT documents

Age measures the last reachable commit timestamp, not content accuracy. Stable reference documents may appropriately remain untouched.

| Document | Age in whole days |
| --- | ---: |
| `ENGINE_V2.md` | 264 |
| `KNOWLEDGE_MINE_BRIEF.md` | 245 |
| `WEEKLY_CONUNDRUM_ARC.md` | 239 |
| `HERO_HUB_ANIMATION_TUNING.md` | 229 |
| `STONEBRIDGE_BIBLE.md` | 229 |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 229 |
| `first-principles-system-review.md` | 229 |
| `SCRIPT_CONVENTIONS.md` | 225 |
| `investigations/backend-reliability-assessment.md` | 224 |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 215 |
| `EVALUATION_METHODOLOGY_2026-04.md` | 190 |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 189 |
| `PROFILE_LIMITS_AUDIT.md` | 181 |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 180 |
| `design-pass-v1/copy-pass-audit.md` | 180 |

No CURRENT document named in the index is missing from the tree.

## Build status (this run)

Run on this branch's tree after the last edit. The first pass ran at the pinned revision plus the doc edits. The second pass ran again after the `functions/package-lock.json` change.

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build`. Main chunk `index-*.js` **4,740.58 kB** (1,417.58 kB gzip); `jspdf` is its own on-demand chunk (385.99 kB). |
| **Lint** | ⚠️ 2 WARNINGS | 0 errors. `StickerLibraryTab.tsx:374` — `react-hooks/exhaustive-deps` (`stickers` conditional in a `useCallback` dep list); `usePlannerAskHandoff.ts:731` — an unused `eslint-disable` directive. The three `sessionTimer` warnings carried by every prior report are **gone**. |
| **Tests (root)** | ✅ PASS | 14,281 passed, 1 skipped, 0 failed — 907 test files (`npx vitest run`). |
| **Tests (functions/)** | ✅ PASS | 1,820 passed, 0 failed — 80 test files (functions' own config). |
| **`check-docs-alignment`** | ✅ PASS | HARD checks pass; 11 SOFT warnings (`raw-refs`, `remote-timeout-finally`, `image-downscale`). Resilience census: 7 remote-guard · 2 image-downscale · 155 silent catches. |
| **npm audit (prod, root)** | ⚠️ 7 (1 low, 1 moderate, 5 high) | Non-breaking `npm audit fix` left 4 high (`@grpc/grpc-js` chain) needing `--force`, so the fix was **reverted** and left for a human, per Rule 8. |
| **npm audit (prod, functions)** | ✅ fixed → 2 moderate | Was 12 (1 low, 6 moderate, 4 high, 1 critical: `proxy-addr`; highs `@fastify/busboy`, `@grpc/grpc-js`, `body-parser`, `brace-expansion`). Non-breaking `npm audit fix` changed `functions/package-lock.json` only, with no `package.json` change. 2 moderate `qs` remain. |

## Doc accuracy

| Claim | Doc | Code | Status |
| --- | --- | --- | --- |
| Chat task types (`MASTER_OUTLINE` "Other chat-dispatched task types") | 21, no `pageCheck` | 22 | **Fixed** |
| Chat task registry (`MASTER_OUTLINE` file table) | 22 | 22 | OK |
| `pageCheck` in `SYSTEM_PROMPTS.md` | absent | registered | **Fixed** |
| Cloud Functions (`CLAUDE.md`) | 29 | 29 | OK |
| Parent nav (`MASTER_OUTLINE`) | no Stonebridge, no Build Studio | both in `AppShell.tsx` | **Fixed** |
| Kid nav (`MASTER_OUTLINE`) | no Build Studio, no Stonebridge | both in `AppShell.tsx` | **Fixed** |
| `CLAUDE.md` chat dispatch list | 21 names, no `pageCheck` | 22 | Needs human (CLAUDE.md is hand-maintained; not auto-edited) |
| Bundle main chunk (`CLAUDE.md` tech-debt) | 4,225.96 kB after FIX-253 | 4,740.58 kB | Needs human |
| `today/captureRowWrite.ts` reference (prior finding) | — | no longer in CLAUDE.md | Resolved upstream |

Every `docs/*.md` file is indexed in `DOCUMENT_INDEX.md`. Every file named in backticks in `MASTER_OUTLINE.md`, `DOCUMENT_INDEX.md` and `CLAUDE.md` resolves. The exceptions are names the prose itself records as deleted or removed: `ChildSelector.tsx`, `scanAdvance.ts`, `QuickCaptureSection.tsx`, `CreativeTimeLog.tsx`, the two `PARENT_EXPERIENCE_*` rows marked REMOVED, and `AGENTS.md`.

## Issues found

### Auto-fixed
- `docs/SYSTEM_PROMPTS.md`: added `pageCheck → handlePageCheck` to the dispatch diagram, a model-table row, and a `### pageCheck` section derived from `tasks/pageCheck.ts`. The section covers the prospective before-work check, the reused `scan` context slices, and `low` effort with 1024 tokens. It also notes that the task fails closed against an old dispatcher and writes only `aiUsage`.
- `docs/MASTER_OUTLINE.md`: the task-type sentence now reads 22, with `pageCheck` listed. The Parent and Kid nav lines now match `AppShell.tsx` order: Stonebridge added to both, and Build Studio added to both and marked as opt-in-gated.
- `functions/package-lock.json`: non-breaking `npm audit fix` (the critical and all high prod findings cleared). Build and both test suites were re-run on the resulting tree.

### Needs human attention
- **Root npm audit:** 5 high prod findings remain. Clearing them needs `npm audit fix --force`, which is a breaking upgrade. The non-breaking pass would also have moved the Firebase web SDK from 12.11 to 12.19 without clearing them, so it was reverted.
- **`CLAUDE.md` dispatch list** omits `pageCheck` (the Cloud Functions → `chat` bullet). It is hand-maintained, so it was not edited here.
- **Bundle:** the main chunk is 4,740.58 kB, about 515 kB above the figure `CLAUDE.md` records after FIX-253. Route-level `React.lazy` splitting (Three.js — ARCH-08 — and now Build Studio) is an architectural decision.
- **Decomposition candidates:** `useQuestSession.ts` nearly doubled (2275 → 4205) and is the largest file in the repo. `BuildStudioEditor.tsx` (3576) is new since the last report. `KnowledgeMinePage.tsx` (2227) crossed 2,000 lines. `CLAUDE.md`'s tech-debt section still lists `useQuestSession.ts` at 2,275L, `PlannerChatPage.tsx` at 3,942L, `chat.ts` at 3,108L and `BookEditorPage.tsx` at 2,437L. All four have grown.
- **Lint:** `usePlannerAskHandoff.ts:731` is fixable with `--fix`, but that touches feature code, which this audit does not. `StickerLibraryTab.tsx:374` needs a `useMemo` decision.
- **STALE-CHECK:** 74 of 81 CURRENT docs are untouched for more than 30 days (up from 42 of 74). The fifteen oldest are listed above. A human should check whether their content is still accurate before relabelling any of them.
- **Dead exports:** not surveyed this cycle. No dead-code claim is made.
- **SOFT doc checks** (`raw-refs`, `remote-timeout-finally`, `image-downscale`) and the silent-catch census remain report-only follow-ups, as before.

## Charter alignment

Every `CHAT_TASKS` handler file under `functions/src/ai/tasks/` references `buildContextForTask`, `CHARTER_PREAMBLE` or `charterContext`. `pageCheck` reuses `buildContextForTask("scan", …)`. `chat` and `generate` dispatch to `handleChat` (`tasks/chat.ts`) and have no file of their own.

## Test coverage by feature

Of 26 `src/features/*` directories, five hold no test file: `auth`, `login`, `not-found`, `planner`, `ui-preview`. All five are thin (route guard, profile picker, 404, one shared dialog, dev gallery). The same five were flagged before.

No application behavior, stored records, permissions, protected calculations or deployment changed in this report. The only non-doc change is the functions lockfile.
