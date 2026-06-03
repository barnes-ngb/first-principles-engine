# Code Health Report — 2026-06-03

## Metrics

| Metric | Value | Change from last report (2026-06-02) |
|--------|-------|--------------------------------------|
| **Total lines** | **175,836** | +3,519 |
| **Commits (main)** | **120** | −9 ⚠️ (see note) |
| **Test files** | **168** | +8 |
| **Tests passing** | **2,544** | +103 |
| **Tests total** | **2,545** | +104 (1 skipped) |
| **Test files running** | **167** | +8 |
| **Firestore collections** | **37** | +1 (`stonebridgeProgress` — auto-fixed in CLAUDE.md) |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,901 kB / 1,149 kB gzip** | +23 kB |

> **Commit count note:** `git fetch origin main` showed another forced update (`+ 237bfda...c7af96e main -> origin/main`). Commit count dropped from 129 → 120. This is the same pattern as last report. Human: verify forced-push to main is intentional (ongoing rebase/squash workflow).

> **Test growth:** 2,544 tests pass across 167 files — up +103 tests and +8 files from last report. Healthy pace.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 18.43s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged from last report) |
| **Tests** | ✅ PASS | 2,544 passing, 1 skipped, 0 failing |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ PASS | 0 production vulnerabilities |

### Lint Warnings (unchanged from last report)

```
src/features/evaluate/EvaluateChatPage.tsx:282 — useEffect missing dep: sessionTimer
src/features/quest/useQuestSession.ts:779 — useCallback missing dep: sessionTimer
src/features/quest/useQuestSession.ts:2026 — useCallback missing dep: sessionTimer
```

All three are `sessionTimer` ref omissions. Adding `sessionTimer` to deps would cause re-subscription loops — intentional omission. Suppression with `eslint-disable-next-line react-hooks/exhaustive-deps` on each line would silence these cleanly. Not auto-fixed (needs inline comment placement).

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 172,317 | 175,836 | **DRIFT** (+2.0%) — auto-fixed |
| Commits | 129 | 120 | **DRIFT** (forced-push) — auto-fixed |
| Test files | 160 | 168 | **DRIFT** (+5.0%) — auto-fixed |
| Firestore collections | 36 | 37 | **ERROR** (+1 new) — auto-fixed |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

Same 5 files as last two reports — all historical PR log references, not live path references. No action needed.

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06 |

### Nav Accuracy

Code nav matches MASTER_OUTLINE items. Same minor ordering discrepancy as last report: "Ask AI" is last in `AppShell.tsx` but listed between Books and Game Workshop in MASTER_OUTLINE. All items present; ordering-only gap, not flagged.

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI  
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

New collection `stonebridgeProgress` detected (not in CLAUDE.md). Added in this audit. See Auto-Fixed below.

### Task Types — Registry vs SYSTEM_PROMPTS.md

All 17 task types documented in `docs/SYSTEM_PROMPTS.md`. `chat` and `generate` both route to `chatHandler.ts` — charter context injected via `buildContextForTask`. ✅

### Unindexed Docs

No new unindexed docs found. ✅

### Stale Docs (marked CURRENT but >30 days since last commit)

No stale docs found by git log check. ✅ (Note: `docs/investigations/backend-reliability-assessment.md` flagged last report — either updated or not picked up by this check.)

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report | Flag |
|-------|------|------------------------|------|
| 2,627 | `src/features/planner-chat/PlannerChatPage.tsx` | +7 | Known debt — stable |
| 2,544 | `functions/src/ai/chat.ts` | +4 | Growing — decomposition target |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 | Known debt — stable |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 | Stable — still above 2,000L threshold |
| 1,875 | `src/features/avatar/MyAvatarPage.tsx` | **+51** | Growing |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 | Stable |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 | Stable |
| 1,566 | `functions/src/ai/contextSlices.ts` | **+22** | Growing — watch |
| 1,482 | `src/features/records/records.logic.test.ts` | +106 | Test file — OK |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 | — |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 | — |
| 1,159 | `src/features/records/RecordsPage.tsx` | +4 | — |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 | Test file — OK |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 | — |
| 1,112 | `src/features/today/TodayChecklist.tsx` | **+42** | Growing |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 | — |
| 1,103 | `src/features/today/TodayPage.tsx` | +7 | — |
| 1,065 | `src/features/quest/ReadingQuest.tsx` | +0 | — |
| 1,054 | `src/features/today/KidTodayView.tsx` | +14 | — |
| 1,050 | `functions/src/ai/evaluate.ts` | +0 | — |

## Decomposition Candidates

| File | Lines | Priority | Notes |
|------|-------|----------|-------|
| `useQuestSession.ts` | 2,161 | HIGH | Above 2,000L for second consecutive report. Quest, comprehension, fluency all in one hook. CLAUDE.md names this as debt. Splitting by quest domain is the right move. |
| `chat.ts` (CF) | 2,544 | HIGH | `buildQuestPrompt` alone is 400+ lines. CLAUDE.md notes highest-leverage decomp: extract prompt builders to separate files. |
| `contextSlices.ts` | 1,566 | MEDIUM | +22 this cycle. Growing with each new task type. |
| `PlannerChatPage.tsx` | 2,627 | LOW | Stable (+7). State management is ~1,700L. Known debt, no urgency. |

---

## Issues Found

### Auto-Fixed
- Updated MASTER_OUTLINE.md TypeScript lines: 172,317 → 175,836
- Updated MASTER_OUTLINE.md commits: 129 → 120 (forced-push noted)
- Updated MASTER_OUTLINE.md test files: 160 → 168
- Updated MASTER_OUTLINE.md Firestore collections: 36 → 37
- Added `stonebridgeProgress` collection to CLAUDE.md Firestore table (Banner Rally per-child mission progress, derived read-only from XP ledger reading events — never touches XP/diamond economy)

### Needs Human Attention

1. **Forced push to `origin/main` (second consecutive report)** — Another forced update: `+ 237bfda...c7af96e main -> origin/main`. Commit count 129 → 120. This is recurring — either the rebase/squash workflow is expected, or there's a process concern. Recommend confirming whether this is the intended workflow or a git hygiene issue.

2. **`useQuestSession.ts` at 2,161 lines — second consecutive report above threshold** — No growth this cycle but still above 2,000L. Decomposition run should be assigned if not already planned.

3. **Lint warnings** (3) — `sessionTimer` dependency omissions in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, and `useQuestSession.ts:2026`. Intentional omissions but should get `eslint-disable-next-line` suppressions to keep lint clean.

4. **Bundle size 3.9MB** — main chunk is 3,901 kB (1,149 kB gzip, +7 kB from last report). Route-level React.lazy splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.

5. **Dead exports in `src/core/types/`** — same 20 items as last report. Verify before removing — may be used in tests or dynamic imports:
   - `ReadingTags`, `MathTags`, `ALL_SKILL_TAGS` in `skillTags.ts`
   - `WorkingLevelSource`, `QuestOutcome` in `evaluation.ts`
   - 10 zod schema exports in `zod.ts`
   - `getPresetTheme`, `resolveBookCreator` in `books.ts`
   - `CardDifficulty` in `workshop.ts`
   - `PIECE_POSITIONS` in `xp.ts`
   - `SUPPORT_LEVEL_ORDER` in `enums.ts`

6. **npm audit: 9 total vulnerabilities (8 moderate, 1 critical) in dev deps** — 0 production vulnerabilities. Run `npm audit` for details. Consider `npm audit fix` for non-breaking resolutions.

---

## Charter Alignment

All 17 chat task types verified. `chat` and `generate` both route to `chatHandler.ts` which calls `buildContextForTask` (includes charter context slice). All 15 dedicated task files reference charter context via `buildContextForTask` or `CHARTER_PREAMBLE`. ✅

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 15 | today |
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
| 0 | progress |
| 0 | planner |
| 0 | not-found |
| 0 | login |
| 0 | dad-lab |
| 0 | auth |

Zero-test features are primarily UI pages (progress tabs, login flow, auth guard, 404) where vitest coverage is low-value compared to Firestore integration behavior. `dad-lab` is the only zero-test feature with meaningful business logic — still flagging for future test run assignment.

---

## Dependency Notes

- `npm audit --production`: **0 vulnerabilities** ✅
- `npm audit` (all): 9 vulnerabilities (8 moderate, 1 critical) — dev deps only
- npm v10.9.7 installed; v11.16.0 available (major) — low priority upgrade
