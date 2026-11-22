# Architecture Audit — 2026-11

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-11-22
> **Branch:** `claude/brave-feynman-qonops` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-25.md` (window end `65ee1ab`).
> **Window covered:** `65ee1ab` → `5ee7a73` (`origin/main` when this run started, 2026-11-22) —
> **332 files, +99,503 / −2,366** (`git diff --shortstat 65ee1ab..origin/main`). The commit count
> (`git log --oneline 65ee1ab..origin/main | wc -l` → **218**) includes merge commits and is an over-count of
> the work; the tree diff is the honest size. Tests are a large share of the insertions.
> Headline: the **largest window this ledger has audited**, dominated by three lanes — **Build Studio**
> (LOCAL-BUILD-001 / LOCAL-VISION-007: saved Arcade games, Apple Dash and Lantern Cove challenges, the
> automatic hours credit), **Stonebridge** (the village as a place, the town hero, the Mine invitation) and
> **Knowledge Mine save custody** (UX-491…497). Baseline green. **`useQuestSession.ts` nearly doubled**
> (`ARCH-04`, now 4,205L), a **new 3,576L single-component file** landed (`BuildStudioEditor.tsx`), and the
> main bundle grew **+352 kB** — the largest single-window regression recorded — still with zero route-level
> splitting. Three rows filed (`ARCH-56`, `ARCH-57`, `ARCH-58`) and one documentation drift (`DOC-31`), which includes
> a §6 table split that left the ledger's newest rows rendering as raw text — repaired mechanically here.

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `5ee7a73`:

```
npm run lint                      → 0 errors, 2 warnings
npx tsc -b                        → CLEAN
npx vitest run                    → 907 files, 14,281 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 80 files, 1,820 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,740.58 kB │ gzip: 1,417.58 kB
node scripts/check-docs-alignment.mjs → HARD passed, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 10-25: root **790 → 907 files, 11,638 → 14,281 tests**; functions
**79 → 80 files, 1,808 → 1,820 tests**. Lint warnings **4 → 2**: the three `useQuestSession.ts` warnings are
gone; the `StickerLibraryTab.tsx:374` `exhaustive-deps` warning (10-25) remains; one new warning is an
**unused `eslint-disable` directive** at `src/features/shelly-chat/usePlannerAskHandoff.ts:731`. Neither is an
error; both are one-line edits for the next run touching those files, not rows.

**Bundle: 4,388.40 kB → 4,740.58 kB (+352.18 kB), gzip 1,313.17 → 1,417.58 kB (+104.41 kB).**
`grep -c "lazy(" src/app/router.tsx` → **0**; `grep -c "^import" src/app/router.tsx` → **37** (was 34).

## Step 0.5 — Lenses

- **Learning-loop integrity:** the window **closes a weak link** `PROCESS_OVERVIEW.md` names — Lincoln
  doing Knowledge Mine only ~weekly. Stonebridge now offers one model-informed Mine invitation (§2.2).
- **Multi-kid generality:** `npm run census:arch-audit -- --base=65ee1ab` → **17 name-literal sites in 15
  files**, identical to 10-25. A grep of the window's added non-test lines for
  `=== 'lincoln'|'london'`, `name.toLowerCase() ===` and `isLincoln` returns only (a) cosmetic `isLincoln`
  font/colour choices on Stonebridge surfaces, which `CLAUDE.md` permits as personality, and (b) one
  **identity** resolution, `useActiveChild.profileOwnChildId` (`src/core/hooks/useActiveChild.ts:100`),
  which matches a child profile to its document by name — the same rule `useChildren.ts:61` already applies
  (the `ARCH-15` identity coupling, not access). It is the input to the new `profileChildResolved` flag that
  Build Studio reads so a child profile with no matching document is refused rather than shown a sibling.
  Access itself is the per-child `settings/buildStudio_{childId}` opt-in, never a name. **No new
  name-gating.** Observation for the owner, not a row: there are now two copies of the profile→child name
  match, and a kid-add (or a renamed child) depends on both.
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **22** (was 19)

`census:arch-audit` prints **22** production files ≥ 1,500L of **1,045** scanned. Sizes now (10-25's figure
in brackets): `useQuestSession.ts` **4,205** [2,275] · `PlannerChatPage.tsx` 4,049 [3,942] ·
`BuildStudioEditor.tsx` **3,576** [new] · `chat.ts` 3,131 [3,129] · `BookEditorPage.tsx` 2,505 [2,433] ·
`KnowledgeMinePage.tsx` **2,227** [< 1,500] · `evaluate.ts` 2,106 · `dataReviewExport.logic.ts` 2,052 [1,966] ·
`MyAvatarPage.tsx` 1,983 [1,897] · `TodayPage.tsx` 1,945 [1,982] · `WorkshopPage.tsx` 1,928 ·
`shellyChat.ts` 1,919 · `CurriculumTab.tsx` 1,899 [1,888] · `EvaluateChatPage.tsx` **1,888** [< 1,500] ·
`TodayChecklist.tsx` 1,841 · `RecordsPage.tsx` 1,741 [1,614] · `LogWorkCard.tsx` 1,683 ·
`chatPlanner.logic.ts` 1,682 · `contextSlices.ts` 1,638 · `VoxelCharacter.tsx` 1,611 [1,606] ·
`useBook.ts` **1,585** [< 1,500] · `useShellyChatActions.ts` 1,506.

**Joined:** `BuildStudioEditor.tsx`, `KnowledgeMinePage.tsx`, `EvaluateChatPage.tsx`, `useBook.ts`.
**Left:** `DevAdminTab.tsx` (1,530 → 1,475, `FIX-270` moved chapter-question generation out).

### 1.2 `useQuestSession.ts` — 2,275 → 4,205L in one window (`ARCH-04` escalated → `ARCH-56`)

`git diff --numstat 65ee1ab..origin/main` and the census drift list: **+1,930L net**, from the Mine save
custody series (UX-491 → UX-497, nineteen commits touching the file per `git log --oneline … | wc -l`). It is
**one hook**, `useQuestSession` (line 593 to end of file), with 44 `useState/useRef/useEffect/useCallback/useMemo`
sites (`grep -cE`). Its callbacks, by line: `startQuest` **1247–1909** (~660L), `endSession` **2293–2878**
(~585L), `submitAnswer` 2879 / `handleSkip` 3190 (~510L together), the fluency trio
`recordFluencyAttempt` / `requestNewFluencyPassage` / `endFluencySession` (3389–3587), `resumeSession`
3588–3871, and a **run/source-save custody** group — `bumpViewGeneration` 720, `publishSourceSave` 814,
`retireReplacedPartial` 842, `scopeStillLive` 994, `questExitFace` 1057, `questExitVerdict` 1131,
`retireUnansweredRun` 1192, `retrySourceSave` 2069, `discardPartial` 3872. Five pure parse helpers sit above
the hook (128–335).

The pure halves of the new work already moved out with tests (`questRun.ts`, `questSourceWrites.ts`,
`questSaveCopy.ts`, `mineAdditionProbe.ts`), so what grew is the React binding of the custody state machine.
**Severity P2, band 1** — this is the file `CLAUDE.md`'s tech-debt list already named, and it is now the
largest production file in the repo. **Proposed (not built):** design-first read, then three cuts in order of
risk: (1) the parse helpers to `questParsing.ts` (pure, zero-risk); (2) the fluency trio to
`useFluencySession`; (3) the custody group to `useQuestRunCustody` beside `questRun.ts`. Cut (3) carries the
UX-494/496/497 save ordering and must be asserted by those rows' existing tests, not eyeballed — not a
`PROMPT_FIX` target until the owner wants it. Filed as **`ARCH-56`** (a new row rather than an edit to
`ARCH-04`'s, per the additive-ledger rule).

### 1.3 `build-studio/BuildStudioEditor.tsx` — born at 3,576L, one component (`ARCH-57`)

New this window (25 commits touch it). One default-exported component, `BuildStudioEditor`, spanning
**444–3,561**, with **97** hook sites (`grep -cE`), the render starting at **2,679** (~880 lines of JSX). The
author already marked the seams with section comments: *The visit* (487), *The optional challenge invitation*
(622), *Departure* (754), *The session, one per visit* (1089), *The opening deadline* (1162), *Import, then
CHECK* (1194), *Save* (1311 — `handleSave`, `handleRetrySave`, `handleSaveCaptured`, `handleDiscardPending`,
`handleDownloadCurrent`, `handleDownloadEarlier`), *Reopen* (1864), *The helper* (2045), *The challenge card's
handlers* (2066), *The reflection* (2154), *Render* (2556). The bridge and stores are already separate and
tested (`arcadeBridge.ts`, `buildStudioPendingStore.ts`, `buildStudioScope.ts`; `build-studio` is 28 source /
26 test files). **Severity P3, band 1.** It sits on the automatic hours-credit rail (the save creates the
credit job), so a split must keep save→job ordering. **Proposed (not built):** lift *Save* + *Reopen* into
`useBuildStudioSave`, *Departure* into `useBuildStudioDeparture`, and *The reflection* into
`useBuildStudioReflection`, leaving the component as session wiring + markup. Design-first; not a fix target
yet. Filed as **`ARCH-57`**.

### 1.4 Three pre-existing files crossed 1,500L, and one "fixed" file regrew (`ARCH-58`)

`git diff --numstat 65ee1ab..origin/main`: `KnowledgeMinePage.tsx` **+1,526 / −87** (one component,
187–1,643, ~1,450L — the Mine trip exit, suggestion, recovery and resume cards were added as in-file
sub-components below it); `EvaluateChatPage.tsx` **+1,023 / −376** (UX-491/492: the page was split into
`EvaluateVisit` 393 and `EvaluateDraft` 539 *within* the file — a healthy split that did not leave the file);
`useBook.ts` **+675 / −77** (reader-session, save recovery). Separately `ShellyChatPage.tsx` is **1,151L**
(`wc -l`; +300/−23 this window, `usePlannerAskHandoff`) while `CLAUDE.md`'s tech-debt list records it as
*"647L … Stable"* under `ARCH-09` FIXED. None is tangled on its face; each is a watch. **Severity P3.**
**Proposed:** `KnowledgeMinePage`'s in-file sub-components (`MineTripExit` 1644, `MineTripSuggestion` 1705,
`QuestCard` 1903, `RecoveryNotice` 2063, `ResumeCard` 2126) move to sibling files — a mechanical move the next
Mine run can take; the other three are re-read next cycle. Filed as **`ARCH-58`**.

### 1.5 Drift — files that moved > 150L

`census:arch-audit -- --base=65ee1ab` → **78** files with |net delta| > 150L, all additions. Almost all are
new modules in the three lanes (largest: `BuildStudioEditor.tsx` +3,576, `usePlannerAskHandoff.ts` +1,274,
`StonebridgeVillage.tsx` +1,108, `arcadeBridge.ts` +1,107, `buildStudioHoursCreditWrites.ts` +1,097). Of
**pre-existing** files the ones that crossed the line are named in 1.2 and 1.4, plus `FoundationsTab.tsx`
(+440), `useStonebridgeProgress.ts` (+827), `BookReaderPage.tsx` (+411), `questTargeting.ts` (+208),
`conceptOverride.ts` (+185), `questModelSync.ts` (+179), `useShellyChatFlows.ts` (+179) and
`BookshelfPage.tsx` (+211) — each traced to a named row in the window (UX-490 → 497, UX-487/488, UX-474/475).
**No silent growth in an unrelated file.** `PlannerChatPage.tsx` (`ARCH-02`) moved **+107** (+203/−96), so it
is no longer line-flat; the recommended live-day-edit seam is still unbuilt — **eighth consecutive cycle**.

### 1.6 Bundle (`ARCH-05` / `ARCH-08`) — regressed again, and now has an obvious first cut

Main chunk **4,740.58 kB** (Step 0), **+352.18 kB** in one window, `lazy(` count **0**. The only non-main
chunks are `jspdf`, `html2canvas`, `purify` and one `index.es` vendor chunk. Build Studio imports nothing
heavy (its non-test imports are React + MUI), so the growth is **this app's own code** shipped to every
first load. **New observation:** `/build-studio` is the cleanest route-level split the app has had — it is
behind `RequireBuildStudioAccess`, opens only for a child a parent has explicitly enrolled, and its whole
directory is self-contained, so a `React.lazy` boundary at `router.tsx`'s `BuildStudioPage` import cannot
regress any other surface. `/stonebridge` is the second candidate but shares `avatar/` code with the shell.
This audit **does not assert a reduction figure** — no chunk graph was produced. **Proposed action:** the
measured chunk graph recommended on 10-04 and 10-25, then lazy `/build-studio` first as a low-risk proof of
the pattern. Architectural decision for the owner.

### 1.7 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files, the same five (`auth`, `login`,
`not-found`, `planner`, `ui-preview`); `auth` and `planner` are tracked as `TEST-07`. `workshop` is still
**45 source / 8 test** and `monthly-review` **15 / 7** — unchanged for a third cycle. The new lanes shipped
with tests (`build-studio` 28/26, `quest` 28/31). The 10-04 recommendations (a `workshop` reducer/guard test,
a `monthly-review` publish/photo-selection test) remain the highest-value additions.

### 1.8 `ARCH-06` / `ARCH-43` / `ARCH-07`

`census`: ActivityConfig refs **324 (81 files)** [309 / 78], WorkbookConfig refs **38 (12 files)** —
unchanged; migration completion still not a drive-by. Name-literal sites **17 (15 files)**, unchanged;
`ARCH-43` stays OPEN. `grep -rn "TODO.*ARCH-07" src functions/src` → nothing.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`) — no new authority

The direct writer sets of the three invariant collections did not change by file: comparing
`git grep -l` at `65ee1ab` against the tree for `learnerModelsCollection|'learnerModels'`,
`skillSnapshotsCollection|'skillSnapshots'` and `xpLedgerCollection|'xpLedger'` (non-test) gives **no added or
removed file** for any of the three. The Mine custody work changed *how* `questModelSync.ts` applies evidence
(once, from the saved session — UX-494) but not who writes. Build Studio writes no learner state
(`buildStudioVersionWrites.ts` boundary test, per `CLAUDE.md`). `DOC-29` part (1) is **still open**:
`grep -n programCompletionWrites docs/review/DECISION_FUNC-01_source_of_truth.md` returns nothing (part (2),
the task count, was closed by `DOC-28`). `skillSnapshots` stays the authority for "what to teach next".

### 2.2 Loop integrity — learner model → Stonebridge → Mine → learner model

Traced: `avatar/stonebridge/mineInvitation.ts` is a pure decision over the child's learner model — an
unresolved `routedTo:'quest'` ask first, through the **same** `selectQuestTargets` the Mine uses
(`mineInvitation.ts:41`), then a fresh `synthesis.whatMattersNext` move only when `synthesisStaleAt` is falsy —
returning one calibrated Mine mode or nothing. The child's tap opens the Mine in that mode; finalization applies
evidence once from the saved quest (UX-494) through `questModelSync.ts` (`learnerModelsCollection`, line 122).
**The loop closes**, and it closes from a surface the boys open for its own sake — the first structural answer
to the "Mine only ~weekly" weak link. Not verified here: actual uptake (a live-data question). No dead end
found; a failed or uncalibrated read lands on *no invitation*, never a wrong one.

### 2.3 Shelly's path / no-shame

The Build Studio hours credit is automatic by owner decision (`CLAUDE.md`, 2026-11-20) and the parent's only
controls are lower/remove on the Records card (`BuildStudioHoursCard.tsx`), which renders per-row minutes and
no total. Mine save-protection copy (`questSaveCopy.ts`) offers Retry / keep rather than loss. A scan of added
non-test lines for pace language is clean (3.1). No finding.

### 2.4 Kid voice-first

Build Studio's reflection is spoken (*Save my words*) and the helper "talks, and that is all it can do"
(`BuildStudioEditor.tsx:2045`); the editor itself is MakeCode blocks, which is the point of the surface.
Stonebridge thank-you replays now speak (UX-476). Not re-walked on a device.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines of `src/` and `functions/src/` for
  `behind|catch up|falling behind|deadline|on track|quota|streak|you should|overdue`. Every hit is
  non-pedagogical — *behind* as layout/code prose (SVG layering, "nothing behind it"), *quota* in a comment
  stating the capstone carries none, and `streakDays` at `useQuestSession.ts:3964`, an existing field carried
  into the resumable payload (`currentStreak` was already in the file at `65ee1ab`). **Clean.**
- **Diamonds-not-scores:** a saved Build Studio version awards nothing and updates no learner state
  (`CLAUDE.md` › `buildStudioVersions`); no new scoring surface was found.
- **Charter reach:** `CHAT_TASKS` registry size **22** (`census:arch-audit`), unchanged. `functions/src`
  changed in 7 files (+359/−40), the prompt-bearing ones being `tasks/bookLookup.ts` and
  `tasks/chapterQuestions.ts` (`FIX-270`: effort and truncation handling), which keep their context slices.
  The known `analyzePatterns` gap is unchanged and tracked under `DOC-04`.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src` (non-test) → the same **5** call sites plus one comment
(`RecordsPage.tsx:595`, `dataReviewExport.logic.ts:1549`, `useWeekHours.ts:40`, `weekBySubject.ts:418`,
`weekRibbon.logic.ts:320`; comment `MonthlyTrend.tsx:27`). `git diff --stat 65ee1ab..origin/main --
functions/src/shared/hoursContributions.ts src/features/records/records.logic.ts` is **empty**. The
authoritative core-hours figure is **not recomputed** — it is a fold over live Firestore this environment
cannot read; the last recorded figure (598.73 h core, `ARCHITECTURE_AUDIT_2026-05.md`) stands, and the owner's
live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-11-22 − 2026-07-01 = 144` days past the freeze window (was 116 on 10-25). Requires a live export.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**,
byte-identical to 10-25.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files as 10-25; the window's added
non-test lines contain none of those tokens. Nothing deepens the MO assumption.

### 4.5 Additive-hours invariant — one new `hours` writer, owner-authorised and registered

`src/core/firebase/buildStudioHoursCreditWrites.ts` writes one attributed `hours` row per eligible new save
(line 272, a deterministic id from child/project/version) inside a transaction with an immutable receipt
(`buildStudioCreditReceipts`) and a per-child/day admission bucket (`buildStudioCreditDays`). It is the
**owner's one named exception** to confirm-before-write (`CLAUDE.md`, 2026-11-20, extended to Lantern Cove by
FEAT-247 slice 4), it is registered in `TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md` (line 227), and it folds
nothing itself — the row counts only through the unchanged `collectHoursContributions`. The new Records reader
(`BuildStudioHoursCard.tsx`) renders per-row minutes and computes no total. **Invariant holds.**

### 4.6 `firestore.rules` / indexes

`git diff --stat 65ee1ab..origin/main -- firestore.rules storage.rules firestore.indexes.json` is **empty**.
The new collections live under the existing family owner rule. No action.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-56` (§1.2), `ARCH-57` (§1.3), `ARCH-58` (§1.4), `DOC-31` (below).

**`DOC-31` — documentation drift from the Build Studio window.** (1) The ledger rows `FEAT-246`, `FEAT-247`
and `FEAT-248` still read **LOCAL CANDIDATE … not pushed, no PR**, while their branches merged as PR #1984
(`feat/build-studio-hours-credit`) and PR #1989 (`feat/build-studio-lantern-cove`) — `git log --merges
65ee1ab..origin/main`. Those rows belong to the build run that wrote them, so this audit does not rewrite
them; the owner (or a doc run) flips them. `[ledger-status]` passes because *LOCAL CANDIDATE* matches neither
open-PR pattern, which is itself worth knowing: a stale cell of this shape is invisible to the guard.
(2) `CLAUDE.md`'s Firestore Collections table has no rows for `buildStudioCreditReceipts`,
`buildStudioCreditDays` or `buildStudioCreditJobs` (`src/core/firebase/firestore.ts:1010 / 1019 / 1031`); the
jobs collection is named only in prose. The generated collection count (56) is correct because it is derived
from `firestore.ts`, not from the table. (3) `CLAUDE.md`'s tech-debt line for `ShellyChatPage.tsx` says
*"Stable."* beside a file that grew +277L this window (§1.4). (4) **The ledger table itself was split.**
From `7f59722` (2026-11-05) rows were appended *below* the `†` footnote that closes §6, so `UX-478` through
`UX-497` formed a second table with no header row, which GFM renders as raw text — on the phone the owner
reads the ledger on. `[ledger-shape]` passed throughout because `parseLedgerRowShape` stops scanning at the
footnote (`scripts/check-docs-alignment.mjs:151`), so the rows after it were never examined: the exact
"guard that passes on malformed input" shape `CLAUDE.md` warns about. **Fixed mechanically here** by moving
the footnote line below the last row — no row is edited, reordered or removed, and the check now reports
`all 688 rows have 5 cells` where it reported 665 before this run's edits. **Still proposed:** make the check
fail when a pipe-led row follows the footnote.

**Status re-verifications (no row rewritten):** `ARCH-02` OPEN (eighth cycle, +107L); `ARCH-04` OPEN, see
`ARCH-56`; `ARCH-05`/`ARCH-08` OPEN — main chunk **+352 kB**, 0 `lazy(`; `ARCH-44` OPEN (2,052L, +86);
`ARCH-55` OPEN (1,683L, unchanged); `ARCH-43` OPEN (17 sites); `DOC-29` OPEN (part 1); `DATA-01` FIXED;
`DATA-02` NEEDS-DATA; `DATA-13` OPEN; `TEST-01` OPEN (workshop 45/8, monthly-review 15/7).

**Mechanical fixes applied:** the `†` footnote move that rejoins §6 into one table (`DOC-31` part 4), the ledger header's `Last audit` bump, the `DOCUMENT_INDEX.md` entry (the
10-25 report moves to HISTORICAL), and the line-count / bundle **numbers** in `CLAUDE.md` › Known Technical
Debt, each replaced by the `census:arch-audit` / `wc -l` / `npm run build` figure above. No prose there was
changed.

**Recommended `PROMPT_FIX` order:**
1. `ARCH-05`/`ARCH-08` — the measured chunk graph, then `React.lazy` on `/build-studio` as the first,
   lowest-risk split (§1.6). The bundle has grown +509 kB across the last two windows.
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `DOC-31` + `DOC-29` — one docs run: flip the three stale Build Studio rows (owner's call), add the three
   credit collections to `CLAUDE.md`, add `programCompletionWrites.ts` to the FUNC-01 authority table, and
   make `[ledger-shape]` fail on a row below the `†` footnote.
`ARCH-56` cut (1) — the pure parse helpers out of `useQuestSession.ts` — is the one zero-risk decomposition
step available; cuts (2)–(3), `ARCH-57` and `ARCH-58` are design-first reads.

*Every number above is printed by `npm run census:arch-audit -- --base=65ee1ab`, `npm run build`, the named
`git diff --numstat` / `grep` / `wc -l`, or the test runners' own summaries; the window's size is
`git diff --shortstat`. The "218 commits" figure is `git log --oneline | wc -l` and is flagged above as an
over-count. Line ranges for callbacks are read from `grep -n` of their declarations, so "~660L" etc. are the
distance between consecutive declarations, not a count of the callback's own body.*
