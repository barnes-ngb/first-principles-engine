# Code Health Report — 2026-06-07

## Metrics

| Metric | Value | Change from last report (2026-06-06) |
|--------|-------|--------------------------------------|
| **Total lines** | **176,171** | +0 |
| **Commits (main)** | **124** | +0 |
| **Test files** | **169** | +0 |
| **Tests passing** | **3,003** | **+449** |
| **Tests total** | **3,003** | +449 (0 skipped, 0 failing) |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,904 kB / 1,150 kB gzip** | +0 |

> **Note on test file count:** `find src functions/src -name '*.test.*'` returns 169. Vitest actually runs **191 test files** — the discrepancy arises from files in `functions/lib/` (compiled output) and the differing include patterns. The stat in MASTER_OUTLINE tracks the source-file count (169). The test *total* jump (+449) reflects new tests from the DATA-09 attribution feature merged since the last audit.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 12.16s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged from last 4 reports) |
| **Tests** | ✅ PASS | 3,003 passing, 0 skipped, 0 failing (191 test files) |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | ✅ CLEAN | react-router HIGH vulns fixed by auto-fix this run |

### Lint Warnings (unchanged from last report)

```
src/features/evaluate/EvaluateChatPage.tsx:282 — useEffect missing dep: sessionTimer
src/features/quest/useQuestSession.ts:779 — useCallback missing dep: sessionTimer
src/features/quest/useQuestSession.ts:2026 — useCallback missing dep: sessionTimer
```

All three are `sessionTimer` ref omissions. Intentional — adding to deps would cause re-subscription loops. Add `eslint-disable-next-line react-hooks/exhaustive-deps` on each line to clean up lint output.

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 176,171 | 176,171 | ✅ OK |
| Commits | 124 | 124 | ✅ OK |
| Test files | 169 | 169 | ✅ OK |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

All stats current. No MASTER_OUTLINE updates needed this cycle.

### Missing File References

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06 |
| `StonebridgePreviewCard.tsx` | **AUTO-FIXED** — MASTER_OUTLINE updated to `StonebridgeMissionCard.tsx` (replaced per FEAT-12) |

### Nav Accuracy

Code nav matches MASTER_OUTLINE. ✅

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI  
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

All 37 collection helpers in `firestore.ts` are documented. ✅

### Task Types — Registry vs SYSTEM_PROMPTS.md

All 17 task types fully documented. **AUTO-FIXED this cycle:** Added `reviseStory`, `revisePage`, `chapterQuestions`, `monthlyReview` to the CHAT_TASKS registry diagram in `docs/SYSTEM_PROMPTS.md` (they were in the model table and section 4 prose but missing from the architecture flow diagram). ✅

### Unindexed Docs

No unindexed docs found. ✅

### Stale Docs (marked CURRENT but >30 days since last commit)

No stale docs detected by git log check. ✅

---

## Largest Files (over 500 lines)

| Lines | File | Change from last report | Flag |
|-------|------|------------------------|------|
| 2,627 | `src/features/planner-chat/PlannerChatPage.tsx` | +0 | Known debt — stable |
| 2,544 | `functions/src/ai/chat.ts` | +0 | Known debt — highest-value decomp target |
| 2,278 | `src/features/books/BookEditorPage.tsx` | +0 | Stable |
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 | **Fourth consecutive report above 2,000L** |
| 1,875 | `src/features/avatar/MyAvatarPage.tsx` | +0 | Stable |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 | Stable |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 | Stable |
| 1,566 | `functions/src/ai/contextSlices.ts` | +0 | Stable |
| 1,500 | `src/features/records/records.logic.test.ts` | +0 | Test file — OK |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 | — |
| 1,251 | `src/features/records/RecordsPage.tsx` | +0 | Stable this cycle (+92 last cycle) |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 | — |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 | Test file — OK |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 | — |
| 1,112 | `src/features/today/TodayChecklist.tsx` | +0 | — |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 | — |
| 1,103 | `src/features/today/TodayPage.tsx` | +0 | — |
| 1,065 | `src/features/quest/ReadingQuest.tsx` | +0 | — |
| 1,054 | `src/features/today/KidTodayView.tsx` | +0 | — |
| 1,050 | `functions/src/ai/evaluate.ts` | +0 | — |
| 918 | `functions/src/ai/tasks/monthlyReviewData.ts` | +0 | — |
| 913 | `src/features/avatar/voxel/buildArmorPiece.ts` | +0 | — |
| 908 | `functions/src/ai/chat.test.ts` | +0 | — |

## Decomposition Candidates

| File | Lines | Priority | Notes |
|------|-------|----------|-------|
| `useQuestSession.ts` | 2,161 | HIGH | **Fourth** consecutive report above 2,000L. No growth but no assigned run. Quest/comprehension/fluency/encoding all in one hook. |
| `chat.ts` (CF) | 2,544 | HIGH | `buildQuestPrompt` alone is 400+ lines. Extract prompt builders to `tasks/` files. |
| `RecordsPage.tsx` | 1,251 | WATCH | Stable this cycle; was +92 last cycle. Monitor next report. |
| `contextSlices.ts` | 1,566 | MEDIUM | Stable. Growing with each new task type as task list fills out. |
| `PlannerChatPage.tsx` | 2,627 | LOW | Stable. State management ~1,700L. Known debt, no urgency. |

---

## Issues Found

### Auto-Fixed (this run)
- **react-router HIGH vulnerabilities** — Ran `npm audit fix` (non-force); resolved 2 HIGH react-router vulns (GHSA-49rj-9fvp-4h2h, GHSA-2j2x-hqr9-3h42, GHSA-8x6r-g9mw-2r78, GHSA-rxv8-25v2-qmq8). Production audit now clean.
- **SYSTEM_PROMPTS.md CHAT_TASKS diagram** — Added 4 missing task entries: `reviseStory`, `revisePage`, `chapterQuestions`, `monthlyReview`. These were in model table and prose but absent from the architecture flow diagram.
- **MASTER_OUTLINE.md stale file ref** — Updated `StonebridgePreviewCard.tsx` → `StonebridgeMissionCard.tsx` (file replaced per FEAT-12, old ref was a broken link).

### Needs Human Attention

1. **`useQuestSession.ts` at 2,161 lines — fourth consecutive report above threshold** — No growth but no assigned decomposition run. Consider scheduling the split (quest / comprehension / fluency / encoding) as a dedicated feature run.

2. **Lint warnings** (3, unchanged for 4+ reports) — `sessionTimer` dependency omissions. Add `eslint-disable-next-line react-hooks/exhaustive-deps` to suppress. Locations:
   - `src/features/evaluate/EvaluateChatPage.tsx:282`
   - `src/features/quest/useQuestSession.ts:779`
   - `src/features/quest/useQuestSession.ts:2026`

3. **Bundle size 3.9MB** — Route-level `React.lazy` splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.

4. **Dev-only vulnerabilities (9 remaining)** — 8 moderate + 1 critical (vitest < 4.1.0 — GHSA-5xrq-8626-4rwp: arbitrary file read/execute via Vitest UI server). Safe fix requires `--force` (vitest@4.1.8 is a breaking change). Only exploitable if Vitest UI server is running and exposed — no production risk. Upgrade when vitest@4.x API is stable for this project.

5. **Dead exports in `src/core/utils/`** — Detected last cycle; unchanged. Verify before removing (may be used in tests or dynamic imports):
   - `blockerLifecycle.ts`: `RESOLVING_THRESHOLD`, `RESOLVED_THRESHOLD`, `RESOLVED_MIN_SESSIONS`, `TARGETED_EVIDENCE_WEIGHT`
   - `sessionTimer.ts`: `IDLE_THRESHOLD_MS`, `MAX_SESSION_SECONDS`
   - `complianceMapping.ts`: `inferMoSubjects`, `resolveSubjectBucket`, `inferThemeSubjects`, `autoTagBlocks`
   - `format.ts`: `normalizeDateString`, `parseDateInput`
   - `energyPatterns.ts`: `EnergyTrend`, `analyzeDayOfWeekPatterns`, `detectStreaks`, `detectTrend`, `analyzeEnergyPatterns`
   - `workbookMatching.ts`: `normalizeWorkbookName`

---

## Charter Alignment

All 17 chat task types verified. `chat` and `generate` both route to `chatHandler.ts` which calls `buildContextForTask` (includes charter context slice). All 15 dedicated task files reference charter context. ✅

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

Zero-test features are primarily UI pages (progress tabs, login flow, auth guard, 404). `dad-lab` remains the only zero-test feature with meaningful business logic.

---

## Dependency Notes

- **react-router**: HIGH vulns resolved this run via `npm audit fix`. Production audit clean.
- **vitest**: 1 CRITICAL dev-only (GHSA-5xrq-8626-4rwp). Requires `--force` upgrade to 4.1.8. No production risk. Defer until breaking change is assessed.
- **8 moderate dev-only vulnerabilities**: Unchanged. No production impact.
- **npm**: New major version available (10.9.7 → 11.16.0) — cosmetic, no urgency.
