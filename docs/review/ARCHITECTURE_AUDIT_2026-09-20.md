# Architecture Audit — 2026-09-20

> **Type:** Monthly deep audit (scheduled run — this series has run roughly weekly; the prior full
> pass was 7 days ago).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-09-20
> **Branch:** `claude/brave-feynman-4d7fh9` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-09-13.md` (window start, merge of PR #1847: commit `3478029`).
> **Window covered:** 2026-09-13 → 2026-09-20 — **97 commits, 215 files changed, +18,629 / −3,950 lines**
> (`git diff --shortstat 3478029..HEAD`). Roughly a quarter the size of the 08-29→09-13 window's diff on
> a file-count basis (215 vs 752), consistent with a one-week window against that report's two-week one.
> Headline: **`UX-409`, last cycle's own #1 recommended `PROMPT_FIX` target (the weekly-review
> data-loss risk), was fixed the same day the last audit's PR merged** (`FIX-236`, PR #1850,
> 2026-09-13) — the fastest this series has seen its own top recommendation actioned. The rest of the
> window is consolidation, not new architecture: the "one child control" sweep (`FEAT-237`/`UX-425`→`429`,
> deleting ten in-page `ChildSelector`s and three hand-rolled pickers), the Today evidence-list unification
> (`FEAT-238`/`UX-431`+), and five book-editor/sticker reliability passes (`FIX-248`→`252`). No new
> Band-1 architecture debt was found; one existing recommendation (`ARCH-02`) is now unaddressed for a
> **fifth** consecutive cycle without the file having grown around it this time — the first window in this
> series where that recommendation's file didn't get harder to extract from.

---

## Step 0 — Baseline

```
npm ci (root)                         → fresh container, clean install (646 packages)
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 10,211 tests passing + 1 skipped (717 files), 0 failing
cd functions && npm ci                → fresh container, clean install (685 packages)
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 1,509 tests passing (68 files), 0 failing
npm run build                         → dist/assets/index-*.js  4,619.20 kB │ gzip: 1,392.23 kB
npm run docs:check                    → HARD green, 10 SOFT warnings (see below)
```

**Baseline: GREEN.** No flakes observed. Root vitest took ~7.0 minutes wall-clock (717 files, 10,212
tests including the one design-skip) — a new high for this series' file count.

Root tests: **673 → 717 files (+44), 9,530 → 10,211 tests (+681)** since the 09-13 baseline. Functions:
**64 → 68 files (+4), 1,441 → 1,509 tests (+68)**. Consistent with this codebase's standing norm — every
run in the window shipped tests alongside its change.

**`npm audit` (prod-only) — unchanged from last cycle, no new dependency debt.** Root: 1 moderate
(`fflate`, unchanged). Functions: 3 moderate (`qs`/`body-parser`/`express` chain, unchanged). Neither
package moved this window.

**Bundle:** 4,573.26 kB → **4,619.20 kB** (+45.94 kB), 1,375.80 kB → **1,392.23 kB gzip** (+16.43 kB
gzip) since the 09-13 baseline — modest growth, roughly a fifth of the prior cycle's two-week delta on a
per-week basis. `grep -c "React.lazy\|lazy(" src/app/router.tsx` → **0**, unchanged — **ARCH-05/ARCH-08,
now a fifth consecutive cycle with zero code-splitting and no movement on either standing recommendation**
(the `jspdf` point-of-use dynamic-import split the 09-13 audit measured at −393.20 kB / −128.78 kB gzip,
and the `AvatarThumbnail.tsx`→`three` nav-chrome blocker on any `MyAvatarPage` route split). Re-confirmed
both still unbuilt: `grep -n "^import.*jsPDF.*from 'jspdf'" src/features/books/printBook.ts
src/features/books/printStickerSheet.ts` still shows two static top-level imports.

**`npm run docs:check`:** HARD green. `[ledger-ids]` **595 rows** (was 554 at 09-13 per that report's own
figure — +41 rows in a one-week window, most of them the `UX-`/`FIX-` rows this window's fix runs filed
and closed in the same cycle, see Step 5). `[ledger-status]` PASS, `[ledger-status-contradiction]` PASS.
`[collection-count]` all spans == **47** (unchanged). SOFT warnings: same **10** as 09-13, and for the
first time in this series' recorded history the **silent-fallback-census figure is exactly flat** —
**105 swallowed catches across 58 files**, byte-identical to 09-13's count despite 215 changed files this
window. The two `raw-refs` warnings are the same two files (`ArmorTab.tsx`, `DevAdminTab.tsx`), and the
`remote-timeout-finally` count is the same 7 sites. Nothing in this window's diff touched any of those
14 flagged locations.

---

## Step 0.5 — Audit lenses carried forward

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window's clearest lens-1 result is **`UX-409`'s fix landing** (§2.1) — the loop's one identified,
unrecoverable data-loss point closed within hours of being flagged. The clearest lens-2 result is
**`FEAT-237`'s "one child control" sweep** (§2.2) closing out the last of the `UX-329` child-switch census
rows on the three hand-rolled pickers a grep for `<ChildSelector` couldn't see (`ArmorTab`,
`MyAvatarPage`, `AvatarAdminTab`) — and, as a side effect of deleting `MyAvatarPage.tsx`'s block, also
removing one of `ARCH-43`'s tracked name-literal sites (a `.name === 'lincoln'` literal, confirmed gone
by deletion rather than by rewrite). No MO-hardcoding lens hit this window; see §4.5.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — one new entry crossing 1,500L, everything else flat or shrinking

`npm run census:arch-audit -- --base=3478029` (the committed derivation script from the 09-13 cycle,
re-used rather than re-derived ad hoc):

```
non-test .ts/.tsx files scanned under src/ + functions/src/: 912
files >= 1500L: 18
```

| File | 2026-09-20 | Δ since `3478029` (09-13) | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | **3,942L** | **−8** | Tangled — ARCH-02, OPEN, now its **fifth** consecutive cycle unaddressed, but for the first time in four cycles the file **did not grow** around the standing recommendation — see 1.2. |
| `functions/src/ai/chat.ts` | 3,108L | +57 | Cohesive-but-big — ARCH-01, OPEN, modest growth. |
| `src/features/books/BookEditorPage.tsx` | 2,437L | +23 | Cohesive-but-big — ARCH-03, OPEN, modest growth (FIX-248/249/250/251/252's book-transform/background/layer/cleanup/sticker reliability work). |
| `src/features/quest/useQuestSession.ts` | 2,275L | +0 | Tangled — ARCH-04, OPEN, flat this window. |
| `src/features/today/TodayPage.tsx` | 1,951L | +159 | Watch-list (new at 09-13) — continuing growth, this window's largest single delta on an already-large file (see 1.3). |
| `src/features/workshop/WorkshopPage.tsx` | 1,928L | +0 | Cohesive-but-big, flat this window. |
| `functions/src/ai/tasks/shellyChat.ts` | 1,919L | +0 | Cohesive-but-big — ARCH-01 sibling, flat. |
| `src/features/avatar/MyAvatarPage.tsx` | **1,897L** | **−37** | Cohesive-but-big, shrank — `FEAT-237`/`UX-425` deleted the file's inline child-switcher tab-list block (the app-bar chip is now the one place a parent chooses the child; see 2.2). |
| `src/features/progress/CurriculumTab.tsx` | 1,857L | −6 | ARCH-50 (filed 09-13 as a new decomposition-review candidate at +818L) — flat this window, no new growth to react to; still recommended for a design-first read before the next feature lands on it. |
| `src/features/today/TodayChecklist.tsx` | 1,841L | +46 | Watch-list, continuing slow growth (1,795→1,841). |
| `src/features/records/dataReviewExport.logic.ts` | 1,776L | +15 | Tangled — ARCH-44, OPEN, unchanged judgment, modest growth. |
| `functions/src/ai/evaluate.ts` | **1,736L** | **+348 (newly over 1,500L)** | **New entry — investigated directly this cycle (see 1.4). Judgment: cohesive-but-big, leave it.** |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,682L | +0 | Cohesive-but-big, flat this window. |
| `functions/src/ai/contextSlices.ts` | 1,638L | +11 | Tangled — ARCH-14, OPEN, essentially flat. |
| `src/features/records/RecordsPage.tsx` | 1,614L | +2 | Watch-list (new at 09-13), flat this window. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606L | +0 | Leave as-is per CLAUDE.md — Three.js render loop, untouched. |
| `src/features/settings/DevAdminTab.tsx` | 1,530L | +0 | Watch-list (new at 09-13), flat. |
| `src/features/shelly-chat/useShellyChatActions.ts` | 1,506L | +0 | Watch-list (new at 09-13), flat — no decomposition read attempted yet; still recommended. |

**Seven of eighteen files were exactly flat this window** (0L delta against the 09-13 baseline:
`useQuestSession.ts`, `WorkshopPage.tsx`, `shellyChat.ts`, `chatPlanner.logic.ts`, `VoxelCharacter.tsx`,
`DevAdminTab.tsx`, `useShellyChatActions.ts`) and four more moved by single digits (`BookEditorPage.tsx`
+23, `CurriculumTab.tsx` −6, `contextSlices.ts` +11, `RecordsPage.tsx` +2) — eleven of eighteen essentially
untouched. A different shape from every prior cycle in this series, consistent with the window being
materially shorter (7 days vs. the usual 1–2 weeks) and the work landing being reliability/consolidation
passes on a handful of surfaces (Today, the book editor, the child switcher, the weekly-review generator)
rather than broad feature work touching many large files at once.

### 1.2 ARCH-02 (`PlannerChatPage.tsx`) — unaddressed for a fifth cycle, but this is the first window it didn't get harder to fix

Re-checked directly (`grep -n "handleRemoveItem\|handleMoveItemToDay\|handleSwapWatchItem"
src/features/planner-chat/PlannerChatPage.tsx`): all three handlers are still present and inline —
`handleRemoveItem` at line 2355 (~69L, including the async live-day branch and the curriculum follow-up
call), `handleMoveItemToDay` at 2462 (~65L), `handleSwapWatchItem` at 2536 (~54L) — roughly 190L of
candidate-hook body, plus the adjacent `handleConfirmRemoveFromCurriculum` (2434–2449) and the
`moveTarget`/`swapTarget` state that would need to travel with them. The file **shrank by 8 net lines**
this window (`git diff 3478029..HEAD --stat`: 9 insertions / 17 deletions) — the first time in four
audit cycles this file hasn't grown — but the shrink is unrelated to the standing recommendation: it's
`FEAT-237`/`UX-425` deleting the file's inline `ChildSelector` in favor of the app-bar chip (a single
hunk, `ChildSelector`→`ActiveChildLine` swap), not progress on the handler-trio extraction. **Unchanged
recommendation, now entering a fifth consecutive cycle** — but for the first time, the seam didn't get
buried under new growth while waiting, which is as close to "a good week to finally do it" as this
row has had.

### 1.3 `TodayPage.tsx` — this window's largest single delta on an already-large file

+159L (1,792L → 1,951L), the largest movement of any ≥1,500L file this window. `git log --oneline
3478029..HEAD -- src/features/today/TodayPage.tsx` and the ledger's own `FEAT-238`/`UX-431`+ lineage
(the Today evidence-list unification — "the day's evidence, all of it, with the time," per `CLAUDE.md`'s
`today/` section) account for the growth: `todayEvidence.ts` itself grew **+347L** in the same window
(the largest single-file delta in the whole >150L drift sweep below), and `TodayPage.tsx` is one of its
two render sites. Not judged tangled this cycle — the growth is one named, cohesive feature (a shared
`TodayEvidenceList` component plus the pure `todayEvidence.ts` module, per CLAUDE.md), not several
unrelated things landing in the same file — but flagged for a decomposition read once it clears roughly
2,000L, the same treatment `CurriculumTab.tsx` got at 09-13.

### 1.4 `functions/src/ai/evaluate.ts` — new to the ≥1,500L table, investigated directly: cohesive-but-big, leave it

+348L (1,388L → 1,736L), crossing the 1,500L threshold for the first time. Investigated directly rather
than deferred to next cycle, since it's this window's only new entry to the large-file table. `git diff
3478029..HEAD --stat -- functions/src/ai/evaluate.ts` shows 545 insertions / 197 deletions across four
commits; `git log --oneline` on the file identifies them as `ad8fbf3`/`26415c3`/`2d7c29b` (UX-409, in
three rounds) and `2f7cd95` (UX-410's follow-on). Both are last cycle's own headline recommendation and
its P2 sibling, fixed the same day the 09-13 audit's PR merged — the growth is **one feature landing in
three bugfix rounds**, not unrelated work stacked in one file: the diff's largest hunk replaces
`writeReviewDoc` with `writeWeekRecord`/`WeekHoursDoc`/`foldWeekHours`, exactly the
position-snapshot-before-narrative reordering `UX-409` called for. A function inventory of the file shows
one clean pipeline for a single Cloud Function task (`assembleWeekContext` → `summarizeBooksWeek` /
`summarizeTeachBacks` / `loadCurriculumSnapshot` → `foldWeekHours` / `writeWeekRecord` →
`buildEvaluationPrompt` / `parseReviewResponse` → `generateReviewForChild` /
`runWeeklyReviewCycleForChild`), the same "many independent, well-commented helper functions in one
task-handler file" shape `chat.ts` (ARCH-01) already carries the "cohesive-but-big" judgment for.
**Judgment: cohesive-but-big — leave it. Not filed as a new decomposition candidate.**

### 1.5 Bundle (ARCH-05/ARCH-08) — fifth cycle unchanged; both standing recommendations still unbuilt

See Step 0. No new measurement attempted this cycle (the 09-13 audit already produced a real,
`rollup-plugin-visualizer`-measured ranking and a measured, reverted `jspdf` split experiment — re-running
the same experiment a week later on a bundle that grew 1% would not change either number materially).
Re-confirmed both recommendations are still exactly where they were: `three` still blocked on `ARCH-08`
(`AvatarThumbnail.tsx` in `AppShell.tsx`'s always-rendered nav chrome), `jspdf` still statically imported
at its two leaf call sites with the measured −393.20 kB / −128.78 kB gzip win sitting unclaimed.

### 1.6 Test coverage (TEST-01) — unchanged; the two named gaps and the `workshop` ratio are all still open

Direct re-check: `grep -rl "persist(" src/features/evaluation/*.test.tsx` → **zero hits**;
`SkillSnapshotPage.tsx`'s general merge/`persist` path (line 103) is still not independently tested,
even though the file itself was touched this window (`git diff 3478029..HEAD --stat` shows −35L / net
shrink) — the touch was `FEAT-237`/`UX-425` removing its in-page `ChildSelector`, not new test coverage.
`DispositionProfile.tsx` similarly shrank (−26L, same cause) with no new test file added — it still has
only the narrowly-scoped `DispositionProfile.childSwitch.test.tsx` from `FIX-232`. Re-ran the
directory-ratio census: `workshop` is still **45 source / 8 test files (5.6:1)**, byte-identical to
09-13 — this cycle's own highest-value gap is exactly as open as it was a week ago, with no test growth
against `WorkshopPage.tsx`'s continued size (flat at 1,928L this window, per 1.1). `avatar` is also
unchanged at **80/20 (4.0:1)**. Re-confirmed the two files the 09-13 audit's Codex rounds reclassified
from "untestable shell" to "missing coverage on real logic" are still untested:
`grep -rl "TeachHelperDialog\|LoginPage" src --include=*.test.tsx --include=*.test.ts` → zero hits for
either. **TEST-01 status: unchanged — IMPROVING, no new progress this cycle on either named gap or on
the `workshop` ratio.**

### 1.7 ARCH-06 (WorkbookConfig → ActivityConfig) — essentially flat

`npm run census:arch-audit` (no `--base` needed): **`ActivityConfig`: 308 refs / 78 files** (was 306/77),
**`WorkbookConfig`: 38 refs / 12 files** (unchanged). +2 refs / +1 file against a 215-file window — the
ratio is unmoved. **Band 1, ARCH-06, OPEN, unchanged.**

### 1.8 ARCH-43 (Lincoln/London name-literal census) — count dropped by one, and this time it's a genuine name-gate removal, not a feature deletion

`npm run census:arch-audit`: **17 sites / 15 files**, down from 18/16 at 09-13. Unlike the 09-13 cycle's
own drop (a whole feature, Story Guide, deleted wholesale), this one traces to a real name-gate removal:
`git log 3478029..HEAD --oneline -- src/features/avatar/MyAvatarPage.tsx` shows one commit
(`d654e01`, `FEAT-237`/`UX-425`→`429`, "one place to choose the child"); the diff deletes the file's
entire child-switcher tab-list block (8 insertions / 45 deletions), including a
`const childIsLincoln = child.name.toLowerCase() === 'lincoln'` literal (old line 1423) and its dependent
styling branches — confirmed gone via a direct grep of the current file. This is the same initiative that
produced 1.2's `PlannerChatPage.tsx` shrink and 1.6's `SkillSnapshotPage.tsx`/`DispositionProfile.tsx`
shrinks: deleting nine other in-page `ChildSelector`s (per `CLAUDE.md`'s `src/app/` section, `UX-425`→
`429`) incidentally removed a name-literal that had nothing to do with child-switching per se, just
happened to live in the same deleted block. **ARCH-43 stays OPEN** (17 remaining sites, all previously
classified as the permitted cosmetic/personality carve-out or the B6–B12 name-keyed data shapes) — the
count is lower for a real, traced reason, not re-logged as closed. The known blind spot in the census's
own regex (the two-step `const lower = x.toLowerCase(); lower === 'lincoln'` form, tracked separately as
`ARCH-46`) is unrelated and unchanged — re-confirmed this cycle that neither `LabReportForm.tsx` nor a
`dailyPlanTemplates` file was ever in the automated count on either side of this window.

### 1.9 ARCH-07/ARCH-39, ARCH-17, ARCH-47 — re-confirmed still correctly closed, nothing removable found

`grep -rn "TODO.*[Ll]adder\|ladder.*TODO" src` → zero hits (Ladder deprecation, unchanged). Node 22
migration (`ARCH-17`) and the `functions/`↔`src/` duplication consolidation (`ARCH-47`) were both
already `FIXED`/resolved before this window opened and neither was touched by this window's diff — no
re-verification beyond confirming their governing files are absent from `git diff 3478029..HEAD
--name-only`.

### 1.10 Drift catalog — every file that moved >150L this window

`npm run census:arch-audit -- --base=3478029`, full sweep (not narrowed to the ≥1,500L table, per the
prompt's own drift rule and the 09-13 Codex round-1 lesson that a size-based table isn't the complete
inventory):

```
files with |net line delta| > 150L since base: 12
  +   348  functions/src/ai/evaluate.ts                        (already covered, §1.4 — UX-409/410)
  +   347  src/features/today/todayEvidence.ts                 (FEAT-238/UX-431+, already covered, §1.3)
  +   305  src/features/books/SketchScanner.tsx                (FIX-251's cleanup-layout reliability pass)
  +   303  functions/src/shared/foundations/readingGraph.ts    (FIX-244/UX-296 — see below)
  +   294  functions/src/shared/foundations/mathGraph.ts        (FIX-244/UX-296 — see below)
  +   245  src/features/today/dayChecklistRowWrite.ts           (FIX-239/UX-415's scan-skip preservation lane)
  +   209  src/features/books/StickerCleanupEditor.tsx          (FIX-251)
  +   201  src/features/today/todayRowKind.ts                   (continuing UX-363 lineage growth)
  +   159  src/features/today/TodayPage.tsx                     (already covered, §1.3)
    -244  src/features/books/DraggableImage.tsx                 (FIX-248/249's geometry-role extraction)
    -269  src/core/foundations/mathGraph.ts                     (FIX-244 — moved, not lost, see below)
    -281  src/core/foundations/readingGraph.ts                  (FIX-244 — moved, not lost, see below)
```

The `readingGraph.ts`/`mathGraph.ts` pair is a genuine move, not duplication: `FIX-244` (`UX-296`) landed
this window and relocated the static Foundations spine + pure graph selectors from `src/core/foundations/`
to `functions/src/shared/foundations/` — the single-source pattern `ARCH-47` established for four other
rules — with the client paths becoming compatibility re-exports. `CLAUDE.md`'s own `src/core/foundations/`
section already documents this as done, confirming it landed correctly rather than merely being claimed.
Every other row traces to a named, already-ledgered fix (`FIX-239`/`244`/`248`/`249`/`251`, `FEAT-238`)
with no unexplained growth. **No new decomposition candidate filed from this sweep** — every line is
either already covered above or a small, cohesive module matching one ledger row.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 UX-409 — last cycle's #1 recommendation, fixed the same day the recommending audit's own PR merged

The 09-13 report's headline finding (a weekly-review generation failure silently and permanently losing
that week's `curriculumPositions` snapshot, since `callClaude` ran before `loadCurriculumSnapshot` in
`functions/src/ai/evaluate.ts`) was fixed by `FIX-236` (PR #1850, 2026-09-13) — merged the same calendar
day as the audit's own PR #1847, per the ledger. Re-verified directly against the current file (§1.4): the
position snapshot and the week's hours are now folded and written (`foldWeekHours`/`writeWeekRecord`)
**before** the model call, under `status: 'snapshot-only'`, with the narrative merged on after — exactly
the fix the ledger row scoped. **This is the fastest this report series has seen its own #1 recommendation
actioned** — worth naming as a process point: the ledger's "propose, don't fix" discipline didn't cost a
cycle here, because the finding was specific and scoped enough (file, lines, exact fix) that the very next
run could act on it immediately. `UX-410` (the sibling AI-hours-reader consolidation) closed in the same
PR.

### 2.2 FEAT-237/UX-425→429 — "one child control," traced against the child-switch census mechanism this series has praised twice already

Owner, 2026-09-13, from the first post-deploy test of the `FIX-231` switcher-reactivation: *"There are now
as many as four locations to choose a child. I like the chip drop-down in the header... remove the
others."* This window's `FEAT-237` deleted `ContextBar`'s inert chip, the drawer's duplicate copy, **ten**
in-page `ChildSelector` sites (`components/ChildSelector.tsx` itself deleted), and **three** hand-rolled
pickers a grep for the component couldn't see (`ArmorTab`'s button pair, `MyAvatarPage`'s themed row —
which also carried the `.name === 'lincoln'` literal §1.8 found gone — and `AvatarAdminTab`'s chip row,
which keeps its `onClick` since it doubles as the duplicate-mark/delete list). `src/test/oneChildControl.
source.test.ts` fails closed on an eleventh caller of `setActiveChildId`, per `CLAUDE.md`'s `src/app/`
section. **Verified directly this cycle** (not just read off the ledger): `grep -nE "=== *'Lincoln'|===
*'London'|\.name *===" src/app/childSwitcher.ts src/components/ChildSwitcherChip.tsx` returns zero
matches — the one remaining control gates on `canSwitchChild`/`canOpenChildMenu` (capability: is there
more than one child, is this a parent profile), never on a name. This is a genuine lens-2 win: the same
initiative that reduced the child-switch surface count also happened to delete one more of `ARCH-43`'s
name-literal sites (in the deleted `MyAvatarPage.tsx` block, §1.8) as a side effect of consolidation, not
as a dedicated remediation pass.

### 2.3 Loop integrity — traced FIX-237/UX-413(a), weekly-review evidence following the activity day

Picked this window's own weekly-review evidence fix as the one real path to trace end-to-end (per the
prompt's Step 2 instruction). `FIX-237` added `src/features/weekly-review/weekArtifactSelection.ts`
(`selectWeekArtifacts`), which prefers an artifact's `dayLogId` (the day it records) over its `createdAt`
(the day it was uploaded) when deciding whether it belongs to a review week; `useWeekBySubject.ts` now
runs parallel queries by both fields and de-dupes through the new selector rather than trusting
`createdAt` alone. **The loop closes**: `dayLogId` is confirmed stamped at every real capture site —
`UnifiedCaptureCard.tsx`, `KidTeachBack.tsx`, `TeachBackSection.tsx`, `KidChapterPool.tsx`,
`KidConundrumResponse.tsx`, `TodayPage.tsx`, `progress/strandSession.ts`, `watch/watchItemCompletion.ts`
— so the read-side fix has a real field to key on for both old (unlinked) and new artifacts, with a
documented fallback path and its own test (`weekArtifactSelection.test.ts`). No dead end found on this
path this cycle.

### 2.4 Shelly's path (no-shame) — clean, and this window's own hours-rule fix is itself a positive confirmation

Grepped this window's changed AI files (`functions/src/ai/chat.ts`, `contextSlices.ts`,
`data/foundationsGraphSummary.ts`, `evaluate.ts`, `promptHours.ts`, `tasks/generateStory.ts`,
`tasks/monthlyReviewData.ts`) for pace/pressure language. Every hit is the `UX-410` fix's own
documentation of what it **removed**: `promptHours.ts`'s new header reads *"No target, no percentage,
ever... The slice used to print 'Hours logged this year: N hours of 1000 target (P% complete)'... so no
hours surface in this product states a target, a quota, a percentage or a share"* — the fix this window
shipped is itself the no-shame rule being actively enforced against a real violation the 09-13 audit
found two days before it ran (`UX-410`), not a new one. No new pace/pressure language found anywhere else
in the window's diff.

### 2.5 Kid voice-first, DATA-17, and the rest of Step 2's standing items — unchanged, re-confirmed briefly

`DATA-17` (certificate-scan lane skips the learner-model sync): `grep -n "syncWorkbookPositionToModel"
src/core/hooks/useCertificateProgress.ts` → zero hits, and the file is absent from this window's diff
entirely (`git diff 3478029..HEAD --stat -- src/core/hooks/useCertificateProgress.ts` → empty). Unchanged,
still open. No new kid-facing capture surface requiring typed-only input was found in this window's diff.

---

## Step 3 — Pedagogy & Ethos (Band 3)

- **Pace/pressure language:** clean this window — see 2.4. The one hit found is the AI-hours-reader fix
  removing a real violation the last audit's own census surfaced (`UX-410`), not a new one.
- **Diamonds-not-scores / no-shame:** clean. Spot-checked `src/features/today/todayEvidence.ts` (this
  window's largest new module, §1.3) for shame-adjacent language around missing/failed evidence — its
  `failedLine`/`EVIDENCE_FAILED_LINE` constants describe a **failed read** ("a failed read is never
  rendered as a result," per the file's own header comment), not a child's failed performance; no
  shame-coded copy found.
- **Charter preamble reach:** re-confirmed **21** task types still wired in `CHAT_TASKS`
  (`npm run census:arch-audit`'s `CHAT_TASKS registry size` section), unchanged count from 09-13. The
  pre-existing `analyzePatterns` gap noted at 09-13 (a separate, non-chat-dispatched Cloud Function
  carrying no `"charter"` slice — tracked under `DOC-04`) is unchanged; not re-touched this window.

**No new Band 3 findings this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — holds, same 4 guarded call sites

`grep -rn "computeHoursSummary(" src functions/src --include=*.ts --include=*.tsx | grep -v '\.test\.'`
returns the same 4 non-test call sites as 09-13: `RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1273`,
`weekly-review/useWeekHours.ts:40`, `weekly-review/weekBySubject.ts:418` (line numbers drifted slightly
with file growth; same sites). **DATA-01 holds FIXED, unchanged.**

### 4.2 DATA-02 — still NEEDS-DATA, now 81 days past the freeze window

`(2026-09-20 − 2026-07-01) = 81 days` overdue (was 74 at 09-13), now in its **twelfth week** as the
longest-standing item in the ledger. Still requires the owner to run the dedupe pass against a live
Firestore export — unresolvable from a repo-only audit.

### 4.3 DATA-13 — unchanged, same 4 lines

`grep -n "Missouri" src/features/records/records.logic.ts` → lines 1046/1073/1120/1150, byte-identical
to 09-13 (the file did not grow in that region this window). Same four plain-string Missouri literals in
the same template-literal HTML builder function; same trivial fix (route through
`stateCompliance.ts`'s existing config).

### 4.4 DATA-17 — see 2.5. Unchanged, re-verified.

### 4.5 MO→TX lens — no new hardcoding found; one pre-existing MO-specific chart noted and judged out of scope

No new `Missouri`/`'MO'`/`MO_` hits outside the already-tracked files. One pre-existing element worth
naming precisely rather than silently passing over: `src/features/records/MonthlyTrend.tsx` renders a
dashed "~83h/mo target" reference line (`(1000 * 60) / 12`) on the parent-facing compliance chart — this
is the MO 1000-hour annual requirement, shown to a **parent** on a compliance/records page, which is a
different thing from `UX-410`'s AI-prompt pace-pressure finding (that one risked an LLM repeating a target
to a parent in generated prose; this is a static reference line a state's own statute requires tracking
against). Not touched this window (`git diff 3478029..HEAD --stat` on the file is empty) and not filed as
a new row — flagging only because a literal `1000`-hour constant is inherently MO-shaped, and a MO⇄TX
toggle would need this chart's target to vary by state alongside `stateCompliance.ts`'s existing
MO-specific config. Worth folding into whatever `PROMPT_FIX` eventually builds TX support, not urgent on
its own.

### 4.6 Additive-hours invariant — holds; no new independent hour math found

Checked every changed file this window matching `hour|minute` in its path
(`promptHours.ts`, `weekHours.ts`, `useTodayMiningMinutes.ts`, plus their test files) against whether any
computes a total independently of `collectHoursContributions`/`computeHoursSummary`. All the growth here
is `UX-410`'s own fix (§2.4) — `promptHours.ts` folding through the shared rule rather than a second
accumulator — and `useTodayMiningMinutes.ts`'s growth is Knowledge Mine session-time tracking, a distinct
concept from compliance `hours` that has never routed through the shared fold. No new view computes hours
independently this window.

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Mechanical doc fixes applied directly this cycle

- **`docs/review/DECISION_FUNC-01_source_of_truth.md`** — added the seventh Authority-table row,
  `learnerModels/{childId}` (concept frontier / synthesis), closing `DOC-26` (filed by the 09-13 audit).
  The row states the store, its ~8 writers, its readers, and its reconciliation path with `skillSnapshots`
  via `needsReconcile` + the Foundations tab's confirm/override flow — content the 09-13 report's §2.1
  already fully specified; this is a mechanical transcription into the decision doc, not a new judgment.
- **`CLAUDE.md`** Known Technical Debt section: every stale line-count parenthetical corrected against
  this cycle's fresh counts — `PlannerChatPage.tsx` 3,950L → **3,942L**, `chat.ts CF` 3,051L → **3,108L**,
  `BookEditorPage.tsx` 2,414L → **2,437L**, `MyAvatarPage.tsx` 1,934L → **1,897L** (with a note on why it
  shrank), `contextSlices.ts` 1,627L → **1,638L**, the `WorkbookConfig → ActivityConfig` ratio 306→**308**
  refs, and the bundle-size line "4.57MB (1.38MB gzipped)" → **"4.62MB (1.39MB gzipped)"**, with the
  jspdf-split measurement from the 09-13 report folded into the same line so the recommendation travels
  with the number. `useQuestSession.ts`, `WorkshopPage.tsx`, `useShellyChatFlows.ts`, `ReadingQuest.tsx`
  needed no change — genuinely flat this window.
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-09-20, this report added to the
  audit chain.
- No other ledger status cells needed flipping — every row this audit re-verified (`ARCH-01`→`08`,
  `ARCH-17`, `ARCH-43`, `ARCH-47`, `DATA-01`, `DATA-17`, `TEST-01`) was already correctly reflected in
  `docs/review/REVIEW_HOME_BASE.md` §6; this audit's contribution on each is independent re-confirmation
  against current code, not a ledger write. `DOC-26`'s status cell is flipped in Step 5.2 below.
  **Ledger gets +0 new rows this cycle** — every finding in this report is either a re-verification of an
  already-filed row, or a mechanical fix to one (`DOC-26`); nothing surfaced novel enough this short a
  window to warrant a fresh ID, and filing a row for the sake of filing one would violate the same
  "don't duplicate what's already tracked" discipline the ledger's own conventions ask for.

### 5.2 Status re-verifications this cycle

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-01, 03, 04, 06, 08, 14, 44 | OPEN | OPEN, unchanged — flat or modest growth | see 1.1, 1.5, 1.7 |
| **ARCH-02** | OPEN (fourth consecutive cycle) | **OPEN — fifth consecutive cycle, but the file shrank this window (unrelated cause) rather than growing around the seam** | see 1.2 |
| ARCH-07/ARCH-39, ARCH-17, ARCH-47 | FIXED/RESOLVED | unchanged — re-confirmed live, no action needed | see 1.9 |
| **ARCH-43** | OPEN (18 sites/16 files) | **OPEN — 17 sites/15 files, explained by a genuine name-gate removal (`FEAT-237`'s `MyAvatarPage.tsx` deletion), not a census artifact** | see 1.8 |
| **ARCH-50** | OPEN (filed 09-13, +818L) | OPEN, unchanged — flat this window (−6L), still recommended for a design-first read | see 1.1 |
| TEST-01 | IMPROVING | IMPROVING, unchanged — no new progress on either named gap or the `workshop` ratio this cycle | see 1.6 |
| **UX-409** | OPEN (P1, last cycle's #1 recommendation) | **FIXED — `FIX-236`, PR #1850, 2026-09-13 (already correctly reflected in the ledger; re-confirmed directly against current code)** | see 2.1 |
| DATA-01 | FIXED | FIXED, unchanged — same 4 guarded consumers | see 4.1 |
| **DATA-02** | NEEDS-DATA (74 days overdue at 09-13) | NEEDS-DATA, now **81 days overdue (twelfth week)** | see 4.2 |
| DATA-13 | OPEN (lines 1046/1073/1120/1150) | OPEN, unchanged — same lines, file didn't grow in that region | see 4.3 |
| DATA-17 | OPEN | OPEN, unchanged | see 2.5, 4.4 |
| **DOC-26** | OPEN (filed 09-13) | **FIXED (this run — the seventh Authority-table row added to `DECISION_FUNC-01_source_of_truth.md`; PR number finalized in the ledger's own status-cell flip per the end-of-run protocol)** | see 5.1 |

### 5.3 Codex rounds

See the run's own summary comment on the PR for round timing and outcome, posted per the end-of-run
protocol below.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 10,211/10,212 tests passing
+1 skipped across 717 files; functions: clean lint/tsc, 1,509/1,509 tests across 68 files; build clean,
bundle 4,619.20 kB/1,392.23 kB gzip, +45.94 kB/+16.43 kB gzip since 09-13; `npm audit` unchanged at 1
moderate (root)/3 moderate (functions); `docs:check` HARD green, 10 SOFT warnings, silent-fallback census
byte-identical at 105/58). **Top 3 findings by leverage:** (1) **`UX-409` fixed** (§2.1) — last cycle's
#1 recommendation, the weekly-review compliance-data-loss risk, closed the same calendar day the
recommending audit's own PR merged — the fastest turnaround this report series has recorded, and worth
naming as confirmation the propose→fix pipeline this ledger runs on is working, not just that a bug got
fixed. (2) **`ARCH-02`** (`PlannerChatPage.tsx`) — unaddressed for a fifth consecutive cycle, though for
the first time the file didn't grow around the standing seam this window, which is as good a week as any
to finally cut it. (3) **`FEAT-237`'s "one child control" sweep** (§2.2/1.8) — a UX consolidation that,
as a side effect, deleted one more of `ARCH-43`'s tracked name-literal sites, a second instance (after
`ARCH-47`'s resolution at 09-13) of this series' recommendations getting acted on quickly once scoped.
**Recommend running `PROMPT_FIX.md` next against:** `ARCH-02`'s live-day-edit handler trio extraction
(five cycles overdue, ~190L, now a smaller lift than it will be if it waits for a sixth), then the
`jspdf` point-of-use dynamic-import split (§1.5 — measured −393.20 kB/−128.78 kB gzip, still unclaimed
from 09-13, two files, no design decision attached), then `workshop`'s test-coverage gap and
`TeachHelperDialog.tsx`/`LoginPage.tsx`'s untested logic (§1.6, unchanged from 09-13's own
`TEST-04`-style recommendation), then `DOC-17` (the portal-writer resurvey, still open, still mechanical
but wider in scope than originally filed).
