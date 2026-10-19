# Code Health Report — 2026-10-19

> Scheduled audit of 2026-10-19 (revision `065efde`). The pinned 2026-09-28 census below is preserved unchanged; `docs/MASTER_OUTLINE.md`'s scale block is a script-derived historical snapshot and was deliberately not overwritten.

## Metrics (this run, working-tree counts)
- **TypeScript lines (src + functions, incl. tests):** 418,948 (the pinned census counts differently — see its scope note; not comparable)
- **Test source files:** 776 (census method: 724 at 2026-09-28)
- **Commits:** not reliable — this clone is shallow (750 reachable); the pinned count of 3783 stands
- **Collection helpers in firestore.ts:** 51 · **Routes (`path:`):** 39 · **Chat task types:** 22 · **Exports matched in `functions/src/index.ts`:** 22 (grep heuristic)

## Build Status
- Build: PASS · Lint: PASS (0 errors, 4 warnings, `react-hooks/exhaustive-deps`)
- Tests: **INCOMPLETE** — the full `vitest run` hit the 540s timeout; 405 test files had passed, 0 failed, before cut-off. No pass/fail verdict for the remainder.
- `node scripts/check-docs-alignment.mjs`: HARD checks passed, 11 SOFT warnings.
- `npm audit --omit=dev`: 6 vulnerabilities (1 low, 1 moderate, 4 high). Not auto-fixed.

## Issues Found
### Auto-Fixed
- Task registry has 22 entries; docs said 21. Added undocumented `pageCheck` to `docs/SYSTEM_PROMPTS.md` model table and set the count to 22 in two `docs/MASTER_OUTLINE.md` places.

### Needs Human Attention
- `CLAUDE.md` still says "21 task types" in two places (not touched: audit rules forbid editing CLAUDE.md).
- `pageCheck` has no entry in `functions/src/ai/models.ts`; its model is unverified (SYSTEM_PROMPTS row says so).
- 4 high npm vulnerabilities in production deps; `npm audit fix` was not run (needs review; may require `--force`).
- Features with 0 test files: `auth`, `login`, `not-found`, `planner`, `ui-preview`.
- Files over 2,000 lines (non-test): `PlannerChatPage.tsx` 3942, `chat.ts` 3129, `BookEditorPage.tsx` 2433, `useQuestSession.ts` 2275, `evaluate.ts` 2106.
- Phases not run: dead-export scan (4b), referenced-file existence (3b), stale-doc scan (3h), charter check (4c) — time budget spent on the test timeout; shallow history also makes 3h unreliable.
- Bundle: main chunk still >500 kB warning; route-level splitting is an architectural decision.

---

# Code Health Report — 2026-09-28

## Reproducible historical snapshot

Corrected October 5 under owner-authorized maintenance. Revision **12ad312b1586437979a6a46cf9d91eb0288aa74b**; as-of **2026-09-28** at UTC midnight. This is a historical survey, not the present app size or a new family assessment.

Run from the repository using Node 22:

```text
node scripts/health-census.mjs --rev=12ad312b1586437979a6a46cf9d91eb0288aa74b --as-of=2026-09-28
npx vitest run scripts/health-census.test.mjs
```

Tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec test filenames. CURRENT Markdown rows deduplicated by path; age from last reachable commit timestamp, UTC midnight; age is not proof of staleness. Full Git history is required; missing indexed documents are reported explicitly. Working-tree edits, generated output and dependencies do not affect the snapshot. Commit count includes only history reachable from the named revision, so later audit commits do not shift it.

| Metric | Value |
| --- | ---: |
| TypeScript lines (src and functions/src) | 382731 |
| Commits reachable from pinned revision | 3783 |
| Test source files in those roots | 724 |
| Unique CURRENT Markdown documents | 74 |
| CURRENT documents last touched more than 30 days earlier | 42 |

The previous ad-hoc survey is superseded. Root Vitest's executed file total below includes its own configured scope and is not identical to the source-root filename census. Cross-cycle growth percentages and unpinned route/export counts have been removed instead of implying comparability. Existing architecture census and documentation checks remain the tools for their respective counts.

### Largest TypeScript files, including tests

| File | Lines |
| --- | ---: |
| `src/features/planner-chat/PlannerChatPage.tsx` | 3942 |
| `functions/src/ai/chat.ts` | 3108 |
| `src/features/records/records.logic.test.ts` | 3027 |
| `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | 2936 |
| `src/features/books/BookEditorPage.tsx` | 2433 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 2350 |
| `functions/src/ai/tasks/shellyChat.test.ts` | 2296 |
| `src/features/quest/useQuestSession.ts` | 2275 |
| `functions/src/ai/evaluate.ts` | 2106 |
| `src/features/today/TodayPage.tsx` | 1952 |
| `src/features/workshop/WorkshopPage.tsx` | 1928 |
| `functions/src/ai/tasks/shellyChat.ts` | 1919 |
| `src/features/avatar/MyAvatarPage.tsx` | 1897 |
| `src/features/progress/CurriculumTab.tsx` | 1857 |
| `src/features/today/TodayChecklist.tsx` | 1841 |

### Oldest indexed CURRENT documents

Age measures the last reachable commit timestamp, not content accuracy or product relevance. The list is a review aid; stable reference documents may appropriately remain untouched.

| Document | Age in whole days |
| --- | ---: |
| `ENGINE_V2.md` | 208 |
| `KNOWLEDGE_MINE_BRIEF.md` | 189 |
| `WEEKLY_CONUNDRUM_ARC.md` | 183 |
| `first-principles-system-review.md` | 173 |
| `HERO_HUB_ANIMATION_TUNING.md` | 173 |
| `STONEBRIDGE_BIBLE.md` | 173 |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 173 |
| `SCRIPT_CONVENTIONS.md` | 169 |
| `investigations/backend-reliability-assessment.md` | 168 |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 159 |
| `EVALUATION_METHODOLOGY_2026-04.md` | 134 |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 133 |
| `PROFILE_LIMITS_AUDIT.md` | 125 |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 124 |
| `design-pass-v1/copy-pass-audit.md` | 124 |

## Historical build observations

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
