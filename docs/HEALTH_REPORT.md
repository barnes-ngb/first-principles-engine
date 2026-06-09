# Code Health Report — 2026-06-09

## Metrics

| Metric | Value | Change from last report (2026-06-08) |
|--------|-------|--------------------------------------|
| **Total lines** | **178,993** | +2,001 (FEAT-20–23 Lesson Video dialog + bookLookup task) |
| **Commits (main)** | **125** | ⚠️ Prior report inflated (branch commits counted); 125 is correct baseline |
| **Test files** | **177** | +1 |
| **Tests passing** | **2,674** | +29 |
| **Tests total** | **2,674** | 0 skipped, 0 failing |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **19** | +2 (`bookLookup`, `lessonVideo` added) |
| **Routes** | **34** | +0 |
| **Bundle size** | **3,916 kB / 1,156 kB gzip** | +8 kB |

> **Note on commit count:** The 2026-06-08 report counted 134 commits, but that was inflated because the health audit branch itself added commits before the count ran. Rebasing to fresh `origin/main` gives 125, which is the accurate baseline going forward.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 14.65s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29) |
| **Tests** | ✅ PASS | 2,674 passing, 0 skipped, 0 failing (177 test files) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities (8 dev-only moderate) |

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 176,992 | 178,993 | ⚠️ DRIFT +2,001 — **AUTO-FIXED** |
| Commits | 134 | 125 | ⚠️ CORRECTION (prior report inflated) — **AUTO-FIXED** |
| Test files | 176 | 177 | ⚠️ DRIFT +1 — **AUTO-FIXED** |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 19 | ⚠️ DRIFT +2 — **AUTO-FIXED** |
| Routes | 34 | 34 | ✅ OK |

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06 |

No new missing file references. All are carry-overs from prior reports.

### Nav Accuracy

Code nav matches MASTER_OUTLINE. ✅

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Ask AI, Game Workshop, Dad Lab, Settings  
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

All 37 collection helpers in `firestore.ts` are documented in CLAUDE.md. ✅

### Task Types — Registry vs Docs

**Two new task types found in `functions/src/ai/tasks/index.ts` that were undocumented in `SYSTEM_PROMPTS.md`:**
- `bookLookup` — chapter book title/author/chapter metadata lookup via web search; used by "Add a book" form in Plan My Week. Has `CHARTER_PREAMBLE`. Uses `modelForTask()` → Sonnet.
- `lessonVideo` — finds one short kid-friendly video for a lesson topic; web search enabled; child age + interests used as soft tiebreaker. Has `CHARTER_PREAMBLE` + `formatChildProfile`. Uses `modelForTask()` → Sonnet.

Both tasks self-load context directly (no `buildContextForTask` / `TASK_CONTEXT` entry needed — they pass input directly to the prompt). Both have charter alignment via `CHARTER_PREAMBLE`.

**AUTO-FIXED:** Added both to SYSTEM_PROMPTS.md CHAT_TASKS registry diagram and model selection table. Updated task type count to 19 in MASTER_OUTLINE.

### Unindexed Docs

None. All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`. ✅

### Stale Docs

No docs marked CURRENT were found untouched for 30+ days. ✅

---

## Largest Files (over 500 lines)

| Lines | File | Change vs last report |
|-------|------|-----------------------|
| 2,669 | `src/features/planner-chat/PlannerChatPage.tsx` | +42 |
| 2,548 | `functions/src/ai/chat.ts` | 0 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | 0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | 0 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | 0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | 0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | 0 |
| 1,566 | `functions/src/ai/contextSlices.ts` | NEW ENTRY |
| 1,500 | `src/features/records/records.logic.test.ts` | 0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | 0 |
| 1,248 | `src/features/records/RecordsPage.tsx` | 0 |
| 1,168 | `src/features/today/TodayChecklist.tsx` | 0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | 0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | 0 |
| 1,147 | `src/features/shelly-chat/useShellyChatFlows.ts` | 0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | 0 |
| 1,094 | `src/features/today/TodayPage.tsx` | 0 |
| 1,066 | `src/features/quest/ReadingQuest.tsx` | 0 |
| 1,055 | `src/features/today/KidTodayView.tsx` | 0 |
| 1,050 | `functions/src/ai/evaluate.ts` | 0 |

## Decomposition Candidates

Files ≥ 1,500 lines with growth trend (existing in CLAUDE.md Technical Debt section):
- **`PlannerChatPage.tsx` (2,669)** — +42 from last report; still largest file. State management monolith as documented.
- **`chat.ts` (2,548)** — Unchanged. Highest-leverage decomposition: extract prompt builders.
- **`contextSlices.ts` (1,566)** — NEW ENTRY. Will grow as task count increases; consider splitting per-slice loaders at ~2,000 lines.

---

## Issues Found

### Auto-Fixed
- Updated MASTER_OUTLINE.md stats: lines 178,993 / commits 125 / test files 177 / chat task types 19
- Added `bookLookup` task to SYSTEM_PROMPTS.md CHAT_TASKS registry + model table (Sonnet; chapter book metadata lookup via web search)
- Added `lessonVideo` task to SYSTEM_PROMPTS.md CHAT_TASKS registry + model table (Sonnet; kid-friendly lesson video finder via web search)
- Updated last-updated date in SYSTEM_PROMPTS.md header

### Needs Human Attention

**MEDIUM — Bundle size (3.9 MB main chunk)**  
Route-level `React.lazy()` splitting would reduce initial load significantly. Heaviest contributors: Three.js (avatar page), jsPDF (print book), curriculum map data, WorkshopPage. Architectural decision — not auto-fixable.

**LOW — 3 lint warnings (unchanged since 2026-05-29)**  
`react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, `useQuestSession.ts:2026` — all involve `sessionTimer`. Intentional exclusion pattern (adding sessionTimer to deps would cause infinite re-renders). No action needed unless bugs surface.

**INFO — `contextSlices.ts` crossed 1,500 lines**  
Now 1,566 lines and will grow as new tasks add context slices. Not urgent yet — no decomposition candidate — but worth watching. At ~2,000 lines it becomes a candidate for splitting per-slice loaders.

**INFO — `bookLookup` + `lessonVideo` not in `TASK_CONTEXT` mapping**  
These tasks self-assemble context and don't use `buildContextForTask`. Intentional by design. Documented here for clarity.

---

## Charter Alignment

All task handlers include charter context. ✅

Tasks using `buildContextForTask` (via `TASK_CONTEXT`): plan, chat, generate, evaluate, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, scan, shellyChat, weeklyReview.

Tasks with self-loaded charter context (`CHARTER_PREAMBLE` directly): conundrum, weeklyFocus, chapterQuestions, monthlyReview, bookLookup, lessonVideo.

The registry charter check flagged `chat` and `generate` as "FILE MISSING" — these are false positives; handlers live at `tasks/chatHandler.ts` and `chat.ts` respectively.

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
| 2 | workshop |
| 2 | records |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | evaluation |
| 1 | engine |
| 0 | ui-preview (intentional — dev-only component gallery) |
| 0 | progress (tab routing shell; logic in sub-components) |
| 0 | planner (single shared dialog component) |
| 0 | not-found (404 page) |
| 0 | login (profile selector) |
| 0 | dad-lab |
| 0 | auth (route guard wrapper) |

Zero-test features are all either trivial wrappers or intentionally minimal. No new zero-test features introduced since last report.

---

## Dependency Notes

- **npm audit (production):** 0 vulnerabilities ✅
- **npm audit (dev):** 8 moderate severity (dev-only, no production impact)
- **npm version:** v11.16.0 available (running 10.9.7) — not blocking
