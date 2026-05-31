# Architecture Audit — 2026-06

**Auditor:** Claude Code (scheduled monthly)
**Date:** 2026-05-31
**Covers period:** 2026-05-29 → 2026-05-31 (first monthly audit; follow-on to the 2026-05 inaugural audit)
**Previous audit:** `ARCHITECTURE_AUDIT_2026-05.md` (2026-05-29)

---

## Step 0 — Baseline

> npm install required on fresh clone (expected in remote execution environment). All checks green after install.

| Check | Status | Notes |
|---|---|---|
| Root `npm run lint` | ✅ PASS | 3 warnings — all LINT-01 (intentional timer-ref pattern) |
| Root `npx tsc -b` | ✅ PASS | Clean |
| Root `npx vitest run` | ✅ PASS | **162 files, 2,595 tests** (+164 tests since 2026-05-30 report) |
| Functions `npm run lint` | ✅ PASS | Clean |
| Functions `npx tsc --noEmit` | ✅ PASS | Clean |
| Functions `npm test` | ✅ PASS | **22 files, 418 tests** |

Baseline is green. Audit proceeds.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large Files (>1,500L)

| File | Lines | vs Last Audit | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,620 | +0 | Tangled — ARCH-02 OPEN. ~1,700L interconnected wizard/chat/plan/apply state. Stable, no urgency. |
| `functions/src/ai/chat.ts` | 2,478 | +12 | Tangled — ARCH-01 OPEN. Slow growth. `buildQuestPrompt` 400+L still inline. |
| `src/features/books/BookEditorPage.tsx` | 2,278 | +0 | Cohesive-but-big — ARCH-03 OPEN. Clear section boundaries; low urgency. |
| `src/features/quest/useQuestSession.ts` | 1,870 | +0 | Tangled — ARCH-04 OPEN. 4 quest types (comprehension, fluency, word, blocker) in one hook. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,804 | +0 | Cohesive-but-big. Forge + portal + ceremony flow. Stable. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | +0 | Cohesive-but-big. Phase-based rendering, 3 game types. Stable. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,562 | +0 | Three.js render loop — risky to split. Leave as-is. |

**Approaching threshold — watch list (1,000–1,500L):**

| File | Lines | vs Last Audit | Flag |
|---|---|---|---|
| `functions/src/ai/contextSlices.ts` | 1,485 | **+160** | **DRIFT ALERT** — crossed +150L threshold. Grew with curriculum map, portal, monthly-review slices. |
| `src/features/shelly-chat/useShellyChatFlows.ts` | 1,123 | **new** | **SILENT GROWTH** — extracted from ShellyChatPage (healthy), but itself now a large single-file handler cluster with 19 functions. Not in last audit's large-file list. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | +0 | Stable test-companion file. |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | +0 | Stable. |
| `src/features/records/RecordsPage.tsx` | 1,155 | +19 | Minor growth. |

**Seams for ARCH-01 (`chat.ts`):**
- Extract `buildQuestPrompt` + subfunctions (lines ~944–1784) → `tasks/questPromptBuilder.ts`
- Extract `buildStoryPrompt` + related (lines ~1786–2478) → `tasks/storyPromptBuilder.ts`
- Both are pure functions with no CF side effects — safe to move

**Seams for ARCH-02 (`PlannerChatPage.tsx`):**
- Wizard state (~lines 100–500) → `usePlannerWizardState`
- Plan application (~lines 700–900) → `usePlanApply`
- Interconnected `wizardStep` ↔ `planDoc` ↔ `messages` refs make further splitting high-risk without a clear seam contract

**New: `contextSlices.ts` decomposition candidates (ARCH-14):**
- Context slice loading functions are grouped by domain already
- Could split: `contextSlices.avatar.ts`, `contextSlices.books.ts`, `contextSlices.curriculum.ts`, `contextSlices.core.ts`
- This is an architectural decision, not a safe refactor until tested seam-by-seam

### 1.2 Bundle (ARCH-05)

**Current:** `index-*.js` = **3,836 kB / 1,130 kB gzip** (effectively unchanged)

Three dynamic/static import conflicts prevent any chunk splitting:
1. `firebase/firestore` — dynamically imported by 6 files but statically imported by ~90 others; the static imports pin it to the main chunk
2. `compressImage.ts` — dynamically imported by PhotoCapture but statically by 3 others
3. `sightWordMastery.ts` — similar conflict

**Root blocker (ARCH-08):** `AvatarThumbnail.tsx` imports Three.js at startup via `AppShell.tsx:15`, `ContextBar.tsx:14`, `ChildSelector.tsx:10`. Until AvatarThumbnail is either lazy-loaded or replaced with a static image fallback, Three.js cannot be split from the main chunk.

**Proposed 4-step plan** (from 2026-05 audit §1.2, unchanged):
1. Replace `AvatarThumbnail` with a static placeholder image (or wrap in `React.lazy`) to break Three.js from AppShell
2. Apply `React.lazy` + `Suspense` to heavy routes: `/avatar`, `/quest`, `/books/editor`, `/records`
3. Address firebase static imports (convert to dynamic where feasible)
4. Add Vite `manualChunks` for Three.js + jsPDF

Estimated initial-load reduction: ~1.5MB uncompressed / ~400 kB gzip if Three.js + route-level splits land.

### 1.3 Test Coverage (TEST-01)

| Feature | Test Files | Status |
|---|---|---|
| `shelly-chat` | **9** | ✅ Well covered (parseChatActions, parseFollowups, parseFriction, reflectionSuggestions, useShellyChatState, useShellyChatActions, formatRelativeTime, logFeatureRequest, ShellyChatPage shell) |
| `books` | 21 | ✅ Good |
| `planner-chat` | 13 | ✅ Good |
| `avatar` | 12 | ✅ Good |
| `today` | 11 | ✅ Good |
| `evaluate` | 4 | ✅ Basic coverage |
| `progress` | **0** | ⚠️ Open |
| `evaluation` | **0** | ⚠️ Open |
| `dad-lab` | **0** | ⚠️ Open |

**TEST-01 update:** `shelly-chat` confirmed fully addressed (9 files, 57+ tests). Status bumped to ADDRESSED for shelly-chat. Remaining 0-test features:

- **`progress`** — `DispositionProfile.tsx` contains AI-narrative parsing + parent-override merge logic. The `getDispositionNarrative` logic is testable without UI. **Highest leverage** next test target.
- **`evaluation`** (SkillSnapshotPage) — manual edit path writes `setDoc` inline; testing the merge logic has value. Second priority.
- **`dad-lab`** — mostly Firestore + AI calls; limited pure logic to test. Lower priority.

**TEST-02 (flake):** `BookEditorPage.cover.test.tsx` — nondeterministic under full-suite load. Still OPEN. Proposed fix: `vi.useFakeTimers()` + `await nextTick()` around the async cover render assertion.

### 1.4 Migrations / Deprecations

**WorkbookConfig → ActivityConfig (ARCH-06):**
Live ref count: **30 refs across 8 files** (down from 34 in ledger — 4 removed in recent cleanup)

| File | Refs |
|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 10 |
| `src/features/planner-chat/PlannerCompactSetup.tsx` | 4 |
| `src/features/planner-chat/PhotoLabelForm.tsx` | 4 |
| `src/features/planner-chat/PlannerSetupWizard.tsx` | 3 |
| `src/core/firebase/firestore.ts` | 5 |
| `functions/src/ai/workbookActivityConfigBackfill.ts` | 2 |
| `src/core/hooks/useScanToActivityConfig.ts` | 1 |
| `src/core/firebase/migrateActivityConfigs.ts` | 1 |

**Assessment:** Migration is NOT safe to complete yet. The planner cluster accounts for 21/30 refs and actively reads workbook paces for plan generation. `firestore.ts` still exports the `workbookConfigsCollection` helper. Complete migration requires: (a) planner migrated to read activityConfigs exclusively, (b) firestore.ts helper removed, (c) backfill util archived. This is a multi-PR effort. Update ledger count to 30.

**Ladder deprecation (ARCH-07):**
- ARCH-07 PR #1263 IN PROGRESS — UI surfaces, `/ladders` redirect, `ladders/` directory deletion. Awaiting merge.
- Data layer retained intentionally: `ladderRef` tag, `ladderProgress` collection, `Ladder*` types in `common.ts`, `planning.ts`
- **Dead collection query** — `functions/src/ai/generate.ts:421` still queries `families/${familyId}/ladders` collection that is never written to. Confirmed live in code. CLAUDE.md calls this out but no fix PR yet. Safe to remove as a standalone 5-line cleanup.
- The `ladderRef` forward in `rollover.ts:76` and `TeachHelperDialog.tsx:174` are intentional (preserving tag from plan → artifact).

**ARCH-12 (inline skillSnapshot writers):**
Three writers still bypass `skillSnapshotWrites.ts`:
- `EvaluateChatPage.tsx:608` — `setDoc(snapshotRef, ..., { merge: true })` after eval apply
- `EvaluateChatPage.tsx:496,611` — `updateDoc` for updatedAt
- `useQuestSession.ts:876,941` — `setDoc` after quest completion
- `SkillSnapshotPage.tsx:100,119` — `setDoc` for manual snapshot creation/edit

The central `writeSnapshotUpdate` in `skillSnapshotWrites.ts:166` exists and is clean. Migration of these 3 files = ARCH-12 scope.

### 1.5 Drift Since Last Audit

| File | Last Audit | Current | Delta | Flag |
|---|---|---|---|---|
| `functions/src/ai/contextSlices.ts` | 1,325 | 1,485 | **+160** | ⚠️ Crossed +150L threshold |
| `functions/src/ai/chat.ts` | 2,466 | 2,478 | +12 | Minor |
| `src/features/records/RecordsPage.tsx` | 1,136 | 1,155 | +19 | Minor |
| `src/features/shelly-chat/useShellyChatFlows.ts` | (new) | 1,123 | n/a | New file, watch list |
| `src/features/shelly-chat/ShellyChatPage.tsx` | (reported 1,653 in HEALTH_REPORT) | **645** | — | HEALTH_REPORT stale — reflects pre-decomposition count |

**DOC correction (mechanical):** `docs/HEALTH_REPORT.md` lists `ShellyChatPage.tsx` as 1,653L and shows it in the decomposition-candidates table. The file is now 645L (post-ARCH-09 decomposition). The health report was generated before the decomposition PRs merged. **Applied directly** — updated HEALTH_REPORT.md to reflect actual line count and remove from decomposition-candidates.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01: Where is Lincoln?

**Status: RESOLVED-WITH-DECISION** (Model 2, 2026-05-30 — `DECISION_FUNC-01_source_of_truth.md`)

Authority map adopted:
- `skillSnapshots` = authoritative current academic state (skills, blocks, working levels)
- `children` = stable identity + soft profile (motivators, interests, strengths)
- `childSkillMaps` = curriculum coverage (read-only from Shelly's perspective)
- `activityConfigs` = curriculum position / pace
- Disposition = derived narrative, not authoritative
- Milestones = computed
- Ladders = deprecated

**Outstanding ARCH-12:** The decision named `skillSnapshotWrites.ts` as the central write path, but 3 sources still write directly. Until ARCH-12 is closed, a bug in any of those 3 inline writers could silently diverge from the central module's invariants (additive, no-downgrade, idempotent).

### 2.2 Loop Integrity: Evaluation → Plan → Today → Review

Traced one complete path:

1. **Scan → skillSnapshot:** ✅ FUNC-02 FIXED. `useCertificateProgress` → `skillSnapshotWrites.applyToSnapshot` → `writeSnapshotUpdate`. Idempotent, additive.

2. **Eval chat → skillSnapshot:** ⚠️ `EvaluateChatPage.tsx:608` writes inline with `setDoc(..., { merge: true })`. Not through central module. Risk: if the central module's invariants ever change, this path diverges silently. Tracked as ARCH-12.

3. **skillSnapshot → planner:** ✅ `PlannerChatPage.tsx` reads skillSnapshot via the `plan` context slice in `contextSlices.ts`. Planner AI sees the snapshot.

4. **Planner → daily checklist:** ✅ `useDailyPlan.ts` loads the saved `dailyPlans` doc. TodayChecklist renders from it.

5. **Today → weekly review:** ✅ `assembleWeekContext` (in `evaluate.ts`) reads `dayLogs`, `hours`, `plans`, `books`, `teachBacks`, `missedDays`. Evidence is assembled for the AI reviewer.

6. **Weekly review → planner (next cycle):** ✅ `PlannerChatPage.tsx` reads `weeklyReviews` as part of plan context. The `weeklyFocus` task slice includes `weeklyFocus` data.

**Loop assessment:** No dead ends found. The single structural gap is the eval-chat inline writer (ARCH-12) which could allow a subtle divergence, but the loop itself is connected end-to-end.

### 2.3 Shelly's Path

Energy selector → plan → today checklist → today completion → weekly review → planner next week.

- **No shame language** found in AI prompts (evaluated `plan.ts`, `evaluate.ts`, `scan.ts`, `quest.ts`).
- **MVD path** functional — `PlanType.Mvd` renders a shorter checklist, both modes count as real school.
- **Bad day / dead-end check:** When a plan day is incomplete, `rollover.ts` carries unchecked items forward rather than dropping them. No silent drops.
- **Typing demand check:** TodayChecklist uses checkbox taps + optional capture buttons. UnifiedCaptureCard has tap-to-record (audio-first). No mandatory text entry on the core today loop.
- **One UX concern (low):** The planner setup wizard (`PlannerSetupWizard.tsx`) has 4 steps before a plan generates. On a tired day this may feel like friction. Not a code issue — a UX observation.

### 2.4 Kid Voice-First

- `KidTodayView` / `KidChecklist` — tap completion, no required typing ✅
- `KidTeachBack` — voice record primary ✅
- `KidChapterPool` — tap answer options ✅
- `KidConundrumResponse` — voice + tap ✅
- `KidExtraLogger` — tap-to-add capture ✅

Kid surfaces honor taps-over-typing.

---

## Step 3 — Pedagogy & Ethos (Band 3)

### 3.1 Charter Preamble Coverage

**ETHOS-01 CONFIRMED OPEN.** Five task types are missing `'charter'` in their `TASK_CONTEXT` slice list (`contextSlices.ts:56-67`):

| Task | Charter in TASK_CONTEXT | Risk |
|---|---|---|
| `generateStory` | ❌ | High — generates child-facing content |
| `reviseStory` | ❌ | High — same |
| `revisePage` | ❌ | High — same |
| `quest` | ❌ | Medium — comprehension questions for Lincoln |
| `scan` | ❌ | Low — curriculum detection, not child-facing content |

The fix is mechanical: add `"charter"` as the first element in each of these 5 slice arrays. Estimated impact: 3–5 lines in `contextSlices.ts`. **This is the highest-leverage, lowest-risk ETHOS fix available.**

### 3.2 "Diamonds Not Scores"

- XP system uses diamond metaphor throughout. No numeric scores surfaced to kids.
- Disposition profile uses narrative language, not letter grades. ✅
- Weekly review references "growth" not "grades." ✅

### 3.3 Coverage-Not-Pace Language

Scanned `scan.ts`, `quest.ts`, `plan.ts`, `evaluate.ts`. No pace-pressure language found. Charter preamble drives framing when it reaches the task. The 5 tasks without charter are a gap, not a confirmed violation — those prompts don't actively contain pressure language, but they also lack the charter guardrail.

---

## Step 4 — Data Integrity & Compliance (Band 4)

### DATA-01: Core Hours (FIXED)

**Confirmed closed.** `MonthlyTrend.tsx:29` calls `computeMonthlyTrend()` from `records.logic.ts`, which shares `dayLogMinuteContributions` with `computeHoursSummary`. The invariant guard test in `records.logic.test.ts` asserts cumulative core === `computeHoursSummary().coreMinutes` for a fixed dataset. No divergence possible.

### DATA-02: Duplicate Backfill (NEEDS-DATA)

Unchanged. Suspected duplicate near-identical 5-subject batches dated 2025-07-15 and 2025-08-15 in `hoursAdjustments`. Requires live Firestore export to confirm. No in-repo fix possible. Keep as NEEDS-DATA.

### DATA-03: Firestore Backups (RESOLVED)

Confirmed. Firebase console: daily backups on, 98-day retention. RESOLVED.

### Additive-Hours Invariant Check

New code since last audit:
- `computeMonthlyTrend` added to `records.logic.ts` — shares extractor with `computeHoursSummary`, guarded by test ✅
- `ARCH-11` (errorLog collection) — new collection, family-scoped, no hours involvement ✅
- `featureRequests` collection — global feedback metadata, no hours involvement ✅

No new view or function added since last audit that bypasses the additive-hours invariant.

---

## Step 5 — Summary & Ledger

### New Findings

| ID | Band | Finding | Evidence |
|---|---|---|---|
| **ARCH-13** | 1 | `useShellyChatFlows.ts` at 1,123L — new file, silent growth since ShellyChatPage decomposition. 19 handler functions: send/response cluster, image gen/refine, image analysis/upload, thread CRUD. Not yet causing problems but watch it. **Seams if needed:** image cluster (lines ~300–550), thread CRUD (lines ~900–1050). | `src/features/shelly-chat/useShellyChatFlows.ts` |
| **ARCH-14** | 1 | `contextSlices.ts` grew from 1,325L → 1,485L (+160L since last audit), crossing the +150L drift threshold. Contains loading functions for 20+ slice types. **Candidate seams:** domain-group the loaders into `contextSlices.curriculum.ts`, `contextSlices.books.ts`, `contextSlices.family.ts`, keeping `contextSlices.ts` as a thin re-export/TASK_CONTEXT registry. Architectural decision required before splitting. | `functions/src/ai/contextSlices.ts` |
| **DOC-03** | 1 | `docs/HEALTH_REPORT.md` lists `ShellyChatPage.tsx` at 1,653L in both the large-file table and decomposition-candidates table. Actual size is **645L** (post-ARCH-09 decomposition). Mechanical doc correction — applied in this audit run. | `docs/HEALTH_REPORT.md` large-file table |

### Status Updates to Existing Ledger Items

| ID | Previous | Updated | Evidence |
|---|---|---|---|
| DATA-01 | FIXED | **FIXED** (confirmed) | `MonthlyTrend.tsx:29`, `records.logic.ts` shared extractor |
| DATA-03 | RESOLVED | **RESOLVED** (confirmed) | Firebase daily backups, 98-day retention |
| TEST-01 | PARTIALLY ADDRESSED | **shelly-chat: 9 files / 57+ tests — ADDRESSED for shelly-chat.** Remaining 0-coverage: `progress`, `evaluation`, `dad-lab` | `src/features/shelly-chat/*.test.*` |
| ARCH-06 | OPEN (34 refs) | **OPEN — 30 refs** (4 removed in recent cleanup) | 8 files, planner cluster dominant |
| ARCH-07 | IN PROGRESS | **IN PROGRESS** (awaiting PR #1263 merge). Dead `generate.ts:421` ladder-collection query still present — 5-line safe removal. | `functions/src/ai/generate.ts:421` |

### Recommended Next Fix Runs (PROMPT_FIX.md)

**Priority order:**

1. **ETHOS-01** — Add `"charter"` to `TASK_CONTEXT` for `generateStory`, `reviseStory`, `revisePage`, `quest`, `scan` in `contextSlices.ts`. ~5 lines, zero risk, closes a values guardrail gap on user-facing content generation. Highest leverage per line of change.

2. **ARCH-12** — Migrate 3 inline `skillSnapshot` writers (`EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage`) onto `writeSnapshotUpdate` from `skillSnapshotWrites.ts`. Makes the `skillSnapshot` authority model actually enforced in code, not just declared in the decision doc.

3. **ARCH-07** (dead ladder query) — Remove the 5-line dead `ladders` collection query from `functions/src/ai/generate.ts:421–430`. Safe, requires no design decisions.

---

*Report generated by scheduled monthly audit. All findings are proposals — no invariant-touching or structural changes applied here. Mechanical doc corrections (HEALTH_REPORT.md ShellyChatPage line count) applied directly as authorized by the audit prompt.*
