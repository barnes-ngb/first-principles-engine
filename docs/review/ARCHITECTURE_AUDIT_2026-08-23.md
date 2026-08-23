# Architecture Audit — 2026-08-23

> **Type:** Monthly deep audit (scheduled run, fired 2026-08-23 — 7 days after the 2026-08-16
> mid-cycle run; cadence in practice continues to run roughly weekly in this series).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-08-23
> **Branch:** `claude/brave-feynman-435irz` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-08-16.md` (merged as PR #1678, commit `c4dc12b`)
> **Window covered:** 2026-08-16 → 2026-08-23 (7 days, `origin/main` at `e768ebf`, 56 commits since
> `c4dc12b`). Another real feature week, not a flat one: **67 files changed under `src/`+`functions/src/`,
> +5,512 / −378 lines.** Headline: the chat arc's slice 4 of 4 shipped (FEAT-150 — "the chat can reshape
> next week," a full two-tap draft→apply lane sharing the planner's own `applyWeekPlan.ts`), plus a
> General-tab write-honesty fix (FEAT-152), a kid day-done honesty fix (UX-72/75), a wording pass
> (FEAT-154/UX Batch A), the functions-side dependency cleanup that zeroes out `npm audit` (FEAT-155),
> and a Dad's Lab upload-honesty fix + five-question walk (FEAT-156). No PRs are currently open against
> `main` outside this audit's own branch.

---

## Step 0 — Baseline

```
npm ci (root)                         → fresh container, 0 → clean install
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 5,934 tests passing (397 files), 0 failing, 0 skipped
cd functions && npm ci                → fresh container, 0 → clean install
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 976 tests passing (39 files), 0 failing, 0 skipped
npm run build                         → dist/assets/index-*.js  4,340.19 kB │ gzip: 1,293.00 kB
npm run docs:check                    → HARD green, 11 SOFT warnings (all pre-existing, see below)
```

**Baseline: GREEN.** Fresh container, no `node_modules` at session start for either `npm ci` — both
installs ran clean before any check (same class of one-time environment artifact as the 2026-08-16 and
2026-08-17 cycles; not a repo defect). No flakes observed.

Root tests: **394 → 397 files (+3), 5,905 → 5,934 tests (+29)** since the 2026-08-17 health report (the
most recent authoritative count) — modest growth, proportionate to this window's real but not enormous
feature diff. Functions: **39 files / 976 tests, unchanged in count** from 2026-08-17 (`shellyChat.test.ts`
grew +427/−14 lines this window without adding a net-new top-level file to the functions suite).

**`npm audit` (prod-only, `--omit=dev`) — functions side is now clean.** Root: **0 vulnerabilities**,
unchanged since the 2026-08-17 health audit's `npm audit fix`. **Functions: 0 vulnerabilities**, down
from **10** (9 moderate, 1 high) at 2026-08-17 — **FEAT-155** (PR merged this window, commit `0538009`)
deleted the unused `sharp` dependency outright (confirmed: `functions/package.json` no longer lists it;
the `functions/src/ai/providers/__stubs__/sharp.ts` test stub was deleted alongside it, 7 lines removed —
full removal, not a demotion) and pinned `uuid@^11.1.1`, closing the long-standing `sharp` libvips CVEs
and the `firebase-admin`/`google-gax`/`uuid` chain that every health report since at least 2026-08-03 had
left for a human, breaking-change decision. **This is the first cycle in the report series where both
trees show zero vulnerabilities.**

**Bundle:** 4,337.66 kB → **4,340.19 kB** (+2.53 kB), 1,292.15 kB → **1,293.00 kB gzip** (+0.85 kB gzip) —
essentially flat, consistent with a window whose largest changes were new modules behind the chat
surface (already-imported feature area) rather than a new heavy dependency. `grep -n "React.lazy\|lazy("
src/app/router.tsx` still returns zero matches — **ARCH-05/ARCH-08 unchanged, zero code-splitting.**

**`npm run docs:check`:** HARD green. `[ledger-ids]` 278 rows, all unique. `[ledger-status]` PASS — no
ledger row claims an open PR (the `DOC-13` scripted check, and its `ebdba1d` follow-up hardening this
window that also flags "awaiting … review/merge" phrasing, both holding). SOFT warnings unchanged in
shape from every prior cycle: 2 `raw-refs` (`ArmorTab.tsx`, `DevAdminTab.tsx`), 8
`remote-timeout-finally`, 1 `image-downscale`, plus the `silent-fallback-census` at **97 swallowed
catches across 54 files** (report-only) — byte-identical count to 2026-08-16, meaning none of this
window's 67 changed files added a new bare/console-only catch.

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window shipped real surface against Lens 1 (FEAT-150, FEAT-156) and a genuine Lens-2 **fix** (see
1.5) — not a rubber-stamp cycle.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — full >1,500L listing, judged; `PlannerChatPage.tsx` shrank again but not on the recommended seam

Full `find src functions/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn`, filtered to every
production file ≥1,500L (test files excluded — `records.logic.test.ts` 2,764L,
`useShellyChatActions.logic.test.ts` 2,211L, `shellyChat.test.ts` 2,072L, `chatPlanner.logic.test.ts`
1,896L all cross the line but are test files, not decomposition candidates):

| File | 2026-08-23 | Δ since `c4dc12b` (08-16) | Judgment |
|---|---|---|---|
| `PlannerChatPage.tsx` | **3,295L** | **−117** (3,412→3,295) | Tangled — ARCH-02, OPEN. See below. |
| `functions/src/ai/chat.ts` | 2,641L | +0 | Cohesive-but-big — ARCH-01, OPEN, unchanged. `buildQuestPrompt` alone 400+L. |
| `src/features/quest/useQuestSession.ts` | 2,218L | +0 | Tangled — ARCH-04, OPEN, unchanged. 5 question pipelines in one hook. |
| `src/features/books/BookEditorPage.tsx` | 2,113L | +0 | Cohesive-but-big — ARCH-03, OPEN, unchanged. Section-bounded, low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,876L | +0 | Cohesive-but-big — CLAUDE.md tech-debt note, unchanged. Forge/portal/Stonebridge state. |
| `functions/src/ai/tasks/shellyChat.ts` | **1,719L** | **+199** | Growing watch-list — see below, not yet a decomposition candidate. |
| `src/features/records/dataReviewExport.logic.ts` | 1,713L | +0 | Tangled — **ARCH-44, OPEN, unchanged.** Born large (FEAT-120), one ~1,100-line function (`computeIntegrityChecks`). Already ledger-tracked; omitted from this table in an earlier pass of this report, corrected here. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623L | +0 | Cohesive-but-big — phase-based rendering delegates to sub-components. Not urgent. |
| `functions/src/ai/contextSlices.ts` | 1,617L | +0 | Tangled — ARCH-14, OPEN, unchanged. 20+ slice loaders, needs a domain-group split. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606L | +0 | Cohesive-but-big — ARCH-08 prerequisite (Three.js render loop), leave as-is per CLAUDE.md. |
| `src/features/today/TodayChecklist.tsx` | 1,592L | +0 | Watch-list, not yet a decomposition candidate — crossed 1,500L on 2026-08-16 (live-week-edit feature), flat since. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,544L | +0 | Cohesive-but-big — pure planner logic module, no prior audit has flagged a tangled seam here; not a new candidate this cycle. |

**Correction to an earlier pass of this table:** a first draft of this section filtered to only the files
that materially moved this window and omitted `dataReviewExport.logic.ts`, `TodayChecklist.tsx`, and
`chatPlanner.logic.ts` — all three are still ≥1,500L and the audit prompt requires listing and judging
every such file, moved or not. Corrected above; none of the three changed this window, and
`dataReviewExport.logic.ts` was already ledger-tracked as `ARCH-44` (unchanged, not new drift).

**`src/features/shelly-chat/useShellyChatActions.ts` (1,112L, +169 from 943L)** stays below the 1,500L
cutoff for this table but is trending toward it in lockstep with `shellyChat.ts` below — tracked in 1.8,
not listed here.

**`PlannerChatPage.tsx` (ARCH-02) — the −117L is FEAT-150's Apply extraction continuing, not the
recommended seam.** Only two commits touched this file this window: `fdb663a` ("extract Apply into a
testable module, one lane two callers" — the FEAT-150 slice that finished pulling `handleApplyPlan`'s
remaining Apply logic into `planner-chat/applyWeekPlan.ts`) and `7e3f585` (UX Batch A, wording-only).
**The live-day-edit handler trio the 2026-08-16 audit named as the next `PROMPT_FIX` target
(`handleRemoveItem`/`handleMoveItemToDay`/`handleSwapWatchItem` → a `useLiveDayEditHandlers` hook) is
still inline, unchanged**, confirmed present at `PlannerChatPage.tsx:1960`, `:2027`, `:2101`. Recording
this explicitly (as the 08-16 report did for the prior extraction) so a future audit doesn't read this
cycle's −117L as that seam having been taken — it hasn't. **Recommend it again as the next `PROMPT_FIX`
candidate for ARCH-02**, now against a smaller 3,295L file.

**`functions/src/ai/tasks/shellyChat.ts` (functions' largest production file) — +199L, closing in on the
2,000L watch-list threshold both the 08-16 audit and the 08-17 health report flagged.** At 1,719L it is
now within **281L** of the 2,000L auto-flag line that applies to production files elsewhere in this
report's methodology. Growth this window is FEAT-150's next-week chat-arc plumbing
(`draftNextWeek`/`applyNextWeek` dispatch, week-zone resolution helpers) — new capability, same pattern
as every prior addition to this file, not undirected sprawl. **Not yet a DECOMPOSITION CANDIDATE, but
worth a standing watch-list line every cycle now** given the pace (+574L over 08-09→08-16, +199L this
window — two consecutive large-growth cycles).

**`useShellyChatActions.ts` +169L (943→1,112L)** — the client-side portal write layer, growing in lockstep
with `shellyChat.ts` as expected (FEAT-150's `applyNextWeek` handler, FEAT-152's General-tab drop guard).
Still comfortably below any threshold; noted for trend-tracking only.

**ARCH-01/03/04/08/14/44 — unchanged, re-verified only** (see table above; none of these files appear in
the 67-file diff this window). **ARCH-13** (`useShellyChatFlows.ts`, below this table's 1,500L cutoff at
1,134L) is also unchanged this window — not in the diff.

### 1.2 Bundle (ARCH-05) — flat, still zero code-splitting

+2.53 kB / +0.85 kB gzip this window — noise-level, not a regression. `AvatarThumbnail.tsx` still
statically imports `three` into always-rendered nav chrome (unchanged). **Band 1, ARCH-05/ARCH-08, OPEN —
unchanged.**

### 1.3 Test coverage (TEST-01) — same two gaps, unchanged

- **`DispositionProfile.tsx`** — still zero dedicated test file (it's exercised indirectly inside
  `FoundationsTab.test.tsx` and `shellyChat.test.ts`, but has no direct unit test of its own). Unchanged.
- **`SkillSnapshotPage.tsx`'s general update path (`persist`, now at line 115)** — re-confirmed still
  untested. `SkillSnapshotPage.defaults.test.tsx` (the file's only test file) asserts `setDoc` calls only
  for the defaults-seed branch (line 96-area); grepping that test file for `persist` returns zero hits.
  **Note:** this file *did* change this window — `git diff c4dc12b..HEAD -- SkillSnapshotPage.tsx` shows
  a 6-line UX-50 fix (the page's `<Typography>` heading was hardcoded `"Lincoln Evaluation"`, now reads
  `{activeChild?.name ?? 'Your child'}'s Skill Snapshot`, see 1.5 below) — the change didn't touch the
  `persist` function, so the coverage gap is unaffected, but it's worth flagging that the file most
  recently edited for a Lens-2 fix is also the file with the standing TEST-01 gap; a future test addition
  for `persist` would naturally also pin the new per-child heading. **TEST-01 status: unchanged from
  2026-08-16 — no new coverage, no new gap.**
- Several new test files landed with this window's features (`applyWeekPlan.test.ts` 485L,
  `useNextWeekDraft.test.ts` 264L, `nextWeekActions.test.ts` 270L, `generateNextWeekDraft.test.ts` 153L,
  `writeNextWeekDraft.test.ts` 191L, `NextWeekDraftCard.test.tsx` 197L, `KidChecklist.dayDone.test.tsx`
  117L, `wordWallNoShame.test.tsx` 55L, `ExplorerMap.grammar.test.tsx` 54L, `orderValidation.test.ts`
  484L, `bandCeiling.test.ts` 68L, `askMePanel.logic.test.ts`, `stickerTagging.test.ts`) — real behavioral
  coverage on new logic, not shell padding; consistent with this codebase's "tests ship with the feature"
  norm rather than a separate lane.

### 1.4 ARCH-06 (WorkbookConfig → ActivityConfig) — unchanged

`grep -rl -w 'WorkbookConfig' src functions/src --include=*.ts --include=*.tsx | grep -v '.test.'`: **28
refs / 10 files**, identical to 08-16. No file in this window's diff references `WorkbookConfig`. **Band
1, ARCH-06, OPEN — unchanged, no coupling increase.**

### 1.5 ARCH-43 (Lincoln name-literal sites) — count unchanged, but a real instance was FIXED this window, and the grep pattern has a confirmed blind spot

`grep -rln "toLowerCase() === 'lincoln'\|=== 'Lincoln'\|=== 'London'" src functions/src` (non-test): still
**20 sites**, byte-identical to 08-16 — **but this undercounts.** `git diff c4dc12b..HEAD --
SkillSnapshotPage.tsx` shows a genuine Lens-2 **fix** this window (part of FEAT-154/UX Batch A, tagged
`UX-50` in-code): the page's heading was a hardcoded `<Typography>...Lincoln Evaluation...</Typography>`
— wrong for London, and stale copy besides (the tab is called "Skill Snapshot," not "Evaluation") — now
`{activeChild?.name ?? 'Your child'}'s Skill Snapshot`. **This is exactly the class of regression Lens 2
exists to catch, and it was caught and fixed, not by this audit — a positive data point for the
discipline holding day to day.** It doesn't show up in ARCH-43's own grep because a hardcoded
`<Typography>` string isn't a `=== 'Lincoln'` comparison — a different shape of the same problem.

**Separately, this audit's investigation surfaced a second blind spot in the ARCH-43 grep pattern itself**
(pre-existing code, not new this window): `src/features/dad-lab/LabReportForm.tsx` name-gates via a
**two-step** lowercase compare (`const lower = childName.toLowerCase(); if (lower === 'lincoln')...`) and
a `ROLE_PLACEHOLDERS` map **keyed by lowercase name** — neither matches the single-line regex the census
has used since 08-19. This means the standing "20 sites / 19 files" figure has undercounted by at least
one file for as long as `LabReportForm.tsx`'s current shape has existed. **New row `ARCH-46` below**
(methodology fix, not a code fix): broaden the grep to also catch `.toLowerCase()` assigned to an
intermediate variable and object keys literally `lincoln`/`london`, then re-run the full census once.
Low severity — doesn't change any code, just the accuracy of a count this audit series has relied on for
five cycles.

### 1.6 ARCH-17 (Node.js runtime) — 68 days out

`functions/package.json` still pins `"node": "20"`. Node 20 EOL 2026-10-30 is now **68 days** out (was 75
at 08-16). **Band 1, ARCH-17, OPEN — narrowing, not yet urgent.**

### 1.7 ARCH-45 — already FIXED this window, confirmed live, not this cycle's finding

The 08-16 audit's `ARCH-45` (root `vitest` had no path guard against a locally-built, gitignored
`functions/lib`) shipped as PR #1690 (commit `f9071db`, 2026-08-22) — `vite.config.ts`'s `test.exclude`
now lists `'**/functions/lib/**'` and `'**/.firebase/**'`. Already `FIXED` in the ledger before this cycle
started; confirmed present in `vite.config.ts` and not re-logged.

### 1.8 Drift catalog beyond the headline files

- **`functions/src/ai/tasks/shellyChat.ts`: +199L this window** — see 1.1, now the standing watch-list
  entry every cycle should re-check.
- **`src/features/shelly-chat/useShellyChatActions.ts`: +169L this window** — see 1.1.
- No other production file crossed +150L this window; the remaining large diffs are new files
  (`applyWeekPlan.ts`, `useNextWeekDraft.ts`, `nextWeekActions.ts`, `writeNextWeekDraft.ts`,
  `generateNextWeekDraft.ts`, `NextWeekDraftCard.tsx`, `watchActions.ts`, `useChatWatchLibrary.ts`,
  `useChatPlannerDefaults.ts`, `watchCuratorLabel.ts`, `weekEnergyLabels.ts`) — the FEAT-150 chat-arc
  finale and its supporting cast, appropriately decomposed into single-purpose modules rather than grown
  inline into an existing large file (the opposite failure mode from ARCH-02/ARCH-14).

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — no new authority conflict; the DOC-14 fix already landed and is current

`docs/review/DECISION_FUNC-01_source_of_truth.md` was itself updated this window (2026-08-22, closing
`DOC-14`): the curriculum-position row now lists the Shelly-chat portal (FEAT-143) alongside planner
setup and certificate scan, and a new "Execution-record stores the portal can now write" section
explicitly rows out `days`, `weeks`, and `watchLibrary` — including **this window's** FEAT-150 change
(`weeks/{weekStart}` row: *"`planner-chat/applyWeekPlan.ts` — the single Apply (FEAT-150), called by Plan
My Week and by the chat's next-week lane"*). **No stale writer list this cycle** — the decision doc is
already caught up to the window this report covers, because the DOC-14 fix and the FEAT-150 ship landed
in the same few days. FUNC-01 remains **RESOLVED-WITH-DECISION**, and its supporting doc is current.

**Mechanical note:** `docs/DOCUMENT_INDEX.md`'s entry for this file still cites "(2026-05-30)" as its
last-touched date; `git log` shows it was actually last edited 2026-08-22. Corrected directly (Step 5).

### 2.2 Loop integrity — traced FEAT-150's two-tap gate end to end; holds

**The chat's "reshape next week" arc (FEAT-150) is genuinely two separate taps, with no `ChatAction` kind
that could reach a week-write from a single model reply.** The only `ChatAction` in the flow is
`draftNextWeek` (`src/core/types/shellyChat.ts:348`); the second tap (`applyNextWeek`) is a plain callback
on `useNextWeekDraft`'s own component state (`useNextWeekDraft.ts:243-302`), unreachable from anything the
model can emit on its own. **The week window is re-resolved at write time, not just at draft time:**
`writeNextWeekDraft.ts:97` calls `isNextWeekStart(weekStart, now)` fresh at the write, refusing with a
named `weekMoved` notice if a parent sits on a drafted week across a Sunday→Monday rollover
(`nextWeekActions.ts:83-99`) — the staleness risk this shape of feature invites is explicitly guarded, not
assumed away. No swallowed-catch pattern in the write path: every failure mode (`WeekApplyError`, a
partial apply, both the AI path and local-planner fallback failing) returns a typed outcome with a
parent-facing notice rather than throwing past the caller or silently no-op'ing (`writeNextWeekDraft.ts:
105-131`, `generateNextWeekDraft.ts:115-140`).

### 2.3 FEAT-152 (General tab write honesty) — real bug, clean fix, ruled out elsewhere

**The bug:** on the General (no-child) tab, `activeChildId === ''`, so the child-id mismatch guard
(`activeChildId && action.childId !== activeChildId`) short-circuited to `false` — a well-formed but
hallucinated action from the model could reach a write path meant only for a specific child, while the
UI's own success copy still said "Pushed!" **The fix:** `stagePendingActions` now drops every action
outright when there's no active child (`useShellyChatActions.ts:646-658`), with a `generalTabDropNotice`
so the parent is told the tab can't write rather than shown a false success. Grepped the rest of
`shelly-chat/` for the same bug class (a rendered success state with no preceding real write) —
**none found**; every other "Done"/"Sent"/"Drafted" render in `ActionConfirmCard.tsx` is downstream of
`performChatAction` actually resolving. This closes a real Lens-1 concern (a parent believing something
was saved when it wasn't) cleanly, with no sibling regressions.

### 2.4 UX-72/75 (kid day-done honesty) — bug and fix both hold, one edge case worth a note

**The bug:** `mustDoDone` required `completed` alone, so a single parent-issued skip on a must-do item
left that item permanently "unresolved" from the kid gate's point of view, silently stranding the
Craft/Workshop unlock behind a task the kid could never complete or dismiss. A second bug in the same
area (UX-75) showed two different item counts in two different footer lines. **The fix:**
`mustDoDone`/`mustDoRemaining` now treat `completed || skipped` as resolved (`kidQuestGate.ts:94-96`), and
the footer collapsed to one number (`KidChecklist.tsx:319-341`). Multi-skip, all-skipped, and
skip-then-complete are each directly tested (`kidQuestGate.test.ts:68,89,119`); an all-skipped day
correctly still requires `mustDoCompleted > 0` before any celebration fires, so nothing is falsely
celebrated. **One case isn't separately gate-tested (a day mixing a skip with a watch item), but it's a
non-issue by construction** — watch rows are filtered out of the must-do set before the gate math runs
(`kidQuestGate.ts:23`), so a watch-row skip can't touch this logic; noted for completeness, not filed as
a gap.

### 2.5 FEAT-156 (Dad's Lab) — Lincoln-first, no new name-gating, the upload bug was real

The diff touches only `persistArtifactRef` (write-on-upload, so a photo's Firestore reference is
persisted the moment it lands rather than only on final submit — closing a real repro where an uploaded
image "vanished on Use Photo") and an unattached-uploads leave-guard dialog. Neither change adds a
child-name branch; the pre-existing `LINCOLN_FIELDS`/`LONDON_FIELDS`/`ROLE_PLACEHOLDERS` gating in this
same file predates this window (unrelated to this fix) and is the source of the ARCH-43 grep blind spot
noted in 1.5. The "five-question walk" is a documentation addition (`docs/review/UX_AUDIT_2026-08.md`
§11), not new code.

### 2.6 One standing gap, re-confirmed, not double-logged

**`FEAT-145`** (OPEN, filed 2026-08-14) — a confirmed live-day card (remove/move) still vanishes instead
of showing "Done," because the resolved row is genuinely gone from the live week. Untouched this window
(no commit references it); still a good `PROMPT_FIX` candidate. Not re-logged.

### 2.7 Kid voice-first — unchanged

**FUNC-15** (`KidLabView.tsx`, plain `TextField`s, zero voice wiring) re-confirmed unchanged, still OPEN
— confirmed via the Explore investigation that this window's Dad's Lab changes (2.5) landed entirely in
`LabReportForm.tsx`/`DadLabPage.tsx`, not `KidLabView.tsx`.

### 2.8 MO→TX lens — clean rule-out

None of this window's changed files touch `src/features/records`, `src/core/compliance`, or
`functions/src/records`. `Missouri`/`'MO'`/`MO_` hits remain confined to the same four files as every
prior cycle (`RecordsPage.tsx`, `ComplianceDashboard.tsx`, `records.logic.ts`,
`src/core/compliance/stateCompliance.ts`).

---

## Step 3 — Pedagogy & Ethos (Band 3)

- **Pace/pressure language:** clean. Scanned every added line across this window's diff for
  behind/catch-up/falling-behind/scoring language; the only "failed" hits are honest error-state copy or
  code comments explicitly discussing how to *avoid* implying blame (e.g. `writeNextWeekDraft.ts`'s own
  docblock: *"not — never 'failed', which would imply nothing happened"*).
- **Diamonds-not-scores / no grading creep:** clean, and this window added a **direct regression test**
  for it — `src/features/progress/wordWallNoShame.test.tsx` (new, 55L) asserts the Word Wall's internal
  `masteryPercent` fixture never surfaces as a raw percentage in the rendered no-shame copy. Worth naming
  as a positive pattern: a Band-3 rail got its own test this cycle, not just a manual spot-check.
- **Charter preamble reach:** unchanged, still all **21** `CHAT_TASKS` registry entries wired
  (`functions/src/ai/tasks/index.ts` untouched this window).
- **No-shame kid-facing copy (FEAT-156, UX-72/75):** the Dad's Lab "didn't save" wording and the kid
  day-done gate fix both read as system/timing honesty rather than kid-facing blame — consistent with
  prior cycles' findings on this class of copy.

**No Band 3 findings this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, holds; the two files that changed hours-adjacent surfaces both explicitly wall themselves off

`computeHoursSummary` callers (non-test, repo-wide): `src/features/records/RecordsPage.tsx:366`,
`src/features/records/dataReviewExport.logic.ts:1212` — same two call sites as every prior cycle, no new
caller. The two changed files this window that sit near hours math were read in full:
`LabReportForm.tsx` only stores raw `totalMinutes` as source data (no independent derivation);
`applyWeekPlan.ts` carries an explicit in-code HARD CONSTRAINT (lines 226-230) that Apply never touches a
day's logged `actualMinutes` — the only field `computeHoursSummary` reads — and a second comment (lines
204-206) explaining why `plannedMinutes`/`dailyBudgetMinutes` are deliberately withheld from the chat's
own state so they can't leak into hours math by accident. **DATA-01 holds FIXED, no regression.**

### 4.2 DATA-02 — still NEEDS-DATA, now 53 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved; the
2026-07-01 dedupe-window freeze is now **53 days** overdue (was 46 at 08-16). Confirmed still touched by
multiple live paths (`RecordsPage.tsx`, `dataReviewExport.logic.ts`, `dataReviewExportLoader.ts`,
`migrateHoursAdjustments.ts`, `HoursRoutingAuditPanel.tsx`, `hoursRoutingAudit.ts`) but unresolvable from
a repo-only audit — still requires the owner to run the July dedupe pass against a live Firestore export.
**Still the single longest-standing item in the ledger, now growing into its eighth week.**

### 4.3 DATA-13 — unchanged fix candidate, but the true count is 4 sites, not 2

`records.logic.ts` untouched this window. Re-reading the file directly (rather than trusting the ledger
row's own "lines 1099, 1126" text) finds **four** Missouri-hardcoded string literals, not two:
- `records.logic.ts:1099` — `<title>Missouri Homeschool Compliance Report — ${childName}</title>`
- `records.logic.ts:1126` — `<h1>Missouri Homeschool Compliance Report</h1>`
- `records.logic.ts:1173` — *"Missouri's statute defines the five core subjects..."*
- `records.logic.ts:1203` — *"...intended for Missouri homeschool record-keeping purposes."*

All four are plain string literals inside the same template-literal HTML builder function; threading a
`state`/`complianceState` parameter through and interpolating at all four spots (not just two) remains a
clean, mechanical, low-risk fix — same trivial-fix candidate as every prior cycle, just now correctly
scoped. **Row text corrected in the ledger (Step 5); this is an undercount fix, the same class as
ARCH-12's correction two cycles ago, not new drift.**

### 4.4 MO→TX lens — no new hardcoding

Confirmed via 2.8 — zero new `Missouri`/`'MO'` literals in any file this window touched.

### 4.5 Additive-hours invariant — holds (see 4.1)

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Already-fixed items confirmed live, not this cycle's finding

- **`ARCH-45`** and **`DOC-14`** — both shipped as PR #1690 (2026-08-22), one day before this audit
  window's start point would have mattered; both confirmed live in the current tree (1.7, 2.1). No
  ledger action needed beyond what the fixing run already recorded.
- **`FEAT-155`** — functions-side `npm audit` is now clean (0 vulnerabilities, was 10) as directly
  re-verified in Step 0. Already ledgered as MERGED; no status change needed, confirming here for the
  record since it closes a debt every health report since 2026-08-03 had flagged.

### 5.2 New rows added this cycle

One new row, low severity, a methodology proposal (no code fix applied):

- **`ARCH-46`** — the `ARCH-43` Lincoln-name-literal grep census (`toLowerCase() === 'lincoln'` /
  `=== 'Lincoln'` / `=== 'London'`) has a confirmed blind spot: it misses a two-step lowercase-compare
  form (`const lower = childName.toLowerCase(); if (lower === 'lincoln')`) and object keys literally
  `lincoln`/`london`, both present in `src/features/dad-lab/LabReportForm.tsx` and undercounted by the
  census for as long as that file's current shape has existed. Recommend broadening the pattern and
  re-running the full census once. See Step 1.5.

### 5.3 Re-verified existing rows (status updates, no new IDs)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| **ARCH-02** | OPEN (+320L, "recommend live-day-edit handler trio as next PROMPT_FIX target") | **OPEN — −117L this window (3,412→3,295L), but NOT the recommended seam; the handler trio is still inline. Recommendation unchanged.** | see 1.1 |
| ARCH-01, 03, 04, 08, 13, 14 | OPEN | OPEN, unchanged | 0L growth on every one |
| ARCH-05 | OPEN | OPEN, unchanged — bundle flat (+2.53 kB) | |
| ARCH-06 | OPEN (28 refs/10 files) | OPEN, unchanged | |
| **ARCH-17** | OPEN (75 days to Node 20 EOL) | OPEN — 68 days, narrowing | |
| **ARCH-43** | OPEN (20 sites/19 files) | **OPEN, count unchanged — but a real instance was FIXED this window (`SkillSnapshotPage.tsx` heading, part of FEAT-154/UX-50) and a grep blind spot was found; see new row ARCH-46** | see 1.5 |
| **ARCH-45** | OPEN (new 08-16) | **FIXED** (PR #1690, 2026-08-22) — confirmed live | see 1.7 |
| **TEST-01** | IMPROVING (partial gap on `SkillSnapshotPage.tsx`, `DispositionProfile.tsx` untested) | IMPROVING, unchanged — same two gaps, `SkillSnapshotPage.tsx` changed this window but not on the untested path | see 1.3 |
| FUNC-01 | RESOLVED-WITH-DECISION, doc stale (DOC-14) | **RESOLVED-WITH-DECISION — supporting doc now current (DOC-14 fixed 08-22)** | see 2.1 |
| **DOC-14** | OPEN (new 08-16) | **FIXED** (PR #1690, 2026-08-22) — confirmed live | see 2.1 |
| FUNC-15 | OPEN | OPEN, unchanged | |
| FEAT-145 | OPEN (filed 08-14) | OPEN, unchanged — re-confirmed, not re-logged | see 2.6 |
| DATA-01 | FIXED | FIXED, re-verified against two new hours-adjacent files | |
| **DATA-02** | NEEDS-DATA (46 days overdue) | NEEDS-DATA, now **53 days overdue** | |
| **DATA-13** | OPEN (row text said lines 1099/1126, 2 sites) | **OPEN — corrected to the true 4-site scope (1099, 1126, 1173, 1203); same trivial fix, wider than previously described** | see 4.3 |

### 5.4 Mechanical doc fixes applied directly this cycle

- `docs/DOCUMENT_INDEX.md`: added this report's row; flipped `ARCHITECTURE_AUDIT_2026-08-16.md`'s entry
  from **CURRENT** to **HISTORICAL**; corrected `DECISION_FUNC-01_source_of_truth.md`'s cited date from
  "(2026-05-30)" to "(2026-08-22)" — `git log` confirms that is the file's true last-touch date (the
  DOC-14 fix), not its original authoring date.
- `docs/MASTER_OUTLINE.md` stats block: TypeScript lines 270,088 → **270,926** (computed via the same
  `find … | xargs wc -l` methodology as every prior cycle); Test files 394 → **397** (root `vitest run`
  file count). Firestore collections (48), Cloud Functions (29), Chat task types (21), Routes (36) all
  re-verified unchanged — none of their source files (`firestore.ts`, `functions/src/index.ts`,
  `tasks/index.ts`, `router.tsx`) appear in this window's diff, so no re-derivation was needed.
- `CLAUDE.md` Known Technical Debt section: two stale line-count parentheticals corrected —
  `useShellyChatFlows.ts` "(1,123L)" → **(1,134L)**, `contextSlices.ts` "(1,566L)" → **(1,617L)** — both
  pre-existing drift from before this window (neither file changed this cycle), caught while
  cross-checking Step 1's file-size table against CLAUDE.md's own numbers. No prose/judgement changed.
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-08-23, added this report to the
  audit chain; ledger gets **+1 row / −0** (`ARCH-46`), no row reordered, deleted, or reopened.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 5,934/5,934 tests; functions:
clean lint/tsc, 976/976 tests; build clean, bundle 4,340.19 kB/1,293.00 kB gzip, essentially flat;
`npm audit` **0 vulnerabilities on both trees for the first time this report series** — functions went
10→0 via FEAT-155's dependency cleanup; `docs:check` HARD green). **Top 3 findings by leverage:** (1)
functions-side `npm audit` reaching zero (FEAT-155) closes a debt every health report since 2026-08-03
had left for a human — worth naming as the cycle's biggest win, not a new finding to chase; (2) `ARCH-02`
(`PlannerChatPage.tsx`) shrank again (−117L) but not via the recommended seam — the live-day-edit handler
trio is still inline and still the concrete, scoped extraction candidate; (3) `DATA-02`'s dedupe freeze
window is now 53 days overdue (eighth week) with no owner action, still the longest-standing item in the
ledger. **Recommend running `PROMPT_FIX.md` next against:** `ARCH-02`'s live-day-edit handler trio
extraction (concrete and scoped, unchanged recommendation from 08-16), then `DATA-13` (now correctly
scoped to 4 sites, still a trivial parameterization fix), then `ARCH-46` (methodology-only — broaden the
name-literal grep pattern and re-run the census once, no code change).
