# Code Health Report — 2026-06-15

## Metrics

| Metric | Value | Change from last report (2026-06-13) |
|--------|-------|--------------------------------------|
| **Total lines** | **179,214** | +0 |
| **Commits (main)** | **118** | −1 (previous audit PR not yet merged into main at time of last report) |
| **Test files** | **178** | +0 |
| **Tests passing** | **2,682** | +0 (177 test files ran; 1 test file in find count excluded by vitest config) |
| **Tests total** | **2,682** | 0 skipped, 0 failing |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **19** | +0 |
| **Routes** | **34** | +0 |
| **Bundle size** | **3,916 kB / 1,156 kB gzip** | +0 |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 14.14s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29 — `sessionTimer` in EvaluateChatPage.tsx:282, useQuestSession.ts:779, useQuestSession.ts:2026) |
| **Tests** | ✅ PASS | 2,682 passing, 0 skipped, 0 failing (178 test files) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities |

> **Note:** `npm install` was required at session start — container started without node_modules. This is expected for ephemeral remote execution environments.

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 179,214 | 179,214 | ✅ OK |
| Commits | 119 | 118 | ⚠️ DRIFT −1 — **AUTO-FIXED** |
| Test files | 178 | 178 | ✅ OK |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 19 | 19 | ✅ OK |
| Routes | 34 | 34 | ✅ OK |

### Stale Task Count References in MASTER_OUTLINE

Two prose references said "17 task types" while the stats header and code correctly show 19. The two new tasks (`bookLookup`, `lessonVideo`) were missing from the prose list and the Key Files table. **AUTO-FIXED** — updated both occurrences to 19 and added the new task names.

### Missing Task Types in CLAUDE.md

`bookLookup` (chapter book metadata lookup for "Add a book" form) and `lessonVideo` (kid-friendly lesson video finder) were present in `SYSTEM_PROMPTS.md` and `tasks/index.ts` but absent from:
- Model selection list (both use Sonnet)
- `chat` CF task dispatch list
- Prompt Files task handler list

**AUTO-FIXED** — added to all three locations in `CLAUDE.md`.

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected carry-over — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected carry-over — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected carry-over — removed with parent component |
| `CreativeTimeLog.tsx` | Expected carry-over — removed in UX P2.06 |

No new missing file references since last report.

### Nav Accuracy

Code nav vs MASTER_OUTLINE nav match. Only ordering difference: docs list Ask AI before Game Workshop under Parent nav (cosmetic, not functional). No fix needed.

### Unindexed Docs

None — all docs/*.md files are indexed in DOCUMENT_INDEX.md.

### Stale Docs (CURRENT but >30 days since last commit)

None found. All docs marked CURRENT were updated within the last 30 days.

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report |
|-------|------|------------------------|
| 2,669 | `src/features/planner-chat/PlannerChatPage.tsx` | +42 |
| 2,548 | `functions/src/ai/chat.ts` | +4 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +1 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,566 | `functions/src/ai/contextSlices.ts` | new entrant (was below 500L threshold) |
| 1,554 | `src/features/records/records.logic.test.ts` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,248 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,168 | `src/features/today/TodayChecklist.tsx` | +0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,094 | `src/features/today/TodayPage.tsx` | +0 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | +0 |
| 1,055 | `src/features/today/KidTodayView.tsx` | +0 |
| 1,050 | `functions/src/ai/evaluate.ts` | +0 |
| 1,031 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 |

---

## Decomposition Candidates

All files over 1,500 lines are documented in CLAUDE.md "Known Technical Debt" and are stable / deliberately deferred. `contextSlices.ts` (1,566L) is a new entrant — it grew as context slices were added for `bookLookup` and `lessonVideo`. Monitor for further growth.

No new crossings of the 2,000-line threshold.

---

## Issues Found

### Auto-Fixed
- **Commits stat drift**: MASTER_OUTLINE 119 → 118 (origin/main baseline)
- **Stale "17 task types" prose** (×2): MASTER_OUTLINE lines 348 and 373 updated to 19; `bookLookup` and `lessonVideo` added to task list
- **CLAUDE.md model selection**: Added `bookLookup` and `lessonVideo` to Sonnet task list
- **CLAUDE.md `chat` CF dispatch list**: Added `bookLookup` and `lessonVideo`
- **CLAUDE.md Prompt Files list**: Added `bookLookup` and `lessonVideo`

### Needs Human Attention

**LOW — bundle size (unchanged)**
Bundle remains 3,916 kB / 1,156 kB gzip. Route-level React.lazy splitting would reduce initial load. Heaviest chunks: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision — deferred per CLAUDE.md.

**LOW — 3 persistent lint warnings (unchanged since 2026-05-29)**
`react-hooks/exhaustive-deps` for `sessionTimer` in:
- `src/features/evaluate/EvaluateChatPage.tsx:282`
- `src/features/quest/useQuestSession.ts:779`
- `src/features/quest/useQuestSession.ts:2026`
These are intentional (sessionTimer is a ref-like stable object). Consider adding `// eslint-disable-next-line react-hooks/exhaustive-deps` with a comment to suppress permanently.

---

## Charter Alignment

All 19 chat task handlers include `CHARTER_PREAMBLE` or `buildContextForTask` (which injects charter context). The two tasks without dedicated files (`chat` → `chatHandler.ts`, `generate` → `chatHandler.ts`) both route through `chatHandler.ts` which includes charter context. ✅ All tasks covered.

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 17 | today |
| 15 | quest |
| 14 | planner-chat |
| 14 | avatar |
| 9 | shelly-chat |
| 6 | settings |
| 6 | evaluate |
| 3 | records |
| 2 | workshop |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | evaluation |
| 1 | engine |
| 0 | ui-preview *(dev-only gallery, not shipped)* |
| 0 | progress *(tab shell + sub-tabs)* |
| 0 | planner *(TeachHelperDialog only)* |
| 0 | not-found *(trivial 404)* |
| 0 | login *(profile selector)* |
| 0 | dad-lab |
| 0 | auth *(route guard wrapper)* |

Features with 0 tests that could benefit from coverage: `progress` (complex multi-tab page) and `dad-lab` (lifecycle state machine). Others are trivial shells.

---

## Dependency Notes

- **npm audit (production):** 0 vulnerabilities — clean
- **npm audit (all):** 13 vulnerabilities (8 moderate, 5 high) — all in dev dependencies, not production code. No action needed.
- **npm version:** npm 10.9.7 → 11.17.0 available (major upgrade, low priority).
