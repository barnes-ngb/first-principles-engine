# Architecture Audit — 2026-07-12

> **Type:** Monthly deep audit (this run: mid-cycle re-verification, 7 days after the 2026-07-05 primary
> July run). **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-07-12
> **Branch:** `claude/brave-feynman-aougyr` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-07.md` (2026-07-05, PR #1505)

---

## Step 0 — Baseline

Fresh container — `npm ci` (root, 646 packages) and `cd functions && npm ci` (683 packages) run first,
then:

```
npm run lint                          → 3 warnings (LINT-01, same 3 locations — unchanged), 0 errors
npx tsc -b                            → CLEAN
npx vitest run                        → 3,459 tests passing (248 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 563 tests passing (31 files)
npm run build                         → dist/assets/index-*.js  4,080.44 kB │ gzip: 1,208.07 kB
npm run docs:check                    → all 6 HARD checks PASS; 11 SOFT warnings (unchanged from 2026-07-10 DOC-09 day-one census)
```

**Baseline: GREEN.** No new failures anywhere. Root test count is up **3,277 → 3,459 (+182)** across
**232 → 248 files (+16)**; functions' own suite up **527 → 563 (+36)** across **27 → 31 files (+4)** —
real coverage growth, not re-counting drift (see §1.4). This week's growth traces to the July 6 weekly
test-builder run (`curriculumMap.test.ts`, `missions.test.ts`, `mineRecap.logic.test.ts`,
`roundToFiveMinutes.test.ts` — 4 files, PR #1504) plus tests shipped alongside FEAT-57/58/59/60/61/62/DOC-09.

`npm run docs:check` (DOC-08/DOC-09) independently confirms: 43 Firestore collection helpers, **151**
ledger rows with no ID collisions (up from 144 at 2026-07-05 — 7 new rows landed this week, all
accounted for below), and the same resilience census as DOC-09's day-one baseline (8 remote-guard
warnings, 1 image-downscale warning, 87 silent catches across 47 files) — unchanged, so no fresh
resilience regression since DOC-09 shipped.

---

## Step 0.5 — Audit lenses carried forward

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate
2. **Multi-kid generality** — anything hard-coded to one kid?
3. **MO→TX compliance** — state rules/exports MO-hardcoded in a way that blocks a clean TX toggle?

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large files (>1,500L) — drift since 2026-07-05

| File | 07-05 | 07-12 | Δ | Judgment |
|---|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,745 | **2,757** | +12 | Tangled, stable. ARCH-02 OPEN, not urgent. |
| `functions/src/ai/chat.ts` | 2,666 | **2,641** | **−25** | **First decrease in several cycles.** FEAT-58 (Sonnet 5 + Opus 4.8 model consolidation, PR #1507) replaced inline model-string literals with references to the new `functions/src/ai/models.ts` table. Real cleanup, not just noise — but absolute size (2,641L, `buildQuestPrompt` still 400+L) keeps ARCH-01 OPEN as the top decomposition target. |
| `src/features/quest/useQuestSession.ts` | 2,215 | **2,215** | 0 | Unchanged. ARCH-04 OPEN. |
| `src/features/books/BookEditorPage.tsx` | 2,103 | **2,103** | 0 | Unchanged. ARCH-03 low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,876 | **1,876** | 0 | Unchanged. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | **1,623** | 0 | Unchanged. |
| `functions/src/ai/contextSlices.ts` | 1,581 | **1,617** | +36 | FEAT-57 added the `learnerModel` context slice (`8702a01`). Slow, attributable growth. ARCH-14 OPEN (watching). |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606 | **1,606** | 0 | Unchanged. |

**No new files crossed the 1,500L threshold this cycle.**

**Watch list movement:**
- `src/features/today/TodayChecklist.tsx`: **1,169L → 1,287L (+118L)** — the single largest mover this
  cycle, entirely from FEAT-62's three PRs (`b4f7968`/`639799e`/`ffdac53`/`94c3ce8`/`b0d3099`): the
  workbook-join stamp, the backfill button, and the legacy-item label-fallback path. Now bigger than
  `RecordsPage.tsx` — worth adding to the standing watch list next cycle if growth continues.
- `src/features/shelly-chat/useShellyChatFlows.ts`: 1,123L → **1,134L** (+11, FEAT-59 chat copy/.md
  download/multi-file upload).
- `src/features/today/TodayPage.tsx`: 1,113L → **1,123L** (+10).
- `src/core/types/planning.ts`: 1,031L → **1,046L** (+15, FEAT-62's `workbookConfigId` stamp + registration type).

**All drift this cycle is attributable to named, shipped ledger rows — no silent/unexplained growth found.**

### 1.2 Bundle (ARCH-05 / ARCH-08)

**Current:** 4,080.44 kB / 1,208.07 kB gzip — up **+14.26 kB / +4.7 kB gzip** since 2026-07-05. A much
lighter cycle than the prior one (+89.5 kB/+29.2 kB gzip), consistent with this week's changes being
mostly bug fixes (FEAT-59/60/61/62) rather than new AI surfaces.

Root blocker **unchanged**: `AvatarThumbnail.tsx` still statically imports `three`, still used directly in
`AppShell.tsx`; zero `React.lazy()` in `router.tsx`. The 4-step split proposed in prior audits
(`ARCHITECTURE_AUDIT_2026-05.md §1.2`, restated 2026-07-05) is unchanged and still just a proposal.
**ARCH-05 / ARCH-08 still OPEN**, no new urgency signal this cycle.

### 1.3 WorkbookConfig → ActivityConfig migration (ARCH-06) — trend reversed

Re-verified: **43 `WorkbookConfig` references across 12 files** in `src/`/`functions/src/` (excluding
tests) — **up** from 35 refs / 8 files at 2026-07-05 (which was itself down from 49/9 at 2026-06-21).
This is the first *increase* since the migration started being tracked.

Root cause: FEAT-62 needed to resolve workbook configs for **legacy, unstamped** Today checklist items
(items planned before the lock-in join existed), so it added `src/core/utils/workbookMatching.ts` (new,
3 refs), `src/features/today/useUnifiedCapture.ts` (new, 5 refs), and grew `TodayChecklist.tsx`'s own
ref count (new, 4 refs) — all genuinely necessary for that bug fix, not sloppy reuse. But it means new
code shipped this week against the legacy `WorkbookConfig` shape rather than `ActivityConfig`-only
semantics, which pushes the "safe to complete" bar for ARCH-06 further out. **Recommendation:** treat
ARCH-06 as needing an explicit re-scope decision (home-base chat), not an assumption that the ref count
will keep trending down unattended — the planner cluster (`PhotoLabelForm.tsx` alone: 8 refs) was already
the dominant blocker before this week's addition.

### 1.4 Test coverage (TEST-01 / TEST-02 / TEST-04)

**Root: 3,459 tests / 248 files (+182 tests / +16 files since 07-05); functions: 563 tests / 31 files
(+36 tests / +4 files).**

- **TEST-01**: `progress/` still has just **1** test file (`multiPageScan.test.ts`, unrelated to
  `DispositionProfile.tsx`) — unchanged, still OPEN. `dad-lab/`'s share remains ADDRESSED (still 9 files,
  no new dad-lab test additions this cycle).
- **TEST-04** (`useDadLabReports.ts` hours/XP credit loop + `DispositionProfile.tsx` narrative-parse):
  re-verified **still OPEN** — `grep -l useDadLabReports src/features/dad-lab/*.test.*` still empty, no
  `DispositionProfile` test file exists. Unchanged.
- **TEST-02** (`BookEditorPage.cover.test.tsx` flake): file still present, ran green this pass (as before,
  flakiness by definition doesn't show every run — not re-verified for the flake itself).
- The week's +182 root tests came from the weekly test-builder (4 files: `curriculumMap`, `missions`,
  `mineRecap.logic`, `roundToFiveMinutes` — PR #1504) plus tests shipped inline with FEAT-57 through
  FEAT-62/DOC-09. None of that new coverage touches TEST-01/TEST-04's named gaps.

### 1.5 New findings this cycle

**None requiring a fresh ledger ID.** Everything material this week is either (a) attributable drift on
an existing large file (§1.1), (b) a reversal on an existing tracked metric (ARCH-06, §1.3), or (c) a
ledger-hygiene lag — see §5.1.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 "Where is Lincoln" (FUNC-01) — confirmed-fine, no new claimants

No new surface introduced this week claims authority outside the standing hierarchy
(`skillSnapshots` → academic state; `children` → identity; `childSkillMaps` → coverage;
`activityConfigs` → position). FEAT-57's `learnerModel` context slice and FEAT-60's per-child
learner-model loading are both **read** paths into the existing Learner Model layer (itself already
folded into the hierarchy per the 2026-07-05 audit) — neither writes a new competing source of truth.

### 2.2 Loop integrity — the FEAT-62 fix directly strengthens the loop

FEAT-62 (three PRs this week) is itself a **loop-integrity fix**: Today work-capture photos on
workbook-linked items were saving as plain artifacts without registering against the curriculum scan
pipeline, so completed work silently failed to advance `activityConfigs` position — a real instance of
the "sparse-upload"/"silent starve" failure mode this audit's Lens 1 exists to watch for. Traced the fix
concretely: `b4f7968` stamps `workbookConfigId` on plan items at lock-in → `639799e` routes per-item
captures on stamped items to `syncScanToConfig` (deterministic pin, not fuzzy match) → `94c3ce8` extends
the same join to **legacy** unstamped items via label fallback (so the fix isn't lock-in-only) →
`ffdac53`/`b0d3099` give the parent a one-tap manual backfill + visible confirmation line for anything
that still slips through. This closes a real capture→state-label gap called out as a standing risk in
`PROCESS_OVERVIEW.md` (iii). No new dead ends introduced by the fix itself.

### 2.3 Shelly's path — confirmed-fine

No changes to the energy selector, MVD floor, or rollover logic this cycle (no commits touched
`src/features/records/` or `TodayChecklist.tsx`'s core checklist-state logic — only its capture/backfill
affordances, §2.2). FEAT-59's chat copy/download/multi-file-upload additions are parent-chat-only
conveniences, not part of the daily checklist path.

### 2.4 Kid voice-first — confirmed-fine

FEAT-62's new "Analyze as workbook scan" button and "Registered to {workbook}" confirmation line
(`TodayChecklist.tsx:1019,1097`) are tap-only, no new `TextField`s. No kid-facing surface changed this
cycle in a way that reintroduces typing over tapping.

### 2.5 Multi-kid generality sweep — ARCH-41/ARCH-42 re-verified, both still open and unfixed

Re-checked both findings from 2026-07-05 directly against current source — **no drift, no fix landed**:

- **ARCH-41** (cosmetic, LOW-MEDIUM): `KidTodayView.tsx:235` (`isLincoln = child.name.toLowerCase() ===
  'lincoln'`) and `MyAvatarPage.tsx:1365` (`childIsLincoln = child.name.toLowerCase() === 'lincoln'`,
  inside the child-switcher tab loop) are both present, unchanged, same line numbers. Note:
  `MyAvatarPage.tsx:246`'s own *active-child* `isLincoln` remains correctly derived from
  `profile.themeStyle`/age group (the ARCH-15 fix holds there) — only the switcher-loop instance at
  :1365 regresses.
- **ARCH-42** (MEDIUM, blocks second-child use): `KidLabView.tsx:54,278`
  (`isLincoln = childName === 'Lincoln'`) still gates the 5-step Scientific-Method flow vs. the simpler
  2-field form. Unchanged since 2026-07-05; this week's Dad Lab-adjacent work (none — no commits touched
  `src/features/dad-lab/` this cycle) had no opportunity to touch it either way.

FEAT-60's general-mode fix is a **positive** Lens-2 data point this week: it explicitly iterates the
family's child list (`buildAllChildrenLearnerModels`, no hardcoded names/count, built post-ARCH-40) rather
than assuming two children — verified in the diff, not just the commit message.

### 2.6 MO→TX compliance, Band-2/UX layer — confirmed-fine

No commits this cycle touched `chatPlanner.logic.ts`, `PlannerChatPage.tsx`'s time-budget logic, or
`TodayPage.tsx` in a way that introduces new state-config coupling. Unchanged from 2026-07-05.

---

## Step 3 — Pedagogy & Ethos (Band 3)

### 3.1 Charter preamble coverage — confirmed-fine, no regression

`CHAT_TASKS` registry (`functions/src/ai/tasks/index.ts:25-46`) still has exactly **21 keys**, unchanged
from 2026-07-05 — FEAT-57's `learnerSynthesis` is a scheduled/callable function
(`generateLearnerSynthesisNow`, already counted in the 26 Cloud Functions total), not a new chat task
type, so it doesn't touch this count. All 21 confirmed carrying the charter preamble, same as last cycle.

### 3.2 Pace/pressure language scan — confirmed-fine

Swept `functions/src/ai/learnerSynthesis.ts` and `functions/src/ai/tasks/learnerSynthesis.ts` (FEAT-57,
new this cycle) for behind/ahead/grade-level/percent/score framing — **zero hits**. No new pace/pressure
language introduced anywhere this week.

### 3.3 Diamonds-not-scores — confirmed-fine

No new score/percentage/level-number UI surfaces shipped this cycle (FEAT-59/60/61/62 are all
chat-UX/upload/routing fixes, not new progress displays).

### 3.4 New-surface charter alignment — confirmed-fine

FEAT-62's parent-facing "Registered to {workbook} · Lesson {n}" confirmation line and "Analyze as
workbook scan" backfill button (§2.4) carry no shame/urgency framing — informational only, matching the
no-judge convention already established for records/compliance surfaces.

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — still FIXED, unchanged

No commits this cycle touched `src/features/records/records.logic.ts` at all (`git log
f4ff81c..HEAD -- src/features/records/` is empty) — the single-counting-path invariant had zero
opportunity to drift this week.

### 4.2 DATA-02 — still NEEDS-DATA, now further overdue

Freeze window (2026-07-01) is now **11 days elapsed** (was 4 days at the 2026-07-05 audit), with still no
repo-visible follow-up commit or ledger note. Genuinely unresolvable from a repo-only audit — flagging the
growing gap so the owner sees it's not just "due," it's aging. Ledger status updated to reflect the longer
overdue window.

### 4.3 DATA-13 — still OPEN, unchanged

Re-verified all four sites directly: `records.logic.ts:809` (`<title>`), `:836` (`<h1>`), `:873`
(`Core at home (MO &ge;600)`), `:909` ("intended for Missouri homeschool record-keeping purposes") — byte-
identical to 2026-07-05, no new sites, no fix landed. `StateComplianceConfig` still has no `reportTitle`
field. Still a trivial 3-4 line PROMPT_FIX.

### 4.4 Additive-hours invariant — no changes to evaluate this cycle

Zero commits since 2026-07-05 touched hours-computation logic (`src/features/records/`,
`collectHoursContributions`, `dayLogMinuteContributions`) — nothing to re-verify beyond confirming the
absence of change. DATA-14's one hours-affecting commit (flagged 2026-07-05) remains the only
non-additive change of the current window; no new one this cycle.

### 4.5 New MO-hardcoding since 2026-07-05 — none found

Re-swept `src/` and `functions/src/` for new Missouri/MO/600-hour literals — only the four already-known
DATA-13 sites, unchanged. No fresh Lens-3 regression.

### 4.6 Other DATA- items (status as recorded, not re-investigated in depth)

No `DATA-17+` rows exist yet. DATA-14/DATA-15/DATA-16 status unchanged from 2026-07-05.

---

## Step 5 — Findings Table and Summary

### 5.1 Ledger-hygiene correction (mechanical, applied directly)

Seven rows were still marked `BUILT/DONE (PR open ...) — do not merge` in the ledger despite their PRs
having been reviewed and merged by the owner days ago. Cross-checked each against `git log --merges` on
`main`:

| ID | Was | Now | PR | Merged |
|---|---|---|---|---|
| FEAT-57 | BUILT (PR open 2026-07-06) — do not merge | **MERGED** | #1506 | 2026-07-06 |
| FEAT-58 | BUILT (PR open 2026-07-06) — do not merge | **MERGED** | #1507 | 2026-07-06 |
| FEAT-59 | BUILT (PR open 2026-07-06) — do not merge | **MERGED** | #1508 | 2026-07-06 |
| FEAT-60 | BUILT (PR open 2026-07-06) — do not merge | **MERGED** | #1511 | 2026-07-06 |
| FEAT-61 | BUILT (PR open 2026-07-06) — do not merge | **MERGED** | #1513 | 2026-07-06 |
| FEAT-62 | BUILT (PR open 2026-07-10) — do not merge | **MERGED** | #1515/#1517/#1520 | 2026-07-10 |
| DOC-09 | DONE (PR open 2026-07-10) — do not merge | **MERGED** | #1518 | 2026-07-10 |

This is a status-only correction (no rows added/removed/reordered) — `docs/review/REVIEW_HOME_BASE.md`
diffs `+14/−14` lines, one file, all within existing rows.

### 5.2 Items re-verified this cycle

| ID | Band | Was | Now | Notes |
|---|---|---|---|---|
| ARCH-01 | 1 | OPEN, +89L | OPEN, **−25L** | First decrease in several cycles (FEAT-58 model-string cleanup); absolute size still the top target |
| ARCH-02/03/04/05/08/13/14 | 1 | various OPEN | OPEN, re-verified | Current line/bundle counts recorded; see §1.1/1.2 |
| ARCH-06 | 1 | OPEN, 35/8 | OPEN, **43/12 — trend reversed** | FEAT-62's necessary legacy-shape coupling; recommend explicit re-scope decision |
| ARCH-41 | 1 | OPEN | OPEN, unchanged | Same two sites, unfixed |
| ARCH-42 | 1 | OPEN | OPEN, unchanged | Same two sites, unfixed |
| TEST-01/TEST-02/TEST-04 | 1 | OPEN/PARTIAL | unchanged | No new coverage on the named gaps |
| DATA-02 | 4 | NEEDS-DATA, 4 days overdue | NEEDS-DATA, **11 days overdue** | Escalating, still repo-unresolvable |
| DATA-13 | 4 | OPEN, 4 sites | OPEN, unchanged | Byte-identical re-check |
| FEAT-57/58/59/60/61/62, DOC-09 | 2/4/1 | PR open — do not merge | **MERGED** | See §5.1 |

### 5-line executive summary

**Baseline GREEN** — lint 3 warnings (unchanged), tsc clean, 3,459/248 root tests + 563/31 functions
tests passing (real growth, all attributable), bundle 4,080 kB (+14 kB, a light cycle), `docs:check` all
HARD checks pass with the same 11 SOFT warnings as DOC-09's day-one baseline (no new resilience drift).
**Housekeeping:** corrected 7 ledger rows (FEAT-57–62, DOC-09) from stale "PR open" language to
**MERGED** — all were already reviewed and merged by the owner days before this audit ran.
**Top open finding, unchanged:** ARCH-42 — `KidLabView.tsx`'s Scientific-Method flow is still gated on
the literal string `"Lincoln"`; ARCH-41's cosmetic sibling is also still open. Neither has had a
PROMPT_FIX run against it yet. **New-this-cycle signal:** ARCH-06 (WorkbookConfig→ActivityConfig
migration) reversed direction (35→43 refs) because FEAT-62's loop-integrity fix needed legacy-shape
compatibility — worth a re-scope conversation, not an emergency. **Recommended PROMPT_FIX sequence
(unchanged from 2026-07-05, still not run):** DATA-13 (trivial, 4 sites) → ARCH-42 (higher-severity
multi-kid blocker) → ARCH-41 (cosmetic) → TEST-04 (`useDadLabReports.ts` + `DispositionProfile.tsx`) →
DATA-02 (owner action against a live Firestore export, now 11 days past due, not a PROMPT_FIX).
