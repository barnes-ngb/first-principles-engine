# Code Health Report — 2026-08-10

## Metrics

| Metric | Value | Change from last report (2026-07-27) |
|--------|-------|--------------------------------------|
| **Total lines** | **247,099** | +1,369 |
| **Commits** | **215** | -4 (shallow-clone HEAD depth in this sandboxed environment, not full repo history — see note below) |
| **Test files** | **362** | +2 |
| **Tests passing** | **4,867** | +83 |
| **Tests total** | **4,867** | 0 skipped, 0 failing |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,276.73 kB / 1,273.34 kB gzip** | +2.52 kB / +0.40 kB gzip (effectively flat) |

> **Note on "Commits":** `git rev-list --count HEAD` in this run's environment returns the depth of a shallow clone (`git rev-parse --is-shallow-repository` → `true`), not the true repository history. This has been true for every prior audit run — the metric tracks shallow-clone depth, not real commit count. Treat this row as directionally informative only, same caveat as the 2026-07-27 report.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in ~16-17s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings, unchanged since 2026-07-06 (`EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`) |
| **Tests** | ✅ PASS | 4,867 passing, 0 skipped, 0 failing (362 test files) — reran full suite before and after the dependency fix below to confirm no regression |
| **TypeScript** | ✅ PASS | `npx tsc -b` clean (via `npm run build`) |
| **npm audit (prod, root)** | ✅ AUTO-FIXED | Was 3 vulnerabilities (1 moderate `dompurify`, 1 high + downstream `react-router`/`react-router-dom`). **Auto-fixed** via non-breaking `npm audit fix`: `dompurify` 3.4.12→3.4.13, `react-router`/`react-router-dom` 7.18.1→7.18.2, plus incidental `nanoid`/`js-yaml`/`brace-expansion` patch bumps. `package.json` unchanged — only `package-lock.json` moved (all bumps stayed inside existing semver ranges). Verified build, lint, and full test suite (4,867 tests) still pass after the fix. Root now shows 0 vulnerabilities in the categories that had a non-breaking fix available. |
| **npm audit (prod, functions)** | ⚠️ UNCHANGED | 13 vulnerabilities (1 low, 9 moderate, 3 high), same `firebase-admin`→`@google-cloud/firestore`/`@google-cloud/storage`→`google-gax`/`teeny-request`→`uuid` chain as every prior cycle. `npm audit fix --dry-run` confirms no non-breaking fix is available — full fix requires `firebase-admin@10.3.0` (a **downgrade** from the current major) or a later major bump. No fix applied, per policy (HIGH/CRITICAL non-breaking only). |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 245,730 | 247,099 | ⚠️ DRIFT +0.6% — **AUTO-FIXED** |
| Commits | 219 | 215 | ⚠️ DRIFT -1.8% (shallow-clone metric, see note above) — **AUTO-FIXED** |
| Test files | 360 | 362 | ⚠️ DRIFT +0.6% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06, referenced only in MASTER_OUTLINE's historical changelog entry |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component, referenced only in the same historical changelog entry |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06, referenced only in the same historical changelog entry |

No new missing-reference findings this cycle — identical set to 2026-07-27.

### Navigation

Code (`AppShell.tsx`) and docs (`MASTER_OUTLINE.md` §Navigation) match exactly for both Parent and Kid nav lists.

### Collection Coverage

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection). Confirmed via `npm run docs:check` (`[collection-count]` PASS, span 48).

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`'s dispatch diagram and model table. `SYSTEM_PROMPTS.md` §4 still carries its own known-gap note (unchanged since 2026-07-06): prose write-ups for `reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard` are still missing — that requires drafting new documentation prose (judgment call), not a mechanical fix, so it stays open under Needs Human Attention.

### Unindexed Docs

None — every file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`.

### Stale Docs

None — no doc marked **CURRENT** in `DOCUMENT_INDEX.md` has gone 30+ days without a commit.

### `docs:check` script (DOC-08/DOC-09 automated checks)

Ran `npm run docs:check` (the repo's own alignment script) as a cross-check. All 6 HARD checks passed (`ledger-ids`, `index-fs`, `ledger-anchors`, `collection-count`, `evidence-kinds`, `day-write-routing`). 11 SOFT warnings — 2 new raw Firestore refs not in the allowlist (`ArmorTab.tsx`, `DevAdminTab.tsx`), 8 `httpsCallable` reach sites without timeout/AbortController/finally, 1 image-input without downscale, plus a 97-swallowed-catch census across 54 files. These are handled by the existing first-weekend `OPS_WINDOW.md` monthly review cadence, not this 3-day audit — noted here for visibility only, not re-litigated.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,092 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 |
| 2,764 | `src/features/records/records.logic.test.ts` | **+304** (test file) |
| 2,641 | `functions/src/ai/chat.ts` | +0 |
| 2,218 | `src/features/quest/useQuestSession.ts` | +0 |
| 2,113 | `src/features/books/BookEditorPage.tsx` | +0 |
| 1,896 | `src/features/planner-chat/chatPlanner.logic.test.ts` | **+336** (test file) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,713 | `src/features/records/dataReviewExport.logic.ts` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,617 | `functions/src/ai/contextSlices.ts` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,544 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,498 | `src/features/today/TodayChecklist.tsx` | +0 |
| 1,464 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,233 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,218 | `src/features/today/TodayPage.tsx` | +0 |
| 1,207 | `src/features/records/records.logic.ts` | +0 |
| 1,156 | `src/features/today/KidTodayView.tsx` | +9 |
| 1,143 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,134 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,112 | `functions/src/ai/evaluate.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,096 | `src/features/books/BookshelfPage.tsx` | +0 |
| 1,078 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,059 | `src/core/types/planning.ts` | +0 |
| 1,046 | `src/features/settings/DevAdminTab.tsx` | +0 |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |
| 1,008 | `functions/src/ai/chat.test.ts` | +0 (test file) |
| 1,002 | `src/features/books/printBook.ts` | +0 |

The two notable movers this cycle are both **test files** (`records.logic.test.ts` +304L, `chatPlanner.logic.test.ts` +336L) — together they account for most of the repo's +1,369-line growth. No production file crossed a new size threshold this cycle; the majority of production files in this table are byte-identical to 2026-07-27.

---

## Decomposition Candidates

No file crossed a new line-count threshold this cycle. `PlannerChatPage.tsx` (3,092L) held flat for the first time in four cycles — the growth streak that prompted last cycle's flag has paused, but the file has not shrunk.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,092 | KNOWN, flat this cycle. `CLAUDE.md`'s "Known Technical Debt" entry still says **"2,669L ... Stable as-is"** — still stale by 423 lines (unchanged from last cycle's finding; `CLAUDE.md` prose is excluded from auto-fix by policy). |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. Highest-leverage decomposition target. No growth this cycle. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth this cycle. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. No growth this cycle. |

**Watch list:** none new. `records.logic.test.ts` and `chatPlanner.logic.test.ts` grew substantially but are test files, not decomposition candidates under this audit's criteria.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 245,730→247,099; Commits 219→215; Test files 360→362. (Firestore collections, Cloud Functions, Chat task types, and Routes were already correct.)
- **`npm audit fix` (root, non-breaking):** resolved `dompurify` 3.4.12→3.4.13 and `react-router`/`react-router-dom` 7.18.1→7.18.2 (plus incidental `nanoid`/`js-yaml`/`brace-expansion` bumps pulled in by the same resolve). `package.json` untouched — lockfile-only. Verified build, lint, and full test suite (4,867 tests) pass after the fix.
- Ran `npm run lint -- --fix`: no auto-fixable issues found (0 file changes beyond what was already clean); the 3 pre-existing warnings require dependency-array judgment calls and were left as-is.

### Needs Human Attention

- **`CLAUDE.md`'s `PlannerChatPage.tsx` tech-debt note is stale.** Still reads "2,669L ... Stable as-is" against an actual 3,092L — unchanged from the 2026-07-27 finding since `CLAUDE.md` prose is excluded from this audit's auto-fix scope. The growth streak paused this cycle (+0L), so "stable" is now closer to accurate on the trend, but the number itself is still wrong.
- **Remaining `react-router` vulnerability status (root, prod):** `npm audit --production` now shows 0 vulnerabilities in the categories this cycle's fix addressed — re-verify at next cycle to confirm no new advisories reappeared for the patched range.
- **Remaining `firebase-admin` vulnerabilities (functions, unchanged):** 13 total (1 low, 9 moderate, 3 high) tracing to a vulnerable `uuid` transitively via `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`. `npm audit fix --dry-run` confirms no non-breaking fix is available — the only path is `firebase-admin@10.3.0` (a **downgrade** from the current major) or a later major bump. Same as every prior cycle, no fix applied.
- **Bundle size 4,276.73 kB (1,273.34 kB gzip), effectively flat since last report (+2.52 kB / +0.40 kB gzip):** heaviest imports unchanged — Three.js (avatar), jsPDF (print), curriculum map data. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **`SYSTEM_PROMPTS.md` §4 prose gap (unchanged since 2026-07-06):** still missing dedicated write-ups for `reviseStory`, `chapterQuestions`, `bookLookup`, `lessonVideo`, `monthlyReview`, `foundationsReview`, `helpCard`. Drafting these is a judgment call (each needs an accurate prompt-behavior description read from source), left for a dedicated docs pass rather than mechanically inferred here.
- **`docs:check` SOFT warnings (11, see Doc Accuracy above):** 2 new unallowlisted raw Firestore refs, 8 remote-call reach sites without timeout/finally, 1 image-input without downscale, 97 swallowed catches. These route through the existing monthly `OPS_WINDOW.md` review, not this 3-day cycle — flagged for visibility only.
- **Dead-export scan:** not rerun this cycle (time budget). Last full finding (2026-07-27) listed ~47 possibly-dead exports pending manual verification (re-exports/dynamic imports/test-only usage can produce false positives) — status unverified, no new scan performed.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 42 | today |
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

No change in the 0-test feature set since last report: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only). `today` grew from 40 to 42 test files this cycle — the only feature-level change.

---

## Dependency Notes

- **Root (prod):** was 3 vulnerabilities (1 moderate `dompurify`, 1 high `react-router` + downstream) → now 0 in the categories a non-breaking fix could address. Fixed this cycle: `dompurify`, `react-router`/`react-router-dom` fully to 7.18.2.
- **Functions (prod):** 13 vulnerabilities unchanged (1 low, 9 moderate, 3 high) — `firebase-admin` major-version chain, no non-breaking fix available.
- No major version upgrades were applied — the remaining vulnerability chain requires a breaking change and is left for human review per policy.

---

*All green except the two long-standing architectural items (bundle size, functions dependency chain) and the stale `CLAUDE.md` line-count note — none of which are new this cycle.*
