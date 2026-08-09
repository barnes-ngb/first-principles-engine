# Architecture Audit — 2026-08-09

> **Type:** Monthly deep audit (scheduled run, fired 2026-08-09 — 7 days after the 2026-08-02 primary
> monthly run; cadence in practice has run roughly weekly this series, consistent with prior mid-cycle
> re-verification runs such as `ARCHITECTURE_AUDIT_2026-07-12.md`).
> **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-08-09
> **Branch:** `claude/brave-feynman-srv54k` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-08.md` (2026-08-02)
> **Window covered:** 2026-08-02 → 2026-08-09 (7 days, `origin/main` at `d22e510`, clean fast-forward
> from the prior audit's base — no divergence).

---

## Step 0 — Baseline

```
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 4,867 tests passing (362 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 682 tests passing (37 files)
npm run build                         → dist/assets/index-*.js  4,276.73 kB │ gzip: 1,273.33 kB
```

**Baseline: GREEN.** `node_modules` was not present at session start (fresh container); `npm ci` /
`npm ci` (functions) installed cleanly before any check ran. No flakes observed.

Root test count is up **4,802 → 4,867 (+65)** at an **unchanged 362 files** — all growth landed inside
four already-existing test files (`records.logic.test.ts` +304L, `chatPlanner.logic.test.ts` +336L,
`addXpEvent.test.ts`, `checklistRoutineSync.test.ts`), the sanctioned weekly **test-builder** lane
(`PROCESS_OVERVIEW.md` §ii — additive test files only, never product code). Functions' suite is
byte-identical at **682 tests / 37 files.** Bundle is **byte-identical** to 08-02:
**4,276.73 kB / 1,273.33 kB gzip, +0.00 kB.** `npm audit` (functions, prod): **13** (1 low, 9 moderate,
3 high) — unchanged. `npm audit` (root, prod): **3** (1 moderate, 2 high) — **+1 moderate since 08-02**
(`dompurify` ≤3.4.12, XSS via `IN_PLACE` hook removal, transitive through `jspdf@4.2.1`; patch fix
available, `dompurify@3.4.13`, non-breaking). This is a **new advisory publication, not a dependency
change** — `package-lock.json` is byte-identical to 08-02 (confirmed via `git diff --stat`), so nothing
in the repo moved; the vulnerability database updated underneath an unchanged lockfile. Noted, not
applied — a lockfile bump is not a "mechanical doc fix" and stays a `PROMPT_FIX` candidate, not
something this audit self-applies.

`npm run docs:check` — **HARD green** after this report was added to `docs/DOCUMENT_INDEX.md` (the
script's `[index-fs]` rule failed once, correctly, before that index entry existed — fixed as part of
this cycle's mechanical doc work, same as every prior audit's own report needed indexing). SOFT warnings
unchanged in shape from prior cycles: 2 `raw-refs` (untracked direct `collection()` calls in
`ArmorTab.tsx`/`DevAdminTab.tsx`), 8 `remote-timeout-finally`, 1 `image-downscale`, plus the 97-swallowed-
catch `silent-fallback-census` (report-only). None of these are new to this cycle's diff — no file in
that list appears in `git diff --stat ec784df..HEAD`.

**This is the quietest window recorded in this audit series, more so than 08-02's "flattest week."**
`git diff --stat ec784df..HEAD` (the entire window) touches exactly 8 files: the 08-02 audit's own
report + ledger update, one `CLAUDE.md` line, `docs/DOCUMENT_INDEX.md`, and four test files. **Zero
files under `src/` or `functions/src/` changed.** Every Step 1–4 largest-file, writer-location, and
name-literal measurement below is therefore re-verification against an unchanged tree, not new
investigation — the only place this cycle found real drift was the **ledger itself** (Step 5).

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

No surface shipped this window that could regress any of the three — noted once here rather than
repeated under each step.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — byte-identical to 2026-08-02 on every product file

Full `find src functions/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn` re-run, filtered
to >1,500L:

| File | 2026-08-02 | 2026-08-09 | Δ |
|---|---|---|---|
| `PlannerChatPage.tsx` | 3,092L | 3,092L | +0 |
| `chat.ts` (CF) | 2,641L | 2,641L | +0 |
| `useQuestSession.ts` | 2,218L | 2,218L | +0 |
| `BookEditorPage.tsx` | 2,113L | 2,113L | +0 |
| `MyAvatarPage.tsx` | 1,876L | 1,876L | +0 |
| `dataReviewExport.logic.ts` | 1,713L | 1,713L | +0 |
| `WorkshopPage.tsx` | 1,623L | 1,623L | +0 |
| `contextSlices.ts` | 1,617L | 1,617L | +0 |
| `VoxelCharacter.tsx` | 1,606L | 1,606L | +0 |
| `chatPlanner.logic.ts` | 1,544L | 1,544L | +0 |

**The only two files that moved anywhere in the repo are test files**, both from the sanctioned
test-builder lane: `records.logic.test.ts` 2,460L → **2,764L (+304)** and `chatPlanner.logic.test.ts`
1,560L → **1,896L (+336)**. Neither crosses into product code; neither is a decomposition candidate
(test files scale with the logic they cover, and both are already the largest test file for their
respective logic module by design).

**ARCH-01/02/03/04/05/08/12/13/14 — all unchanged, re-verified only.** `PlannerChatPage.tsx` holds at
3,092L for a **third** consecutive measurement window (paused since 08-02, was a 4-cycle growth streak
before that) — two flat cycles now makes "genuinely stabilized" a live enough hypothesis that the next
cycle's read should decide it one way or the other rather than carry the decomposition recommendation
forward by default.

### 1.2 Bundle (ARCH-05) — byte-identical

**4,276.73 kB / 1,273.33 kB gzip, +0.00 kB / +0.00 kB gzip** since 08-02 — the first exactly-zero
bundle delta in this series (prior cycles were "noise-level," this one is literally unchanged, matching
zero `src/` diff). Still zero `React.lazy` in `router.tsx`; `AvatarThumbnail.tsx:2` still statically
imports `three`, still used in the always-rendered `AppShell.tsx` nav chrome. **ARCH-08 remains the
concrete prerequisite, unchanged. Band 1, ARCH-05/ARCH-08, unchanged.**

### 1.3 Test coverage (TEST-01) — both named gaps still open, growth landed elsewhere

- **`DispositionProfile.tsx` still has zero direct test file** — re-confirmed, no
  `DispositionProfile*.test.*` anywhere in `src/features/progress/`.
- **`SkillSnapshotPage.tsx`'s inline merge-write path is still untested** — `SkillSnapshotPage.tsx:96,115`
  (`setDoc` on `snapshotRef`) unchanged, no covering test.

This window's +65 tests landed in `records.logic.test.ts`, `chatPlanner.logic.test.ts`,
`addXpEvent.test.ts` (XP ledger — tier check, `MANUAL_AWARD`, diamond spend, fresh ledger), and
`checklistRoutineSync.test.ts` (untested labels, toggles, un-sync) — real logic, not the two named
`progress`/`evaluation` gaps. **TEST-01 status unchanged: IMPROVING but not closed** — the test-builder
lane is picking real targets, just not these two yet. Worth naming as a direct ask for the next
test-builder pass rather than leaving it to land wherever coverage is thinnest.

### 1.4 ARCH-12 re-verify — inline `skillSnapshots` writers, unchanged at identical line numbers

- `useQuestSession.ts:1148` (`setDoc(snapshotRef, ..., { merge: true })`) and `:1168`
  (`updateDoc(snapshotRef, { conceptualBlocks, ... })`) — still inline.
- `EvaluateChatPage.tsx:622,625` — still inline.
- `SkillSnapshotPage.tsx:96,115` — still inline.

**Still 0 of 3 files migrated. Band 1, ARCH-12, OPEN — unchanged.**

### 1.5 ARCH-43 (Lincoln-name-literal sites) — re-swept, same 20 sites, one prior-cycle prose imprecision corrected

`grep -rln "toLowerCase() === 'lincoln'\|=== 'Lincoln'" src` (non-test): **20 sites across 19 files** —
the site count matches 08-02's "20 sites" exactly. The file count is **19, not 18** as the 08-02 prose
stated; enumerating precisely this cycle turns up a ninth `books/` file (`PageEditor.tsx` alongside
`CreateSightWordBook.tsx`, `BookReaderPage.tsx`, `StoryGuidePage.tsx`, `StickersPage.tsx`,
`BookEditorPage.tsx`, `BookshelfPage.tsx`, `BookGenerateChat.tsx`, `BookReviewChat.tsx`) that the prior
cycle's "8 files under books/" undercounted by one. **This is not a new regression** — zero files under
`src/features/books/` appear anywhere in `git diff --stat ec784df..HEAD`, so the set was already 19
files at 08-02; the "18" was a counting slip in that report's prose, not a stale measurement. Corrected
here for the record. **Band 1, ARCH-43, OPEN — unchanged in substance, count precision fixed.**

### 1.6 ARCH-06 (WorkbookConfig → ActivityConfig) — exact pattern unchanged

Exact case-sensitive `WorkbookConfig\b` grep (non-test): **30 refs / 10 files — unchanged** from 08-02
and 07-26. No new investigation into the broader case-insensitive methodology gap this cycle (nothing
in the affected files changed) — the standing recommendation (pin one exact grep pattern for this row
via a future `PROMPT_FIX` or health-audit pass) still applies. **Band 1, ARCH-06, OPEN — unchanged.**

### 1.7 ARCH-17 (Node.js runtime) — watch window narrowing further

`functions/package.json` still pins `"node": "20"`. Node 20 decommission is 2026-10-30 — **82 days
out** as of this audit (was 89 at 08-02). Worth flagging concretely now: the local build environment
this cycle ran on **Node v22.22.2** (`npm warn EBADENGINE` on `functions/npm ci`, required `20` vs
current `22`) — the pin is already behind the tooling actually available, which strengthens rather than
weakens the case to treat the 20→22 upgrade as due, not merely "approaching."

### 1.8 Drift since last audit (2026-08-02 → 2026-08-09)

- **Zero lines changed under `src/` or `functions/src/`.** The only files touched all week: this
  report's predecessor + its ledger update, `CLAUDE.md` (1 line removed), `docs/DOCUMENT_INDEX.md`, and
  4 test files.
- Bundle: **+0.00 kB** — the first exactly-flat cycle in this series.
- No new lint errors, no new tsc errors, no new test failures or flakes.
- `npm audit`: functions unchanged at 13; root **+1 moderate** (new `dompurify` advisory, no lockfile
  change — see Step 0).
- **This is the flattest architecture-drift window recorded since the audit series began**, surpassing
  08-02's own record. Two flat cycles in a row is itself a data point: either the team is between
  feature pushes, or the pace of shipped work genuinely varies this much week to week. Either way, a
  quiet week is not evidence any standing OPEN item resolved itself — every row above was re-verified,
  not assumed.

---

## Step 2 — Functional / UX Loop (Band 2)

No feature surface shipped this window (confirmed via the zero-`src/`-diff finding in Step 0), so this
step is a re-affirmation sweep rather than fresh investigation, same posture 08-02 took for pedagogy.

### 2.1 FUNC-01 ("where is Lincoln") — no regression

Still **RESOLVED-WITH-DECISION** (2026-05-30, Model 2: layered ownership). No new surface competes for
authority this window.

### 2.2 Loop integrity — no new incident to trace

No code shipped, so there is no new real-path incident this cycle (unlike 08-02, which had the
FEAT-134 kid-watch-visibility fix as a live case study). The loop's last-traced state stands unchanged.

### 2.3 Shelly's path / 2.4 Kid voice-first — no new surface, standing findings unchanged

**FUNC-15** (`KidLabView.tsx`, 5 plain `TextField`s, zero `VoiceInput`/`useAudioRecording`/
`useTranscription` wiring) re-confirmed via the same grep as every prior cycle — unchanged, no fix
applied. **Band 2, FUNC-15, OPEN — unchanged.**

### 2.5 Known weak links (`PROCESS_OVERVIEW.md` iii) — unchanged

No repo-observable change to sparse-upload days, Lincoln's Knowledge Mine cadence, or MO-only
state-labeling this window.

---

## Step 3 — Pedagogy & Ethos (Band 3)

Zero files under `functions/src/ai/` changed this window (confirmed in Step 0's diff-stat). Re-affirmed
without fresh investigation: no pace/pressure language regression, "diamonds not scores" framing
unchanged (no kid-facing surface touched), charter preamble reach unchanged — `CHAT_TASKS` registry
untouched since 08-02's confirmed 21-entry count. **No new Band 3 finding this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — unchanged, no new hours-adjacent surface

No new view shipped this window. Additive-hours invariant unaffected — nothing to re-verify beyond
08-02's confirmation.

### 4.2 DATA-02 — still NEEDS-DATA, now 39 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved. The
2026-07-01 dedupe-window freeze is now **39 days** overdue (was 32 at 08-02). Still unresolvable from a
repo-only audit — requires the owner to run the July dedupe pass against a live Firestore export.
**This is now over five weeks overdue and remains the single longest-standing item in the ledger.**

### 4.3 DATA-13 — unchanged, same lines

`records.logic.ts` did not change this window (only its test file grew); the hardcoded
`"Missouri Homeschool Compliance Report"` title is still at **`records.logic.ts:1099,1126`**, unmoved.
Same 3-line fix candidate as every prior cycle. **Band 4, DATA-13, OPEN — unchanged.**

### 4.4 MO→TX lens — no new hardcoding

No compliance-adjacent file changed. `stateCompliance.ts` untouched. No new Lens-3 violation.

### 4.5 Additive-hours invariant — no new surface to re-check

---

## Step 5 — Ledger Hygiene: the ledger-hygiene fix itself had a gap, closed this cycle

### 5.1 DOC-12 (new) — 28 more stale "PR open" / "do not merge" statuses found and corrected

The 08-02 audit's own **DOC-11** finding fixed 25 rows and explicitly named its own limits: it caught
only rows matching `PR open|do not merge` verbatim in the *July 2026* window, and separately noted that
**PR #1634** (2026-07-26, a dedicated ledger-hygiene sweep) had already fixed 53 rows but flagged
**~40 more** using variant wording (`DONE (PR open ...)`, `RESOLVED (PR open ...)`, etc.) as sampled-but-
not-swept — 15 of ~40 were spot-checked in #1634 and confirmed merged, including naming `FEAT-112`'s
amendment tail as one of the 15. **Neither DOC-11 nor #1634 actually corrected those rows' status
cells** — the sampling proved they were stale but the fix was deferred both times. This cycle finished
that deferred work: **grepped the current ledger for every remaining `PR open|do not merge` instance**,
verified each against GitHub (via `search_pull_requests`, direct merge-commit lookup after
`git fetch --unshallow` — the repo's working clone was shallow, the same trap PR #1634's own body warns
about), and corrected all that were genuinely stale:

**28 rows corrected** (all confirmed `MERGED` on `main`, none currently open — cross-checked against the
repo's single currently-open PR, #1649, which matches none of them): `ARCH-26` (#1370, 06-07),
`ARCH-27` (#1371, 06-07), `ARCH-28` (#1372, 06-08), `ARCH-29` (#1375, 06-08), `ARCH-30` (#1376, 06-08),
`ARCH-31` (#1377, 06-08), `ARCH-32` (#1378, 06-08), `ARCH-33` (#1379, 06-08), `ARCH-34` (#1380, 06-08),
`ARCH-35` (#1381, 06-08), `ARCH-36` (#1382, 06-08), `ARCH-37` (#1407, 06-09), `DATA-11` (#1409, 06-10),
`FEAT-25` (#1417, 06-19), `FEAT-26` (#1417, 06-19), `FEAT-32` (#1427, 06-20), `FEAT-34` (#1438, 06-20),
`FEAT-35` (#1441, 06-20), `FEAT-36` (#1442, 06-20), `FEAT-37` (#1445, 06-20), `FEAT-38` (#1446, 06-20),
`FEAT-39` (#1458, 06-21), `DATA-14` (#1473, 07-01), `DATA-15` (#1479, 07-02), `FUNC-13` (#1429, 06-20),
`DOC-05` (#1433, 06-20), `DOC-06` (#1440, 06-20), and `FEAT-112`'s amendment tail (#1609, 07-20) — the
exact row #1634 named as sampled-and-confirmed but never fixed.

Two design-doc rows (`FEAT-49`, `FEAT-50`) carried the same stale `— do not merge` tail despite their
docs being live on `main` since 2026-07-03 (`#1491`, `#1492`) — corrected alongside the code rows since
they're the identical defect (the "do not merge" phrase written into the PR body at build time, never
updated on merge), just on doc-only rows rather than code rows.

**All 28 verified independently, not by trusting #1634's un-acted-upon sample:** PRs #1370–1382 were
confirmed via a title search (`"UI Batch 3b" in:title is:merged`, 11/11 merged) plus first-parent
merge-commit dates off the now-unshallowed clone; the remainder via `search_pull_requests` by ID/title
plus merge-commit date lookup. **Zero rows left in a worse state than found** — every row's status cell
now reads `MERGED (PR #N, merged DATE — verified 2026-08-09, monthly audit)`, matching the wording
convention DOC-11 established.

**Deliberately left alone:** one embedded narrative phrase inside `ARCH-15`'s (already-`FIXED`)
description column still reads `"→ RESOLUTION (PR open, branch ...)"` — this is prose describing
historical work, not a live status-cell claim, and `ARCH-15`'s actual status is already
`FIXED (PR #1338 merged 2026-06-02)`, so it carries no risk of being read as open work. `FEAT-42`'s
`"do not merge"` phrase is likewise embedded in its description text, not its status cell (which already
reads the neutral `DESIGN (doc only, no build assigned)`). Neither was touched — out of the pattern this
sweep exists to fix.

**Ledger diff for this row:** 28 status cells corrected in place, **0 rows added, 0 removed, 0
reordered, 0 reopened** (plus the 1 new `DOC-12` row itself) — same additive discipline as DOC-11.
`grep -c '^| \*\*' docs/review/REVIEW_HOME_BASE.md` reads 238 before and after this cycle's edits.

**Systemic observation, carried forward again:** this is the *third* time this exact class of drift has
been found (PR #1634 → DOC-11 → this cycle) and the *second* time a sweep explicitly named rows it
wasn't fixing yet. The proposed scripted check from DOC-11 (`gh pr list --state open` diffed against
every ledger row matching `/PR open|do not merge/i`, run continuously rather than manually once a
month) has not been built. After three manual sweeps catching the same defect, **this is no longer a
nice-to-have** — recommend it as the top `PROMPT_FIX` candidate this cycle specifically because doing it
once, mechanically, is cheaper than a fourth manual sweep next month.

### No new architecture/functional/pedagogy/data findings this cycle

Consistent with the zero-`src/`-diff finding in Step 0 — every Step 1–4 investigation this window
re-confirmed an existing row unchanged. The only new ledger row this cycle is the ledger-hygiene finding
above.

### Re-verified existing rows (status updates)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-01, 03, 04, 06, 08, 12, 13, 14 | OPEN | OPEN, unchanged | 0L growth / 0 drift on every one |
| **ARCH-02** | OPEN (growth paused, held at 3,092L) | **OPEN — held flat a 2nd cycle (3rd flat measurement overall)** | worth deciding "stabilized vs. lull" next cycle |
| ARCH-05 | OPEN | OPEN, unchanged — bundle +0.00 kB, first exactly-flat cycle | |
| **ARCH-43** | OPEN (20 sites / "18 files") | **OPEN — 20 sites / 19 files, prose count corrected (not a regression)** | see 1.5 |
| ARCH-17 | OPEN (89 days to Node 20 EOL) | OPEN — 82 days, narrowing; local env already on Node 22 | |
| TEST-01 | IMPROVING | IMPROVING, unchanged — both named gaps (DispositionProfile, SkillSnapshotPage) still open despite +65 tests elsewhere | |
| FUNC-01 | RESOLVED-WITH-DECISION | unchanged, re-affirmed | |
| FUNC-15 | OPEN | OPEN, unchanged | |
| DATA-01 | FIXED | FIXED, re-verified | |
| DATA-02 | NEEDS-DATA (32 days overdue) | NEEDS-DATA, now **39 days overdue** | longest-standing overdue item, growing |
| DATA-13 | OPEN (lines 1099/1126) | OPEN, unchanged | |
| **ARCH-26 – ARCH-37, DATA-11, FEAT-25/26/32/34–39, DATA-14/15, FUNC-13, DOC-05/06, FEAT-49/50, FEAT-112 (amendment)** | stale `PR open`/`do not merge` | **MERGED, corrected** | see 5.1, new row `DOC-12` |

### Mechanical doc fixes applied directly this cycle

- `docs/review/REVIEW_HOME_BASE.md` header: bump "Last audit" to 2026-08-09, add this report to the
  audit chain.
- `docs/review/REVIEW_HOME_BASE.md` ledger: 28 status-cell corrections (stale `PR open`/`do not merge`
  → `MERGED (PR #N, merged DATE — verified 2026-08-09, monthly audit)`), one new row (`DOC-12`). Ledger
  diff: **+1 row / −0 rows** net content, 28 status cells edited in place — no row reordered, deleted,
  or reopened.

### 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 4,867/4,867 tests;
functions: clean lint/tsc, 682/682 tests; build clean, bundle 4,276.73 kB/1,273.33 kB gzip, **+0.00 kB —
the flattest week recorded in this series, surpassing 08-02's own record**). **Top 3 findings by
leverage:** (1) a ledger-hygiene defect that has now survived **three** independent sweeps (PR #1634 →
DOC-11 → this cycle's `DOC-12`) because each one fixed what it found and deferred the rest — 28 more
rows corrected this cycle, and the scripted continuous check first proposed at DOC-11 is now the
clearest highest-leverage `PROMPT_FIX` in the ledger precisely because doing it once is cheaper than a
4th manual sweep; (2) `PlannerChatPage.tsx` has now held flat at 3,092L for two consecutive cycles after
a 4-cycle growth streak — next cycle's read should settle whether it has genuinely stabilized; (3)
DATA-02's dedupe freeze window is now 39 days overdue with no owner action, still the longest-standing
item in the ledger and growing weekly. **Recommend running `PROMPT_FIX.md` next against:** the DOC-11
scripted ledger-status check (now proposed three times, highest leverage this cycle), then DATA-13
(trivial 3-line fix, unchanged from every prior cycle's recommendation), then ARCH-12 (central-writer
migration, precisely scoped to 3 call sites, unchanged).
