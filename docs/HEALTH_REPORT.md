# Code Health Report — 2026-06-06

## Metrics

| Metric | Value | Change from last report (2026-06-03) |
|--------|-------|--------------------------------------|
| **Total lines** | **176,171** | +335 |
| **Commits (main)** | **124** | +4 |
| **Test files** | **169** | +1 |
| **Tests passing** | **2,554** | +10 |
| **Tests total** | **2,554** | +9 (0 skipped, 0 failing) |
| **Firestore collections** | **37** | +0 |
| **Cloud Functions** | **25** | +0 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,904 kB / 1,150 kB gzip** | +3 kB |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 14.25s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (unchanged from last 3 reports) |
| **Tests** | ✅ PASS | 2,554 passing, 0 skipped, 0 failing |
| **TypeScript** | ✅ PASS | Implied by clean build |
| **npm audit (prod)** | 🚨 2 HIGH | **react-router** — see Issues below |

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

| Claim | Doc value (prev) | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 175,836 | 176,171 | **DRIFT** (+335, +0.2%) — auto-fixed |
| Commits | 120 | 124 | **DRIFT** (+4) — auto-fixed |
| Test files | 168 | 169 | **DRIFT** (+1) — auto-fixed |
| Firestore collections | 37 | 37 | ✅ OK |
| Cloud Functions | 25 | 25 | ✅ OK |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

Same 5 files as previous reports — all historical PR log references, not live path references. No action needed.

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06 |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06 |

### Nav Accuracy

Code nav matches MASTER_OUTLINE. Same ordering-only gap as prior reports: "Ask AI" is last in `AppShell.tsx` vs mid-list in MASTER_OUTLINE. All items present. ✅

**Parent (code order):** Today, Plan My Week, Weekly Review, Progress, Records, Books, Game Workshop, Dad Lab, Settings, Ask AI
**Kid (code order):** Today, Knowledge Mine, My Books, Books About Me, My Hero, My Stuff, Game Workshop, Dad Lab

### Collections — CLAUDE.md vs Code

All 37 collection helpers in `firestore.ts` are documented. ✅

### Task Types — Registry vs SYSTEM_PROMPTS.md

All 17 task types documented in `docs/SYSTEM_PROMPTS.md`. `chat` and `generate` both route to `chatHandler.ts` — charter context injected via `buildContextForTask`. ✅

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
| 2,161 | `src/features/quest/useQuestSession.ts` | +0 | **Third consecutive report above 2,000L** |
| 1,875 | `src/features/avatar/MyAvatarPage.tsx` | +0 | Stable |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | +0 | Stable |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 | Stable |
| 1,566 | `functions/src/ai/contextSlices.ts` | +0 | Stable |
| 1,500 | `src/features/records/records.logic.test.ts` | +18 | Test file — OK |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | +0 | — |
| 1,251 | `src/features/records/RecordsPage.tsx` | **+92** | Growing — watch |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | +0 | — |
| 1,156 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +0 | Test file — OK |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | +0 | — |
| 1,112 | `src/features/today/TodayChecklist.tsx` | +0 | — |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 | — |
| 1,103 | `src/features/today/TodayPage.tsx` | +0 | — |
| 1,065 | `src/features/quest/ReadingQuest.tsx` | +0 | — |
| 1,054 | `src/features/today/KidTodayView.tsx` | +0 | — |
| 1,050 | `functions/src/ai/evaluate.ts` | +0 | — |
| 918 | `functions/src/ai/tasks/monthlyReviewData.ts` | new entry | — |
| 913 | `src/features/avatar/voxel/buildArmorPiece.ts` | new entry | — |
| 908 | `functions/src/ai/chat.test.ts` | new entry | — |

## Decomposition Candidates

| File | Lines | Priority | Notes |
|------|-------|----------|-------|
| `useQuestSession.ts` | 2,161 | HIGH | Third consecutive report above 2,000L. No growth but no progress. Quest/comprehension/fluency/encoding all in one hook. |
| `chat.ts` (CF) | 2,544 | HIGH | `buildQuestPrompt` alone is 400+ lines. Extract prompt builders to `tasks/` files. |
| `RecordsPage.tsx` | 1,251 | WATCH | +92 this cycle — notable growth. |
| `contextSlices.ts` | 1,566 | MEDIUM | Stable this cycle. Growing with each new task type. |
| `PlannerChatPage.tsx` | 2,627 | LOW | Stable. State management ~1,700L. Known debt, no urgency. |

---

## Issues Found

### Auto-Fixed
- Updated MASTER_OUTLINE.md TypeScript lines: 175,836 → 176,171
- Updated MASTER_OUTLINE.md commits: 120 → 124
- Updated MASTER_OUTLINE.md test files: 168 → 169

### Needs Human Attention

1. **🚨 react-router HIGH security vulnerabilities (NEW — was 0 production vulns last report)** — `npm audit --production` now shows 2 HIGH + 2 moderate in `react-router` (7.0.0–7.14.2 affected):
   - GHSA-49rj-9fvp-4h2h: Arbitrary constructor invocation via TYPE_ERROR deserialization (potential unauth RCE)
   - GHSA-2j2x-hqr9-3h42: Open redirect via protocol-relative URL
   - GHSA-8x6r-g9mw-2r78: DoS via unbounded path expansion in `__manifest`
   - GHSA-rxv8-25v2-qmq8: DoS via reflected user input in single-fetch
   - `npm audit fix` reports a safe non-breaking fix is available. Run `npm audit fix`, verify build + tests pass, then push. **Production dependency — prioritize.**

2. **`useQuestSession.ts` at 2,161 lines — third consecutive report above threshold** — No growth but no assigned decomposition run. Recommend scheduling the split (quest / comprehension / fluency / encoding) soon.

3. **`RecordsPage.tsx` grew +92 lines this cycle** — Now 1,251 lines. Worth watching before it becomes a decomposition problem.

4. **Lint warnings** (3, unchanged for 3+ reports) — `sessionTimer` dependency omissions. Add `eslint-disable-next-line react-hooks/exhaustive-deps` to clean up. Locations:
   - `src/features/evaluate/EvaluateChatPage.tsx:282`
   - `src/features/quest/useQuestSession.ts:779`
   - `src/features/quest/useQuestSession.ts:2026`

5. **Bundle size 3.9MB** — Route-level React.lazy splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.

6. **Dead exports in `src/core/utils/`** — Detected by grep scan. Verify before removing (may be used in tests or dynamic imports):
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

- **react-router**: 2 HIGH + 2 moderate production vulnerabilities. Safe fix available via `npm audit fix`. Priority upgrade.
- **npm**: New major version available (10.9.7 → 11.16.0) — cosmetic, no urgency.
- **Dev-only vulnerabilities**: 9 total (8 moderate, 1 critical) — same as last report. Not production-exposed.
