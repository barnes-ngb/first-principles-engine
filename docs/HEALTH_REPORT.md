# Code Health Report — 2026-06-08

## Metrics

| Metric | Value | Change from last report (2026-06-07) |
|--------|-------|--------------------------------------|
| **Total lines** | **176,992** | +821 |
| **Commits (main)** | **134** | +10 |
| **Test files** | **176** (source) | +7 |
| **Tests passing** | **2,645** | ⚠️ see note |
| **Tests total** | **2,645** | 0 skipped, 0 failing |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **34** | +1 |
| **Bundle size** | **3,908 kB / 1,152 kB gzip** | +4 kB |

> **Note on test count vs last report:** Previous report showed 3,003 tests across 191 test files. This run is a fresh clone with no compiled artifacts — vitest runs 175 source test files producing 2,645 tests. The previous machine had `functions/lib/` compiled output that inflated the count: 191−175=16 extra files, 3,003−2,645=358 extra tests. **2,645 is the accurate baseline going forward.** The 10 new commits since the last audit account for the +821 lines and +1 route; no tests were deleted.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 18.22s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged since 2026-05-29) |
| **Tests** | ✅ PASS | 2,645 passing, 0 skipped, 0 failing (175 test files) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | 0 production vulnerabilities |
| **npm audit (dev)** | ⚠️ 9 dev vulns | 8 moderate, 1 critical — dev-only (ESLint toolchain); `--force` required to fix; not in production bundle |

### Lint Warnings (unchanged since last report)

```
src/features/evaluate/EvaluateChatPage.tsx:282 — useEffect missing dep: sessionTimer
src/features/quest/useQuestSession.ts:779 — useCallback missing dep: sessionTimer
src/features/quest/useQuestSession.ts:2026 — useCallback missing dep: sessionTimer
```

All three are `sessionTimer` ref omissions. Intentional — adding to deps would cause re-subscription loops. Add `eslint-disable-next-line react-hooks/exhaustive-deps` on each line to clean up lint output without changing behavior.

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 176,171 | 176,992 | ⚠️ DRIFT +821 — **AUTO-FIXED** |
| Commits | 124 | 134 | ⚠️ DRIFT +10 — **AUTO-FIXED** |
| Test files | 169 | 176 | ⚠️ DRIFT +7 — **AUTO-FIXED** |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 34 | ⚠️ DRIFT +1 — **AUTO-FIXED** |

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

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI  
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

All 37 collection helpers in `firestore.ts` are documented in CLAUDE.md. ✅

### Task Types — Registry vs Docs

All 17 task types in `functions/src/ai/tasks/index.ts` are documented in `SYSTEM_PROMPTS.md`. ✅

The charter check flagged `chat` and `generate` as missing task handler files at `functions/src/ai/tasks/{name}.ts` — these are false positives; those tasks are implemented in `functions/src/ai/chat.ts` and `functions/src/ai/generate.ts` respectively, both of which include `CHARTER_PREAMBLE`.

### Unindexed Docs

None. All docs in `docs/` are indexed in `DOCUMENT_INDEX.md`. ✅

### Stale Docs

No docs marked CURRENT were found untouched for 30+ days. ✅

---

## Largest Files (over 500 lines)

| Lines | File | vs last report |
|-------|------|---------------|
| 2,627 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 |
| 2,544 | `functions/src/ai/chat.ts` | +0 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| **1,566** | `functions/src/ai/contextSlices.ts` | **⚠️ NEW — crossed 1,500 lines** |
| 1,500 | `src/features/records/records.logic.test.ts` | +0 |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 |
| 1,248 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 |
| 1,113 | `src/features/today/TodayChecklist.tsx` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,103 | `src/features/today/TodayPage.tsx` | +0 |

## Decomposition Candidates

| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,627 | Known — stable per CLAUDE.md; state management complexity blocks decomp |
| `chat.ts` (functions) | 2,544 | Known — highest-leverage decomp target: extract prompt builders per CLAUDE.md |
| `BookEditorPage.tsx` | 2,278 | Known — sketch/voice/sticker panels could extract later |
| `useQuestSession.ts` | 2,161 | Known — consider splitting by quest domain |
| `contextSlices.ts` | 1,566 | **NEW** — crossed 1,500 lines this cycle. Growing context slice registry; reasonable candidate for per-slice files if it keeps growing |

---

## Issues Found

### Auto-Fixed

- Updated MASTER_OUTLINE.md stats: lines 176,171→176,992; commits 124→134; test files 169→176; routes 33→34

### Needs Human Attention

**LOW — Lint warnings (4 consecutive reports unchanged)**
Three `sessionTimer` exhaustive-deps suppressions needed. Safe mechanical change: add `// eslint-disable-next-line react-hooks/exhaustive-deps` before the three hooks in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, and `useQuestSession.ts:2026`.

**LOW — npm dev vulnerabilities (9 total: 8 moderate, 1 critical)**
Dev-only; `--force` required to upgrade. Zero production impact. Upgrade is an `npm audit fix --force` on eslint-related packages — breaking changes possible. Human should review before applying.

**MONITOR — `contextSlices.ts` crossed 1,500 lines**
`functions/src/ai/contextSlices.ts` is now 1,566 lines — first report it has appeared on the large-file list. The file is the central context-slice registry; its growth tracks directly with new features adding context slices. Not urgent, but worth tracking. If it crosses 2,000 lines, consider per-slice files with a barrel re-export.

**INFO — Bundle size 3,908 kB (unchanged guidance)**
Route-level React.lazy splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision — not auto-fixable.

---

## Charter Alignment

| Task | Status |
|------|--------|
| plan | ✅ `buildContextForTask` / `CHARTER_PREAMBLE` present |
| evaluate | ✅ |
| quest | ✅ |
| generateStory | ✅ |
| reviseStory | ✅ |
| revisePage | ✅ |
| workshop | ✅ |
| analyzeWorkbook | ✅ |
| disposition | ✅ |
| conundrum | ✅ |
| weeklyFocus | ✅ |
| scan | ✅ |
| shellyChat | ✅ |
| chapterQuestions | ✅ |
| monthlyReview | ✅ |
| chat (→ `chat.ts`) | ✅ (file at non-standard path — `CHARTER_PREAMBLE` confirmed) |
| generate (→ `generate.ts`) | ✅ (file at non-standard path) |

All 17 task types have charter context. ✅

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 16 | today |
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
| 0 | ui-preview *(preview-only, expected)* |
| 0 | progress |
| 0 | planner *(redirect-only route)* |
| 0 | not-found *(trivial)* |
| 0 | login |
| 0 | dad-lab |
| 0 | auth |

Features with meaningful 0-test gaps: **progress**, **dad-lab**, **login**, **auth**. The `progress` tab renders significant UI (curriculum map, disposition profile, skill snapshot); `dad-lab` has lifecycle state management. Both are candidates for integration test coverage when next touched.

---

## Dependency Notes

- **npm audit (production):** 0 vulnerabilities ✅
- **npm audit (dev):** 9 vulnerabilities (8 moderate, 1 critical) — dev toolchain only; `--force` required
- **npm major version available:** npm 10.9.7 → 11.16.0 (informational)
