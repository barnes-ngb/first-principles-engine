# Architecture Audit — 2026-08

> **Type:** Monthly deep audit (scheduled run, 1st of month cadence — fired 2026-08-02).
> **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-08-02
> **Branch:** `claude/brave-feynman-6uhs6i` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-07-26.md` (2026-07-26)
> **Window covered:** 2026-07-26 → 2026-08-02 (~7 days, `origin/main` at `ec784df`, clean fast-forward
> from the prior audit's base — no divergence).

---

## Step 0 — Baseline

```
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 4,802 tests passing (362 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 682 tests passing (37 files)
npm run build                         → dist/assets/index-*.js  4,276.73 kB │ gzip: 1,273.33 kB
```

**Baseline: GREEN.** No flakes observed this run. The 3 lint warnings are the same
`react-hooks/exhaustive-deps` sites named in every prior cycle (`EvaluateChatPage.tsx:293`,
`useQuestSession.ts:814,2083`, both `sessionTimer`-related, content unchanged).

Root test count is up **4,784 → 4,802 (+18)** across **360 → 362 files (+2)** since the 2026-07-27
`HEALTH_REPORT.md` baseline (6 days). Functions' own suite is unchanged at **682 tests / 37 files**
since 2026-07-27 (the last cycle's HEALTH_REPORT number was pulled from a stale snapshot; the 07-26
audit's own baseline already read 634 — this run's 682 reflects six days of watch-feature test growth
folded in since). Bundle is up **4,274.21 → 4,276.73 kB (+2.52 kB) / 1,272.94 → 1,273.33 kB gzip
(+0.39 kB)** — effectively flat. `npm audit` (root, prod): **2 high** (`react-router` 7.12.0–8.2.0 CSRF
bypass, unchanged, no non-breaking fix available). `npm audit` (functions, prod): **13** (1 low, 9
moderate, 3 high, unchanged — `firebase-admin` major-version chain).

This is the **quietest cycle since this audit series began.** The only shipped feature-work in the
7-day window was the Watch Vehicle's home-page + CRUD + containment slice (**FEAT-129 through
FEAT-134**) plus the routine 07-27 health audit — a single, well-contained feature area. Every
largest-file measurement below is flat or within single-digit-line noise except one file.

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — re-verified, essentially flat

| File | 2026-07-27 (HEALTH_REPORT) | 2026-08-02 (this audit) | Δ |
|---|---|---|---|
| `PlannerChatPage.tsx` | 3,092L | **3,092L** | +0 |
| `chat.ts` (CF) | 2,641L | 2,641L | +0 |
| `records.logic.test.ts` | 2,460L | 2,460L | +0 |
| `useQuestSession.ts` | 2,218L | 2,218L | +0 |
| `BookEditorPage.tsx` | 2,113L | 2,113L | +0 |
| `MyAvatarPage.tsx` | 1,876L | 1,876L | +0 |
| `dataReviewExport.logic.ts` | 1,713L | 1,713L | +0 |
| `WorkshopPage.tsx` | 1,623L | 1,623L | +0 |
| `contextSlices.ts` | 1,617L | 1,617L | +0 |
| `VoxelCharacter.tsx` | 1,606L | 1,606L | +0 |
| `chatPlanner.logic.test.ts` | 1,560L | 1,560L | +0 |
| `chatPlanner.logic.ts` | 1,544L | 1,544L | +0 |
| `TodayChecklist.tsx` | 1,498L | 1,498L | +0 |
| `RecordsPage.tsx` | 1,464L | 1,464L | +0 |
| `EvaluateChatPage.tsx` | 1,233L | 1,233L | +0 |
| `TodayPage.tsx` | 1,218L | 1,218L | +0 |
| `records.logic.ts` | 1,207L | 1,207L | +0 |
| **`KidTodayView.tsx`** | 1,147L | **1,156L** | **+9** |
| `LabReportForm.tsx` | 1,143L | 1,143L | +0 |
| `useShellyChatFlows.ts` | 1,134L | 1,134L | +0 |

Only `KidTodayView.tsx` moved at all (+9L), consistent with the FEAT-134 kid-watch-visibility fix
touching `kidQuestGate.ts`/`KidChecklist.tsx`/`KidTodayView.tsx`. **Every other tracked file is
byte-for-byte the same line count as the 2026-07-27 health report.** This is the flattest week
recorded in this audit series to date.

**ARCH-02 (`PlannerChatPage.tsx`) — no change, still the standing top item.** Held at 3,092L for a
second consecutive measurement window (the growth streak that crossed 3,000L last cycle has paused,
not reversed — no new evidence changes the 07-26 recommendation that this be the next design-first
decomposition pass). **ARCH-01/03/04/05/08/12/13/14 — all unchanged, re-verified only,** no new
urgency and no regression on any of them this cycle.

### 1.2 Bundle (ARCH-05) — re-verified, effectively flat

4,276.73 kB / 1,273.33 kB gzip, **+2.52 kB / +0.39 kB gzip** since 2026-07-27 — noise-level movement.
Still zero `React.lazy` in `router.tsx`; `AvatarThumbnail.tsx:2` still statically imports `three` and
is still used in the always-rendered `AppShell.tsx` nav chrome — **ARCH-08 remains the concrete
prerequisite**, unchanged. No new proposal beyond the standing plan in `ARCHITECTURE_AUDIT_2026-05.md
§1.2`. **Band 1, ARCH-05/ARCH-08, unchanged.**

### 1.3 Test coverage (TEST-01) — re-verified, both named gaps still open

- **`DispositionProfile.tsx` still has zero direct test file** — confirmed via directory listing, no
  `DispositionProfile*.test.*` anywhere in `src/features/progress/`.
- **`SkillSnapshotPage.tsx`'s inline merge-write path is still untested** — `SkillSnapshotPage.tsx:96,115`
  (`setDoc` on `snapshotRef`) has no covering test; the existing `SkillSnapshotPage.defaults.test.tsx`
  covers only the "Load Starter Defaults" action, unchanged from last cycle.

Feature test-file counts (today 42, books 33, business 23, planner-chat 19, quest/avatar 17, watch 16,
settings 13, shelly-chat/dad-lab 11, records/evaluate 9, foundations-review 6, progress 5,
monthly-review 4, evaluation 3, workshop 2, weekly-review/engine 1) track the 2026-07-27 health report
almost exactly — `watch` is the only feature that grew test coverage this window (10 → 16 in the prior
cycle's count, holding at 16 now). **TEST-01 status unchanged: IMPROVING but not closed.**

### 1.4 ARCH-12 re-verify — inline `skillSnapshots` writers, unchanged at identical line numbers

Re-traced all three named files — **identical to the 07-26 finding, same line numbers, no drift:**

- `useQuestSession.ts:1148` (`setDoc(snapshotRef, ..., { merge: true })`) and `:1168`
  (`updateDoc(snapshotRef, { conceptualBlocks, ... })`) — still inline.
- `EvaluateChatPage.tsx:622,625` — still inline.
- `SkillSnapshotPage.tsx:96,115` — still inline.

**Still 0 of 3 files migrated on their primary write path.** No regression, no progress. **Band 1,
ARCH-12, OPEN — unchanged.**

### 1.5 ARCH-43 (Lincoln-name-literal sites) — re-swept, identical count

`grep -rn "toLowerCase() === 'lincoln'\|=== 'Lincoln'" src` (non-test) still returns **20 sites across
18 files** — the exact same file list as the 07-19/07-26 sweeps (`MyAvatarPage.tsx`,
`AvatarCharacterDisplay.tsx`, `useShellyChatFlows.ts`, `ExplorerMap.tsx`, `TodayChecklist.tsx`,
`TeachBackSection.tsx`, `UnifiedCaptureCard.tsx`, `KidTodayView.tsx`, `RoutineSection.tsx`,
`KidLabView.tsx`, and 8 files under `books/`). No new site introduced this cycle despite
`KidTodayView.tsx`/`KidChecklist.tsx` both changing under FEAT-134 — the FEAT-134 fix touched
`itemType`/`category` bucketing logic, not child-identity branching, so **no new Lens-2 regression**.
**Band 1, ARCH-43, OPEN — unchanged, re-verified.**

### 1.6 ARCH-06 (WorkbookConfig → ActivityConfig) — methodology gap persists, count drifted slightly

Exact case-sensitive `WorkbookConfig\b` grep (non-test): **30 refs / 10 files — unchanged** from
07-26. The broader case-insensitive sweep (`workbookconfig`, non-test) now returns **105 refs / 18
files** (was 97/16 at 07-26) — two new files picked up in the wider net
(`dataReviewExportLoader.ts` and `PhotoLabelForm.tsx`/`PlannerCompactSetup.tsx` cluster additions).
As flagged last cycle, **this remains a measurement-methodology gap, not confirmed new drift** — no
exact, reproducible grep pattern has been pinned for this row yet. Recommendation unchanged: the next
`PROMPT_FIX` or health-audit pass should pin one. **Band 1, ARCH-06, OPEN — unchanged judgment,
directional count only.**

### 1.7 ARCH-07 residual — re-confirmed clean

`grep -in "ladders" functions/src/ai/generate.ts` still returns nothing. No regression. (This
re-verification is also what let this cycle finally close the stale CLAUDE.md bullet — see Step 5.)

### 1.8 Node.js runtime (ARCH-17) — unchanged, watch window narrowing

`functions/package.json` still pins `"node": "20"`. Node 20 decommission is 2026-10-30 — **89 days
out** as of this audit. Not yet urgent, but this is the point in the cycle where it's worth naming: the
next 1–2 monthly audits should treat the Node 20→22 (or later) upgrade as approaching, not distant.

### 1.9 Drift since last audit (2026-07-26 → 2026-08-02)

- `KidTodayView.tsx` +9L (FEAT-134). Every other tracked file: **+0L.**
- Bundle +2.52 kB / +0.39 kB gzip — noise.
- No new lint errors, no new tsc errors, no new test failures or flakes.
- `npm audit`: root unchanged at 2 high; functions unchanged at 13.
- ARCH-10 (Firestore rules blanket write grant) — re-confirmed unchanged.
- **This is the flattest architecture-drift window recorded since the audit series began** — a
  useful data point on its own: growth is bursty (PlannerChatPage.tsx's four-cycle streak, then a
  full stop), not a steady drip, and a quiet week is not evidence any standing item resolved itself.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — status check, no regression

Still **RESOLVED-WITH-DECISION** (2026-05-30, Model 2: layered ownership). The only feature surface
that shipped this window (Watch Vehicle home/CRUD/containment, FEAT-129–134) neither reads nor writes
`skillSnapshots`/`learnerModels` — confirmed via `grep -rln "skillSnapshots\|learnerModels"
src/features/watch/` returning nothing. Watch rows are explicitly non-curricular by design
(`watchDayItem.ts`'s own doc comment: "Watching is not a calibrated assessment... a watch row carries
no `skillTags` and never reaches the concept graph"). **No new competing source of academic-state
authority introduced. No regression.**

### 2.2 Loop integrity — traced the FEAT-134 kid-watch-visibility fix as this cycle's live incident

FEAT-134 is a good loop-integrity case study even though it's a bug fix, not new plumbing: a curated
video was correctly saved and correctly shown to the *parent* (`TodayChecklist.tsx`, reading raw
`category` off the checklist), but was invisible or locked behind unrelated gates in the *kid* view
(`KidChecklist.tsx`, which bucketed on a different signal). This is exactly the failure mode the
functional-loop lens exists to catch: a surface can be technically wired end-to-end and still silently
drop a child's ability to act on it. The fix (bucket on `itemType === 'watch'` explicitly, add an
always-open, never-gated "You Can Watch" section) is narrow and well-tested (18 new tests, verified by
behavioral revert per the PR's own methodology). **No further gap found in this path this cycle** —
re-tracing confirms the fix's own claim that hours math, XP, and the must-do gate are all untouched.

### 2.3 Shelly's path — no-shame check, spot-check only (no new surface this window)

No new parent-facing flow shipped this window beyond Watch Library's own edit/retire UI, which is
inventory management (video title, minutes, subject), not a child-facing evaluative surface. No new
finding.

### 2.4 Kid voice-first — no new surface to check this window; FUNC-15 still open

No new kid-capture surface shipped this cycle (Watch Vehicle is watch-only, not a capture flow). The
standing **FUNC-15** finding (`KidLabView.tsx`, 5 plain `TextField`s, zero `VoiceInput`/
`useAudioRecording`/`useTranscription` wiring) is unchanged — re-confirmed via the same grep as last
cycle, no fix applied yet. **Band 2, FUNC-15, OPEN — unchanged.**

### 2.5 Known weak links (PROCESS_OVERVIEW iii) — re-affirmed, no change

- **Sparse-upload days, Lincoln's ~weekly Knowledge Mine cadence** — no repo-observable change this
  window; still a live risk per the process doc's own framing, not resolvable from a repo-only audit.
- **"Learning-map shows missing things he's actually learned"** — already marked fixed in
  `PROCESS_OVERVIEW.md` as of the 07-26 audit's mechanical correction; re-confirmed still accurate.
- **State-labeling is MO-only** — unchanged; see Step 4.

---

## Step 3 — Pedagogy & Ethos (Band 3)

No AI prompt or context-slice files changed this window (the shipped work was entirely in
`src/features/watch/` and `src/features/today/`, neither of which touches `functions/src/ai/`). Given
zero surface area changed, this step is a **re-affirmation sweep**, not a fresh investigation:

- **Pace/pressure language** — re-swept `functions/src/ai/tasks/*.ts` and `contextSlices.ts` for
  deficit-pressure framing ("behind schedule," "catch up," "falling behind," "should be able to," "by
  now"); no hits, unchanged from 07-26.
- **"Diamonds not scores" / disposition-over-mastery** — no kid-facing quest/evaluate surface changed
  this window; the 07-26 confirmation (`ReadingQuest.tsx`'s own "no 'score' language" comment,
  `MasteryCheckoffPanel.tsx` qualitative states) stands unchanged.
- **Charter preamble reach** — `CHAT_TASKS` registry re-counted: still exactly **21 entries**, byte
  identical to 07-26's list. No new task type added. **Full coverage, no gap, unchanged.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, still FIXED, no regression

No new hours-adjacent view shipped this window (Watch Vehicle's checklist rows route through the
existing, unchanged `checklistItemCountedMinutes` path — confirmed via `watchDayItem.ts`'s own doc
comment: "Hours are unaffected... `source` is not part of that math"). The additive-hours invariant
holds on the only new surface this cycle touched. **No new divergence.**

### 4.2 DATA-02 — still NEEDS-DATA, now 32 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved. The
2026-07-01 dedupe-window freeze is now **32 days** overdue as of this audit (was 25 days at 07-26).
Still unresolvable from a repo-only audit — requires the owner to run the July dedupe pass against a
live Firestore export, per the 2026-06-09 decision (post-DATA-09-migration shape, `childId: 'both'`).
This is now the longest-standing overdue item in the ledger by a wide and growing margin.

### 4.3 DATA-13 — re-verified, still open, lines unchanged this cycle

The hardcoded `"Missouri Homeschool Compliance Report"` title/heading in `records.logic.ts` is still
present at the **same lines as 07-26** — `records.logic.ts:1099,1126` — unmoved, since the file didn't
grow this window. Still the same 3-line fix candidate (add `reportTitle` to `StateComplianceConfig`,
use it at both sites). No new severity; unusually, this is the first cycle where the line numbers
*didn't* shift.

### 4.4 MO→TX lens — no new hardcoding found

No compliance-adjacent file changed this window. The `stateCompliance.ts` per-state config
(`MO_CONFIG`/`TX_CONFIG`) is untouched; `records.logic.ts:36`'s intentional MO-only hours-counting
constant (DATA-12) is unchanged and still the sole documented, deliberate exception. **No new Lens-3
violation.**

### 4.5 Additive-hours invariant — re-affirmed, no new surface to re-check beyond 4.1

---

## Step 5 — Ledger Hygiene Finding (new this cycle) and Findings Table

### 5.1 DOC-11 (new) — a systemic ledger-staleness defect, found and fixed this run

While re-verifying this cycle's recent-window "PR open"/"do not merge" rows (FEAT-70, FEAT-129
through FEAT-134) against live GitHub state, the check turned up **zero open PRs repository-wide**.
Walking backward from that fact surfaced a much larger, previously-untracked problem: **25 ledger rows
spanning the entire month of July 2026 (2026-07-03 through 2026-07-31) claimed an unmerged, "do not
merge" PR when the PR had, in every single case, already been merged to `main`** — in several cases
(`FEAT-65`, `FEAT-68`) for **over two weeks**. This staleness survived **two intervening architecture
audits (07-19, 07-26) and a dedicated ledger-status-sweep run** (PR #1634, 2026-07-26) — none of which
caught it, meaning the sweep's coverage was itself incomplete rather than the drift being new.

All 25 were verified against the GitHub API (merge commit + `merged_at` timestamp) and corrected in
this same PR: `FEAT-43` (#1480), `FEAT-44` (#1482), `FEAT-45` (#1484), `FEAT-47` (#1488), `FEAT-48`
(#1489), `FEAT-51` (#1493), `FEAT-52` (#1481, renumbered via #1496), `FEAT-53` (#1497), `FEAT-54`
(#1498), `FEAT-55` (#1500), `FEAT-56` (#1502), `FEAT-63` (#1525), `FEAT-64` (#1527), `FEAT-65`
(#1529), `FEAT-68` (#1530), `FEAT-70` (#1635), `FEAT-129` (#1637), `FEAT-130` (#1636), `FEAT-131`
(#1638), `FEAT-133` (#1642), `FEAT-134` (#1644), `DOC-08` (#1495), `DATA-16` (#1501), `ETHOS-03`
(#1485), `ETHOS-04` (#1487) — all now read `MERGED (PR #N, merged DATE)`.

**Deliberately not chased further this cycle:** the pattern strongly suggests the same defect extends
to the pre-2026-07-03 "PR open"/"DONE (PR open ...)" tags (`ARCH-26`–`ARCH-37`'s UI-batch rows,
`DATA-11`, `FEAT-25/26/32/34/37/38/39`, `DATA-14/15`, `FEAT-112`'s amendment) — but individually
re-verifying ~20 more historical rows was judged lower-leverage this cycle than fixing the demonstrated
cases and naming the systemic gap for a scripted fix. **Proposed action:** a small script step (diff
`gh pr list --state open` against every ledger row matching `/PR open|do not merge/i`) added to either
the daily health audit or a dedicated ledger-hygiene pass, so this class of drift is caught
continuously rather than by manual re-derivation once a month. Filed as **DOC-11**, status **FIXED**
(the 25 corrections are the fix; the proposed scripted check remains open future work, not blocking).

### 5.2 DOC-10 — closed this cycle

Re-verified all three items from the 07-19 finding: (1) `src/features/watch/` is now documented in
`CLAUDE.md`'s Project Structure list; (2) `watchLibrary` is now in the Firestore Collections table;
(3) the stale "Dead `ladders` collection query" Known Technical Debt bullet — demonstrably false since
ARCH-39 resolved it 2026-06-28, re-confirmed via `grep -in "ladders" functions/src/ai/generate.ts`
returning nothing — removed this run (mechanical, zero-risk: the bullet described code that no longer
exists, not a judgment call about the code itself). **All three items closed. DOC-10 → FIXED.**

### No new architecture/functional/pedagogy/data findings this cycle

Every Step 1–4 investigation this window re-confirmed an existing row unchanged (no new evidence, no
regression, no closure) — a direct consequence of how little of the codebase changed in the 7-day
window (one contained feature area, `src/features/watch/` + `src/features/today/`). No new `ARCH-`,
`FUNC-`, `TEST-`, `ETHOS-`, or `DATA-` row was warranted this cycle beyond the ledger-hygiene finding
above.

### Re-verified existing rows (status updates)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-01, 03, 04, 05, 08, 12, 13, 14 | OPEN | OPEN, unchanged | 0L growth on every one; no new urgency |
| **ARCH-02** | OPEN (3,092L, 4th cycle of growth) | **OPEN — growth paused, held at 3,092L** | first flat cycle after 4 consecutive growth cycles; standing decomposition recommendation unchanged |
| ARCH-06 | OPEN (methodology gap, 97/16) | OPEN — count drifted to 105/18, same judgment | see 1.6 |
| ARCH-07 | FIXED | FIXED, re-verified — this cycle's re-check also let DOC-10 close | |
| ARCH-10 | OPEN | OPEN, unchanged | |
| ARCH-17 | OPEN (new 2026-06-01) | OPEN — 89 days to Node 20 decommission, narrowing | worth watching over the next 1-2 cycles |
| ARCH-41, 42, 43 | OPEN | OPEN, unchanged — 20-site count confirmed stable, no new sites | re-swept, identical file list |
| ARCH-44 | OPEN (new 07-26) | OPEN, unchanged — file still 1,713L | not re-measured in detail this cycle (no growth signal) |
| TEST-01 | IMPROVING | IMPROVING, unchanged — both named gaps still open | |
| TEST-02 | OPEN (flake) | OPEN, unchanged — no flake observed this run (consistent with intermittent nature) | |
| FUNC-01 | RESOLVED-WITH-DECISION | unchanged, re-affirmed — no new competing authority | |
| FUNC-15 | OPEN (new 07-26) | OPEN, unchanged — no fix applied | |
| DATA-01 | FIXED | FIXED, re-verified — invariant held, no new hours-adjacent surface beyond Watch (compliant by construction) | |
| DATA-02 | NEEDS-DATA (25 days overdue) | NEEDS-DATA, now **32 days overdue** | still the longest-standing overdue item |
| DATA-13 | OPEN (lines 1099/1126) | OPEN, unchanged — same lines, first cycle without drift | |
| **DOC-10** | OPEN (found 07-19) | **FIXED** | all 3 items closed this cycle, see 5.2 |
| **DOC-11** | *(new)* | **FIXED** | 25-row ledger-staleness sweep, see 5.1 |

### Mechanical doc fixes applied directly this cycle

- `CLAUDE.md` Known Technical Debt: removed the stale "Dead `ladders` collection query — ... Safe to
  remove" bullet (closes DOC-10 item 3; the query has been gone since ARCH-39, 2026-06-28).
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-08-02, added this report to
  the audit chain.
- `docs/review/REVIEW_HOME_BASE.md` ledger: 25 status-cell corrections (stale "PR open"/"do not
  merge" → `MERGED (PR #N, merged DATE)`), one new row (`DOC-11`), one status close (`DOC-10` →
  `FIXED`). Ledger diff for this PR: **+2 rows / −0 rows** net content (`DOC-11` new, `DOC-10`'s
  status cell edited in place along with the 25 FEAT/DOC/ETHOS/DATA cells) — no row reordered, deleted,
  or reopened.

### 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 4,802/4,802 tests;
functions: clean lint/tsc, 682/682 tests; build clean, bundle 4,276.73 kB/1,273.33 kB gzip, +2.52 kB
— flattest week recorded in this series). **Top 3 findings by leverage:** (1) a systemic ledger-hygiene
defect — 25 rows across a full month falsely claimed "PR open/do not merge" on already-merged work,
surviving two prior audits and a dedicated sweep, now corrected with a proposed scripted check to catch
it continuously (DOC-11); (2) `PlannerChatPage.tsx`'s four-cycle growth streak has paused at 3,092L —
worth watching whether this is a lull or the file has genuinely stabilized before deciding urgency on
ARCH-02's decomposition; (3) DATA-02's dedupe freeze window is now 32 days overdue with no owner action
yet, the longest-standing item in the ledger. **Recommend running `PROMPT_FIX.md` next against:**
DATA-13 (trivial 3-line fix, unchanged from last cycle's recommendation), then ARCH-12 (central-writer
migration, precisely scoped to 3 call sites, unchanged), then — if the growth pause holds for one more
cycle — reconsider ARCH-02's priority; if it resumes, escalate immediately.
