# Code Health Report — 2026-08-03

## Metrics

| Metric | Value | Change from last report (2026-07-27) |
|--------|-------|--------------------------------------|
| **Total lines** | **247,120** | +1,390 |
| **Commits** | **219** | not verifiable this cycle (shallow clone reaches back only to 2026-07-18 — see note below); left unchanged rather than overwritten with an unreliable number |
| **Test files** | **362** | +2 |
| **Tests passing** | **4,867** | +83 |
| **Tests total** | **4,867** | 0 skipped, 0 failing |
| **Firestore collections** | **48** | +0 |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,276.73 kB / 1,273.33 kB gzip** | +2.52 kB / +0.39 kB gzip |

> **Note on "Commits":** `git rev-list --count HEAD` returned 215 this run, but `git rev-parse --is-shallow-repository` confirms this sandbox's clone is shallow and its earliest reachable commit dates to 2026-07-18 (16 days before this audit) — `git rev-list --count` on a shallow clone measures fetched depth, not true repo history, and that depth varies run to run. The prior report's 219 is equally a shallow-clone artifact from a differently-truncated fetch, not verified ground truth either. Left the doc's value at 219 unchanged this cycle rather than replacing one unreliable number with another; a full (non-shallow) checkout is needed to get a real count.

> **Note on stale-doc detection (Phase 3h):** for the same shallow-clone reason, every doc's "last commit" in this sandbox is capped at 2026-07-18 at the latest possible floor — a doc last genuinely touched in March would still show a `git log` date no older than the clone boundary. This makes the 30-day-staleness check unable to produce a true negative or positive this cycle; results below are informational only, not authoritative.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~22s). `node_modules` had to be installed fresh in this sandbox before the build would run (`npm install` at root and in `functions/`) — not a repo issue. |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`) |
| **Tests** | ✅ PASS | 4,867 passing, 0 skipped, 0 failing (362 test files) |
| **TypeScript** | ✅ PASS | Included in `npm run build` (`tsc -b`) |
| **npm audit (prod, root)** | ⚠️ UNCHANGED | 2 high (`react-router` 7.12.0–8.2.0, "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response"). No non-breaking fix — `npm audit fix --force` moves to a breaking major. Same as last cycle. |
| **npm audit (prod, functions)** | ⚠️ UNCHANGED | 13 vulnerabilities (1 low, 9 moderate, 3 high), same `firebase-admin`→`google-gax`/`teeny-request`→`uuid` chain as every prior cycle. `npm audit fix --dry-run` confirms no non-breaking resolution. No fix applied, per policy. |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 245,730 | 247,120 | ⚠️ DRIFT +0.6% — **AUTO-FIXED** |
| Commits | 219 | 215 (shallow-clone artifact) | Not fixed — computed value isn't ground truth this cycle, see note above |
| Test files | 360 | 362 | ⚠️ DRIFT +0.6% — **AUTO-FIXED** |
| Firestore collections | 48 | 48 | ✅ OK |
| Cloud Functions | 29 | 29 | ✅ OK (a naive single-line grep undercounted to 22 because two of the eleven `export {...}` blocks in `functions/src/index.ts` span multiple lines; manually walking every block confirms 29 — matches the doc, no drift) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

### Missing File References

Same four expected carry-overs as every prior cycle, all correctly marked as removed/superseded in their source docs — not real gaps:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` | Referenced only in MASTER_OUTLINE's historical UX P2.06 changelog entry, which explicitly says "Removes `QuickCaptureSection.tsx`..." |
| `CreativeTimeLog.tsx` | Same UX P2.06 changelog entry, same reason |

No new missing-reference findings this cycle.

### Navigation

Code (`AppShell.tsx`) and docs (`MASTER_OUTLINE.md` §Navigation) match exactly for both Parent (12 items) and Kid (9 items) nav lists.

### Collection Coverage

All 48 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection).

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`.

### Unindexed Docs

None — every file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`.

### Stale Docs

Not reliably checkable this cycle — see the shallow-clone note above. No further action taken.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report |
|-------|------|--------------------------|
| 3,092 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 — growth trend from the last 4 cycles has stopped |
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

---

## Decomposition Candidates

No file crossed 2,000 lines for the first time this cycle, and no production file grew at all this cycle — every production-code line-count entry above shows +0. `PlannerChatPage.tsx`, which grew for four straight prior cycles and crossed 3,000 lines last report, held flat at 3,092 this cycle.

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 3,092 | KNOWN — held flat this cycle after 4 consecutive cycles of growth (2,757 → 2,941 → 3,092 → 3,092). `CLAUDE.md`'s "Known Technical Debt" entry still says "2,669L ... Stable as-is," which is stale by 423 lines regardless of this cycle's flat growth — carried over from last report, still not auto-fixed (`CLAUDE.md` prose is excluded from auto-fix by policy). |
| `chat.ts` (CF) | 2,641 | KNOWN — `buildQuestPrompt` alone 400+ lines. No growth. |
| `useQuestSession.ts` | 2,218 | KNOWN — quest/comprehension/fluency/encoding all in one hook. No growth. |
| `BookEditorPage.tsx` | 2,113 | KNOWN — handlers interleaved but clear section boundaries. No growth. |

**Watch list:** the only growth anywhere in the >500-line table this cycle is in two test files — `records.logic.test.ts` (+304L) and `chatPlanner.logic.test.ts` (+336L) — consistent with the +83 passing-test count and +2 test-file count above. No production file grew. `KidTodayView.tsx` grew a trivial +9L.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 245,730→247,120; Test files 360→362. (Commits left unchanged — unverifiable this cycle, see note above. Firestore collections, Cloud Functions, Chat task types, and Routes were already correct.)
- Ran `npm run lint -- --fix`: no auto-fixable issues found (0 file changes); the 3 pre-existing warnings require dependency-array judgment calls and were left as-is.
- `npm audit fix` was evaluated for both root and `functions/` — no non-breaking fix is available for either remaining vulnerability set this cycle (both were already resolved to their non-breaking floor as of the 2026-07-27 report), so no changes were applied.

### Needs Human Attention

- **`CLAUDE.md`'s `PlannerChatPage.tsx` tech-debt note is still stale.** Reads "PlannerChatPage.tsx (2,669L) ... Stable as-is" — actual is 3,092L (+423). The file itself held flat this cycle (first cycle without growth in a while), which arguably makes "stable" directionally true again even though the line count in the note is wrong. Still recommend updating the note's number, or removing the stale figure. Not auto-fixed — `CLAUDE.md` prose is excluded from this audit's auto-fix scope.
- **Remaining `react-router` HIGH vulnerability (root, prod), unchanged:** "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response," affects 7.12.0–8.2.0. No non-breaking fix exists — `npm audit fix --force` would move to a breaking v8. Architectural decision, left for human review, same as last cycle.
- **Remaining `firebase-admin` vulnerabilities (functions, unchanged):** 13 total (1 low, 9 moderate, 3 high), same `google-gax`/`gaxios`/`teeny-request`/`@google-cloud/*`→`uuid` chain. `npm audit fix --dry-run` confirms no non-breaking fix. Only path is a `firebase-admin` major-version change (itself breaking). No fix applied, per policy.
- **Bundle size 4,276.73 kB (1,273.33 kB gzip), +2.52 kB / +0.39 kB gzip since last report:** essentially flat. Heaviest imports unchanged — Three.js (avatar), jsPDF (print), curriculum map data. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:293`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **Test file growth (+304L / +336L this cycle in `records.logic.test.ts` / `chatPlanner.logic.test.ts`):** healthy (test coverage growing, not production complexity), noted for visibility only — no action needed.
- **Dead-export scan skipped this cycle.** The prior report's scan was already a partial, sampled, grep-based heuristic (explicitly noted as unreliable without manual verification — misses re-exports, dynamic imports, test-only usage) and this cycle's time budget went to installing dependencies from scratch (no `node_modules` existed in this sandbox at start) plus the full build/lint/4,867-test run. Re-running the same heuristic would likely just reproduce the prior cycle's ~47 candidates with no new signal; recommend a real dead-code tool (e.g. `ts-prune` or `knip`) rather than repeating the grep heuristic next cycle.
- **Commit-count / stale-doc metrics unverifiable this cycle** — both depend on full git history, and this sandbox's clone is shallow with a boundary at 2026-07-18. If a future run has access to a non-shallow clone, both metrics should be recomputed properly rather than carried forward.

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

No change in the 0-test feature set since last report: `planner`, `not-found`, `login`, `auth` (`ui-preview` intentionally untested, dev-only). `today` grew from 40 to 42 test files.

---

## Dependency Notes

- **Root (prod):** 2 high vulnerabilities (`react-router` RSC bypass chain), unchanged from last report — already fixed to its non-breaking floor previously; the remainder needs a breaking major bump.
- **Functions (prod):** 13 vulnerabilities unchanged (1 low, 9 moderate, 3 high) — `firebase-admin` major-version chain, no non-breaking fix available.
- No major version upgrades were applied — both remaining vulnerability chains require breaking changes and are left for human review per policy.
