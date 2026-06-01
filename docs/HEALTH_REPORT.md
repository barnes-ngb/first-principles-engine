# Code Health Report — 2026-06-01

## Metrics

| Metric | Value | Change from last report (2026-05-30) |
|--------|-------|--------------------------------------|
| **Total lines** | **165,719** | +4,867 |
| **Commits (main)** | **197** | +62 |
| **Test files** | **144** | +19 |
| **Tests passing** | **2,232** | −199 ⚠️ |
| **Test files running** | **143** | −2 ⚠️ |
| **Firestore collections** | **36** | +2 |
| **Cloud Functions** | **25** | +1 |
| **Chat task types** | **17** | +0 |
| **Routes** | **33** | +0 |
| **Bundle size** | **3,841 kB / 1,132 kB gzip** | +0 |

> **Test count note:** 2,232 tests pass across 143 vitest files. Last report recorded 2,431 tests across 145 files. The drop (−199 tests, −2 files) coincides with recent Shelly Chat decomposition PRs (#1274/#1277) and Tier C Option 2 (PR #1305). All 2,232 current tests pass cleanly. Human should verify test restructuring was intentional and no coverage regressed.

> **Commit count note:** `git rev-list --count HEAD` on a branch rooted at `origin/main` = 197. Previous report used main-branch squash count of 135. Both are valid; 197 reflects the actual linear count on current `origin/main`.

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean in 11.95s |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; 3 `react-hooks/exhaustive-deps` warnings (new since last report) |
| **Tests** | ✅ PASS | 2,232 tests across 143 files, all pass |
| **TypeScript** | ✅ PASS | `tsc -b` clean |
| **npm audit (prod)** | ✅ PASS | 0 production vulnerabilities |

### Lint Warnings

```
src/features/evaluate/EvaluateChatPage.tsx:282 — useEffect missing dep: sessionTimer
src/features/quest/useQuestSession.ts:679 — useCallback missing dep: sessionTimer
src/features/quest/useQuestSession.ts:1760 — useCallback missing dep: sessionTimer
```

All three are `sessionTimer` ref omissions. Not auto-fixable — adding `sessionTimer` to deps would cause re-subscription loops. Needs intentional suppression (`eslint-disable-next-line`) or refactor.

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value | Computed | Status |
|-------|-----------|----------|--------|
| TypeScript lines | 160,852 | 165,719 | **DRIFT** (+3%) — auto-fixed |
| Commits | 135 | 197 | **ERROR** (+46%) — auto-fixed |
| Test files | 125 | 144 | **ERROR** (+15%) — auto-fixed |
| Firestore collections | 34 | 36 | **ERROR** (+2) — auto-fixed |
| Cloud Functions | 24 | 25 | **ERROR** (+1) — auto-fixed |
| Chat task types | 17 | 17 | ✅ OK |
| Routes | 33 | 33 | ✅ OK |

### Missing File References

Same 5 files flagged as last report — all are historical PR log references, not live path references. No action needed.

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Expected — marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` | Expected — removed in UX P2.06, referenced in historical PR log |
| `QuickCaptureSection.test.tsx` | Expected — removed with parent component |
| `CreativeTimeLog.tsx` | Expected — removed in UX P2.06, referenced in historical PR log |

### Nav Accuracy

Code nav matches MASTER_OUTLINE items. Minor ordering discrepancy: "Ask AI" appears last in code (`AppShell.tsx`) but is listed between Books and Game Workshop in MASTER_OUTLINE. All items present — ordering-only gap, not auto-fixed.

### Collections — CLAUDE.md vs Code

Two collection helpers in `firestore.ts` were not in CLAUDE.md:

| Collection | Helper | Status |
|---|---|---|
| `errorLog` | `errorLogsCollection` | **Missing from CLAUDE.md** — added (companion fix) |
| `shellyChatMessages` | `shellyChatMessagesCollection` | Already documented as subcollection under `shellyChatThreads` |

MASTER_OUTLINE stat updated to 36 (was 34). CLAUDE.md collection table updated (companion fix).

### Unindexed Docs

6 docs in `docs/` not listed in DOCUMENT_INDEX.md — all added by companion fix:

| Doc | Classification |
|-----|---------------|
| `ARCH-10_rules_hardening_plan.md` | CURRENT — Firestore rules hardening recon, build pending |
| `LONDON_BACKLOG.md` | CURRENT — active London deferral register |
| `SESSION_TIMER_HOURS_2026-04-14.md` | HISTORICAL — shipped session-timer hours implementation doc |
| `SHELLY_PORTAL_CONTEXT.md` | CURRENT — Shelly portal code-verified recon reference |
| `SHELLY_PORTAL_FEEDBACK_LOOP.md` | CURRENT — friction log → GitHub issue feedback loop (shipped) |
| `barnes-shelly-chat-portal-design.md` | CURRENT — portal design doc (feature complete) |

### Stale Docs

No docs with CURRENT status were flagged as untouched 30+ days. ✅ OK

---

## Largest Files (over 500 lines)

| Lines | File | vs last report |
|-------|------|----------------|
| 2,620 | `src/features/planner-chat/PlannerChatPage.tsx` | unchanged |
| 2,478 | `functions/src/ai/chat.ts` | +12 |
| 2,278 | `src/features/books/BookEditorPage.tsx` | unchanged |
| 1,870 | `src/features/quest/useQuestSession.ts` | unchanged |
| 1,809 | `src/features/avatar/MyAvatarPage.tsx` | unchanged |
| 1,623 | `src/features/workshop/WorkshopPage.tsx` | unchanged |
| 1,562 | `src/features/avatar/VoxelCharacter.tsx` | unchanged |
| 1,485 | `functions/src/ai/contextSlices.ts` | unchanged |
| 1,376 | `src/features/records/records.logic.test.ts` | unchanged |
| 1,363 | `src/features/planner-chat/chatPlanner.logic.ts` | unchanged |
| 1,162 | `src/features/evaluate/EvaluateChatPage.tsx` | unchanged |
| 1,155 | `src/features/records/RecordsPage.tsx` | unchanged |
| 1,123 | `src/features/shelly-chat/useShellyChatFlows.ts` | unchanged |
| 1,106 | `src/features/settings/AvatarAdminTab.tsx` | unchanged |
| 1,096 | `src/features/today/TodayPage.tsx` | unchanged |

## Decomposition Candidates

No file crossed 2,000 lines for the first time since last report. Files already over 2,000:
- `PlannerChatPage.tsx` (2,620L) — documented tech debt, stable
- `chat.ts` (2,478L) — documented tech debt, `buildQuestPrompt` extraction target
- `BookEditorPage.tsx` (2,278L) — documented tech debt, stable

---

## Issues Found

### Auto-Fixed

- Updated MASTER_OUTLINE stats: lines 160,852→165,719, commits 135→197, test files 125→144, collections 34→36, CFs 24→25
- Added `errorLog` collection row to CLAUDE.md Firestore table
- Indexed 6 unindexed docs in DOCUMENT_INDEX.md

### Needs Human Attention

1. **TEST COUNT DROP** — 2,232 tests vs 2,431 last report (−199 tests, −2 files). All pass. Verify test restructuring in Shelly Chat decomposition + Tier C Option 2 PRs was intentional.

2. **3 lint warnings** (new since last report) — `sessionTimer` missing from deps in `EvaluateChatPage.tsx:282` and `useQuestSession.ts:679,1760`. Adding to deps risks re-subscription loops. Needs either `eslint-disable-next-line react-hooks/exhaustive-deps` with a comment, or refactor to `useRef`.

3. **Bundle size 3,841 kB** — unchanged. Route-level React.lazy splitting would reduce initial load. Heaviest: Three.js (avatar), jsPDF (print), curriculum map data. Architectural decision required.

4. **Dead exports in `src/core/types/`** — scan found candidates. Verify before removing (may be used in tests or dynamic imports):
   - `skillTags.ts`: `ReadingTags`, `WritingTags`, `MathTags`, `ALL_SKILL_TAGS`
   - `zod.ts`: 8 schema exports (`subjectBucketSchema`, `engineStageSchema`, `evidenceTypeSchema`, `dayBlockTypeSchema`, `checklistItemSchema`, `dayBlockSchema`, `artifactTagsSchema`, `artifactSchema`, `dayLogSchema`, `weekPlanSchema`)
   - `books.ts`: `getPresetTheme`, `resolveBookCreator`
   - `workshop.ts`: `PlaytestReaction`, `CardDifficulty`
   - `xp.ts`: `PIECE_POSITIONS`

---

## Charter Alignment

All task files in `functions/src/ai/tasks/` reference charter context (via `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext`). ✅ OK

---

## Test Coverage by Feature

| Tests | Feature |
|-------|---------|
| 21 | books |
| 13 | planner-chat |
| 12 | today |
| 12 | avatar |
| 9 | shelly-chat |
| 6 | quest |
| 5 | settings |
| 4 | evaluate |
| 2 | workshop |
| 2 | records |
| 2 | monthly-review |
| 1 | weekly-review |
| 1 | engine |
| **0** | **progress** |
| **0** | **planner** |
| **0** | **not-found** |
| **0** | **login** |
| **0** | **evaluation** |
| **0** | **dad-lab** |
| **0** | **auth** |

Zero-test features are mostly thin UI shells or routing wrappers. `progress` and `evaluation` have the most surface area with no direct test coverage.

---

## Dependency Notes

- npm audit (production): **0 vulnerabilities**
- npm audit (all deps): 8 moderate severity (dev-only dependencies)
- npm major upgrade available: npm 10.9.7 → 11.16.0 (optional, dev tooling only)
