# Code Health Report — 2026-07-27

## Metrics

| Metric | Value | Change from last report (2026-07-20) |
|--------|-------|--------------------------------------|
| **Total lines** | **245,730** | +16,302 |
| **Commits** | **219** | -2 (shallow-clone HEAD depth in this sandboxed environment, not full repo history — see note below) |
| **Test files** | **360** | +35 |
| **Tests passing** | **4,784** | +549 |
| **Tests total** | **4,784** | 0 skipped, 0 failing |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +2 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +1 (`/watch`, FEAT-132) |
| **Bundle size** | **4,274.21 kB / 1,272.94 kB gzip** | +66.28 kB / +23.01 kB gzip |

> **Note on "Commits":** `git rev-list --count HEAD` in this run's environment returns the depth of a shallow clone, not the true repository history (PR numbers visible in `git log` already exceed #1640). This has been true for every prior audit run — the metric tracks shallow-clone depth consistently, not real commit count. Treat this row as directionally informative only.

> **Script reproducibility note (new this cycle):** the Phase-1 line-count one-liner (`find src functions -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1`) is sensitive to whether `node_modules` exists when it runs, because it has no `node_modules` exclusion. This cycle ran `npm ci` *before* Phase 1 (to install deps once, up front) instead of only before the build in Phase 2, so the naive command would have swept in `functions/node_modules/**/*.ts` and (depending on `xargs` batching) either inflated the count or silently truncated it to a partial batch. This run computed the real number with an explicit `-path '*/node_modules/*' -prune` exclusion instead (245,730 — cross-checked against `wc -l`'s own "total" line, which matched exactly). **Recommendation for future cycles:** add `-path '*/node_modules/*' -prune -o` to the Phase 1 one-liner so the stat is correct regardless of install order.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in ~15-19s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-07-06); `eslint --fix` made no changes |
| **Tests** | ✅ PASS | 4,784 passing, 0 skipped, 0 failing (360 test files) — reran full suite twice this cycle (before and after the dependency fix below) to confirm no regression |
| **TypeScript** | ✅ PASS | `npx tsc -b` clean |
| **npm audit (prod, root)** | ✅ PARTIALLY FIXED | Was 3 vulnerabilities (1 low `dompurify`, 1 high + downstream `react-router`/`react-router-dom`). **Auto-fixed** via non-breaking `npm audit fix`: `dompurify` 3.4.11→3.4.12 (low, resolved), `react-router`/`react-router-dom` 7.17.0→7.18.1 (resolved 4 of 5 react-router advisories). **1 high remains** — "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response" affects the entire 7.12.0–8.2.0 range; the only fix is a major v8 bump (`npm audit fix --force`, breaking) or a downgrade below 7.12 (loses other fixes) — left for human review. Verified build + full test suite (4,784 tests) still pass after the fix. |
| **npm audit (prod, functions)** | ⚠️ UNCHANGED | 13 vulnerabilities (1 low, 9 moderate, 3 high), same `firebase-admin`→`@google-cloud/firestore`/`@google-cloud/storage`→`google-gax`/`teeny-request`→`uuid` chain as every prior cycle. `npm audit fix --dry-run` confirms **no non-breaking fix is available** (dry-run output identical to current state) — full fix requires `firebase-admin@10.3.0` (breaking downgrade!) or later major, architectural decision. No fix applied, per policy (HIGH/CRITICAL non-breaking only). |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 229,428 | 245,730 | ⚠️ DRIFT +7.1% — **AUTO-FIXED** |
| Commits | 221 | 219 | ⚠️ DRIFT -0.9% (shallow-clone metric, see note above) — **AUTO-FIXED** |
| Test files | 325 | 360 | ⚠️ DRIFT +10.8% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 27 | 29 | ⚠️ DRIFT (exact mismatch) — **AUTO-FIXED**. `CLAUDE.md`'s own header already said "29 exported" and listed all 29 by name (verified by manually walking every `export {...} from` statement in `functions/src/index.ts`) — only `MASTER_OUTLINE.md`'s stat line was stale. |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 35 | 36 | ⚠️ DRIFT (exact mismatch) — **AUTO-FIXED**. The new `/watch` route (FEAT-132, Watch Library's own top-level home) pushed the real count to 36. |

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06, referenced only in MASTER_OUTLINE's historical changelog entry |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component, referenced only in the same historical changelog entry |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06, referenced only in the same historical changelog entry |

No new missing-reference findings this cycle.

### Navigation

Code (`AppShell.tsx`) and docs (`MASTER_OUTLINE.md` §Navigation) match exactly for both Parent and Kid nav lists, including the FEAT-132 `Watch Library` top-level entry.

### Collection Coverage

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection).

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`.

### Unindexed Docs

None — every file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`.

### Stale Docs

None — no doc marked **CURRENT** in `DOCUMENT_INDEX.md` has gone 30+ days without a commit.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,092 | `src/features/planner-chat/PlannerChatPage.tsx` | **+151** |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,460 | `src/features/records/records.logic.test.ts` | **+419** (test file) |
| 2,218 | `src/features/quest/useQuestSession.ts` | +3 |
| 2,113 | `src/features/books/BookEditorPage.tsx` | +10 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,713 | `src/features/records/dataReviewExport.logic.ts` | new to this table (was below the prior cutoff) |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,560 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +39 (test file) |
| 1,544 | `src/features/planner-chat/chatPlanner.logic.ts` | +36 |
| 1,498 | `src/features/today/TodayChecklist.tsx` | **+107** |
| 1,464 | `src/features/records/RecordsPage.tsx` | **+139** |
| 1,233 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,218 | `src/features/today/TodayPage.tsx` | +56 |
| 1,207 | `src/features/records/records.logic.ts` | **+176** |
| 1,147 | `src/features/today/KidTodayView.tsx` | **+88** |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,112 | `functions/src/ai/evaluate.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,078 | `src/features/dad-lab/DadLabPage.tsx` | +26 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,059 | `src/core/types/planning.ts` | +4 |
| 1,046 | `src/features/settings/DevAdminTab.tsx` | new to this table (was below the prior cutoff) |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |
| 1,008 | `functions/src/ai/chat.test.ts` | +0 (test file) |
| 1,002 | `src/features/books/printBook.ts` | -1 |

---

## Decomposition Candidates

No **production** file crossed 2,000 lines for the first time this cycle (`PlannerChatPage.tsx` was already over 2,000; `records.logic.test.ts` was already over 2,000 and is a test file). But `PlannerChatPage.tsx` is now the fourth consecutive cycle of growth and has crossed 3,000 lines for the first time.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,092 | **⚠️ Crossed 3,000 lines this cycle.** Fourth consecutive cycle of growth (2,757 → 2,941 → 3,092), +151 this cycle. `CLAUDE.md`'s "Known Technical Debt" entry still says **"2,669L ... Stable as-is"** — that description is now stale by 423 lines and the trend contradicts "stable." Flagged below under Needs Human Attention; not auto-fixed (CLAUDE.md prose is excluded from auto-fix by policy). |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage decomposition target. No growth this cycle. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. +3, effectively stable this cycle. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. +10, effectively stable this cycle. |

**Watch list:** `records.logic.ts` (production) grew +176L this cycle and its test file +419L — the largest production-file growth outside `PlannerChatPage.tsx`. `RecordsPage.tsx` (+139L) and `TodayChecklist.tsx` (+107L) also grew notably. `dataReviewExport.logic.ts` (1,713L) and `DevAdminTab.tsx` (1,046L) newly appear in the >1,000-line table — not previously tracked, so no cycle-over-cycle delta is available; will be tracked starting next cycle.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 229,428→245,730; Commits 221→219; Test files 325→360; Cloud Functions 27→29; Routes 35→36. (Firestore collections and Chat task types were already correct.)
- **`npm audit fix` (root, non-breaking):** resolved `dompurify` 3.4.11→3.4.12 (low) and `react-router`/`react-router-dom` 7.17.0→7.18.1 (fixed 4 of 5 react-router advisories, including the CVE-2025-68470 bypass, RSC error-handler XSS, deserializeErrors constructor injection, and inefficient-route-matching DoS). Verified build, typecheck, and full test suite (4,784 tests) pass after the fix.
- Ran `npm run lint -- --fix`: no auto-fixable issues found (0 file changes); the 3 pre-existing warnings require dependency-array judgment calls and were left as-is.

### Needs Human Attention

- **`CLAUDE.md`'s `PlannerChatPage.tsx` tech-debt note is stale and its conclusion is now wrong.** It reads "PlannerChatPage.tsx (2,669L) ... Stable as-is" — the file is now 3,092L (+423 since that note was written) and has grown for four straight audit cycles. "Stable as-is" no longer matches reality; recommend either prioritizing a decomposition pass or updating the note to reflect the ongoing growth trend and a revised plan. Not auto-fixed — `CLAUDE.md` prose is explicitly excluded from this audit's auto-fix scope.
- **Remaining `react-router` HIGH vulnerability (root, prod):** "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response" affects the entire 7.12.0–8.2.0 range currently in use. No non-breaking fix exists — `npm audit fix --force` would move to v8 (breaking) or downgrade below 7.12 (loses the other 4 fixes just applied). Architectural decision, left for human review.
- **Remaining `firebase-admin` vulnerabilities (functions, unchanged):** 13 total (1 low, 9 moderate, 3 high) tracing to a vulnerable `uuid` transitively via `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`. `npm audit fix --dry-run` confirms no non-breaking fix is available — the only path is `firebase-admin@10.3.0` (a **downgrade** from the current major, itself flagged "breaking") or a later major bump. Same as every prior cycle, no fix applied.
- **Bundle size 4,274.21 kB (1,272.94 kB gzip), +66.28 kB / +23.01 kB gzip since last report:** heaviest imports unchanged — Three.js (avatar), jsPDF (print), curriculum map data. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **`records.logic.ts`/`records.logic.test.ts` growth (+176L / +419L this cycle):** worth a look next cycle if the trend continues — currently well under any decomposition threshold but the largest production-code growth outside the already-tracked `PlannerChatPage.tsx`.
- **Dead-export scan (partial — sampled `src/core` two levels deep, capped per time budget, not the full tree):** 47 possibly-dead exports flagged by a grep-based heuristic (no usage found outside the defining file) — same core set as prior cycles (`EvidenceKind`, `SynthesisVehicle`, `WorkingLevelSource`, `QuestOutcome`, 9 zod schema exports, `resolveBookCreator`, `CardDifficulty`, `PIECE_POSITIONS`, `SUPPORT_LEVEL_ORDER`, `PlannerSessionStatus`, `ScheduleBlockLabel`, several `firestore.ts` converters/doc-id helpers) plus new entries from broader directory coverage this cycle (`getAIFeatureFlag`/`setAIFeatureFlag`, `isWorkbookOwnerInvalid`/`assertWorkbookOwner`/`findActivityConfigByCurriculum`, `dedupeChildrenByName`, `scrubStack`, `MO_CONFIG`/`TX_CONFIG`, `OLDER_AGE_GROUP_THRESHOLD`, `CHILD_BIRTHDATES`, `SUIT_UP_MORNING_MESSAGES`, `seedChapterBooks`, 3 exports from `deriveWorkingLevelMastery.ts`, `isPieceForged`, `ensureNewProfileStructure`). **Not removed** — a static grep pass can miss re-exports, dynamic imports, and test-only usage; needs manual verification before any deletion. This cycle's sample used `-maxdepth 2` (covering more subdirectories than a flat scan), so the larger count vs. last cycle (47 vs. 30) partly reflects wider coverage, not necessarily new dead code. A full-tree scan is still outstanding if wanted.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 40 | today |
| 33 | books |
| 23 | business |
| 19 | planner-chat |
| 17 | quest |
| 17 | avatar |
| 16 | watch |
| 13 | settings |
| 11 | shelly-chat |
| 11 | dad-lab |
| 9 | records |
| 9 | evaluate |
| 6 | foundations-review |
| 5 | progress |
| 4 | monthly-review |
| 3 | evaluation |
| 2 | workshop |
| 1 | weekly-review |
| 1 | engine |
| 0 | ui-preview *(dev-only gallery — ok)* |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | auth |

No change in the 0-test feature set since last report: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only). `watch` grew from 10 to 16 test files this cycle.

---

## Dependency Notes

- **Root (prod):** was 3 vulnerabilities (1 low, 1 high + downstream) → now 2 (1 high, `react-router` — see Needs Human Attention). Fixed this cycle: `dompurify`, most of the `react-router` chain.
- **Functions (prod):** 13 vulnerabilities unchanged (1 low, 9 moderate, 3 high) — `firebase-admin` major-version chain, no non-breaking fix available.
- No major version upgrades were applied — both remaining vulnerability chains require breaking changes and are left for human review per policy.

