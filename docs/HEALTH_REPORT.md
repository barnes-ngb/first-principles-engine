# Code Health Report — 2026-11-02

## Reproducible snapshot

Revision **f5db79179cc37c8b169c1f3d2c8055ab17043c2c**; as-of **2026-11-02**. Derived by:

```text
node scripts/health-census.mjs --rev=f5db79179cc37c8b169c1f3d2c8055ab17043c2c --as-of=2026-11-02
```

Counting scope is unchanged from the 2026-09-28 report (tracked .ts/.tsx under src and functions/src; Git blob LF lines; CURRENT docs deduplicated; age is not proof of staleness).

| Metric | Value |
| --- | ---: |
| TypeScript lines (src and functions/src) | 452648 |
| Commits reachable from pinned revision | 4091 |
| Test source files in those roots | 826 |
| Unique CURRENT Markdown documents | 81 |
| CURRENT documents last touched more than 30 days earlier | 65 |

## Build status (this run, at the pinned revision)

| Check | Status | Notes |
| --- | --- | --- |
| Build | PASS | `npm run build`; main chunk 4,478.82 kB (1,340.13 kB gzip) |
| Lint | 0 errors, 5 warnings | not auto-fixable (1 reported fixable by `--fix`; not applied, timer/hook semantics need review) |
| Tests (root) | PASS | 12,242 passing, 1 skipped, 825 test files |
| `check-docs-alignment` | PASS | all HARD checks; 11 SOFT warnings (remote-timeout-finally, image-downscale, others) |

## Largest TypeScript files over 1,900 lines (tests included)

| File | Lines |
| --- | ---: |
| `src/features/planner-chat/PlannerChatPage.tsx` | 4049 |
| `functions/src/ai/chat.ts` | 3131 |
| `src/features/records/records.logic.test.ts` | 3027 |
| `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | 2936 |
| `src/features/shelly-chat/plannerAskHandoff.route.test.tsx` | 2585 |
| `src/features/books/BookEditorPage.tsx` | 2505 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 2350 |
| `functions/src/ai/tasks/shellyChat.test.ts` | 2296 |
| `src/features/quest/useQuestSession.ts` | 2275 |
| `src/features/avatar/stonebridge/useStonebridgeProgress.recovery.test.ts` | 2136 |
| `functions/src/ai/evaluate.ts` | 2106 |
| `src/features/records/dataReviewExport.logic.ts` | 1966 |
| `src/features/today/TodayPage.tsx` | 1945 |
| `src/features/workshop/WorkshopPage.tsx` | 1928 |
| `src/features/avatar/MyAvatarPage.tsx` | 1928 |

Since 2026-09-28: PlannerChatPage +107, BookEditorPage +72, chat.ts +23. `dataReviewExport.logic.ts` (1966) is newly in the list.

## Issues found

### Auto-fixed
- `docs/MASTER_OUTLINE.md` scale table refreshed to the pinned census above.
- `npm audit fix` (non-breaking, lockfile only): production vulnerabilities 7 (1 moderate, 5 high, 1 critical) -> 4 high. Build, lint and tests re-run after the change.

### Needs human attention
- 4 high production vulnerabilities remain (`@grpc/grpc-js` and others); fix needs `npm audit fix --force` (breaking). Decide on the upgrade.
- 65 of 81 CURRENT docs untouched for 30+ days: review content before retiring; age alone does not show staleness.
- 5 lint warnings (react-hooks/exhaustive-deps, timer semantics) need review.
- 11 SOFT docs-check warnings persist (see `node scripts/check-docs-alignment.mjs`).
- Main chunk 4.48 MB; route-level code splitting (Three.js) is an architectural decision (ARCH-08).
- Frontend features with zero test files: auth, login, not-found, planner, ui-preview.
- Dead-export, charter-alignment and task-registry scans were not rerun in this cycle.
- The earlier note that CLAUDE.md references `today/captureRowWrite.ts` (implementation is `dayChecklistRowWrite.ts`) was not re-verified; CLAUDE.md is not auto-fixed.

## Historical build observations (2026-09-28, not rerun)

The following results are retained from the original September 28 audit at the pinned revision. They were reported by that audit, not rerun by this documentation correction. Current PR checks are separate.

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~20s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129`, all involving `sessionTimer`). `eslint . --fix` made no changes. Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ✅ PASS | **10,391 passing, 0 failing, 1 skipped** (725 test files, `src/` + `functions/src/` combined via root `vite.config.ts`'s test block). The one skip is the opt-in `docs:ledger-sweep` probe (does not run in `npx vitest run` by design). |
| **Tests (functions/)** | ✅ PASS | 1,538 passing, 0 failing (69 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` both clean; no orphaned imports |
| **`npm run docs:check`** | ✅ PASS | All HARD checks pass (ledger IDs, index resolution, ledger anchors, collection-count spans, evidence kinds, day-write routing, ledger-status, ledger-status-contradiction). 10 SOFT warnings — see the historical follow-up findings below, identical shape to last cycle. |
| **npm audit (prod, root)** | ⚠️ 1 moderate | `fflate` (ReDoS-adjacent infinite-loop on malformed ZIP64) — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (Rule 8: moderate-only → note, don't fix). |
| **npm audit (prod, functions)** | ⚠️ 3 moderate | `qs`/`body-parser`/`express` transitive chain — unchanged from last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy. |
| **npm audit (full, root)** | ⚠️ 16 vulnerabilities (1 low, 13 moderate, 2 high) | **Flat vs. last cycle.** The 2 high are dev-dependency-only (confirmed by the `--omit=dev` scan above showing only 1 moderate). Fix requires `--force` (breaking) for the dev-only remainder. Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 11 vulnerabilities (9 moderate, 2 high) | **Flat vs. last cycle.** Same pattern — highs are dev-only (`firebase-functions-test` chain). Requires `--force` (breaking). Low priority per policy. |

---

## Findings retained for follow-up

- The jsPDF split reduced the initial chunk; those bytes still load on demand. Main-chunk size and total emitted JavaScript are different measurements. No new bundle measurement was made in this correction.
- CLAUDE.md references today/captureRowWrite.ts, while the implementation is dayChecklistRowWrite.ts. Correct that reference in a separately scoped documentation pass.
- evaluate.ts grew during weekly-review reliability work. Decomposition remains a design proposal, not an implemented maintenance fix.
- Current-doc age alone cannot establish staleness. Review content before replacing or retiring a document.
- Existing lint warnings need timer-semantics review; no automatic production fix or dependency upgrade was attempted.
- Dead-export analysis was not completed by the original audit. No dead-code cleanup is claimed.
- The prior missing committed survey derivation is resolved by health-census.mjs. Synthetic tests cover parsing/date/line-count boundaries; repository output is pinned to the revision and date above.

No application behavior, stored records, permissions, protected calculations, merge policy or deployment changed in this report.

## Additional historical follow-up findings

These observations are retained from the original audit, not reverified as current defects by this correction:

- TodayPage, CurriculumTab and DevAdminTab were flagged for possible inclusion in CLAUDE.md technical-debt notes. Decide based on responsibility and maintainability, not a line-count threshold alone.
- ShellyChatPage was not remeasured in that audit; its earlier reported size disagreed with the Stable description. chat.ts and BookEditorPage also had prose size references needing reconciliation. No new size claim is made here.
- Soft documentation checks identified raw Firestore references in ArmorTab and DevAdminTab; remote timeout/finally concerns in AvatarPhotoUpload, generateFace, monthly-review DiagnosticPanel/GenerateNowDialog/MonthlyReviewReader, FoundationsDiagPanel and AvatarAdminTab; and an image-downscale concern in PortfolioPage.
- The silent-catch census remained a report-only follow-up. Inspect individual error paths before changing behavior; no blanket catch rewrite is authorized.
