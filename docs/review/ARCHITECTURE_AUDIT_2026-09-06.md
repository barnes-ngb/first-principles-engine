# Architecture Audit — 2026-09-06

> **Type:** Monthly deep audit (scheduled run, fired 2026-09-06 — 6 days after the 2026-08-30 run;
> cadence in practice continues to run roughly weekly in this series).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-09-06
> **Branch:** `claude/brave-feynman-ybrnn5` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-08-30.md` (merged as commit `a78a180`, 2026-09-01)
> **Window covered:** 2026-09-01 → 2026-09-06 (215 commits, `origin/main` at `5695f2d`). An unusually
> heavy week even for this series: **374 files changed, +39,356 / −5,323 lines**. Headline: the weekly
> review page was rebuilt from an AI-narrative report into a log (UX-211→UX-219 — hours stated, evidence
> counts, an *observed* (never required) coverage rate, one reflection question, the AI narrative kept
> only as raw material for the monthly book and the Shelly chat context strip); a new Life Day plan type
> shipped (FEAT-200); ARCH-47's four-slice de-duplication finished; and the Story Guide wizard was
> retired (FEAT-187) alongside a wide Books-area reading-level/custom-theme arc (FEAT-169→FEAT-197).
> Two other audits already ran and landed this same window and are not re-litigated here:
> `ASK_AI_AUDIT_2026-09_PART_A.md` (2026-09-05, Ask AI action-kind audit) and
> `AI_DEVELOPMENT_REVIEW_20260905.md` (2026-09-05/06, external AI-development/documentation review,
> `DOC-20`/`DOC-21`).

---

## Step 0 — Baseline

```
npm ci (root)                         → fresh container, 0 → clean install (646 packages)
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 7,687 tests passing (534 files), 0 failing, 0 skipped
cd functions && npm ci                → fresh container, 0 → clean install (685 packages)
cd functions && npm run lint          → CLEAN
cd functions && npm run build (tsc)   → CLEAN (functions has no separate --noEmit script; `build` is `tsc`)
cd functions && npm test              → 1,371 tests passing (61 files), 0 failing, 0 skipped
npm run build                         → dist/assets/index-*.js  4,427.50 kB │ gzip: 1,325.78 kB
npm run docs:check                    → HARD green, 11 SOFT warnings (1 newly actionable — see 5.4)
```

**Baseline: GREEN.** Fresh container, no `node_modules` at session start for either `npm ci` — same
one-time environment artifact as every prior cycle, not a repo defect. No flakes observed.

Root tests: **421 → 534 files (+113), 6,342 → 7,687 tests (+1,345)** since the 2026-08-30 baseline.
Functions: **41 → 61 files (+20), 1,064 → 1,371 tests (+307)**. Consistent with the heaviest single-week
diff this series has recorded — tests continue to ship with the feature, not lag behind it.

**`npm audit` (prod-only, `--omit=dev`) — regressed on both trees, first regression in at least three
cycles.** Root: **1 moderate** (`fflate` 0.8.0–0.8.2, via `jspdf@4.2.1` — a real, always-loaded print-path
dependency, not a dev tool; "unzipSync can enter an infinite loop when parsing malformed ZIP64 archives,"
fix available via `npm audit fix` without `--force`). Functions: **3 moderate** (`qs`/`body-parser`/
`express`, all transitively via `firebase-functions@6.6.0` — "Denial of Service via Attacker Controlled
isBuffer," fix also available via `npm audit fix` without `--force` per the tool's own dry run, though the
underlying fix is an upstream `firebase-functions` version bump, not a local override). Both were **0
vulnerabilities** as recently as 08-24 and 08-30. See 1.12 for detail — this is a new finding this cycle
(`ARCH-50`).

**Bundle:** 4,362.99 kB → **4,427.50 kB** (+64.51 kB), 1,301.48 kB → **1,325.78 kB gzip** (+24.30 kB
gzip) since the 08-30 baseline — roughly **3× the prior week's growth rate** (+22.80 kB / +8.48 kB gzip
at 08-30), proportionate to the heaviest feature week this series has measured. `grep -n "React.lazy\|
lazy(" src/app/router.tsx` still returns zero matches — **ARCH-05/ARCH-08 unchanged, zero
code-splitting.**

**`npm run docs:check`:** HARD green. `[ledger-ids]` **395 rows** (was 292 at 08-30; +103 — this window
also absorbed `FEAT-192a`'s and `AI_DEVELOPMENT_REVIEW`'s own ledger additions, not just this audit's).
`[ledger-status]` produced one **SOFT** (correctly not HARD, see below) finding this cycle: `UX-218`'s
status cell still read the pre-merge "do not merge yet" form after its PR (#1785) merged to `main` —
**fixed directly in this run** (mechanical, see 5.4). SOFT warnings otherwise unchanged in shape:
2 `raw-refs` (`ArmorTab.tsx`, `DevAdminTab.tsx`), **7** `remote-timeout-finally` (was 8 at 08-30 — one
fewer, no regression), 1 `image-downscale`, and `silent-fallback-census` at **98 swallowed catches
across 54 files** (was 97/54 — flat, +1 despite 374 changed files).

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window's headline change (the weekly-review restructure, UX-211→UX-219) is a direct Lens-1
subject — it touches the "re-evaluated" end of the loop and the DATA-01 hours invariant simultaneously.
Both were traced end to end this cycle (2.2, 4.1) and both hold.

---

## Step 1 — Architecture & Tech Debt (Band 1)

**Window:** commit `a78a180` (2026-09-01) → `HEAD` (`5695f2d`, 2026-09-06), 215 commits, 374 files,
+39,356/−5,323.

### 1.1 Largest files — full re-verification

| File | 08-30 | Current | Δ | Judgment |
|---|---|---|---|---|
| `PlannerChatPage.tsx` | 3,295L | **3,418L** | **+123** | Tangled — **ARCH-02**. File **was touched this window** (FEAT-196 week selector, UX-183 button label) — breaks a 3-cycle streak of being untouched. The recommended handler trio (`handleRemoveItem`/`handleMoveItemToDay`/`handleSwapWatchItem`) is still inline and unextracted, now at `:2039/:2106/:2180`. |
| `functions/src/ai/chat.ts` | 2,641L | **3,051L** | **+410** | Cohesive-but-big — **ARCH-01**. Largest single-file growth this cycle, driven by 6 real commits (FEAT-169/172/173/176/191/194, the story reading-level + custom-theme lane). Not tangled — additive prompt-block logic — but CLAUDE.md's line count is now badly stale. |
| `src/features/quest/useQuestSession.ts` | 2,218L | 2,218L | +0 | Tangled — **ARCH-04**, unchanged, not touched this window. |
| `src/features/books/BookEditorPage.tsx` | 2,113L (reported)/2,161L (actual at baseline) | **2,414L** | **+253** | Cohesive-but-big — **ARCH-03**. 11 commits, all Books-area feature work (FEAT-175/177/178/181/182/193/194/195). |
| `functions/src/ai/tasks/shellyChat.ts` | 1,938L | **1,949L** | +11 | **Has not crossed 2,000L.** Zero commits touched this file this window (the +11L is baseline-measurement drift, not growth). Still 51L below the auto-flag line. |
| `src/features/shelly-chat/useShellyChatActions.ts` | 1,354L | **1,360L** | +6 | The 3-cycle ~150–250L/week growth trend **stopped this window**. Stand down from watch-list. |
| `functions/src/ai/contextSlices.ts` | 1,617L | 1,627L | +10 | **ARCH-14**, unchanged. |
| `src/features/records/dataReviewExport.logic.ts` | 1,712L | 1,712L | 0 | **ARCH-44**, unchanged. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,876L | 1,876L | 0 | Unchanged. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623L | **1,816L** | **+193** | **New watch-list candidate** — FEAT-184 (art quota doors) + UX-204/205/206 (day-budget weighting groundwork). Feature accretion, not obviously tangled yet. |
| `src/features/today/TodayChecklist.tsx` | 1,597L | 1,605L | +8 | Flat, unchanged. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,544L | **1,655L** | **+111** | UX-204/205/206 day-budget-weighting work. Approaching the next watch tier. |
| `src/features/records/records.logic.ts` | 1,217L (baseline) | **1,102L** | **−115** | Shrank — ARCH-47 slice 4 (hours-contributions consolidation), a healthy direction. |
| `functions/src/ai/evaluate.ts` | 1,112L (baseline) | **1,302L** | **+190** | UX-211→219 weekly-review restructuring. Cohesive scheduled-CF orchestration, not tangled. |

**Weekly-review directory check:** no file in `src/features/weekly-review/` exceeds 1,500L — largest is
`WeeklyReviewPage.tsx` at 530L. The narrative-stripping (UX-219) plus new pace/reflection modules landed
as small, well-separated files (`weekHours.ts` 148L, `weekReflection.ts` 130L, `WeekPaceSection.tsx`
184L). `pace.logic.ts` grew 98L→**348L** (+250, the new `computeObservedCoverage`/
`selectBaselineSnapshot`) — still small. No decomposition concern in this area.

**No file crossed 1,500L for the first time this window**, other than `WorkshopPage.tsx` and
`chatPlanner.logic.ts`, both already over the line at baseline and both accelerating.

### 1.2 ARCH-02 (`PlannerChatPage.tsx`) — the file was touched this window; the fix still wasn't

Unlike three consecutive prior cycles where this file went untouched, `git diff a78a180..HEAD --stat`
shows 158 insertions / 35 deletions this window (FEAT-196, UX-183 — unrelated to the recommended
extraction). **This demonstrates the exact risk the standing recommendation warns about**: unrelated
feature work keeps landing in the file the extraction was meant to protect, and the handler trio is now
into a **4th consecutive cycle** unaddressed.

### 1.3 `functions/src/ai/tasks/shellyChat.ts` — flat, still hasn't crossed 2,000L

Confirmed via `git log --oneline a78a180..HEAD -- functions/src/ai/tasks/shellyChat.ts` (zero commits).
At 1,949L, 51L below the 2,000L auto-flag line. Standing recommendation (name it in CLAUDE.md the moment
it crosses) correctly deferred again.

### 1.4 Bundle (ARCH-05/ARCH-08) — growth tripled this window, still zero code-splitting

+64.51 kB / +24.30 kB gzip since 08-30 (see Step 0), roughly 3× the prior week's rate. `AvatarThumbnail.
tsx` still statically imports `three` into always-rendered nav chrome (unchanged). **Band 1, ARCH-05/
ARCH-08, OPEN — unchanged**, growth rate worth watching if it compounds.

### 1.5 Test coverage (TEST-01) — same two standing gaps, plus a new narrower observation

- **`DispositionProfile.tsx`** — confirmed still no dedicated test file (only the unrelated `disposition.
  ts` type-module test exists). Unchanged.
- **`SkillSnapshotPage.tsx`'s `persist`** (still line 110) — `SkillSnapshotPage.defaults.test.tsx` still
  covers only the "Load Starter Defaults" branch; the save-failure path is untested. Unchanged.
- **New observation, not a new standing gap:** 11 new-this-window production files ship with no test
  file — `functions/src/ai/imageTasks/visualRecipe.ts`, `functions/src/ai/storyLevelContext.ts`,
  `functions/src/ai/storySafeWords.ts`, `src/features/avatar/useAvatarArtQuota.ts`, `src/features/books/
  CustomLookCard.tsx`, `CustomStoryThemeCard.tsx`, `ImageFitBackdrop.tsx`, `StoryLevelStretchSelector.
  tsx`, `src/features/weekly-review/useWeekHours.ts`, `useWeeklyReviewHistory.ts`, `writeWeekReflection.
  ts`. All are thin hooks/presentational wrappers, not pure-logic modules — every logic-bearing sibling
  in the same feature set (`storyDecodability.ts`, `customPictureNote.ts`, `pace.logic.ts`, `lifeDay.ts`,
  `weekHours.ts`, `weekReflection.ts`, `weekEvidenceCounts.ts`, `imageGenerationFailure.ts`, and a dozen
  more) **did** ship with tests. The "tests ship with the feature" norm held for logic; the gap is
  confined to hooks/presentational glue. Low severity, informational — not proposing a new TEST- row for
  this alone.

### 1.6 ARCH-06 (WorkbookConfig → ActivityConfig) — unchanged

`grep -rn -w 'WorkbookConfig' src functions/src --include=*.ts --include=*.tsx | grep -v '.test.'`: **28
refs / 10 files**, identical to 08-30. No file in this window's diff references `WorkbookConfig`. Not yet
safe to complete migration.

### 1.7 ARCH-47 completion — one leftover still open; discipline held on a new adjacent surface

`functions/src/shared/README.md` confirms all 4 original slices are complete (unchanged from 09-01), plus
one *new* addition landed since — `customPictureNote.ts` (FEAT-197/UX-177), documented as a rule "born"
in `shared/` rather than consolidated into it, not a fifth slice. **The named leftover from 08-30 is
still open**: `labBeatsHaveContent`/`beatTextForChild`/`BEAT_BOTH` in `functions/src/ai/tasks/
dadLabReportArtifacts.ts` remains a hand-kept port of `src/core/types/dadlab.ts`; no slice-5 work done
this window.

**Positive finding: the ARCH-47 discipline held on the new weekly-review surface without a dedicated
review step forcing it.** `weekHours.ts` documents in its own header why it delegates to
`computeHoursSummary` rather than re-deriving hours, and `useWeekHours.ts` imports `computeHoursSummary`
directly from `records.logic.ts` — no new port across the `functions/`↔`src/` wall. `computeObservedCoverage`/
`routineDailyBudgetMinutes` have no server-side counterpart to duplicate — confirmed absent under
`functions/src/`.

### 1.8 Drift catalog — non-test files with net change >150L since `a78a180`

**Corrected in this round** — the first version of this table (21 entries) was checked against Codex
round 1's own `git diff --numstat a78a180 5695f2d -- src functions/src` and found to have silently
dropped 13 files that clear the same >150L threshold. Re-run in full below; this is now the complete set.

**Growth:**

| File | Net | Note |
|---|---|---|
| `src/features/books/artHelpContent.ts` | +856 (new) | FEAT-178 — single source of all help strings. |
| `src/features/books/useBookGenerateChat.ts` | +573 | Reading-level + custom-theme + word-channel wiring. |
| `functions/src/ai/storyDecodability.ts` | +529 (new) | FEAT-176 orthographic readability classifier. |
| `src/features/books/storyPracticeWords.ts` | +467 (new) | FEAT-169/172 word-channel resolver. |
| `functions/src/ai/imageTasks/generateImage.ts` | +451 | FEAT-174/189/193 style-recipe work. |
| `functions/src/ai/chat.ts` | +410 | See 1.1. |
| `functions/src/ai/tasks/generateStory.ts` | +402 | Reading-level block integration. |
| `src/features/books/imageGenerationFailure.ts` | +387 (new) | FEAT-195 retry-card classifier. |
| `src/features/today/quickLogChips.ts` | +384 (new) | FEAT-199/UX-184 family quick-log chip resolver. |
| `functions/src/shared/hoursContributions.ts` | +361 (new) | ARCH-47 slice 4. |
| `src/features/books/printBook.ts` | +264 | FEAT-177/185 image-fit + booklet imposition wiring. |
| `src/features/planner-chat/planningWeekSelection.ts` | +260 (new) | FEAT-196 This-week/Next-week selector. |
| `src/features/books/BookEditorPage.tsx` | +253 | See 1.1. |
| `src/features/planner-chat/pace.logic.ts` | +250 | UX-213 observed-coverage engine. |
| `src/features/today/lifeDay.ts` | +236 (new) | FEAT-200 Life Day. |
| `src/features/books/ArtHelpSheet.tsx` | +228 (new) | FEAT-178 — the one presentational help sheet. |
| `functions/src/ai/imageTasks/enhanceSketch.ts` | +216 | FEAT-193/197 style recipes + custom-note subject clause. |
| `src/features/weekly-review/WeekReflectionCard.tsx` | +200 (new) | UX-214 "Was that enough this week?" card. |
| `src/features/workshop/WorkshopPage.tsx` | +193 | See 1.1. |
| `functions/src/ai/evaluate.ts` | +190 | See 1.1. |
| `src/features/weekly-review/WeekPaceSection.tsx` | +184 (new) | UX-213 observed-coverage rendering, capability-gated. |
| `src/features/books/storyGenerationFailure.ts` | +179 (new) | FEAT-195 generation-failure classifier (sibling of `imageGenerationFailure.ts`). |
| `src/features/books/ImageRetryCard.tsx` | +179 (new) | FEAT-195 the one retry-card presentational component. |
| `functions/src/ai/storyLevelContext.ts` | +173 (new) | FEAT-176 reading-level block composer. |
| `src/features/planner-chat/plannerRequest.ts` | +170 (new) | FEAT-198 shared instruction-fencing/accumulate-and-cap builder. |
| `src/features/books/customStoryTheme.ts` | +170 (new) | FEAT-194 one-or-the-other custom-theme rule. |
| `src/features/today/DayStatusRow.tsx` | +165 (new) | UX-182 day-type + energy row extraction. |
| `src/features/books/SketchScanner.tsx` | +161 | FEAT-158/159 sketch-cleanup pipeline wiring. |
| `functions/src/ai/imageTasks/imageFailure.ts` | +157 (new) | FEAT-195 server-side failure-details/alternatives. |

**Shrinkage (all healthy — Story Guide retirement + ARCH-47 consolidation):**

| File | Net | Note |
|---|---|---|
| `src/features/books/useBookGenerator.ts` | −308 | Story Guide cleanup. |
| `src/features/books/StoryGuidePage.tsx` | −305 | **Deleted** — FEAT-187. |
| `src/features/books/useStoryGuide.ts` | −287 | **Deleted** — FEAT-187. |
| `functions/src/ai/tasks/monthlyHours.ts` | −272 | ARCH-47 slice 4 — now holds only the book's own fold. |
| `src/features/books/StoryGuideQuestion.tsx` | −273 | **Deleted** — FEAT-187. |
| `src/features/books/GenerationProgress.tsx` | −167 | **Deleted** — FEAT-187. |

No file crossed from under-1,500L to over-1,500L via this window's growth alone (`ArtHelpSheet.tsx`,
`planningWeekSelection.ts`, `WeekReflectionCard.tsx`, `WeekPaceSection.tsx` and the other new files above
are all small new modules, none within range of the threshold).

### 1.9 ARCH-43/46 (Lincoln/London name-literal census) — this window's diff shows removals only

`git diff a78a180..HEAD -- src functions/src` shows only **removed** literal name-comparisons (three
`-` lines dropping `childName.toLowerCase() === 'lincoln'`/`childName === 'Lincoln'` forms, one `+`
comment documenting the removal) — consistent with CLAUDE.md's FEAT-183 "behavioural name-gates are
closed" note. **No new name-gating found.** The standing "20 sites / 19 files" count from prior cycles
should have moved down given these removals; a diff-based check cannot safely produce the new absolute
number (a fresh full census, using the ARCH-46-broadened pattern, is needed — this is a repeat of the
08-30 recommendation, still not executed, and this cycle adds evidence the count is now stale in the
*optimistic* direction rather than just uncertain).

### 1.10 CLAUDE.md "Known Technical Debt" staleness — three of four line counts now meaningfully wrong

| Named in CLAUDE.md | Actual current | Staleness |
|---|---|---|
| `PlannerChatPage.tsx (3,295L)` | 3,418L | Stale by 123L |
| `chat.ts CF (2,641L)` | 3,051L | **Stale by 410L (15.5%) — worst offender** |
| `BookEditorPage.tsx (2,113L)` | 2,414L | Stale by 301L |
| `useQuestSession.ts (2,218L)` | 2,218L | Accurate |

Corrected directly this cycle (mechanical, see 5.4).

### 1.11 Multi-kid generality lens (Band 1 slice) — clean

No new name-gating in this window's diff (1.9); FEAT-183/186's enforcement tests were themselves
extended into new surfaces this window without any production regression found.

### 1.12 NEW — `ARCH-50`: production npm-audit vulnerabilities regressed on both trees this window

Root prod audit was **0 vulnerabilities** for at least two consecutive cycles (08-24, 08-30); it is now
**1 moderate** — `fflate@0.8.0–0.8.2` via `jspdf@4.2.1` (`GHSA-px8p-9vwx-vf98`, malformed-ZIP64 infinite
loop in `unzipSync`). **Corrected in this round (Codex round 1 P2):** the affected surface is narrower
than first reported. `grep -rl "from 'jspdf'"` confirms `jspdf` is imported by exactly two production
files, both book/sticker PDF export (`src/features/books/printBook.ts`, `printStickerSheet.ts`) —
**not** the compliance pack, which imports `jszip` (`functions/src/records/generateCompliancePack.ts`,
`src/features/records/records.logic.ts`), an unrelated package with no `fflate` dependency. `jspdf` is
still a genuine always-loaded production dependency, so this is a real production dependency-tree
regression, not the usual dev-only noise this ledger has tracked for months — but the reachability claim
should be stated modestly: `fflate`'s vulnerable `unzipSync` appears only in `jspdf`'s own source map,
not confirmed present in its executed runtime path for the PDF-generation calls this codebase actually
makes, so this is a dependency-tree finding from `npm audit`, not a demonstrated exploitable path through
the app's own PDF export. `npm audit fix` (no `--force`) reports a fix is available.

Functions prod audit was also **0 vulnerabilities** as of 08-30; it is now **3 moderate** — `qs`/
`body-parser`/`express`, all transitively pulled in by `firebase-functions@6.6.0` (`GHSA-4mjr-xmp4-gh2g`,
DoS via attacker-controlled `isBuffer`). `npm audit fix` (no `--force`) also reports a fix available here,
though the underlying fix is realistically an upstream `firebase-functions` bump rather than a local
override, since `express`/`qs` are `firebase-functions`'s own transitive dependencies.

**Why this is worth a ledger row and not just a HEALTH_REPORT.md line:** both prior audits (08-24, 08-30)
explicitly called out "0 vulnerabilities, second/third consecutive cycle" as a positive, tracked data
point — this is the first regression in that streak, on production dependency trees, with non-`--force`
fixes available on both sides. **Proposed action (not applied here):** run `npm audit fix` (no `--force`)
on both trees in a dedicated, isolated `PROMPT_FIX` pass, verify the full test/build suite stays green
afterward, and confirm the `jspdf`/`firebase-functions` version bumps these non-force fixes pull in don't
silently change print output or Cloud Functions runtime behavior. Low urgency (moderate severity, fixes
available, not exploitable without a to-be-parsed adversarial ZIP or crafted HTTP body reaching these
specific code paths) but should not sit un-triaged given the "propose-and-confirm" norm doesn't apply to
routine dependency patches the way it does to invariant-touching code.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — the decision doc's gap is now structural, not just two missing rows

`DOC-17` (filed 08-30: `DECISION_FUNC-01_source_of_truth.md` missing `conceptArcs`/`dadLabReports` writer
rows for FEAT-157) is **still open, unfixed** — the doc's last touch (`git log -1`) is commit `a78a180`,
the exact boundary before this window began. Confirmed by direct grep: zero hits for `conceptArcs`,
`dadLabReports`, `learnerModel`, or `curriculumPositions` anywhere in the file.

**A materially bigger gap has opened underneath it.** In the ~1-week window since 08-30, `learnerModels`
has grown into a full parallel "current academic state" system with real production writers:
`evalModelWriteback.ts` (Eval Apply projects findings onto it *alongside* the unchanged `skillSnapshots`
write), `questTargeting.ts`/`questModelSync.ts` (quest results fold back), `dailySignalTargeting.ts`
(daily struggle signals write frontier concepts), `writeReviewAction.ts` (Foundations Review confirmed
actions), plus `workbookPositionSync.ts` and `useUnifiedCapture.ts` (`grep -rl learnerModels src/` → 21
files). The FUNC-01 ruling's own words: *"`skillSnapshots/{childId}` is the single authority for current
academic state… the answer to 'what do we teach next.'"* But `FoundationsTab.tsx` now surfaces
`learnerModels`'s `synthesis.whatMattersNext` as the parent-facing answer to exactly that question — a
second store answering the question the ruling assigns solely to `skillSnapshots`. The decision doc
doesn't acknowledge `learnerModels` exists at all, let alone rule on whether it's a peer authority, a
derived cache (like `dispositionCache`), or a source that should write-through to `skillSnapshots`.

**Filed below as new `FUNC-17`** (this cycle's highest-leverage finding — see 5.2). `DOC-17` stays open
unchanged; its scope should widen to cover this on next touch rather than being closed as "just two
rows added." Secondary, lower-severity: `weeklyReviews.curriculumPositions` (UX-212, a new historical
workbook-position snapshot) is correctly non-authoritative and doesn't create an authority conflict, but
has no row in the decision doc's "execution-record stores" block either — folds into the same fix.

### 2.2 Loop integrity — traced the weekly-review restructure end to end; holds, no dead end

- `functions/src/ai/evaluate.ts`'s `generateReviewForChild` writes `curriculumPositions` on **both** the
  no-data early-return and the normal AI-review path — the snapshot is written every week the CF runs,
  not only on a "successful" review.
- `WeekPaceSection.tsx` reads `review.curriculumPositions` + history via `useWeeklyReviewHistory`,
  normalizes both, and feeds `computeObservedCoverage` — the rate genuinely reaches a rendered line,
  gated by `useActiveChild().isChildProfile` **above** the data hooks (zero-read gate for kids, verified
  in code, not just claimed).
- Three failure/pending states are kept deliberately distinct and none silently renders a false
  positive: a listener error → `REVIEW_UNAVAILABLE_LINE`; cron hasn't run yet (Saturday) →
  `POSITIONS_PENDING_LINE`; a history-load failure → `HISTORY_UNAVAILABLE_LINE`. This reflects three
  Codex-round fixes whose in-code comments were verified accurate by direct read, not just trusted.
- `weekEvidenceCountsLine` returns `null` (render nothing) on an absent summary vs. an explicit
  `NO_EVIDENCE_LINE` on a present-but-empty one — "no data yet" and "a real zero" are correctly kept
  distinct, matching UX-219's own no-empty-state claim on direct read.

**No dead end, no orphaned state found.** Flagged as a **verified-clean positive finding**, not a defect
— worth a ledger note so a future audit doesn't have to re-derive this trace from scratch.

### 2.3 Shelly's path — no-shame check: Life Day and Week Reflection both pass

`lifeDay.ts`/`LifeDayCard.tsx` (FEAT-200): no progress bar, no counts; an explicit "None" is a first-class
tap choice, not an omission; the one free-text note is optional, courtesy-only, parent-facing (not a kid
voice-first concern); relabeling in either direction is additive, never destructive.
`weekReflection.ts`/`WeekReflectionCard.tsx` (UX-214): three declared-peer tap choices ("no ordering, no
numeric value, no 'better' end"), optional capped note, never computed/scored/AI-generated;
`pastReflections` skips unanswered weeks rather than rendering them as gaps. UX-219's "no empty state
left" claim holds on direct read of `WeeklyReviewPage.tsx`. No findings.

### 2.4 Kid voice-first spot check — FUNC-15 unchanged; touched this window without being addressed

`src/features/dad-lab/KidLabView.tsx` still has 5 plain `TextField`s (now lines 328/372/416/431/473, no
`VoiceInput`/speech-recognition import). The file **was** edited this window (FEAT-183, FEAT-186 — the
name→capability re-gate) but only for that unrelated reason; the voice gap survived untouched. No new
kid-typed-input regressions found elsewhere in `today/`, `quest/`, or `dad-lab/` this window — the new
Life Day and quick-log surfaces (FEAT-199/UX-184) are chip-tap-based.

### 2.5 Multi-kid generality lens — clean, confirms FEAT-183/186 held on new surfaces

Diffed `today/`, `weekly-review/`, `planner-chat/` for new literal `'Lincoln'`/`'London'` comparisons —
every hit is a test-fixture object literal or an **enforcement** assertion (`expect(source).not.toMatch
(/isLincoln|'Lincoln'/...)`) added by FEAT-183/186, none is new production gating logic.

### 2.6 MO→TX compliance lens — no new hardcoding in this window's additions

`weekHours.ts` folds only through the state-neutral `computeHoursSummary`; it never touches the MO
core/non-core 600h split (that stays exclusively in `records.logic.ts`, already routed through
`getStateConfig('MO')`). `curriculumPositions` is workbook-position/units-generic, no state fields. This
window's additions are compliant with the existing state-abstraction seam — they simply don't exercise
it (the absence of a TX switch UI itself is pre-existing, tracked debt outside this window's scope).

---

## Step 3 — Pedagogy & Ethos (Band 3)

**Clean this cycle — no findings.** Full detail (all four checks below returned zero violations, verified
by direct code read, not by trusting doc comments):

- **Pace/pressure language:** `WEEKLY_REVIEW_ADDENDUM` (`functions/src/ai/evaluate.ts`) was **not**
  modified this window; still reads "Never pressure Lincoln about reading aloud," "both modes count as
  real school," "a growth area (not a failure)." A repo-wide grep of every changed line for
  `behind|should be at|falling behind|deadline|percent(age)|score|shame|passing` returned zero
  user-facing hits — every match is either engineering error copy or a comment documenting the
  anti-pressure design intent. `buildPaceSuggestion`'s `_requiredPerWeek`/`_plannedPerWeek` remain
  confirmed unused (grep + a test that specifically asserts they stay ignored); `PaceGaugePanel` remains
  confirmed unmounted anywhere in the app.
- **Diamonds-not-scores / no-shame:** Life Day and Week Reflection both verified clean on direct read
  (see 2.3) — no percentage, no progress bar, no ranking of the three `PlanType` values against each
  other (`dayTypeChoices.ts` carries its own dedicated no-ranking test).
- **Charter preamble reach:** all 21 `CHAT_TASKS` registry entries confirmed reachable — either via
  `TASK_CONTEXT`'s `"charter"` slice or (for `conundrum`/`weeklyFocus`/`chapterQuestions`/`bookLookup`/
  `lessonVideo`/`monthlyReview`) a direct `CHARTER_PREAMBLE` import interpolated into the task's own
  prompt. The weekly-review CF and monthly-review CF (both dispatched outside the chat registry) confirmed
  unbroken. Specifically checked the UX-219 risk (removing the weekly review's direct parent reader could
  let its now-server-only-consumed prompt drift toward pace language unnoticed) — `WEEKLY_REVIEW_ADDENDUM`
  is byte-identical to before this window; no drift.
- **PlanType peer-ranking:** `DAY_TYPE_CHOICES`, `PlanTypeLabel`, and `DayStatusRow.tsx` all confirmed
  neutral/descriptive, no comparative language; the UX-204/205/206 duplicate-activity-notice copy
  (`duplicateActivityNotice`) is informational, not shame-framed.

No ledger action needed for Band 3 this cycle.

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, holds; the new weekly-review hours claim is true, not just asserted

`grep -rn "collectHoursContributions" src functions/src --include=*.ts --include=*.tsx | grep -v test`
returns exactly one real implementation (`functions/src/shared/hoursContributions.ts:304`); every other
hit is either the typed pass-through wrapper (`records.logic.ts:169-175`) or a caller. **No re-divergence.**

The new weekly-review claim (CLAUDE.md: hours are "folded live through the canonical
`collectHoursContributions`") was verified by reading code, not trusting the comment:
`weekHours.ts` is presentational only; the actual fold is in `useWeekHours.ts` (`computeHoursSummary`
imported directly from `records.logic.ts`, which itself calls `collectHoursContributions`). Same three
Firestore ranges (`hours`/`days`/`hoursAdjustments`) the Records page fetches, same doc→record mapping.
**Confirmed true.** DATA-01 holds FIXED, now with a fifth confirmed-correct consumer
(RecordsPage/MonthlyTrend/dataReviewExport/monthlyHours/weekHours), no new divergence introduced.

### 4.2 DATA-02 — still NEEDS-DATA, now 67 days past the freeze window

Recomputed from 2026-07-01 to 2026-09-06: **67 days overdue** (was 60 at 08-30, 53 at 08-23 — a
consistent +7/week progression, confirming no silent resolution). Still unresolvable from a repo-only
audit; requires the owner to run the dedupe pass against a live Firestore export. **Now in its tenth
week** as the single longest-standing item in the ledger.

### 4.3 DATA-13 — unchanged in substance; line numbers shifted (not new occurrences)

`grep -n "Missouri" src/features/records/records.logic.ts` now returns lines **994/1021/1068/1098**
(was 1109/1136/1183/1213 at 08-30) — a net −115-line shift traced to the ARCH-47 slice-4 consolidation
commit (`4cdf7048`), which moved the counting logic out into `functions/src/shared/`. Same four plain
Missouri string literals in the same template-literal HTML builder function, confirmed not new.
`StateComplianceConfig` (`stateCompliance.ts:49-61`) still has no `reportTitle`/`stateName` field. Still
the easiest open `PROMPT_FIX` in the ledger.

### 4.4 Additive-hours invariant — re-affirmed for both new surfaces this window

**Weekly review:** confirmed no independent minute arithmetic anywhere in `src/features/weekly-review/`
(all 12 non-test files scanned) — `WeeklyReview.curriculumPositions`/`.reflection` are position/enum
fields, not minute counts; the pre-existing narrative `hoursBySubject` block in `evaluate.ts` (lines
768-820, predates this window) is unchanged and only feeds AI-prompt narrative text, never a
stored/displayed compliance figure.

**Life Day (`lifeDay.ts`):** read in full. The block sets `DayBlock.actualMinutes` on an ordinary `Other`
-type block that `blockCountedMinutes` picks up exactly like any other block — no new counting branch in
the shared module (`git log` confirms zero commits to `hoursContributions.ts` from Life Day work). The
chips set `estimatedMinutes: 0` explicitly, and `asNumber(0)` returns `0` (not `undefined`), so the `??`
fallback chain genuinely stops at zero rather than falling through to `plannedMinutes`/label-parsing —
chips contribute zero minutes exactly as claimed. `LifeDayCard.tsx` writes through the **same**
`persistDayLogImmediate` every other Today edit handler uses, not a second write lane. **No violation
found — CLAUDE.md's claims verified true by direct code reading, not merely trusted.**

### 4.5 MO→TX lens — no new hardcoding

`grep -rn "Missouri\|'MO'\|\"MO\"" src/features/weekly-review src/features/today/lifeDay.ts
LifeDayCard.tsx dayTypeChoices.ts` returns zero hits. Both new feature areas are purely
observational/UI with no state-specific rules.

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Already-fixed items confirmed live, not this cycle's finding

`ARCH-47` (all 4 slices), `FEAT-183`/`186` (name-gate closures), `FEAT-187` (Story Guide retirement),
`FEAT-196`/`UX-183` (planning-week selector + label), `UX-211`→`UX-219` (weekly-review restructure),
`FEAT-200` (Life Day) — all confirmed live and behaving as documented per Steps 1–4 above. Already
ledgered as MERGED/FIXED; no status change needed beyond the re-verification notes below.

### 5.2 New rows added this cycle

- **`FUNC-17`** (Band 2, high severity) — `learnerModels` has grown into a de facto second "current
  academic state" authority (≈6 real writers, surfaced to parents via `FoundationsTab`'s
  `whatMattersNext`) that `DECISION_FUNC-01_source_of_truth.md` does not acknowledge at all, despite that
  doc's own ruling assigning sole authority to `skillSnapshots`. This is a genuine open architecture
  question, not a mechanical doc-currency gap like `DOC-17` — recommend a dedicated decision-session
  ruling on whether `learnerModels` is a peer authority, a derived/composing read-model (like
  `dispositionCache`), or should write-through to `skillSnapshots`. See 2.1.
- **`ARCH-50`** (Band 1, moderate severity, new) — production npm-audit vulnerabilities regressed on both
  trees this window after being 0/0 for at least two consecutive cycles: root `fflate` (via `jspdf`,
  real print-path dependency) and functions `qs`/`body-parser`/`express` (via `firebase-functions`). Both
  have non-`--force` fixes available. See 1.12.

### 5.3 Re-verified existing rows (status updates, no new IDs)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| **ARCH-01** | OPEN (2,641L) | OPEN — **now 3,051L (+410L this window)**, cohesive-but-big judgment holds | see 1.1 |
| **ARCH-02** | OPEN, untouched 3 cycles running | OPEN — **file touched this window (+123L) for unrelated reasons; extraction still not done, now 4th cycle unaddressed** | see 1.2 |
| **ARCH-03** | OPEN (2,113L reported) | OPEN — **now 2,414L (+253L this window)** | see 1.1 |
| ARCH-04, 06, 14, 44 | OPEN | OPEN, unchanged (0L or negligible growth) | |
| ARCH-05, 08 | OPEN | OPEN, unchanged — bundle +64.51 kB/+24.30 kB gzip this window, ~3× prior rate | see 1.4 |
| **ARCH-43** | OPEN (20 sites/19 files, 2026-09-03 count) | OPEN — **this window's diff shows only removals, no additions; the standing count is likely now stale on the optimistic side; a fresh full census (ARCH-46's broadened pattern) is still recommended and still not executed** | see 1.9 |
| ARCH-46 | OPEN (methodology proposal) | OPEN, unchanged — still recommend a dedicated `PROMPT_FIX` run | |
| **ARCH-47** | MERGED, one named leftover (`dadLabReportArtifacts.ts`'s hand-kept trio) | MERGED, unchanged — **leftover still open (no slice 5)**; **positive: the ARCH-47 discipline held cleanly on the new weekly-review surface with no dedicated review step forcing it** | see 1.7 |
| **TEST-01** | IMPROVING | IMPROVING, unchanged — same two named gaps; **new observation: 11 new-window hook/presentational files ship untested, logic-bearing siblings did not** | see 1.5 |
| **FUNC-01** | RESOLVED-WITH-DECISION, doc stale (DOC-17) | RESOLVED-WITH-DECISION — **doc gap now structural, see new `FUNC-17`** | see 2.1 |
| **DOC-17** | OPEN (2 missing writer rows) | OPEN, unchanged — **recommend widening its scope to the `FUNC-17` finding on next touch rather than closing as "just 2 rows"** | see 2.1 |
| **FUNC-15** | OPEN | OPEN — **file touched this window (FEAT-183/186) for an unrelated re-gate; voice gap not addressed, not mistaken for progress** | see 2.4 |
| **DATA-01** | FIXED | FIXED, unchanged — **now confirmed correct on a 5th consumer** (`weekly-review/useWeekHours.ts`) | see 4.1 |
| **DATA-02** | NEEDS-DATA (60 days overdue) | NEEDS-DATA — now **67 days overdue (tenth week)** | see 4.2 |
| **DATA-13** | OPEN (lines 1109/1136/1183/1213) | OPEN — **lines shifted to 994/1021/1068/1098** (ARCH-47 slice-4 side effect, not new occurrences); same fix | see 4.3 |
| **UX-218** | FIXED (pre-merge form) | **MERGED — status cell corrected this cycle (mechanical, docs:check WARN)** | see 5.4 |

### 5.4 Mechanical doc fixes applied directly this cycle

- `docs/review/REVIEW_HOME_BASE.md`: **`UX-218`'s status cell** flipped from the pre-merge "FIXED …
  do not merge yet" form to "MERGED (PR #1785, 2026-09-06)" — its PR merged to `main` (`5695f2d`) since
  the last audit, and `npm run docs:check`'s `[ledger-status]` check correctly flagged the stale cell as
  a SOFT warning (would become HARD were it not fixed). Body text (the technical narrative) left
  untouched — status cell only, per the same convention prior cycles used for `ARCH-47`/`FEAT-192a`.
- `CLAUDE.md` Known Technical Debt section: three stale line-count parentheticals corrected —
  `chat.ts CF (2,641L)` → **(3,051L)**, `PlannerChatPage.tsx (3,295L)` → **(3,418L)**,
  `BookEditorPage.tsx (2,113L)` → **(2,414L)**. `useQuestSession.ts (2,218L)` confirmed accurate,
  unchanged. No prose/judgment changed, line counts only.
- `docs/MASTER_OUTLINE.md` stats block: TypeScript lines 281,460 → **316,138**; Commits 3,129 → **3,385**
  (repo was shallow at session start — unshallowed via `git fetch --unshallow` for an accurate count,
  same step every prior cycle that needed it has taken); Test files 421 → **534**. Firestore collections
  48 → **47** (`bookThemesCollection` helper was legitimately removed by FEAT-194's saved-theme-library
  retirement — CLAUDE.md's prose already documents this retirement in full, and its collections *table*
  never carried a dedicated `bookThemes` row, so this is a real count decrease, not a doc gap). Cloud
  Functions (29, hand-verified against every `export` block in `functions/src/index.ts`, unchanged),
  Chat task types (21, unchanged), Routes (36, unchanged).
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-09-06, added this report to the
  audit chain; ledger gets **+2 rows / −0** (`FUNC-17`, `ARCH-50`), no row reordered, deleted, or reopened.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 7,687/7,687 tests across 534
files; functions: clean lint/tsc, 1,371/1,371 tests across 61 files; build clean, bundle 4,427.50 kB/
1,325.78 kB gzip, +64.51 kB/+24.30 kB gzip since 08-30 — roughly 3× the prior week's growth rate;
`docs:check` HARD green, one SOFT `[ledger-status]` warning fixed mechanically this run; **`npm audit`
regressed on production dependencies for the first time in at least three cycles** — root 1 moderate
(`fflate` via `jspdf`), functions 3 moderate (`qs`/`body-parser`/`express` via `firebase-functions`),
both with non-`--force` fixes available — filed as new `ARCH-50`). **Top 3 findings by leverage:**
(1) new `FUNC-17` — `learnerModels` has quietly grown into a real second "current academic state"
authority with ~6 production writers and a parent-facing surface (`FoundationsTab`), while the FUNC-01
decision doc that's supposed to be the single source of truth on this exact question doesn't mention it
exists — this needs an owner ruling, not another mechanical doc-currency pass; (2) `ARCH-02`
(`PlannerChatPage.tsx`'s live-day-edit handler trio extraction) is now unaddressed for a **4th**
consecutive cycle, and this cycle demonstrated the compounding risk directly — unrelated feature work
(FEAT-196/UX-183) landed in the same file while the extraction sat untouched; (3) new `ARCH-50` —
production dependency vulnerabilities appeared on both trees after several consecutive clean cycles, with
low-risk non-`--force` fixes available, worth a small dedicated pass before it's forgotten. **Recommend
running `PROMPT_FIX.md` next against:** `ARCH-50` (two `npm audit fix` runs + full-suite re-verification,
low-risk and quick), then `DATA-13` (the 4-site Missouri-string parameterization, still the easiest open
mechanical fix in the ledger), then `ARCH-02`'s live-day-edit handler trio extraction (unchanged
recommendation, now overdue for a dedicated run rather than deferral).