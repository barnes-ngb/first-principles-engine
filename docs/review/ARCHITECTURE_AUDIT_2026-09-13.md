# Architecture Audit — 2026-09-13

> **Type:** Monthly deep audit (scheduled run — cadence has run roughly weekly this series, but the
> prior audit slipped to 14 days: the 2026-09-08 entry in the audit chain was a scoped census
> (`LEARNING_MODEL_CENSUS_2026-09.md`, AUDIT-217), not a full architecture pass, so this run's window
> reaches back to the last full pass, 2026-08-30).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-09-13
> **Branch:** `claude/brave-feynman-sye3jt` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior full architecture audit:** `ARCHITECTURE_AUDIT_2026-08-30.md` (merged, `origin/main` at
> `fc93f35`, 2026-08-29). Intervening scoped audits (not superseded, orthogonal scope): AUDIT-217
> (learner-model census, 2026-09-08), the Ask AI functional audit part A (2026-09-05), the AI-development
> review (2026-09-05/06), the books UX audit and style audit (2026-09-03).
> **Window covered:** 2026-08-29 → 2026-09-13 (a real two-week window, not this series' usual one —
> **523 commits**, **752 files changed, +98,899 / −7,664 lines** repo-wide; **697 files / +90,709 / −7,346**
> under `src/` + `functions/src/`, of which 353 are non-test files). This is roughly **4×** the size of
> the 08-23→08-30 window's diff (113 files / +11,216) on the same file-count basis. Headline: the
> child-switch attribution class was closed end-to-end (`FIX-231`/`FIX-232`, the switcher is back ON),
> a profile-child duplication bug was found and fixed at its root (`UX-394`, deterministic seed ids),
> the whole `functions/`↔`src/` duplication concern this series has tracked since 08-23 (`ARCH-47`) is
> now **fully resolved**, the functions runtime moved to **Node 22** ahead of the Node 20 EOL this series
> has been counting down (`ARCH-17`, now closed), a from-scratch Learner Model engine census and
> bootstrap shipped (`FIX-219`, `AUDIT-217`), and — landed two days ago — a fresh self-audit of every
> place time is logged and reported (`AUDIT-234`) that found a real, still-open compliance-data-loss
> risk this report leads with (§4.1 / `UX-409`).

---

## Step 0 — Baseline

```
npm ci (root)                         → fresh container, clean install (646 packages)
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 9,530 tests passing + 1 skipped (673 files), 0 failing
cd functions && npm ci                → fresh container, clean install (685 packages)
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 1,441 tests passing (64 files), 0 failing
npm run build                         → dist/assets/index-*.js  4,573.26 kB │ gzip: 1,375.80 kB
npm run docs:check                    → HARD green, 10 SOFT warnings (see 1.11)
```

**Baseline: GREEN.** No flakes observed. Root vitest took ~6.7 minutes wall-clock (673 files, 9,531
tests) — this series' first run over 600 test files; noted for the record, not a finding.

Root tests: **552 → 673 files (+121), 8,013 → 9,530 tests (+1,517)** since the 2026-09-07
`HEALTH_REPORT.md` baseline (the closest recent count; the 08-30 audit's own baseline was 421 files /
6,342 tests, so **+252 files / +3,188 tests** over this report's full two-week window). Functions:
**41 → 64 files (+23), 1,064 → 1,441 tests (+377)**. Consistent with this codebase's standing norm —
every feature run in the window shipped tests alongside its change; no red baseline anywhere in the
523-commit history was found in this audit's spot checks.

**`npm audit` (prod-only, `--omit=dev`) — NEW dependency debt this window, first non-zero result in two
cycles.** Root: **1 moderate** (`fflate` 0.8.0–0.8.2, ReDoS-adjacent infinite loop on malformed ZIP64
archives, fix available non-breaking). Functions: **3 moderate** (`qs` array-limit bypass + DoS, via the
`body-parser`/`express` transitive chain, fix available non-breaking). Neither package was added or
bumped by this window's own commits (`git diff fc93f35..HEAD -- package-lock.json functions/package-lock.json`
shows no `fflate`/`qs` diff) — these are newly-disclosed advisories against pre-existing transitive
deps, not new dependency additions. Already known: `docs/HEALTH_REPORT.md` (2026-09-07) flagged the same
two findings the same way ("was 0 last cycle... not applied per policy, moderate-only"), so this is
independent re-confirmation, not a new discovery. **Not urgent** (moderate-only, non-breaking fixes
available whenever a run wants to spend the `npm audit fix` cycle) but worth a line since the prior two
audit cycles could report a clean prod-tree and this one can't.

**Bundle:** 4,362.99 kB → **4,573.26 kB** (+210.27 kB), 1,301.48 kB → **1,375.80 kB gzip** (+74.32 kB
gzip) since the 08-30 baseline. `grep -n "React.lazy\|lazy("  src/app/router.tsx` still returns **zero**
matches — **ARCH-05/ARCH-08 unchanged, zero code-splitting**, now the fourth consecutive full-audit cycle
with the exact same recommendation and no movement.

**`npm run docs:check`:** HARD green. `[ledger-ids]` **554 rows** (was 292 at 08-30 — the ledger itself
doubled in the window, expected given the diff size). `[ledger-status]` PASS, `[ledger-status-contradiction]`
PASS. `[collection-count]` all spans == **47** (unchanged). SOFT warnings: 2 `raw-refs` (same two files,
`ArmorTab.tsx`/`DevAdminTab.tsx`, unchanged), 7 `remote-timeout-finally` (was 8 — one closed, not traced
further this cycle), 1 `image-downscale` (unchanged), and `silent-fallback-census` now **105 swallowed
catches across 58 files** (was 97/54 at 08-30 — **+8 catches / +4 files** against 697 changed files,
i.e. the window's fixes again roughly kept pace with new sites, though not quite net-zero this time).

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window's headline lens-1 hits are **AUDIT-234** (a parent-reported "the days here isn't updated"
turned into a systematic census of every time-logging/reporting surface, landing three fixes and filing
six more findings, one of them a real data-loss path — §2.2/§4.1) and **FIX-232/UX-394** (the child-switch
attribution class closed end-to-end, plus a from-scratch fix for a profile-child duplication bug that had
been silently accumulating ~20 stray `children` documents — a lens-2 hit as much as a data-integrity one,
since the bug's root cause was a check-then-act race with no capability gate at all).

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — significant growth across the board; one file crossed a size class it hadn't before

Full `find src functions/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn`, filtered to every
production file ≥1,500L, with deltas measured against the 08-30 baseline (`git show fc93f35:<path> | wc -l`):

| File | 2026-09-13 | Δ since `fc93f35` (08-29) | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | **3,950L** | **+655** | Tangled — ARCH-02, OPEN, now its **fourth** consecutive cycle with the same unaddressed recommendation, and the file grew faster this window than in any prior one measured (see 1.2). |
| `functions/src/ai/chat.ts` | **3,051L** | **+410** | Cohesive-but-big — ARCH-01, OPEN. Largest single-window growth on this file this series has recorded (see 1.3). |
| `src/features/books/BookEditorPage.tsx` | 2,414L | +301 | Cohesive-but-big — ARCH-03, OPEN, growing faster than its recent trend (was flat 07-12→08-30). |
| `src/features/quest/useQuestSession.ts` | 2,275L | +57 | Tangled — ARCH-04, OPEN, modest growth. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,934L | +58 | Cohesive-but-big — CLAUDE.md tech-debt note, unchanged judgment. |
| `src/features/workshop/WorkshopPage.tsx` | **1,928L** | **+305** | Cohesive-but-big, not urgent per standing judgment — but this is the largest single-window jump this file has had; watch. |
| `functions/src/ai/tasks/shellyChat.ts` | 1,919L | **−19** | Cohesive-but-big — ARCH-01 sibling, still OPEN but the first *shrink* this series has recorded for this file; the 08-30 report's "watch it cross 2,000L" call is now moot for this cycle. |
| `src/features/progress/CurriculumTab.tsx` | **1,863L** | **+818 (newly over 1,500L)** | **New decomposition candidate — filed as `ARCH-50`.** Was 1,045L at 08-29 — the single largest percentage and absolute growth of any file in this window. Driven by real, cohesive feature work named in `CLAUDE.md`'s own section (the strand type, UX-279/280 rename+aliases, UX-354 reassign-to-child, UX-363's `todayRowKind` door text, UX-326's two doors moved in) — each addition is a self-contained block per the CLAUDE.md narrative, not obviously tangled, but the file has nearly doubled and crossed the audit's decomposition-review threshold for the first time. **Recommend a design-first read next cycle** before it becomes a decomposition project nobody can find the seams in. |
| `src/features/today/TodayChecklist.tsx` | 1,795L | +198 | Watch-list, continuing steady growth (1,597→1,795 over two windows). |
| `src/features/today/TodayPage.tsx` | **1,792L** | **+420 (newly over 1,500L)** | **New watch-list entry.** Was 1,372L at 08-29; UX-352's day-plan-gate reporting, UX-351's rollback-and-report rework, and UX-200/UX-261's day-type control all landed here this window per `CLAUDE.md`. Cohesive per the same per-feature-block read as CurriculumTab; flag for next cycle's decomposition read rather than judge in the same pass its own growth was measured. |
| `src/features/records/dataReviewExport.logic.ts` | 1,761L | +49 | Tangled — ARCH-44, OPEN, unchanged judgment, modest growth. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,682L | +138 | Cohesive-but-big, continuing to grow (was flat at 08-30, now +138 this window — UX-198/UX-206 lineage). |
| `functions/src/ai/contextSlices.ts` | 1,627L | +10 | Tangled — ARCH-14, OPEN, essentially flat. |
| `src/features/records/RecordsPage.tsx` | **1,612L** | **+148 (newly over 1,500L)** | **New watch-list entry.** Was 1,464L; UX-388's week-by-subject section and AUDIT-234's week-selector work are the likely drivers per `CLAUDE.md`'s `weekly-review/` and `records/` narrative. Not yet judged tangled — first appearance at this size. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606L | +0 | Leave as-is per CLAUDE.md — Three.js render loop, untouched. |
| `src/features/settings/DevAdminTab.tsx` | **1,530L** | **+484 (newly over 1,500L)** | **New watch-list entry**, the second-largest absolute growth in the window after CurriculumTab. Was 1,046L; `ghostChildDocs.ts`'s UX-394 duplicate-survey UI and `restoreScanLoweredLevels`'s UX-383 restore dialog are admin-only diagnostic panels per `CLAUDE.md` — each a bounded, single-purpose tool bolted onto one tab file rather than tangled logic. Worth a "should these panels get their own route" design note next cycle rather than a decomposition judgment this one. |
| `src/features/shelly-chat/useShellyChatActions.ts` | **1,506L** | **+152 (newly over 1,500L)** | **Crossed the table's threshold — the trend the 08-30 report flagged as a standing watch-list ("943→1,112→1,354 over three windows, ~150–250L/week... same trend line ARCH-13/ARCH-02 showed before they became decomposition candidates") has now arrived.** This is the clearest "the watch-list call was correct" result in this cycle's data — see 1.4. |

**Two files legitimately shrank or held flat this window against a background of otherwise near-universal
growth** (`shellyChat.ts` −19L, `VoxelCharacter.tsx` +0L, `contextSlices.ts` +10L) — worth naming precisely
because they show the growth pattern above is not simply "the whole codebase grew 25%"; it's concentrated
in the surfaces that shipped real user-facing feature work this window (planner, today, curriculum, dev
admin, chat portal), which is the expected shape for a two-week feature sprint, not an unexplained
across-the-board bloat.

### 1.2 ARCH-02 (`PlannerChatPage.tsx`) — the standing recommendation, now unaddressed for a fourth cycle, on the file's fastest-growing window yet

`git diff fc93f35..HEAD --stat -- src/features/planner-chat/PlannerChatPage.tsx` shows real, substantial
activity this window (+655L net) — this is not a dormant file the way 08-30 found it. The 08-16/08-23/08-30
audits all named the live-day-edit handler trio (`handleRemoveItem`/`handleMoveItemToDay`/`handleSwapWatchItem`)
as the next clean seam. Re-checked this cycle:

```
grep -n "handleRemoveItem\|handleMoveItemToDay\|handleSwapWatchItem" src/features/planner-chat/PlannerChatPage.tsx
```

All three handlers are still present in the file (now at drifted line numbers reflecting the +655L of
intervening insertions). **Unchanged recommendation, now going into its fourth consecutive cycle
unaddressed, on a file that just grew faster than in any prior measured window** — the seam identified
three cycles ago hasn't gotten easier to cut by waiting; if anything the file's continued growth around
it is the argument for cutting it now rather than a fifth time.

### 1.3 `functions/src/ai/chat.ts` (ARCH-01) — largest single-window growth this series has recorded

+410L this window (2,641L → 3,051L), the largest jump for this file across every cycle this report series
has tracked (it sat flat at 2,641L from 07-12 through 08-30, four consecutive audits). `buildQuestPrompt`
(the function the 07-19 audit measured at 519L, the largest single function found at that time) was not
independently re-measured this cycle given the size of the window; recommend the next cycle re-run that
measurement given the file's now-active growth. **Cohesive-but-big judgment held for now** — this is a
task-handler file with many independent prompt builders, the shape the "cohesive" judgment was made
against — but a file this large growing this fast is worth watching for whether the *new* additions are
following the same one-function-per-task-type shape or starting to tangle.

### 1.4 `useShellyChatActions.ts` — the watch-list call resolved exactly as predicted

The 08-30 report flagged this file's three-cycle growth trend (943→1,112→1,354L, ~150–250L/week) as
"worth a standing watch-list line, same treatment as `shellyChat.ts`." This window: 1,354L → **1,506L**
(+152L, squarely inside the predicted per-week range for a two-week window), crossing the audit's
1,500L table threshold for the first time. **Not yet judged tangled** — no seam identified this cycle —
but flagged as the first concrete confirmation this series' growth-trend early-warning method (flag a
file approaching the threshold before it crosses, rather than only reacting after) produces a correct
call. Recommend a first decomposition read next cycle now that it's in the table.

### 1.5 Bundle (ARCH-05/ARCH-08) — steady growth, still zero code-splitting, four cycles unchanged

+210.27 kB / +74.32 kB gzip since 08-30 (see Step 0). `AvatarThumbnail.tsx` still statically imports
`three` into always-rendered nav chrome (`AppShell.tsx`) — not re-verified at exact line numbers this
cycle given the window size, but the file does not appear in the window's diff (`git diff fc93f35..HEAD
--stat -- src/features/avatar/AvatarThumbnail.tsx` is empty), so the 07-19 finding stands unmoved.
**Band 1, ARCH-05/ARCH-08, OPEN — unchanged, now the fourth full-audit cycle with an identical finding
and no movement.** Given the standing nature of this recommendation, it may be worth a dedicated
`PROMPT_FIX` run rather than a fifth re-verification next cycle.

### 1.6 Test coverage (TEST-01) — genuine partial progress this window, but on the narrower half of both named gaps

- **`DispositionProfile.tsx`** — **no longer zero test files.** `DispositionProfile.childSwitch.test.tsx`
  (129L, added by `FIX-232`, commit `0ea5819`) now exists — the first test file this component has ever
  had, closing the literal "genuinely zero" framing the 08-30/08-23 audits used. **But it is narrowly
  scoped**: per its own header comment it tests exactly one regression class (UX-337 — the AI-narrative
  cache surviving a child switch), not the general AI-narrative-parse or parent-override-merge logic
  TEST-01 originally named as the highest-value target. **Status: IMPROVING → one real step, gap not
  closed.**
- **`SkillSnapshotPage.tsx`'s `persist` function** (now line 112, was 110 at 08-30) — still not
  independently confirmed under test this cycle (`grep -rl "persist" src/features/evaluation/SkillSnapshotPage.*.test.tsx`
  returns no hits); the file gained two more test files since 07-19 (`SkillSnapshotPage.levelNote.test.tsx`,
  `SkillSnapshotPage.sections.test.tsx`) beyond the original `.defaults.test.tsx`, but none of their names
  suggest they cover the general merge/`persist` path. **Not re-derived exhaustively this cycle — flag
  for next audit to confirm directly** rather than assert a negative from file names alone.
- **TEST-01 status: IMPROVING, with the first concrete file-level progress in several cycles** on one of
  its two named gaps.

### 1.7 ARCH-06 (WorkbookConfig → ActivityConfig) — essentially unchanged

`grep -rn -w 'WorkbookConfig' src functions/src --include=*.ts --include=*.tsx | grep -v '.test.'`: **29
refs / 10 files** (was 28/10 at 08-30 — +1 ref, no new file). **Band 1, ARCH-06, OPEN — unchanged.**

### 1.8 ARCH-07/ARCH-39 (Ladder deprecation) — confirmed still fully resolved, nothing removable found

`grep -rn "TODO.*[Ll]adder\|ladder.*TODO" src` returns zero hits. Both rows already read FIXED/RESOLVED
in the ledger; re-confirmed, no action needed.

### 1.9 ARCH-43 (Lincoln/London name-literal census) — the count dropped for a real, traceable reason

Re-run of the audit series' standing 3-pattern grep (`toLowerCase() === 'lincoln'` / `=== 'Lincoln'` /
`=== 'London'`, non-test): **18 sites / 16 files**, down from the "20 sites, unchanged" figure this row
carried through five consecutive re-verifications (most recently 2026-09-03, FEAT-180). The drop traces
to a real, already-ledgered deletion, not a grep artifact: `StoryGuidePage.tsx` and its sibling files —
named in this row's own "what remains" list as of the 2026-09-03 update — were **deleted outright** by
`FEAT-187` (2026-09-04, PR #1754, per `CLAUDE.md`'s books section: *"The Story Guide wizard is retired...
`StoryGuidePage`/`StoryGuideQuestion`/`useStoryGuide`/`GenerationProgress` are deleted"*). Confirmed:
`find src -iname "StoryGuide*"` now returns only a retirement regression test
(`src/features/books/__tests__/storyGuideRetired.test.ts`), no production file. **This is a name-count
reduction via feature deletion, not via name-gate remediation** — worth stating precisely so the number
isn't read as "two more sites got fixed" when the real story is "a whole surface that carried those sites
is gone." ARCH-43 stays **OPEN** (18 remaining sites, all previously classified as the permitted
cosmetic/personality carve-out or B6–B12 name-keyed data shapes per the row's own 2026-09-03 text) — not
re-logged as newly closed, just re-verified with the current, lower, explained count.

### 1.10 ARCH-17 (Node.js runtime) — closed mid-window, ahead of the EOL deadline this series had been counting down for eight cycles

`functions/package.json`'s `engines.node` moved from `"20"` to `"22"` (confirmed via
`git diff fc93f35..HEAD -- functions/package.json`), and root `package.json` gained a matching
`engines: { "node": ">=22" }`. This matches `CLAUDE.md`'s Deploy section: *"Functions run on Node 22
(ARCH-17)."* The 08-30 report had this at "61 days [to EOL], narrowing" as its eighth consecutive OPEN
re-verification; the ledger row already reads **FIXED** (PR #1751, 2026-09-04 — within this window, not
discovered by this audit), with a well-evidenced note (workflow `node-version` pins, `.nvmrc`, the
`firebase-tools`/`firebase-functions`/`firebase-admin` compatibility check, emit-layout parity, green
suites on Node v22.22.2). **Re-confirmed correct this cycle, no ledger action needed** — noted here
because it closes a recommendation this report series had repeated for eight straight cycles, ahead of
the 2026-10-30 deadline.

### 1.11 **RESOLVED — ARCH-47 (`functions/`↔`src/` duplication) is now fully closed, both new instances the 08-30 audit flagged included**

The 08-30 report's own headline new finding was that this window's predecessor (`monthlyHours.ts`,
`dadLabReportArtifacts.ts`) had produced a *third and fourth* pure-logic duplication of invariant-protected
rules, both guarded only by test-fixture parity rather than the compiler, and recommended "a dedicated
structural look" rather than another verbatim port. That structural look happened this window:

- `functions/src/ai/tasks/monthlyHours.ts`'s own header now reads: *"This module used to carry a
  hand-kept PORT of the whole counting path... That rule now has exactly ONE definition, in
  `functions/src/shared/hoursContributions.ts`, compiled by BOTH projects... The port and its fixture
  are gone."* Confirmed via import: `monthlyHours.ts` now imports `collectHoursContributions` directly
  from `functions/src/shared/hoursContributions.ts` rather than re-implementing it.
- `dadLabReportArtifacts.ts`'s `reportArtifactIds` (the UX-85 rule) is now defined once, in
  `functions/src/shared/dadLabReportArtifacts.ts`, with **both** the app side
  (`src/features/dad-lab/reportArtifacts.ts`) and the functions side
  (`functions/src/ai/tasks/dadLabReportArtifacts.ts`) re-exporting it rather than reimplementing it.

`functions/src/shared/README.md` — itself updated this window — now states: *"All four ARCH-47 slices
have landed. Every rule the work set out to consolidate... now has exactly one definition."* Its named
"one leftover" is `labBeatsHaveContent`/`beatTextForChild` (ports of `src/core/types/dadlab.ts`),
explicitly called out as a **different, lower-stakes** duplication, deliberately out of scope for all four
slices — not a new instance of the DATA-01/UX-85-class problem this row was raised to close. **The
ledger row (`ARCH-47`) already reads MERGED** (PRs #1721/#1723/#1727/#1728, 2026-08-31–09-01) — this
audit's contribution is confirming, by reading the actual current imports rather than the ledger text
alone, that the resolution is real and complete, not merely claimed. **No action needed; noting as a
genuine process win** — the 08-30 audit's "propose a structural fix rather than another verbatim port"
recommendation was taken, and it worked within the very next window.

### 1.12 Drift catalog beyond the headline files

Given the window's size (353 non-test files changed under `src/`+`functions/src/`), an exhaustive >150L
sweep of every file is not reproduced here in full; §1.1 already captures every production file that
crossed or grew materially past the 1,500L table threshold, which is where this series' `>150L` drift
rule has practical teeth. Two additional call-outs found while investigating other findings, both
explained by named feature work rather than unexplained growth:

- `src/features/progress/CurriculumTab.tsx` (+818L) and `src/features/settings/DevAdminTab.tsx` (+484L)
  are this window's two largest single-file deltas of any kind — see 1.1 for the per-feature accounting.
- `functions/src/shared/` gained real content this window (§1.11): `dadLabReportArtifacts.ts`,
  `plannerBoundary.ts`, `customPictureNote.ts` are new files in the shared directory since 08-29, each
  the single-definition home for a rule the app and functions previously duplicated or that this
  window's new UX-269 planner-boundary feature needed shared from day one.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — the decision doc's staleness gap named at 08-30 is still open, and the portal has kept growing past it

`DOC-17` (filed by the 08-30 audit, still OPEN per the ledger) named `DECISION_FUNC-01_source_of_truth.md`
as missing two writer rows (`conceptArcs`, `dadLabReports`) for FEAT-157's chat-portal writes. Re-checked
this cycle: `grep -n "conceptArcs\|dadLabReports" docs/review/DECISION_FUNC-01_source_of_truth.md` still
returns **zero hits** — the gap DOC-17 named is unchanged. Given the size of this window (the Shelly
portal's write surface kept growing throughout it — `CLAUDE.md`'s own shelly-chat section documents
continuing additive-write work), the doc's total staleness may now be wider than the two rows DOC-17
scoped, but this audit did not attempt a full re-derivation of every portal writer against the doc (that
is DOC-17's own job, not a fresh finding to duplicate). **Recommend DOC-17 stays the next `PROMPT_FIX`
target for this lane, scoped to re-survey the full writer table rather than just the two originally-named
rows, given how much has shipped since it was filed.**

### 2.2 AUDIT-234 ("crawl every place time is logged and reported") — a real, recent, well-evidenced loop-integrity self-audit, one finding still open and worth leading this report with

Landed **two days before this audit ran** (2026-09-12, `docs/review/TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md`),
prompted by a direct owner report (*"the days here isn't updated — I added time in artefacts and it
didn't change it for packing and independent play"*). This is exactly the kind of thing the "loop
integrity" lens exists to catch, and it was caught by a dedicated run rather than this audit — worth
naming as a process point in its own right (§5). Three fixes shipped (`UX-406` — the weekly review had
no week selector, defaulting to the wrong week on every day but Saturday; `UX-407` — a sentence promising
"saved overnight" about a Saturday already past; `UX-408` — counted minutes with no checklist-item
account). Six more findings were filed and remain **OPEN**, classified but not fixed:

- **`UX-409` (P1, Band 1) — re-verified live in this audit, still unfixed.** *A weekly review that fails
  to generate writes nothing, silently losing that week's `curriculumPositions` snapshot permanently.*
  Traced directly in `functions/src/ai/evaluate.ts`: in the has-evidence path of `generateReviewForChild`,
  `callClaude` runs at **line 1133**, and `loadCurriculumSnapshot` — the read that captures where each
  workbook stood that week, the only record of that fact anywhere in the repo (`ActivityConfig.currentPosition`
  is a single mutable field with no history) — does not run until **line 1174**, after the model call has
  already returned and been parsed. Any throw between those two lines (a rate limit, a missing secret, a
  parse failure, an outage) means `writeReviewDoc` never runs and that week's position snapshot is gone
  forever — no route in the app can recover it, and `UX-213`'s observed-coverage rate silently loses a
  baseline point. This is exactly the shape of bug the owner's original report describes, and the finding
  notes as much (*"This is very likely what the owner was looking at"*). **Proposed fix already scoped in
  the ledger row** (write the position snapshot before the model call, independent of the flaky
  dependency) — this is Band 1 *and* Band 4 (compliance data-loss), so it jumps this audit's priority
  queue per the ledger's own note-2 rule. **Recommend this as the #1 `PROMPT_FIX` target coming out of
  this audit.**
- `UX-410` (P2) — three AI-side readers count hours their own way, one asserting a 1000-hour target/
  percentage the app itself never shows a parent (worth checking against the no-shame/coverage-not-pace
  rule in a dedicated pass — flagged here for Step 3 visibility, not re-derived independently this cycle).
- `UX-411`/`UX-412` (P2) — a school-year definition mismatch between app and Cloud Functions (a month
  apart), and UTC- vs local-dated Workshop/Knowledge Mine records — both timezone-class bugs in the
  family of `familyClock.ts`'s own stated purpose (*"the one place a CF turns 'now' into a date"*),
  suggesting the rule that module encodes hasn't fully propagated to every date-deriving call site yet.
- `UX-413`/`UX-414` (P3) — a `createdAt` vs `date` range-query mismatch, and an answerable-before-the-week-
  ends question now that a week selector exists.

None of these are re-derived from scratch in this audit — they were found, classified, and evidenced by
AUDIT-234's own census two days ago, and this audit's contribution is (a) re-verifying `UX-409` directly
against current code rather than taking the ledger's word for it, since it is the highest-leverage one,
and (b) surfacing it prominently here since a two-week-old census that already did the work of finding a
real compliance-data-loss bug is exactly what a monthly architecture audit exists to catch and prioritize,
not silently duplicate.

### 2.3 FIX-231/FIX-232 (child-switch attribution class + the switcher going back on) — traced against the census/registry mechanism this series has praised before, and it held

`CLAUDE.md`'s `src/app/` section documents the full arc: the switcher was held behind
`CHILD_SWITCHER_ENABLED = false` from `UX-330` (2026-08-16 era) specifically because turning it on
widened the reach of every mounted child-scoped editor discussed in the `UX-329`/`FIX-220` census work
the 08-16/08-23 audits traced approvingly. `UX-329` built the registry + five-verdict vocabulary +
fail-closed invariant test (`childSwitchSurfaces.invariant.test.ts`) this window's `FIX-232` used to close
the remaining P1s (the census reports `{"P1":0,"P2":0,"P3":0}` per `CLAUDE.md`) before `FIX-231` flipped
the constant back to `true`. Re-verified this cycle: `grep -n "CHILD_SWITCHER_ENABLED" src/app/childSwitcher.ts`
shows `true`, and `npx vitest run src/test/childSwitchSurfaces.invariant.test.ts` (run as part of the
full suite above) passes. **This is the second time this series has watched a "hold a feature behind a
flag until its census reports zero known-class defects" arc complete successfully** (the first being
DATA-01's propose→confirm→write cycle at 08-30) — worth naming again as the pattern working, not just
the individual fix.

### 2.4 UX-394 (profile-child duplication) — a real, silent data-integrity bug found and fixed at its root, not patched at its symptom

`CLAUDE.md`'s `core/firebase/` section: a `useChildren` effect-driven `addDoc`-per-missing-name auto-create,
reached by 73 source files, was a check-then-act race with as many runners as there were mounts — the
family had accumulated **~20 documents named Lincoln and London** against two real boys, silently hidden
from every read path by a `dedupeChildrenByName` band-aid that had been running since. The fix
(`seedProfileChildren.ts`) is a deterministic id (`seed-<profile>`) written create-only inside a
`runTransaction`, closing the race at its source rather than adding a de-dupe pass; `ghostChildDocs.ts`
(now in `DevAdminTab.tsx`, §1.1) surveys the accumulated ghosts read-only with a parent-confirmed delete,
correctly treated as a data-cleanup action rather than something an automated run does silently. **This
is a strong lens-1/lens-2 example**: the bug was a capability-blind race (any of 73 call sites could
trigger it, with no name-gating involved), and the fix pattern (deterministic id + transaction, survey +
confirm for existing damage) is exactly the shape `CLAUDE.md`'s "propose → confirm → write" rule asks
for on a child's record.

### 2.5 DATA-17 (certificate-scan lane skips the learner-model sync) — still the one confirmed, unaddressed break in the capture→evaluate loop

Re-verified directly this cycle: `grep -n "syncWorkbookPositionToModel" src/core/hooks/useCertificateProgress.ts`
returns zero hits, confirming the row's finding is still live — a certificate scan still advances
`activityConfigs.currentPosition` without the FEAT-63 workbook-position→learner-model fold the worksheet
scan path performs. Unchanged from 08-22; not a regression, but the one concrete "does the loop actually
close" break this audit's Step-2 lens turned up beyond what AUDIT-234 already surfaced. Filed and scoped
already; not re-logged.

### 2.6 Shelly's path (no-shame) — clean, with one existing reframing example re-confirmed and no new violations found

Grepped AI task prompts and context slices for pace/pressure language (`behind`, `fail`, `should be at`).
Every hit found is either explicit no-shame guardrail language (`disposition.ts`: *"a light week is not
failure"*; `learnerSynthesis.ts`: *"Never say 'behind'. Never guilt the parent about logging"*;
`monthlyReview.ts`: *"Never use... 'behind'... coverage, never pace"*), or system/error-handling
`console.warn("...failed:", err)` calls that never reach a user-facing surface. One data field worth
checking directly: `scan.ts`'s AI-generated `alignsWithSnapshot: 'ahead'|'at-level'|'behind'|'unknown'`
schema field, which does carry the literal string `'behind'` as a possible AI output. Traced its render
path (`ScanResultsPanel.tsx`): the raw value is never shown — `ALIGNMENT_LABEL` maps `'behind'` to the
displayed string **"new — teach first"**, not "behind." **Re-confirms the no-shame reframing pattern is
correctly applied at the render boundary, not just requested in the prompt** — no new finding, but a
clean, specific spot-check worth recording since it's exactly the kind of gap ("the model is *told* not
to shame, but is the raw value ever rendered anyway?") this lens should keep checking each cycle.

### 2.7 Kid voice-first — spot-checked, unchanged, no regression found

`useAudioRecorder`/`AudioRecorder` narration confirmed still wired into `UnifiedCaptureCard.tsx` (Today's
capture surface) and `FluencyPractice.tsx` (Knowledge Mine reading fluency) — the two surfaces this
series' prior spot-checks have used as the reference points. `VoiceInput` (the FEAT text-input module)
remains wired into the Books generate/review chat surfaces. No new kid-facing surface was found requiring
typed input with no voice/tap alternative in this cycle's spot check (not an exhaustive sweep of the
window's 353 non-test file changes).

---

## Step 3 — Pedagogy & Ethos (Band 3)

- **Pace/pressure language:** clean — see 2.6. No new kid-facing shame copy found in this window's diff
  or in a fresh grep of current prompt/context-slice files.
- **Diamonds-not-scores / no-shame:** clean, with the `alignsWithSnapshot` render-boundary check (2.6) as
  this cycle's specific positive confirmation, in the same spirit as the 08-30 report's `PatternSummary.tsx`
  bare-`0%` example.
- **Charter preamble reach:** re-confirmed **21** task types still wired in `CHAT_TASKS`
  (`functions/src/ai/tasks/index.ts`), unchanged count. One pre-existing, **not new**, gap re-noticed
  while checking this: `analyzePatterns` (a separate, non-chat-dispatched Cloud Function per its own
  header comment — *"Context: childProfile (mapped in TASK_CONTEXT but not called — separate Cloud
  Function)"*) carries no `"charter"` slice in `TASK_CONTEXT`. This traces back to `DOC-04` (2026-06-07),
  which already found the "all 15/21 task files reference charter" claim overstated for exactly this kind
  of task — **not a new or worsening finding**, and `analyzePatterns` was not touched in this window's
  diff, so no regression. Noted only because it surfaced naturally while re-verifying the charter-reach
  count; not filed as a fresh row.
- **UX-410 (from AUDIT-234, §2.2)** is the one item this cycle that specifically warrants a Band-3 look
  next round — an AI-side hours reader "asserting a 1000-hour target and a percentage" is squarely a
  coverage-not-pace question this audit's pedagogy lens exists to catch, but it was filed by AUDIT-234's
  own census two days before this run and this audit did not re-derive it independently; flagged for the
  next cycle (or a dedicated fix run) to read against the no-shame rule directly.

**No new Band 3 findings this cycle; one pointer to AUDIT-234's own `UX-410` for next cycle's attention.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 **DATA-01 holds — and this cycle's real Band-4 headline is `UX-409` (§2.2), a live, unaddressed data-loss path in the sibling weekly-review record**

`computeHoursSummary` non-test callers, repo-wide: **`RecordsPage.tsx:480`, `dataReviewExport.logic.ts:1260`,
`weekly-review/useWeekHours.ts:40`, `weekly-review/weekBySubject.ts:418`** — **4 call sites**, up from the
2 the 08-30/every-prior-cycle count reported. The two new callers are `UX-388`'s week-by-subject feature
(per `CLAUDE.md`'s weekly-review section, pinned by its own test asserting the subject rows sum to
`computeHoursSummary`'s own total). **DATA-01 holds FIXED, protecting a wider set of consumers, no
regression.** But this cycle's actual highest-leverage Band-4 finding is `UX-409` (§2.2): unlike DATA-01's
rule, which is read many times and protected by tests, the weekly review's `curriculumPositions` field is
**written once per week and never again** — if that write is lost, there is no fold, no re-derivation, no
second reader that can reconstruct it. This asymmetry (a heavily-guarded, frequently-read invariant vs. an
unguarded, write-once, irreplaceable one two files away) is exactly the kind of thing a data-integrity
lens should be watching for, and it's real and currently unfixed.

### 4.2 DATA-02 — still NEEDS-DATA, now 74 days past the freeze window, eleventh week overdue

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved. The
2026-07-01 dedupe-window freeze is now **74 days** overdue (was 60 at 08-30, 53 at 08-23) —
**`(2026-09-13 − 2026-07-01) = 74 days`**, now in its **eleventh week** as the single longest-standing
item in the ledger. Still requires the owner to run the dedupe pass against a live Firestore export —
unresolvable from a repo-only audit.

### 4.3 DATA-13 — unchanged, 4 sites, line numbers shifted (not new occurrences)

`records.logic.ts:1046` (title), `:1073` (h1), `:1120` (statute prose), `:1150` (footer note) — was
`1109/1136/1183/1213` at 08-30, a flat downward shift consistent with earlier code in the same file
shrinking, not new literals. Same four plain-string Missouri literals in the same template-literal HTML
builder function. Still the same trivial, low-risk parameterization fix (route them through
`stateCompliance.ts`'s existing config rather than hardcoding "Missouri").

### 4.4 DATA-17 — see 2.5. Re-verified still open, unchanged.

### 4.5 MO→TX lens — no new hardcoding found

`Missouri`/`'MO'`/`MO_` hits confined to the same handful of files this series has tracked (`records.logic.ts`
per DATA-13, `stateCompliance.ts` — the config layer DATA-12 already extracted, by design). No new
MO-hardcoded surface found in this window's diff during any of the above investigations.

### 4.6 Additive-hours invariant — holds; broadened rather than narrowed this window

See 4.1. The invariant now protects two additional consumers (`useWeekHours.ts`, `weekBySubject.ts`),
both pinned by test to sum to the canonical total. No view added this window computes hours independently
of `collectHoursContributions`/`computeHoursSummary`.

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Already-fixed/already-resolved items confirmed live this cycle, not this cycle's own finding

- **`ARCH-47`** (§1.11) — confirmed fully resolved by reading actual current imports, not just the
  ledger's MERGED text. Already ledgered correctly; no status change needed.
- **`ARCH-07`/`ARCH-39`** (§1.8), **`DATA-01`** (§4.1), **`ARCH-17`** (§1.10, already correctly FIXED,
  PR #1751, 2026-09-04) — all re-confirmed live and correctly ledgered; no status change needed for any.

### 5.2 Status re-verifications this cycle (no new ledger writes needed — all already correctly reflected)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-17 | FIXED (PR #1751, 2026-09-04) | FIXED, unchanged — re-confirmed, closes an eight-cycle-standing recommendation | see 1.10 |
| ARCH-01 | OPEN | OPEN, unchanged — +410L this window, largest single-window growth recorded | see 1.3 |
| **ARCH-02** | OPEN (recommend live-day-edit handler trio extraction) | **OPEN — unaddressed for a FOURTH consecutive cycle; file grew +655L this window, its fastest yet** | see 1.2 |
| ARCH-03, 04, 06, 08, 14, 44 | OPEN | OPEN, unchanged | modest or flat growth (see 1.1, 1.5, 1.7) |
| ARCH-05 | OPEN | OPEN, unchanged — bundle +210.27 kB/+74.32 kB gzip, still zero code-splitting, fourth cycle unchanged | see 1.5 |
| ARCH-43 | OPEN (20 sites/19 files, re-verified 2026-09-03) | **OPEN — count dropped to 18 sites/16 files, explained by FEAT-187's deletion of the Story Guide wizard, not by name-gate remediation** | see 1.9 |
| **TEST-01** | IMPROVING (both gaps unchanged as of 08-23) | **IMPROVING — genuine first progress: `DispositionProfile.tsx` gained a (narrowly-scoped) test file; `SkillSnapshotPage.persist` still unconfirmed** | see 1.6 |
| DATA-01 | FIXED | FIXED, unchanged — now 4 guarded consumers (was 2) | see 4.1 |
| **DATA-02** | NEEDS-DATA (60 days overdue at 08-30) | NEEDS-DATA, now **74 days overdue (eleventh week)** | see 4.2 |
| DATA-13 | OPEN (lines 1109/1136/1183/1213) | OPEN — lines shifted to 1046/1073/1120/1150 (shift only, not new occurrences); same fix | see 4.3 |
| DATA-17 | OPEN | OPEN, unchanged — re-verified live | see 2.5 |
| DOC-17 | OPEN (filed 08-30) | OPEN, unchanged — the two originally-named rows are still missing; portal has grown further in the interim (see 2.1) | see 2.1 |

### 5.3 Mechanical doc fixes applied directly this cycle

- `docs/review/REVIEW_HOME_BASE.md` header: bump "Last audit" to 2026-09-13, add this report to the
  audit chain (prior: 2026-09-08 `LEARNING_MODEL_CENSUS_2026-09.md`; last full architecture audit before
  that: 2026-08-30 `ARCHITECTURE_AUDIT_2026-08-30.md`).
- No ledger status cells needed flipping this cycle — every row this audit re-verified (`ARCH-17`,
  `ARCH-47`, `DATA-01`, `ARCH-07`/`ARCH-39`) was already correctly reflected in `docs/review/REVIEW_HOME_BASE.md`
  §6 by the runs that closed them mid-window; this audit's contribution on each was independent
  confirmation against current code, not a ledger write.
- `docs/review/REVIEW_HOME_BASE.md` §6: **+1 new row**, `ARCH-50` (`CurriculumTab.tsx`'s +818L growth
  crossing the 1,500L decomposition-review threshold for the first time — see §1.1), appended after
  `UX-414` following the ledger's additive-only, append-at-end convention. Ledger gets **+1 new row / +0
  rewritten** this cycle overall — every other finding in this report was either a re-verification of an
  already-filed row, or an amplification of `AUDIT-234`'s own two-day-old findings, which already have
  IDs and don't need duplicates. No existing row reordered, rewritten, deleted, or reopened.
- `CLAUDE.md` Known Technical Debt section: every stale line-count parenthetical in the list corrected
  against the fresh `wc -l` figures gathered in §1.1/§1.12 — `PlannerChatPage.tsx` 3,295L → **3,950L**,
  `chat.ts CF` 2,641L → **3,051L**, `BookEditorPage.tsx` 2,113L → **2,414L**, `useQuestSession.ts` 2,218L
  → **2,275L**, `MyAvatarPage.tsx` 1,876L → **1,934L**, `WorkshopPage.tsx` 1,623L → **1,928L**,
  `useShellyChatFlows.ts` 1,134L → **1,246L**, `contextSlices.ts` 1,617L → **1,627L**, `ReadingQuest.tsx`
  1,066L → **1,067L**, the `WorkbookConfig → ActivityConfig` ratio 106/34 → **289/38** (whole-word,
  all-file grep, both counts re-derived together for a consistent methodology), and the bundle-size line
  "3.9MB (1.2MB gzipped)" → **"4.57MB (1.38MB gzipped)"** matching Step 0's build output. `VoxelCharacter.tsx`
  (1,606L) needed no change — genuinely flat. No prose/judgement changed, line counts and the one ratio
  only.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 9,530/9,531 tests passing +1
skipped across 673 files; functions: clean lint/tsc, 1,441/1,441 tests across 64 files; build clean,
bundle 4,573.26 kB/1,375.80 kB gzip, +210.27 kB/+74.32 kB gzip since 08-30; `npm audit` now 1 moderate
(root)/3 moderate (functions) — first non-zero result in two cycles, pre-existing transitive deps with
newly-disclosed advisories, already known via the 09-07 health report; `docs:check` HARD green, 10 SOFT
warnings, silent-fallback census 105/58 (was 97/54)). **Top 3 findings by leverage:** (1) **`UX-409`**
(re-verified live this cycle, §2.2/§4.1) — the weekly review's irreplaceable `curriculumPositions`
snapshot is written *after* the AI call in `evaluate.ts`, so any model-call failure silently and
permanently loses that week's workbook-position record, with no recovery route in the app; this is the
single highest-leverage, best-evidenced, currently-open finding in this report and was found by the
codebase's own `AUDIT-234` census two days before this run, not by this audit — the value this audit adds
is confirming it directly against current line numbers and prioritizing it correctly. (2) **`ARCH-02`**
(`PlannerChatPage.tsx`) — unaddressed for a fourth consecutive full-audit cycle, on its fastest-growing
window yet (+655L); the most stable, most-repeated, least-acted-on recommendation in this report series.
(3) **`ARCH-47`'s resolution** (§1.11) — the 08-30 audit's "propose a structural fix rather than another
verbatim port" recommendation was taken and landed within the very next window, closing all four
duplication slices; worth naming as a positive process signal alongside the two open items above, since a
report that only lists what's wrong misses that this series' own recommendations are being acted on.
**Recommend running `PROMPT_FIX.md` next against:** `UX-409` (compliance data-loss risk, already scoped
in its own ledger row — highest priority), then `ARCH-02`'s live-day-edit handler trio extraction (now
four cycles overdue), then `DOC-17` (mechanical, but rescope it to a full portal-writer resurvey given
how much has shipped since it was filed rather than just the two originally-named rows).
