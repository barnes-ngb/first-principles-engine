# Code Health Report — 2026-06-02

## Metrics

| Metric | Value | Change from last report (2026-06-01) |
|--------|-------|--------------------------------------|
| **Total lines** | **172,317** | +6,598 |
| **Commits (main)** | **129** | −68 ⚠️ (see note) |
| **Test files** | **160** | +16 |
| **Tests passing** | **2,441** | +209 |
| **Test files running** | **159** | +16 |
| **Firestore collections** | **36** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,878 kB / 1,142 kB gzip** | +37 kB |

> **Commit count note:** `git fetch origin main` showed a **forced update** (`+ 237bfda...dd702d2 main -> origin/main`), meaning `origin/main` history was rewritten between audits. `git rev-list --count HEAD` = 129 (was 197). This is expected after a rebase/squash workflow but worth noting. Human: verify this is intentional.

> **Test growth:** 2,441 tests pass across 159 files — up +209 tests and +16 files from the last report (2,232 / 143). Strong coverage growth.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 15.69s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (same as last report) |
| **Tests** | ✅ PASS | 2,441 tests across 159 files, all pass |
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
| TypeScript lines | 165,719 | 172,317 | **DRIFT** (+3.98%) — auto-fixed |
| Commits | 197 | 129 | **ERROR** (force-push history rewrite) — auto-fixed |
| Test files | 144 | 160 | **DRIFT** (+11.1%) — auto-fixed |
| Firestore collections | 36 | 36 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

Same 5 files as last report — all historical PR log references, not live path references. No action needed.

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06 |

### Nav Accuracy

Code nav matches MASTER_OUTLINE items. Same minor ordering discrepancy as last report: "Ask AI" is last in `AppShell.tsx` but listed between Books and Game Workshop in MASTER_OUTLINE. All items present; ordering-only gap, not auto-fixed.

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI  
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

No new collection helpers found outside CLAUDE.md. All 36 match. ✅

### Task Types — Registry vs SYSTEM_PROMPTS.md

`chat` and `generate` tasks both route to `chatHandler.ts` (not individual task files) — the charter check correctly shows these handle via `buildContextForTask`. All 17 task types accounted for. ✅

### Unindexed Docs

| File | Status |
|------|--------|
| `WRITING_SPELLING_DESIGN.md` | **NOT INDEXED** — newly detected. Added to DOCUMENT_INDEX.md (auto-fixed). |

### Stale Docs (marked CURRENT but >30 days since last commit)

| File | Last Updated | Days | Action |
|------|-------------|------|--------|
| `docs/investigations/backend-reliability-assessment.md` | 2026-04-12 | 51 days | STALE-CHECK: verify content still accurate or mark HISTORICAL |

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report | Flag |
|-------|------|------------------------|------|
| 2,620 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 | Known debt — stable |
| 2,540 | `functions/src/ai/chat.ts` | +74 | Growing — decomposition target |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 | Known debt — stable |
| 2,161 | `src/features/quest/useQuestSession.ts` | **+291** | ⚠️ NEW: crossed 2,000L — see Decomposition Candidates |
| 1,824 | `src/features/avatar/MyAvatarPage.tsx` | +20 | Stable |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 | Stable |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +44 | Stable |
| 1,544 | `functions/src/ai/contextSlices.ts` | **NEW >1500** | Growing — watch |
| 1,376 | `src/features/records/records.logic.test.ts` | — | Test file — OK |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | — | — |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | — | — |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | — | Test file — OK |
| 1,155 | `src/features/records/RecordsPage.tsx` | — | — |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | — | — |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | — | — |
| 1,096 | `src/features/today/TodayPage.tsx` | — | — |
| 1,070 | `src/features/today/TodayChecklist.tsx` | — | — |
| 1,065 | `src/features/quest/ReadingQuest.tsx` | — | — |
| 1,050 | `functions/src/ai/evaluate.ts` | — | — |
| 1,040 | `src/features/today/KidTodayView.tsx` | — | — |

## Decomposition Candidates

| File | Lines | Priority | Notes |
|------|-------|----------|-------|
| `useQuestSession.ts` | 2,161 | HIGH | Crossed 2,000L this cycle (+291 lines). Quest, comprehension, fluency all in one hook — CLAUDE.md already names this as debt. Splitting by quest domain is the right move. |
| `chat.ts` (CF) | 2,540 | HIGH | `buildQuestPrompt` alone is 400+ lines. CLAUDE.md notes highest-leverage decomp: extract prompt builders to separate files. Grew +74 this cycle. |
| `contextSlices.ts` | 1,544 | MEDIUM | New >1500 entry. Contains all per-task context loading — growing with each new task type. |
| `PlannerChatPage.tsx` | 2,620 | LOW | Stable (+0). State management is ~1,700L. Known debt, no urgency. |

---

## Issues Found

### Auto-Fixed
- Updated MASTER_OUTLINE.md TypeScript lines: 165,719 → 172,317
- Updated MASTER_OUTLINE.md commits: 197 → 129 (force-push history rewrite noted)
- Updated MASTER_OUTLINE.md test files: 144 → 160
- Added `WRITING_SPELLING_DESIGN.md` to DOCUMENT_INDEX.md

### Needs Human Attention

1. **Forced push to `origin/main`** — `git fetch` showed a forced update: `+ 237bfda...dd702d2 main -> origin/main`. Commit count dropped from 197 → 129. Verify this was intentional.

2. **`useQuestSession.ts` crossed 2,000 lines** (+291 this cycle, now 2,161L). CLAUDE.md named this as a decomposition target — tracking says "consider splitting by quest domain." Now above the 2,000L threshold. Recommend assigning a decomposition run.

3. **Lint warnings** (3) — `sessionTimer` dependency omissions in `EvaluateChatPage.tsx:282`, `useQuestSession.ts:779`, and `useQuestSession.ts:2026`. Intentional omissions but should get `eslint-disable-next-line` suppressions to keep lint clean.

4. **Stale doc** — `docs/investigations/backend-reliability-assessment.md` marked CURRENT but last updated 2026-04-12 (51 days ago). Verify if still accurate or change status to HISTORICAL.

5. **Bundle size 3.7MB** — main chunk is 3,878 kB (1,142 kB gzip). Route-level React.lazy splitting would reduce initial load. Heaviest imports: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.

6. **Dead exports in `src/core/types/`** — grep found unexported symbols that may be unused (verify before removing — could be test-only or dynamic imports):
   - `ReadingTags`, `MathTags`, `ALL_SKILL_TAGS` in `skillTags.ts`
   - `WorkingLevelSource`, `QuestOutcome` in `evaluation.ts`
   - 10 zod schema exports in `zod.ts` (`subjectBucketSchema`, `engineStageSchema`, `evidenceTypeSchema`, `dayBlockTypeSchema`, `checklistItemSchema`, `dayBlockSchema`, `artifactTagsSchema`, `artifactSchema`, `dayLogSchema`, `weekPlanSchema`) — confirm these are used in tests only or remove

---

## Charter Alignment

All 17 chat task types verified. `chat` and `generate` both route to `chatHandler.ts` which calls `buildContextForTask` (includes charter context slice). The 15 dedicated task files that were checked all reference charter context via `buildContextForTask` or `CHARTER_PREAMBLE`. ✅

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 15 | quest |
| 13 | planner-chat |
| 13 | avatar |
| 12 | today |
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

Zero-test features are primarily UI pages (progress tabs, login flow, auth guard, 404) where vitest coverage is low-value compared to Firestore integration behavior. `dad-lab` is the only zero-test feature with meaningful business logic — flagging for future test run assignment.

---

## Dependency Notes

- `npm audit --production`: **0 vulnerabilities** ✅
- npm v10.9.7 installed; v11.16.0 available (major) — low priority upgrade
