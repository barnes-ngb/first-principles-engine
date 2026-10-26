# Code Health Report — 2026-10-26

## Reproducible snapshot

Revision **65ee1ab9aadd784a7b40beb70305260eb4adbee1**; as-of **2026-10-26** at UTC midnight. Scheduled audit run; no repository content other than this report was changed.

```text
node scripts/health-census.mjs --rev=65ee1ab9aadd784a7b40beb70305260eb4adbee1 --as-of=2026-10-26
```

Method is the census script's own (tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec filenames; CURRENT Markdown rows deduplicated by path; age is not proof of staleness).

| Metric | Value |
| --- | ---: |
| TypeScript lines (src and functions/src) | 428421 |
| Commits reachable from revision | 4042 |
| Test source files in those roots | 791 |
| Unique CURRENT Markdown documents | 80 |
| CURRENT documents last touched more than 30 days earlier | 65 |

Route, export and collection counts are not restated here: they have no committed derivation script (see the 2026-09-28 correction), and the existing `docs:check` census covers the ones that do.

## Build status (run this cycle, root project)

| Check | Status | Notes |
|---|---|---|
| Build | PASS | `npm run build` (`tsc -b && vite build`) clean. Largest emitted chunk 4.2M (`du -sh`, uncompressed). |
| Lint | 0 errors, 4 warnings | All `react-hooks/exhaustive-deps`. The three known timer warnings (`EvaluateChatPage.tsx`, `useQuestSession.ts` x2) plus a new one: `StickerLibraryTab.tsx:374` (`stickers` conditional changes `useCallback` deps; wrap in `useMemo`). Not auto-fixed. |
| Tests (root) | PASS | `npx vitest run`: 790 files passed, 11638 tests passed, 1 skipped (the opt-in `docs:ledger-sweep` probe), 0 failing. |
| `node scripts/check-docs-alignment.mjs` | PASS | All HARD checks pass; 11 SOFT warnings (below). |

`functions/` own suite and `npm audit` were not rerun this cycle; the 2026-09-28 figures (1 moderate prod advisory at root, 3 in functions, highs dev-only) stand as last observed.

## Doc accuracy

- Every file in `docs/*.md` is indexed in `DOCUMENT_INDEX.md`.
- CURRENT docs untouched for 30+ days: 65 of 80. Age alone is not staleness; oldest below.
- Not changed by this run: `MASTER_OUTLINE.md` stats block is a pinned historical snapshot, not live drift, so it was left alone.

### Oldest indexed CURRENT documents (whole days)

| Document | Age |
| --- | ---: |
| `ENGINE_V2.md` | 236 |
| `KNOWLEDGE_MINE_BRIEF.md` | 217 |
| `WEEKLY_CONUNDRUM_ARC.md` | 211 |
| `HERO_HUB_ANIMATION_TUNING.md` | 201 |
| `STONEBRIDGE_BIBLE.md` | 201 |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 201 |
| `first-principles-system-review.md` | 201 |
| `SCRIPT_CONVENTIONS.md` | 197 |
| `investigations/backend-reliability-assessment.md` | 196 |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 187 |
| `EVALUATION_METHODOLOGY_2026-04.md` | 162 |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 161 |
| `PROFILE_LIMITS_AUDIT.md` | 153 |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 152 |
| `design-pass-v1/copy-pass-audit.md` | 152 |

## Largest TypeScript files, including tests

| File | Lines |
| --- | ---: |
| `src/features/planner-chat/PlannerChatPage.tsx` | 3942 |
| `functions/src/ai/chat.ts` | 3129 |
| `src/features/records/records.logic.test.ts` | 3027 |
| `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | 2936 |
| `src/features/books/BookEditorPage.tsx` | 2433 |
| `src/features/planner-chat/chatPlanner.logic.test.ts` | 2350 |
| `functions/src/ai/tasks/shellyChat.test.ts` | 2296 |
| `src/features/quest/useQuestSession.ts` | 2275 |
| `functions/src/ai/evaluate.ts` | 2106 |
| `src/features/today/TodayPage.tsx` | 1982 |
| `src/features/records/dataReviewExport.logic.ts` | 1966 |
| `src/features/workshop/WorkshopPage.tsx` | 1928 |
| `functions/src/ai/tasks/shellyChat.ts` | 1919 |
| `src/features/avatar/MyAvatarPage.tsx` | 1897 |
| `src/features/progress/CurriculumTab.tsx` | 1888 |

Since the 2026-09-28 snapshot: `chat.ts` 3108 to 3129, `TodayPage.tsx` 1952 to 1982, `CurriculumTab.tsx` 1857 to 1888; `dataReviewExport.logic.ts` (1966) newly appears in the top 15, displacing `TodayChecklist.tsx`. No file grew by more than 200 lines and none newly crossed 2,000.

## Needs human attention

- Four lint warnings need a decision, not a mechanical fix (timer semantics; one new `StickerLibraryTab` memo).
- SOFT `docs:check` findings are unchanged in kind: `remote-timeout-finally` in 7 files (AvatarPhotoUpload, generateFace, monthly-review DiagnosticPanel / GenerateNowDialog / MonthlyReviewReader, FoundationsDiagPanel, AvatarAdminTab); `image-downscale` in PortfolioPage and BeforeWorkPageCheckDialog; the silent-catch census is 123 swallowed catches across 64 files in `src/features` (report-only).
- CLAUDE.md names `today/captureRowWrite.ts` in the 2026-09-28 findings as a stale reference; this run did not re-verify it and did not edit CLAUDE.md.
- Dead-export and charter-alignment scans were not run this cycle.

## Test coverage by feature

Feature directories with zero test files: `auth`, `login`, `not-found`, `planner`, `ui-preview`.

No application behavior, stored records, permissions, protected calculations or deployment changed in this report.
