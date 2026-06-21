# Architecture Audit — 2026-06-21 (mid-cycle supplement)

> **Type:** Monthly deep audit (mid-cycle run; the June 7 run `ARCHITECTURE_AUDIT_2026-06.md` was the primary).
> **Auditor:** Claude Code (claude-sonnet-4-6) · **Date:** 2026-06-21
> **Branch:** `claude/brave-feynman-72r93d` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here.

---

## Step 0 — Baseline

Commands run in the remote Claude Code environment:

```
npm run lint          → 3 warnings (LINT-01 react-hooks/exhaustive-deps, same three locations — no change)
npx tsc -b            → CLEAN
npx vitest run        → 2,835 tests passing (188 files)
cd functions && npm test → 464 tests passing (23 files)
npm run build         → dist/assets/index-*.js  3,955.73 kB │ gzip: 1,167.32 kB
```

**Baseline: GREEN.** No new failures introduced. Test suite grew +91 tests since the 2026-06-13 health
report (2,744 → 2,835 root; functions stable at 464). Bundle unchanged from health report (+39.7 kB /
+11.1 kB gzip since the 3,916 kB figure — within noise).

---

## Step 0.5 — Audit lenses carried forward

All three lenses from `PROCESS_OVERVIEW.md` and `PROMPT_ARCH_AUDIT.md` are applied across Steps 1–4.
Findings note which lens is triggered.

1. **Learning-loop integrity** — does capture → save+state-label → evaluate → plan → teach → re-evaluate
   actually close?
2. **Multi-kid generality** — is anything hard-coded to one kid (name/age branches)?
3. **MO→TX compliance** — are state rules/exports MO-hardcoded in a way that would block a clean TX toggle?

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large files (>1,500L)

| File | Lines | vs June 7 | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | **2,729** | +102L | Tangled — interconnected wizard/chat/plan/apply state; growing every cycle. ARCH-02 OPEN. |
| `functions/src/ai/chat.ts` | **2,548** | +4L | Tangled — `buildQuestPrompt` 400+L inline; other prompt builders similarly large. ARCH-01 OPEN. |
| `src/features/quest/useQuestSession.ts` | **2,161** | +0L (stable) | Tangled — 5 question pipelines (reading MC, math, build-word, spell-word, build-sentence). ARCH-04 OPEN. **Fourth consecutive report above 2,000L.** |
| `src/features/books/BookEditorPage.tsx` | **2,103** | −175L | Slightly decreased (likely FEAT-33 sticker extraction). Cohesive-but-big with clear section boundaries. ARCH-03 low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | **1,876** | stable | Cohesive — forge + portal + Stonebridge Banner Rally state all naturally co-located here. |
| `src/features/workshop/WorkshopPage.tsx` | **1,623** | stable | Cohesive — phase-based rendering delegates to sub-components. Not urgent. |
| `src/features/avatar/VoxelCharacter.tsx` | **1,606** | stable | Three.js render loop — splitting risky. Leave as-is per standing decision. |
| `functions/src/ai/contextSlices.ts` | **1,566** | +81L | **Silent growth** — +241L cumulative from first flag. Contains 20+ slice loaders. ARCH-14 OPEN. |

**Standing decomposition candidates:**

- **ARCH-01 (`chat.ts`)**: `buildQuestPrompt` alone ~400L; extract all `build*Prompt` functions to
  `functions/src/ai/tasks/prompts/` alongside their task handlers. Design-first, not a safe in-place edit.
- **ARCH-02 (`PlannerChatPage.tsx`)**: +102L since June 7. The state management layer (~1,700L) is the
  bottleneck — wizard/chat/plan/apply share `weekNotes`/`selectedChild`/`plannerConvId` without a
  reducer. Proposed split: `usePlannerWizardState` + `usePlannerChatState`; but interconnected state
  makes this a design-first task.
- **ARCH-04 (`useQuestSession.ts`)**: At 2,161L for the fourth consecutive report. Five distinct session
  types share `questBanking`, `adaptive`, `findings`, `snapshot` wiring. Proposed seams: `useQuestCore`
  (session init/end/banking/adaptive) + `useReadingQuestSession` + `useMathQuestSession` +
  `useEncodingQuestSession`. **Design-first required** — shared banking and adaptive state is the seam
  hazard.
- **ARCH-14 (`contextSlices.ts`)**: +81L since June 7 alone. Candidate split: domain-group loaders into
  `contextSlices.curriculum.ts`, `contextSlices.books.ts`, `contextSlices.family.ts`; keep main file as
  TASK_CONTEXT registry + re-exports. Architectural decision required before splitting.

### 1.2 Bundle (ARCH-05)

**Current:** 3,955.73 kB / 1,167.32 kB gzip. No code splitting. Zero route-level lazy boundaries.

The root blocker (ARCH-08) is still present: `AvatarThumbnail.tsx` imports Three.js and is used in
`AppShell.tsx` (the app shell loads on every route), preventing any effective Three.js split. Even if
`MyAvatarPage` were lazy-loaded, Three.js would already be in the main chunk.

**Proposed 4-step split** (unchanged from `ARCHITECTURE_AUDIT_2026-05.md §1.2`):
1. Move `AvatarThumbnail.tsx` off Three.js (use a 2D canvas thumbnail instead).
2. `React.lazy(() => import('./features/avatar/MyAvatarPage'))` — isolates Three.js + VoxelCharacter.
3. `React.lazy` for `BookEditorPage` (jsPDF + canvas drawing flows).
4. `React.lazy` for `WorkshopPage` (game-state complexity, large but stable).

Estimated initial-load reduction: ~800–1,100 kB (Three.js ~600 kB, jsPDF ~200–300 kB, workshop ~100 kB).
This is a structural decision — write-up only, not an auto-fix.

**ARCH-05 / ARCH-08 still OPEN.**

### 1.3 WorkbookConfig → ActivityConfig migration (ARCH-06)

Direct grep shows WorkbookConfig type + `workbookConfig` collection slug still referenced in the planner
cluster:

- `src/features/planner-chat/pace.logic.ts` — typed as `WorkbookConfig` (2 refs)
- `src/features/planner-chat/PlannerSetupWizard.tsx` — prop type + usage (4 refs)
- `src/features/planner-chat/PhotoLabelForm.tsx` — type + `matchWorkbookConfig` helper (6 refs)
- `src/features/planner-chat/PlannerChatPage.tsx` — `useMemo<WorkbookConfig[]>` + `.find` (2+ refs)

Functions side: `functions/src/ai/contextSlices.ts` comment (`legacy workbookConfigs fallback remains
temporarily`) + `contextSlices.ts` `WorkbookPaces` slice documentation. The
`src/ai/workbookActivityConfigBackfill.ts` file still reads `workbookConfigs` collection (migration
script for the transition period).

**Migration not safe until the planner cluster migrates exclusively to `activityConfigs`.** The
`workbookPaces` context slice already reads activityConfigs (primary) with workbookConfig fallback, so
the data side is ahead of the UI side. **ARCH-06 still OPEN.**

### 1.4 NEW: Dead ladders query residual — ARCH-39

**Finding:** `functions/src/ai/generate.ts:422` still queries the `ladders` collection:

```ts
// functions/src/ai/generate.ts:422
.collection(`families/${familyId}/ladders`)
```

ARCH-07 was marked **FIXED** (PR #1263, merged 2026-05-30) but the fix PR removed UI surfaces and the
`src/features/ladders/` directory. The dead `generate.ts` query was explicitly called out as a residual
in ARCH-07's evidence note: *"Residual (not in scope of PR): `functions/src/ai/generate.ts:421–449`
dead `ladders` collection query — standalone 5-line cleanup, recommend as a quick PROMPT_FIX run."*

The June 7 audit listed this as its **#2 recommendation**. It has now been 14 days and it remains
unaddressed. The query is completely dead (the collection is never written to), so this is safe dead code
removal — no logic impact.

- **Evidence:** `functions/src/ai/generate.ts:421–449` (query + unused result variable)
- **Severity:** LOW (dead code; no runtime impact; no test gap)
- **Lens:** none (pure structural cleanup)
- **Proposed action:** One PROMPT_FIX run. Remove the `ladders` collection query block and the result
  variable that is never referenced. 5 lines. Quick win.
- **New ledger row:** **ARCH-39**

### 1.5 NEW: Name-gate on neurodivergence descriptor — ARCH-38

**Finding:** `functions/src/ai/tasks/analyzePatterns.ts:189–191`:

```ts
const neurodivergentDesc = childName.toLowerCase() === "lincoln"
  ? "speech challenges, neurodivergent, benefits from short routines and frequent wins"
  : ""
```

This is a direct `childName` gate — exactly what CLAUDE.md and PROCESS_OVERVIEW.md prohibit ("gate on
**capability, never on name**"). ARCH-15 was the broader identity-coupling fix (PR #1338, merged
2026-06-02); its evidence note explicitly deferred this: *"Deferred + noted (data-model name coupling,
separate runs): `analyzePatterns` neurodivergence descriptor (needs a 'support needs' profile field or
snapshot supports, which touches the propose→confirm snapshot invariant)."*

This needs its own ledger row. The consequence is real: if London ever has overlapping support needs,
his disposition analysis never includes the neurodivergence-aware framing — the check is purely on name.

- **Evidence:** `functions/src/ai/tasks/analyzePatterns.ts:189–191`
- **Severity:** MEDIUM (correctness + operating model violation; affects multi-kid generality)
- **Lens:** Lens 2 (multi-kid generality — name-gate)
- **Proposed fix:** Add `supportNeeds` (or similar) to `Child` profile or read `snapshot.supports[]`
  (the Tier C additive snapshot writes already maintain `supports`). The `neurodivergentDesc` becomes
  `child.supportNeeds ?? snapshot.supports?.join(', ') ?? ""`. Because `snapshot.supports` is managed
  via the propose→confirm invariant (`skillSnapshotWrites.ts`), reading it is safe. Writing it is
  already confirm-gated. The analyzePatterns context-build only reads — no invariant breach.
- **New ledger row:** **ARCH-38**

### 1.6 Test coverage (TEST-01, NEW TEST-04)

TEST-01 is still **PARTIAL**:

| Feature area | Test files | Notes |
|---|---|---|
| `shelly-chat/` | 9 files / 57+ tests | Well-covered (ARCH-09 decomposition brought tests) |
| `evaluation/` | 1 test (`WorkingLevelsSection.test.tsx`) | Render-only; inline `setDoc` path (ARCH-12) untested |
| `progress/` | 0 | `DispositionProfile.tsx` AI-narrative-parse + parent-override merge: 0 tests |
| `dad-lab/` | 0 | `useDadLabReports.ts` hours/XP credit loop: 0 tests |

**NEW TEST-04 — Highest-value test targets (from TEST-01 remaining scope):**

1. **`src/features/dad-lab/useDadLabReports.ts`** — `syncComplianceHours`, `saveReport`,
   `updateStatus`: the hours+XP credit loops. DATA-04 confirmed this is "whole-family by design" —
   tests would lock that semantic and catch future regressions. Pure logic testable with a mocked
   Firestore; no UI required.

2. **`src/features/progress/DispositionProfile.tsx`** — AI narrative parse + parent override merge.
   The component parses a Firestore `dispositionCache` doc, merges parent `overrides` field-by-field,
   reverts overrides, and re-fetches AI narrative. The merge/revert logic is pure-ish (no writes in
   test scope) and is the most business-critical logic in `progress/`. A unit test for the merge +
   revert state machine would add meaningful coverage.

- **Evidence:** absence of `*.test.ts(x)` in `src/features/dad-lab/` and
  `src/features/progress/DispositionProfile*`
- **Severity:** MEDIUM (real untested logic, not pure UI shell)
- **New ledger row:** **TEST-04**

### 1.7 Drift since last audit

Files that grew notably since June 7:
- `PlannerChatPage.tsx`: +102L — tracked ARCH-02
- `contextSlices.ts`: +81L — tracked ARCH-14
- `useShellyChatFlows.ts`: stable at 1,123L — watch list (ARCH-13)

Notable structural activity since June 7 (130 commits on main):
- FEAT-33 (stickers), FEAT-35/36 (learning map), FEAT-37/38 (Shelly state-awareness) — all active PRs
  or recent merges. **Four major PRs open simultaneously as of June 21 is a COLLISION risk** per
  PROCESS_OVERVIEW §ii — only one ledger-touching run should be in flight at a time. Merge FEAT-35
  before FEAT-36; merge both before any other ledger-touching run.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 Where is Lincoln (FUNC-01)

FUNC-01 is **RESOLVED-WITH-DECISION** (2026-05-30, Model 2 — layered ownership + named write-through).
Authority hierarchy: `skillSnapshots` = current academic state; `children` = stable identity;
`childSkillMaps` = curriculum coverage; `activityConfigs` = position; `dispositionCache` = derived.

No regression found. The decision doc
(`docs/review/DECISION_FUNC-01_source_of_truth.md`) still holds.

**ARCH-12 still OPEN**: three inline `skillSnapshots` writers (`EvaluateChatPage`, `useQuestSession`,
`SkillSnapshotPage`) are not yet migrated onto the central `skillSnapshotWrites.ts`. These writers are
additive-only (no downgrade risk), so the urgency is low — but they represent a drift risk if the
writer ever acquires new invariants. Recommend as a low-priority PROMPT_FIX run after the ETHOS-01 and
ARCH-38/39 quick wins.

### 2.2 Learning-loop trace

**Capture:** Strong. Multi-photo + audio (FEAT-31/32 FIXED). No weak links in the capture surface.

**Saved + state-labeled:** Works for MO. TX-awareness still absent — see DATA-12 (new finding,
§4 below). The label that makes an artifact count toward MO compliance is not TX-aware.

**Evaluated:** Knowledge Mine + guided eval produce `EvaluationFinding` → `skillSnapshot` +
`childSkillMaps` (via `updateSkillMapFromFindings`). Lincoln does Knowledge Mine ~weekly — the
known sparse-cadence gap in PROCESS_OVERVIEW §iii — but this is operational, not a code bug. The
re-derivation engine (FEAT-35/36, PRs open) will improve the learning map's reflection of mastery
once merged.

**Loop closure check — findings → plan:**
- Evaluation finding → `skillSnapshot` (writes via `EvaluateChatPage` inline writer or quest end)
  → `analyzePatterns` CF reads snapshot → `plannerConversations` gets blocks/priority in context
  → planner AI shapes checklist. This chain closes.
- FEAT-09/10 (both FIXED) added teach-back + mastery signal to the disposition and planner contexts
  respectively. The loop is tighter than June 7.

**Teach (Lincoln teaches London):** `TeachBackSection` writes to `artifacts` + sets `dayLog.teachBackDone`.
FEAT-09 (FIXED) now also feeds the teach-back content to the `disposition` context slice — previously
write-only, now it reaches the AI loop.

**Re-evaluate:** Depends on Knowledge Mine cadence (~weekly per known gap) and the scan path (any
worksheet scan updates working levels). No code blocker.

**Assessment:** The loop closes. Operational weak links (sparse capture, weekly Mine cadence) remain
unchanged from June 7. No new dead ends found in this audit. FEAT-38 (pending PR) adds a frustration→
plan-adjustment handoff that respects single-writer-lane discipline (chat stages a brief; planner applies
via existing path — chat never writes the weekly plan).

### 2.3 Shelly's path

Energy selector → plan → today → review. No new shame triggers or dead-ends found.

- MVD is clearly the floor; the day-log path for MVD records all five MVD items and counts them toward
  compliance. Not a dead-end on a bad day.
- No new typing-required surfaces found; audio/tap maintained in Today + Shelly chat.
- `TodayChecklist.tsx` FEAT-16 "Find a video" button is tap-only and opens a Shelly thread — no friction.

### 2.4 Kid voice-first

- `KidTodayView.tsx`, `KidChecklist.tsx`, `KidTeachBack.tsx`, `KidChapterPool.tsx`: tap-over-typing
  maintained. No regressions from FEAT-33 (stickers) or FEAT-37/38 (Shelly state-awareness — parent
  surface only).
- `BuildWordQuestionScreen` and `BuildSentenceQuestionScreen` (FEAT-11): tap-only; text-input absence
  asserted in tests.

---

## Step 3 — Pedagogy & Ethos (Band 3)

### 3.1 ETHOS-01 — Charter gap (still OPEN)

Direct verification from `functions/src/ai/contextSlices.ts` TASK_CONTEXT registry (lines 56–88):

```ts
quest:         ["childProfile", "sightWords", "recentHistoryByDomain", "wordMastery", "skillSnapshot", "workbookPaces", "recentScans"]
generateStory: ["childProfile", "sightWords", "wordMastery", "skillSnapshot"]
reviseStory:   ["childProfile", "sightWords", "wordMastery", "skillSnapshot"]
revisePage:    ["childProfile", "sightWords", "wordMastery", "skillSnapshot"]
scan:          ["childProfile", "recentEval", "recentHistoryByDomain", "skillSnapshot", "activityConfigs"]
```

None of these include `"charter"`. The charter preamble (`CHARTER_PREAMBLE`) is injected via
`buildContextForTask` only when `"charter"` appears in the slice list
(`contextSlices.ts:324–325`).

**5 of 17 task types have no charter preamble:**

| Task | Concern |
|---|---|
| `generateStory` | AI generates child-facing narrative content — highest concern |
| `reviseStory` | Same surface, no charter framing |
| `revisePage` | Same |
| `quest` | Knowledge Mine dialogue + evaluation prompts |
| `scan` | Worksheet scan feedback to parent — lower concern, but still AI content |

**This was #1 recommendation in the June 7 audit. It remains open 14 days later.**

The fix is low-risk: add `"charter"` to the front of each of these five TASK_CONTEXT slice lists. No
prompt logic needs to change — `buildContextForTask` already handles the injection. The only risk is
the token overhead (~200–300 tokens per call for the charter text). Confirm with the owner before
adding to `quest` if token cost is a concern (Knowledge Mine runs frequently).

**ETHOS-01: still OPEN.**

### 3.2 Pace/pressure language scan

- `analyzeWorkbook.ts`: "above grade level" and "below grade level" are instructions-to-AI (system
  prompt framing), not user-facing strings. Parent sees the AI's synthesized summary. Acceptable.
- `quest` adaptive engine: "Try another one!" framing on correct answers; no pressure language on
  wrong answers. `questAdaptive.ts` moves level only on sustained performance, not per-answer.
- `DispositionProfile.tsx`: AI narrative uses "growing" language. No "failing" or "behind" found.
- `ScanResultsPanel.tsx:15–24`: `alignsWithSnapshot` "behind" maps to "new — teach first" (not raw
  "behind"). Parent-facing, pedagogically framed. Acceptable.

No new pace/pressure language violations found.

### 3.3 Diamonds-not-scores

- Quest: diamond bar fill driven by `diamondsMined` count, not a percentage score. `ReadingQuest.tsx`
  renders the diamond progress bar. No regressions.
- `XpDiamondBar.tsx`: diamond-count display; no grade/percentage exposure.

### 3.4 Charter preamble reach to all 17 task types

Charter preamble confirmed present for: `shellyChat`, `plan`, `evaluate`, `disposition`, `conundrum`,
`weeklyFocus`, `analyzeWorkbook`, `analyzePatterns`, `workshop`, `generateActivity`, `chapterQuestions`,
`bookLookup`, `lessonVideo`, `monthlyReview`, `weeklyReview` (12 of 17 main tasks + evaluate + weekly).

Absent from: `generateStory`, `reviseStory`, `revisePage`, `quest`, `scan` — tracked as ETHOS-01.

### 3.5 Lens 2 hit in ethos context — ARCH-38

`analyzePatterns.ts:189–191` name-gate on `"lincoln"` for the neurodivergence descriptor is also an
ethos finding: the disposition analysis for a non-Lincoln child never receives support-need-aware
framing, regardless of the child's actual profile. This is a pedagogy miss, not just an architecture
smell. Tracked as ARCH-38 (see §1.5).

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 (hours display reconciliation)

**FIXED.** `MonthlyTrend` now calls `computeMonthlyTrend()` which shares the `dayLogMinuteContributions`
helper with `computeHoursSummary()`. The additive-hours invariant is intact. No re-verification needed.

### 4.2 DATA-11 (shared counting path)

**DONE (PR open 2026-06-10).** `collectHoursContributions` is the single counting path; both
`computeHoursSummary` and `computeMonthlyTrend` fold from it. The DATA-11 PR's 3 guard tests pass in
the current suite (included in the 2,835 root total). Merge pending.

### 4.3 DATA-02 (duplicate backfill)

**NEEDS-DATA.** Frozen until 2026-07-01 per owner decision (2026-06-09). The suspect 2025-07/08 batches
were likely migrated to `childId: 'both'` by DATA-09; the July dedupe analysis must key on the
post-migration shape. No code change; re-flag for July data-hygiene window.

### 4.4 NEW: MO compliance structurally hardcoded — DATA-12

**Finding:** Missouri compliance is baked into three distinct files with no abstraction layer:

1. `src/core/utils/complianceMapping.ts:13` — `export const MO_REQUIRED_SUBJECTS: readonly SubjectBucket[]`
   hardcoded list of Missouri required subjects.

2. `src/features/records/records.logic.ts:774, 801, 874` — HTML export contains literal strings:
   `"Missouri Homeschool Compliance Report"`, `"Missouri Homeschool Log"`, etc.

3. `src/features/records/ComplianceDashboard.tsx:15` — re-declares or imports MO required subjects,
   uses them in the compliance gauge.

There is no `homeschoolState` config field or state-config abstraction. A TX toggle would require
simultaneous edits to all three files plus the `computeHoursSummary` subject-bucket filter logic.

TX has different required subjects and a different core-hours floor than MO. The "not deepening MO
assumptions" scope (per Lens 3) means we should not add more MO-hardcoded strings in new features —
but we also need to propose the state-config layer before the family moves.

- **Evidence:** `src/core/utils/complianceMapping.ts:13`, `src/features/records/records.logic.ts:774,801,874`,
  `src/features/records/ComplianceDashboard.tsx:15`
- **Severity:** MEDIUM (compliance-critical; blocks TX toggle; time-sensitive if move is within months)
- **Lens:** Lens 3 (MO→TX compliance)
- **Proposed action:** Introduce `homeschoolState: 'MO' | 'TX'` in family settings (one field on the
  `family` doc). Add a `getStateConfig(state)` helper in `complianceMapping.ts` that returns
  `{ requiredSubjects, coreHoursTarget, exportLabel }`. Wire it through `computeHoursSummary` and the
  export handlers. The TX subject list and 900-hour target can be stubbed (empty array + 900) until
  TX content is built — the structure is what matters. This is a **proposal** — do not apply here.
- **New ledger row:** **DATA-12**

### 4.5 Additive-hours invariant

All new code since June 7 that touches hours:
- FEAT-37 (Shelly reads hours state) — read-only; no write.
- `collectHoursContributions` (DATA-11) — structural refactor; numbers preserved per the 3 guard tests.
- Quick Add rewrite to `hoursCollection` (FEAT-24) — reviewed; `assertAttributed` guard present.

**Invariant obeyed** by all new code. No silent arithmetic changes found.

---

## Step 5 — Summary

### Findings table

| ID | Band | New? | Title | Severity | Proposed action |
|---|---|---|---|---|---|
| ETHOS-01 | 3 | existing (still OPEN) | Charter preamble absent from quest, generateStory, reviseStory, revisePage, scan | HIGH | Add `"charter"` to 5 TASK_CONTEXT slice lists — quick PROMPT_FIX |
| ARCH-38 | 1 | **NEW** | `analyzePatterns.ts:189–191` name-gates neurodivergence on `childName === "lincoln"` | MEDIUM | Read `snapshot.supports[]` or `child.supportNeeds` instead — PROMPT_FIX |
| ARCH-39 | 1 | **NEW** | Dead `ladders` collection query at `generate.ts:422` — ARCH-07 residual | LOW | 5-line dead-code removal — PROMPT_FIX |
| DATA-12 | 4 | **NEW** | MO compliance hardcoded in 3 files; blocks TX toggle | MEDIUM | `homeschoolState` config + `getStateConfig()` layer — proposal only |
| TEST-04 | 1 | **NEW** | `useDadLabReports.ts` hours/XP loop (0 tests) + `DispositionProfile.tsx` override logic (0 tests) | MEDIUM | Add unit tests — weekly test-builder run |
| ARCH-01 | 1 | existing | `chat.ts` 2,548L, `buildQuestPrompt` inline | MEDIUM | Extract prompt builders — design-first |
| ARCH-02 | 1 | existing | `PlannerChatPage.tsx` 2,729L (+102L this cycle) | MEDIUM | State reducer split — design-first |
| ARCH-04 | 1 | existing | `useQuestSession.ts` 2,161L, 4th consecutive report | MEDIUM | Domain-split hook — design-first |
| ARCH-12 | 1 | existing | 3 inline snapshot writers not on central `skillSnapshotWrites.ts` | LOW | PROMPT_FIX (additive-only migration) |
| ARCH-14 | 1 | existing | `contextSlices.ts` +81L this cycle (1,566L total, +241L cumulative) | LOW | Domain-group split — design-first |

### Items closed / confirmed stable this cycle

- DATA-01: **FIXED** (confirmed in baseline)
- DATA-11: **DONE** (PR open; guard tests in suite)
- FUNC-01: **RESOLVED-WITH-DECISION** (no regression)
- FEAT-09/10: **FIXED** (teach-back + mastery → plan loop closed)
- ETHOS-01 partial (shellyChat): **resolved** — confirmed CHARTER_PREAMBLE present in shellyChat

### 5-line executive summary

**Baseline GREEN** — lint 3 warnings (LINT-01), tsc clean, 2,835/464 tests passing, bundle 3,955 kB.
**Top finding by leverage:** ETHOS-01 — charter preamble absent from the story-generation trio +
quest + scan; called out as #1 in the June 7 audit, still unaddressed 14 days later; fix is additive
and low-risk (add `"charter"` to 5 TASK_CONTEXT lists). **Second:** ARCH-38 — `analyzePatterns.ts:189`
name-gates neurodivergence on `"lincoln"` (operating model violation + multi-kid generality miss;
quick PROMPT_FIX). **Third:** DATA-12 — MO compliance hardcoded in 3 files with no state-config
layer, blocking a clean TX toggle; propose `homeschoolState` config + `getStateConfig()` before the
family moves. **Recommended PROMPT_FIX sequence:** ETHOS-01 → ARCH-39 (5-line cleanup, trivial win
while waiting for ETHOS-01 review) → ARCH-38 → DATA-12 proposal → TEST-04 (weekly test-builder).
