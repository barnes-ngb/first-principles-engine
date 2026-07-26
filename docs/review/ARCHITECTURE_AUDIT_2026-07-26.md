# Architecture Audit — 2026-07-26

> **Type:** Monthly deep audit (scheduled run, 7 days after the 2026-07-19 primary July audit).
> **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-07-26
> **Branch:** `claude/brave-feynman-fl3re5` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-07-19.md` (2026-07-19)

---

## Step 0 — Baseline

Fresh container — `node_modules` were empty at session start (not a code issue, consistent with every
prior cycle); `npm ci` (root) and `cd functions && npm ci` run first, then:

```
npm run lint                          → 0 errors, 3 warnings (unchanged locations — see below)
npx tsc -b                            → CLEAN
npx vitest run                        → 4,537 tests passing (344 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 634 tests passing (35 files)
npm run build                         → dist/assets/index-*.js  4,265.91 kB │ gzip: 1,269.89 kB
```

**Baseline: GREEN.** No flakes observed this run. The 3 lint warnings are the same pre-existing
`react-hooks/exhaustive-deps` sites named in every prior cycle (`EvaluateChatPage.tsx:293`,
`useQuestSession.ts:814,2083` — both involve `sessionTimer`; line numbers drift slightly cycle to cycle
as the surrounding files grow, content unchanged).

Root test count is up **4,235 → 4,537 (+302)** across **325 → 344 files (+19)** since the 2026-07-20
`HEALTH_REPORT.md` baseline (6 days). Functions' own suite is unchanged at **634 tests / 35 files** since
2026-07-19. Bundle is up **4,207.93 → 4,265.91 kB (+57.98 kB)** / **1,249.93 → 1,269.89 kB gzip
(+19.96 kB)** since 2026-07-20 — still **zero code splitting** (`vite build` emits one
`index-*.js` chunk over the 500 kB warning threshold; `AvatarThumbnail.tsx`'s static `three` import,
always rendered in `AppShell.tsx`, remains the blocker — see ARCH-08/ARCH-05, unchanged).

This is a shorter, lower-volume cycle than 2026-07-19's (which covered 213 commits over 7 days). This
run covers **2026-07-19 → 2026-07-26** (~7 days, `main` at `5e51074`, merge-base with this branch — clean
fast-forward, no divergence).

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — re-verified

| File | 2026-07-20 (HEALTH_REPORT) | 2026-07-26 (this audit) | Δ |
|---|---|---|---|
| `PlannerChatPage.tsx` | 2,941L | **3,020L** | **+79L — crosses 3,000L this cycle** |
| `chat.ts` (CF) | 2,641L | 2,641L | +0 |
| `records.logic.test.ts` | 2,041L | 2,460L | +419L (test file) |
| `useQuestSession.ts` | 2,215L | 2,218L | +3 |
| `BookEditorPage.tsx` | 2,103L | 2,113L | +10 |
| `MyAvatarPage.tsx` | 1,876L | 1,876L | +0 |
| **`dataReviewExport.logic.ts`** | *(did not exist)* | **1,713L** | **new file, see 1.5** |
| `WorkshopPage.tsx` | 1,623L | 1,623L | +0 |
| `contextSlices.ts` | 1,617L | 1,617L | +0 |
| `VoxelCharacter.tsx` | 1,606L | 1,606L | +0 |
| `chatPlanner.logic.test.ts` | 1,521L | 1,560L | +39 (test file) |
| `chatPlanner.logic.ts` | 1,508L | 1,544L | +36 |
| `RecordsPage.tsx` | 1,325L | 1,402L | +77 |
| `TodayChecklist.tsx` | 1,391L | 1,391L | +0 |
| `KidTodayView.tsx` | 1,059L | 1,137L | +78 |
| `useShellyChatFlows.ts` | 1,134L | 1,134L | +0 |

**ARCH-02 re-verify (`PlannerChatPage.tsx`) — escalating.** +79L this cycle, on top of +184L last
cycle (2,757 → 2,838 → 2,941 → **3,020**). This is the **fourth consecutive cycle of growth** and the
file has now crossed the 3,000-line mark the 2026-07-19 report flagged as approaching. Severity:
**HIGH** — recommend this be the next `PROMPT_FIX`-adjacent design pass (a decomposition *design*, not a
blind split, per the file's own "~1,700L interconnected state" note) before another cycle compounds it
further. **Band 1, ARCH-02.**

**ARCH-01/03/04 (`chat.ts`, `BookEditorPage.tsx`, `useQuestSession.ts`) — stable.** All effectively flat
this cycle (0 to +10L). No new urgency; standing proposals from prior audits still apply unchanged.

**New watch-list entries:** `RecordsPage.tsx` (+77L, driven by FEAT-125's compliance-pack Dad Lab section)
and `KidTodayView.tsx` (+78L) both grew notably but remain well under any decomposition threshold.

### 1.2 Bundle (ARCH-05) — re-verified

4,265.91 kB / 1,269.89 kB gzip, **+57.98 kB / +19.96 kB gzip** since 2026-07-20. Still zero
`React.lazy` in `router.tsx`; still one oversized `index-*.js` chunk (vite's own build warning
confirms). `AvatarThumbnail.tsx:2` still statically imports `three` and is still used in
`AppShell.tsx` (always-rendered nav chrome, not route-gated) — **ARCH-08 remains the concrete
prerequisite** for any route-level split. No new proposal beyond the standing 4-step plan in
`ARCHITECTURE_AUDIT_2026-05.md §1.2`. **Band 1, ARCH-05/ARCH-08, unchanged — re-verified only.**

### 1.3 Test coverage (TEST-01) — re-verified

Test-file counts by feature (this audit's own count, current tree):

| Feature | Test files |
|---|---|
| today | 35 |
| books | 33 |
| business | 23 |
| planner-chat | 19 |
| quest | 17 |
| settings | 12 |
| shelly-chat | 11 |
| dad-lab | 11 |
| watch | 10 |
| evaluate | 9 |
| records | 8 |
| foundations-review | 6 |
| progress | 5 |
| monthly-review | 4 |
| evaluation | 3 |
| workshop | 2 |
| weekly-review | 1 |
| engine | 1 |

`progress` is now at 5 files (was 4 on 2026-07-19), `dad-lab` at 11 (was 9), `records` at 8 (was 4 on
the last HEALTH_REPORT's per-test — different unit, directionally consistent). **The two specific
named gaps from TEST-01 are still open:**

- **`DispositionProfile.tsx` still has zero direct test file.** Confirmed via `find` — no
  `DispositionProfile*.test.*` anywhere in `src/features/progress/`.
- **`SkillSnapshotPage.tsx`'s inline merge-write path is still untested.** A new
  `SkillSnapshotPage.defaults.test.tsx` landed since 2026-07-19, but it covers only the "Load Starter
  Defaults" action (2 tests asserting per-child default payloads) — it does **not** exercise the
  general `setDoc`/merge path at `SkillSnapshotPage.tsx:96,115` that ARCH-12 also names. **TEST-01
  status unchanged: IMPROVING but not closed.**

### 1.4 ARCH-12 re-verify — inline `skillSnapshots` writers, precise state

Re-traced all three named files:

- **`useQuestSession.ts`** now imports `writeSnapshotUpdate` from the central
  `skillSnapshotWrites.ts` (line 59) — **but only for one narrow write**: the "last mined activity
  marker" at line 1195 (`recordQuestActivity`, a visibility-only, never-downgrade side write). The
  **main** prioritySkills/workingLevels merge write — the one ARCH-12 is actually about — is still a
  raw inline `setDoc(snapshotRef, ..., { merge: true })` at line 1148, plus a second inline
  `updateDoc(snapshotRef, { conceptualBlocks, ... })` at line 1168 for blocker-lifecycle updates.
- **`EvaluateChatPage.tsx`** — still inline (`setDoc`/`updateDoc` on `snapshotRef`, lines 622/625).
- **`SkillSnapshotPage.tsx`** — still inline (`setDoc` on `snapshotRef`, lines 96/115).

**Correction to how this should be read going forward:** this is *not* "1 of 3 migrated" — it's
**0 of 3 migrated on their primary write path**, with one incidental adjacent write in
`useQuestSession.ts` now correctly routed. Worth noting precisely so a future cycle doesn't
over-credit partial progress. **Band 1, ARCH-12, OPEN — re-verified with corrected detail.**

### 1.5 New file this cycle — `dataReviewExport.logic.ts` (FEAT-120)

A new file landed 2026-07-25 (yesterday relative to this audit) **already at 1,612 lines in its
first commit** (`7beb0a0`, FEAT-120), then grew a further +193L the same day
(`05d26b9`, a P2 review fix) to its current **1,713L**. This is a file "born large" rather than one
that grew slowly into a decomposition candidate — worth flagging under the "drift since last audit"
bullet even though it wasn't yet tracked in a prior report (it didn't exist at 2026-07-19).

Inside it, `computeIntegrityChecks` (declared at line 544) runs to line ~1,678 — **over 1,100 lines
in one function**, by a wide margin the single largest function found in this audit. The file is a
read-only diagnostic export (per its own ledger row, FEAT-120), so it carries none of the invariant
risk a writer-shaped file would, and it **correctly reuses** `computeHoursSummary` (see Step 4) rather
than re-deriving hours — the additive-hours invariant holds here. But a 1,100-line function is a real
decomposition candidate on cohesion grounds alone (likely a sequence of independent per-collection
integrity checks that could be extracted to one function per check). **Proposed new ledger row,
Band 1 — see Step 5.**

### 1.6 Migrations / deprecations

**ARCH-06 (WorkbookConfig → ActivityConfig).** A precise re-count using the exact prior grep
(`WorkbookConfig\b`, case-sensitive, non-test files) gives **30 refs / 10 files** — but this
undercounts relative to the 07-19 row's "45/13" because that count evidently included lowercase
`workbookConfigId`-style field/variable references too. A broadened case-insensitive sweep gives
**97 refs / 16 files**, picking up new sites in `dataReviewExport.logic.ts`,
`dataReviewExportLoader.ts`, `useUnifiedCapture.ts`, `TodayChecklist.tsx`,
`useScanToActivityConfig.ts`, `workbookMatching.ts`, `tagConceptBridge.ts`,
`dailySignalTargeting.ts` beyond the planner cluster. **This is a measurement-methodology gap, not
confirmed new drift** — the audit script/grep pattern for this row has never been pinned precisely
(the same caveat `HEALTH_REPORT.md` has flagged for other one-liners). Recommend the next `PROMPT_FIX`
or health-audit pass **pin an exact, reproducible grep pattern** for ARCH-06 so cycle-over-cycle counts
are comparable; until then, treat the row's trend line as directional only. The underlying judgment
(migration not safe until the planner cluster moves off legacy shapes) is unchanged.

**ARCH-07 residual.** Confirmed still clean — no `ladders` collection references remain in
`functions/src/ai/generate.ts` (ARCH-39 already resolved this 2026-06-28; re-verified, no
regression).

### 1.7 Drift since last audit (2026-07-19 → 2026-07-26)

- `PlannerChatPage.tsx` +79L (see 1.1 — now the standout item).
- New file `dataReviewExport.logic.ts` at 1,713L, born large (see 1.5).
- `RecordsPage.tsx` +77L, `KidTodayView.tsx` +78L, `chatPlanner.logic.ts` +36L — all sub-100L growth,
  none crossing a new threshold.
- Bundle +57.98 kB / +19.96 kB gzip.
- No new lint errors, no new tsc errors, no new test failures or flakes.
- ARCH-10 (Firestore rules blanket write grant) — re-confirmed unchanged (`firestore.rules:11-21` still
  one `allow write: if request.auth != null` / `isFamily(familyId)` shape).

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — status check

Still **RESOLVED-WITH-DECISION** (2026-05-30, Model 2: layered ownership). No new surface introduced
this cycle claims a competing authority over academic state — FEAT-120's data-review export and
FEAT-121/123/124/125 (Dad Lab evidence reaching the compliance pack) all **read** existing
authoritative sources (`skillSnapshots`, `learnerModels`, `activityConfigs`) rather than establishing
new ones. No regression to flag.

### 2.2 Loop integrity — traced FEAT-62's workbook-scan join (evaluate → plan wiring)

Re-traced the FEAT-62/FEAT-62-amendment path (Today capture → workbook position → curriculum) end to
end in `useUnifiedCapture.ts`: `findWorkbookConfigId` resolution, `targetConfigId`-pinned
`syncScanToConfig` call, and the `workbookConfigId` stamp-on-resolve are all still present and wired
exactly as the ledger describes (`useUnifiedCapture.ts:38,119,143,181-184,259-264,494-496`). No dead
end found in this path this cycle.

### 2.3 Shelly's path — no-shame check

Spot-checked `TodayChecklist.tsx`'s engagement-tagging UI (`struggled` chip at line 980, counts
surfaced at line 1264-1265): rendered as a neutral 😫-emoji `warning`-colored count chip, not
shame-coded language — consistent with the no-shame rule. No new violation found.

### 2.4 Kid voice-first — new finding: Dad Lab's kid capture is 100% typed, zero voice

Spot-checking `KidLabView.tsx` (the file ARCH-42 already names for its Lincoln/London
`isLincoln`-gated branch) against the "taps-over-typing, voice-first" rule turned up a **separate,
un-tracked issue**: the file has **5 plain MUI `TextField`s** (lines 308, 352, 396, 411, 453) across
both the Lincoln-branch 5-step "Scientific Method" flow and the simpler shared form, and **zero**
imports of `VoiceInput`, `useAudioRecording`, or `useTranscription` anywhere in the file. The one
"recording" reference in the file (line 177) is a photo/video capture label, not a speech-to-text
affordance.

This is notable because: (a) Lincoln's profile (`CLAUDE.md`) explicitly names "speech + neurodivergence
… needs … low-friction starters," (b) the Voice Input module exists precisely for this, defaults
**on** for Lincoln (`scripts/setLincolnVoiceInputEnhanced.ts`), and (c) `MASTER_OUTLINE.md`'s own
Phase 2 migration list for the voice module (`FluencyPractice, PlaytestView, VoiceRecordingStep,
AdventurePlaytestView, UnifiedCaptureCard`) does not include Dad Lab's kid capture at all — meaning
this isn't a "not yet migrated" gap so much as a surface that was never in scope for the migration
list to begin with. A kid whose speech is the whole reason the app has a voice-input module is asked
to type five short-answer narrative fields to record a science observation. **Proposed new ledger row,
Band 2 — see Step 5.**

### 2.5 Known weak links (PROCESS_OVERVIEW iii) — re-affirmed, one already fixed

- **Sparse-upload days, Lincoln's ~weekly Knowledge Mine cadence** — no repo-observable change; these
  remain live risks per the process doc's own framing (not something a repo-only audit can resolve;
  would need usage telemetry).
- **"Learning-map shows missing things he's actually learned"** — **already resolved** (FEAT-35/FEAT-36,
  2026-06-20, per the ledger) via the re-derivation engine + working-level→implied-mastery inputs.
  `PROCESS_OVERVIEW.md`'s "loose points to watch" section (dated CURRENT, last updated 2026-06-20 —
  the same day) still lists this as an open loose point; worth a **mechanical doc note** that this one
  is fixed, distinct from the two above which are genuinely still open. Applying directly as a doc fix
  (Step 5.3 rule: mechanical, zero-risk).
- **State-labeling is MO-only** — unchanged; see Step 4's MO/TX findings, which show meaningful
  progress here (`stateCompliance.ts` config abstraction, DATA-12) even though full TX activation
  remains out of scope by design.

---

## Step 3 — Pedagogy & Ethos (Band 3)

*(Investigated via a dedicated read-only sweep of `functions/src/ai/tasks/*.ts`,
`functions/src/ai/contextSlices.ts`, kid-facing quest/evaluate components, and the `CHAT_TASKS`
registry.)*

### 3.1 Pace/pressure language — no violations found

Swept for "behind schedule," "catch up," "falling behind," "should be able to," "by now," and similar
deficit-pressure framing across the AI task prompts and context slices. No hits. The handful of
"grade level" mentions (`scan.ts:57,63`, `analyzeWorkbook.ts:17`) are neutral extraction of a stated
curriculum band from a scanned workbook cover or worksheet, not pressure language.
`foundationsReview.ts:171` / `learnerSynthesis.ts:273` explicitly instruct the model to **never**
surface grade/band numbers to the parent — a positive control in the right direction.
`contextSlices.ts:542`'s coverage-summary renderer carries its own code comment ("no pace/deadline
language") and emits only "X of Y covered," no dates or should-be-at framing. One borderline phrase —
`shellyChat.ts:229`'s "are we on track for our hours" — refers to compliance hours-logged vs. the
state target (a legal construct), not curriculum pace; judged **benign**, though a future wording
pass to "hours logged vs. target" would remove any ambiguity. **No new ledger row — no real violation
found.**

### 3.2 "Diamonds not scores" / disposition-over-mastery — confirmed held

Kid-facing quest/evaluate surfaces (`ReadingQuest.tsx`, `BuildSentenceQuestion.tsx`,
`BuildWordQuestion.tsx`, `FluencyPractice`) show no raw percentage/letter-grade/pass-fail language.
`ReadingQuest.tsx:555` carries its own "no 'score' language" code comment; `:604`'s "Diamond bag X%
full" is a diamond-currency progress meter, not an academic score. `MasteryCheckoffPanel.tsx` /
`masteryRollup.ts` render qualitative mastery states, not percentages, to the kid surface. Parent-facing
compliance percentages (a different, expected audience) are untouched by this check. **Confirmed held,
no drift.**

### 3.3 Charter preamble reach — all 21 task types confirmed, plus a hygiene note

`CHAT_TASKS` (`functions/src/ai/tasks/index.ts`) has exactly 21 entries. 15 route through
`buildContextForTask` → `TASK_CONTEXT[taskType]` (`contextSlices.ts:71-118`), each including the
`"charter"` slice: `plan, chat, generate, evaluate, quest, generateStory, reviseStory, revisePage,
workshop, analyzeWorkbook, disposition, scan, shellyChat, foundationsReview, helpCard`. The remaining
6 bypass `buildContextForTask` and directly import `CHARTER_PREAMBLE`, each with its own doc-comment
noting this: `conundrum.ts:90, weeklyFocus.ts:72, chapterQuestions.ts:123, bookLookup.ts:69,
lessonVideo.ts:104, monthlyReview.ts:304`. 15 + 6 = 21 — **full coverage, no gap.**

**Hygiene note (not a charter gap):** `TASK_CONTEXT` retains two keys that are **not** in
`CHAT_TASKS` and therefore never dispatchable — `analyzePatterns` (whose slice list is also missing
`"charter"`, but it's dead config, not a live task) and `weeklyReview` (superseded by `weeklyFocus`'s
direct-import path). Harmless dead config; worth a mechanical prune next time someone is in that file,
not urgent enough for its own ledger row.

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, still FIXED, no regression

`MonthlyTrend.tsx` still calls the canonical `computeMonthlyTrend()` (not a re-derivation). Re-checked
every current consumer of hours-summary logic across `src/features/records/`: `RecordsPage.tsx`,
`records.logic.ts`, `MonthlyTrend.tsx`, `QuickAddHours.logic.ts`, and the new
`dataReviewExport.logic.ts` (FEAT-120) **all** route through the shared `computeHoursSummary` /
`computeMonthlyTrend` path — confirmed by grep and by `dataReviewExport.logic.ts:1196`'s own comment
("Counted through the SHARED counting path … this export never re-derives the counting rules"). The
additive-hours invariant held on the newest surface added since the last audit. **No new divergence.**

### 4.2 DATA-02 — still NEEDS-DATA, now 25 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved. The
2026-07-01 dedupe-window freeze is now **25 days** overdue as of this audit (was 18 days at 2026-07-19).
This remains the longest-standing overdue item in the ledger and is **still unresolvable from a
repo-only audit** — it requires a live Firestore export per the owner's 2026-06-09 decision. No change
in recommendation: run the July dedupe pass against the post-DATA-09-migration shape
(`childId: 'both'`) as already documented in the row.

### 4.3 DATA-13 — re-verified, still open, lines shifted again

The hardcoded `"Missouri Homeschool Compliance Report"` title/heading in `records.logic.ts` is still
present, now at **lines 1099 and 1126** (shifted again from the 07-19 row's noted 785/812, as
`records.logic.ts` grew from FEAT-125's Dad Lab compliance-pack section and then FEAT-126's archive
file-set — see the merge-base addendum in Step 5). Still the same 3-line fix
candidate: add `reportTitle` to `StateComplianceConfig` and use it at both sites. No new severity.

### 4.4 MO→TX lens — no new hardcoding found; one confirmed-deliberate exception

The compliance layer (`src/core/compliance/stateCompliance.ts`) remains a clean per-state config
(`MO_CONFIG` / `TX_CONFIG`, `getStateConfig(state)`), with TX defined-not-activated per its own header
comment. `records.logic.ts:36`'s module-scope `getStateConfig('MO').requiredCoreSubjects` constant is
**intentional and already documented** (DATA-12, comment at lines 30-34): the hours-counting path is
deliberately not state-parametrized because TX imposes no hours target at all — this is a reasoned
design decision, not an oversight, and does not block a clean MO⇄TX toggle (TX's `ComplianceDashboard`
path already branches independently on `hoursRequirement === null`). **No new Lens-3 violation found**
beyond the already-tracked DATA-13.

### 4.5 Additive-hours invariant — re-affirmed on all views added since 2026-07-19

Covered under 4.1 — `dataReviewExport.logic.ts` is the only new hours-touching view this cycle and it
is compliant by construction.

---

## Step 5 — Findings Table and Summary

### New findings this cycle

| ID | Band | Lens | Finding | Evidence | Proposed action |
|---|---|---|---|---|---|
| **ARCH-44** *(proposed)* | 1 | Architecture | `dataReviewExport.logic.ts` (FEAT-120) landed already at 1,612L in its first commit, now 1,713L, containing a single ~1,100-line function (`computeIntegrityChecks`, lines 544–1679). | `src/features/records/dataReviewExport.logic.ts:544-1679` | Decompose `computeIntegrityChecks` into one function per integrity check it currently inlines (read-only diagnostic, low risk to split). Design-first, not urgent (no invariant risk — it's a reader, and it already reuses the canonical hours path). |
| **FUNC-15** *(proposed)* | 2 | Kid voice-first / multi-kid generality | Dad Lab's kid-facing capture (`KidLabView.tsx`) is 100% typed — 5 `TextField`s across both the Lincoln and shared branches, zero `VoiceInput`/`useAudioRecording`/`useTranscription` wiring — for a child whose profile names speech as a primary need and who has Voice Input enabled by default. Sibling instance of the same class of gap **FUNC-14** already named for Kit Builder. | `src/features/dad-lab/KidLabView.tsx:308,352,396,411,453`; sibling row **FUNC-14** | Wire the existing `<VoiceInput>` module into at least the Lincoln-branch narrative fields (Question/Prediction/What Happened/Teach London), following the same integration pattern already used for `BookGenerateChat`. Not in either tracked Phase-2 voice-migration list — needs to be added to scope. |

### Mechanical doc fix applied directly this cycle

- `docs/PROCESS_OVERVIEW.md` §(iii) "Loose points to watch": the "Learning-map shows missing things
  he's actually learned" bullet is stale — this was resolved by FEAT-35/FEAT-36 (2026-06-20). Marking
  it fixed and leaving the two genuinely-open weak links (sparse-upload days, Lincoln's Knowledge-Mine
  cadence) in place, per the "mechanical, zero-risk" carve-out (no architectural judgment involved —
  simply reflects what the ledger already records as RESOLVED).

### Re-verified existing rows (status updates)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-01, ARCH-03, ARCH-04 | OPEN | OPEN, unchanged | 0 to +10L growth, no new urgency |
| **ARCH-02** | OPEN (2,838L) | **OPEN — escalated (3,020L, crossed 3,000L)** | fourth consecutive cycle of growth; recommend prioritizing next |
| ARCH-05, ARCH-08 | OPEN | OPEN, unchanged | bundle +57.98 kB / +19.96 kB gzip; AvatarThumbnail still the blocker |
| ARCH-06 | OPEN (45/13, contested methodology) | OPEN — methodology gap noted, recommend pinning an exact grep pattern | see 1.6 |
| ARCH-07 | FIXED | FIXED, re-verified no regression | |
| **ARCH-12** | OPEN (new) | **OPEN — corrected detail: 0/3 files migrated on primary write path** (one incidental adjacent write in `useQuestSession.ts` now routed) | see 1.4 |
| ARCH-10 | OPEN | OPEN, unchanged | blanket write grant unchanged |
| ARCH-41, ARCH-42, ARCH-43 | OPEN | OPEN, unchanged — 20-site count confirmed stable, no new sites | re-swept, identical file list to the 07-19 count |
| TEST-01 | IMPROVING | IMPROVING, unchanged — both named gaps (`DispositionProfile.tsx`, `SkillSnapshotPage.tsx` merge path) still open | new `SkillSnapshotPage.defaults.test.tsx` covers a different slice (Load Starter Defaults), not the named gap |
| FUNC-01 | RESOLVED-WITH-DECISION | unchanged, re-affirmed — no new competing authority introduced | |
| DATA-01 | FIXED | FIXED, re-verified — invariant held on the newest surface (FEAT-120) | |
| DATA-02 | NEEDS-DATA | NEEDS-DATA, now 25 days overdue (was 18) | |
| DATA-13 | OPEN | OPEN, unchanged — lines shifted to 1099/1126 | re-measured at merge, see addendum |
| DATA-12 | FIXED | FIXED, re-verified — TX defined-not-activated pattern holds | |

### Merge-base addendum — re-verified against `main` @ `851a58d` (2026-07-26)

This audit was cut from `main` @ `5e51074` (PR #1630, FEAT-121–125). Before merge, **FEAT-126**
(PR #1631 — the compliance pack becomes a real evidence archive) landed on `main`. Every finding above
was re-checked against the new base. **No finding is closed by FEAT-126 and no new finding is raised**
— three measured claims are restated:

- **DATA-13 line numbers moved again.** `records.logic.ts` grew 1,161L → 1,207L; the hardcoded MO
  title/heading is now at `records.logic.ts:1099,1126` (was 1054/1081 at audit time). Finding
  unchanged and still the easiest open `PROMPT_FIX` — corrected above and in §4.3 so a future run
  doesn't chase a stale line.
- **§1.1 largest-files table:** `RecordsPage.tsx` is **1,464L** on the merged base (+62L from
  FEAT-126's archive wiring), not the 1,402L measured at audit time. It stays a watch-list entry, well
  under any decomposition threshold. Every other row in the table is untouched by FEAT-126 —
  **ARCH-02's `PlannerChatPage.tsx` is still 3,020L**, so the escalation stands exactly as written.
- **§4.1 / §4.5 additive-hours invariant re-verified on FEAT-126.** It is the second hours-adjacent
  surface added this cycle, so §4.5's "`dataReviewExport.logic.ts` is the only new hours-touching
  view" now reads as of audit date only. The invariant **holds**: `generateCompliancePack` renders
  nothing — the four text files arrive pre-rendered from the client's existing
  `buildCompliancePackFiles`, and there is no `computeHoursSummary` / `computeMonthlyTrend` reference
  anywhere under `functions/src/records/` or in `compliancePackArchive.ts`. One renderer, no second
  hours path. **No new divergence.**

Also re-confirmed still-true on the merged base: **ARCH-44** (`dataReviewExport.logic.ts` 1,713L) and
**FUNC-15** (`KidLabView.tsx` — 5 `TextField`s, 0 voice imports). Findings the ledger records as closed
by FEAT-122 (`?diag=1` parent-gating), FEAT-123/125 (`childId: 'both'` in portfolio + pack) and
FEAT-124 (capability-not-name routing) were **already** in this audit's base and are correctly not
raised as open anywhere above.

### 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 4,537/4,537 tests;
functions: clean lint/tsc, 634/634 tests; build clean, bundle 4,265.91 kB/1,269.89 kB gzip, no code
splitting). **Top 3 findings by leverage:** (1) `PlannerChatPage.tsx` crossed 3,000L this cycle on its
fourth consecutive cycle of growth (ARCH-02) — the single highest-leverage decomposition candidate
right now; (2) ARCH-12's inline `skillSnapshots` writers are more open than previously credited — 0 of
3 files route their primary write through the central writer; (3) a new, previously-untracked gap —
Dad Lab's kid capture has zero voice input for a speech-challenged child, the same gap-class FUNC-14
already named for Kit Builder (proposed FUNC-15). **Recommend
running `PROMPT_FIX.md` next against:** DATA-13 (trivial 3-line fix, ready-made template from DATA-12),
then ARCH-12 (central-writer migration, now precisely scoped to 3 call sites), then a design-first pass
on ARCH-02 before its next growth cycle.
