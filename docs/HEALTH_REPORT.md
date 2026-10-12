# Code Health Report — 2026-10-12

## Reproducible snapshot

Scheduled audit 2026-10-12. Revision **3db6028d56e5af77a1a7bd91de6f2d96b75b8bf1**; as-of **2026-10-12** at UTC midnight. Counts come from the committed census, not hand counts.

Run from the repository using Node 22 with full Git history:

```text
node scripts/health-census.mjs --rev=3db6028d56e5af77a1a7bd91de6f2d96b75b8bf1 --as-of=2026-10-12
npx vitest run scripts/health-census.test.mjs
```

Tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec test filenames. CURRENT Markdown rows deduplicated by path; age from last reachable commit timestamp, UTC midnight; age is not proof of staleness. Commit count includes only history reachable from the named revision.

| Metric | Value |
| --- | ---: |
| TypeScript lines (src and functions/src) | 393270 |
| Commits reachable from pinned revision | 3981 |
| Test source files in those roots | 744 |
| Unique CURRENT Markdown documents | 76 |
| CURRENT documents last touched more than 30 days earlier | 60 |

Missing indexed documents: none. Previous snapshot (12ad312b, 2026-09-28): 382731 lines, 3783 commits, 724 test files, 74 CURRENT docs, 42 older than 30 days. Route, export and collection counts are not re-derived here; `npm run docs:check` and the existing censuses own those.

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

No file newly crossed 2,000 lines since the previous snapshot; the top-15 list is unchanged.

### Oldest indexed CURRENT documents

Age is the last reachable commit timestamp, not content accuracy.

| Document | Age in whole days |
| --- | ---: |
| `ENGINE_V2.md` | 222 |
| `KNOWLEDGE_MINE_BRIEF.md` | 203 |
| `WEEKLY_CONUNDRUM_ARC.md` | 197 |
| `HERO_HUB_ANIMATION_TUNING.md` | 187 |
| `STONEBRIDGE_BIBLE.md` | 187 |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 187 |
| `first-principles-system-review.md` | 187 |
| `SCRIPT_CONVENTIONS.md` | 183 |
| `investigations/backend-reliability-assessment.md` | 182 |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 173 |
| `EVALUATION_METHODOLOGY_2026-04.md` | 148 |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 147 |
| `PROFILE_LIMITS_AUDIT.md` | 139 |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 138 |
| `design-pass-v1/copy-pass-audit.md` | 138 |

## Build status at this revision (run 2026-10-12)

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | PASS | `npm run build` (`tsc -b && vite build`) clean, ~20s |
| **Lint** | 4 WARNINGS, 0 errors | `react-hooks/exhaustive-deps`: `EvaluateChatPage.tsx:296`, `useQuestSession.ts:850`, `useQuestSession.ts:2129` (sessionTimer, as in prior cycles) plus **new** `settings/StickerLibraryTab.tsx:374` (`stickers` conditional changes `useCallback` deps). Not auto-fixed: needs review of the hook semantics. |
| **Tests (root)** | PASS | 746 files, 10853 passed, 0 failed, 1 skipped (the opt-in `docs:ledger-sweep` probe) |
| **Tests (functions/)** | NOT RUN | `functions/node_modules` not installed in this run; functions tests are also included in the root run via the root config |
| **`npm run docs:check`** | PASS | All HARD checks pass; 10 SOFT warnings; resilience census: 7 remote-guard, 1 image-downscale, 120 silent catches |
| **npm audit (prod, root)** | 6 vulnerabilities (1 low, 1 moderate, 4 high) | **Changed since last cycle (was 1 moderate).** The highs are `@grpc/grpc-js <=1.13.5` via `@firebase/firestore` → `firebase`; the fix is `--force` (breaking), so not applied. `dompurify` and `fflate` are fixable non-breaking but are not high/critical, so left per policy. Human: decide on a firebase upgrade. |
| **npm audit (full, root)** | 25 vulnerabilities (2 low, 12 moderate, 9 high, 2 critical) | Was 16 (1 low, 13 moderate, 2 high). Dev-dependency share not broken out in this run. |

## Doc accuracy

- Stats block in `docs/MASTER_OUTLINE.md` refreshed from the census above (auto-fixed).
- Every docs/*.md file is indexed in `DOCUMENT_INDEX.md`; no CURRENT document is missing.
- Nav labels in MASTER_OUTLINE were not compared line by line this run; `docs:check` passes.
- The earlier `captureRowWrite.ts` reference in CLAUDE.md no longer appears (grep finds none); that finding is resolved.

## Issues found

### Auto-fixed
- `docs/MASTER_OUTLINE.md` Scale block updated to the pinned census values at 3db6028d.

### Needs human attention
- **Prod npm audit now shows 4 high** (`@grpc/grpc-js` via firebase); only a `--force` upgrade fixes them.
- **New lint warning** in `StickerLibraryTab.tsx:374`.
- 60 of 76 CURRENT docs untouched for more than 30 days; oldest is `ENGINE_V2.md` at 222 days. STALE-CHECK: human to verify content, not just age.
- Functions package tests were not run separately (dependencies not installed in this environment).

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
