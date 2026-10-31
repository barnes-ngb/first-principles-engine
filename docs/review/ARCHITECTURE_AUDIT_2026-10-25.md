# Architecture Audit — 2026-10-25

> **Renumbered (DOC-30):** filed in PR #1914 as `ARCH-52` and `DOC-28`; landed by DOC-30 as `ARCH-55` and `DOC-29` because three audits claimed the same ids.
>
> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-10-25
> **Branch:** `claude/brave-feynman-9f1nhp` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-04.md` (window end `12ad312`).
> **Window covered:** `12ad312` → `65ee1ab` (`origin/main` when this run started, 2026-10-23) —
> **225 files, +50,377 / −2,005** (`git diff --shortstat 12ad312..origin/main`). The commit count
> (`git log --oneline 12ad312..origin/main | wc -l` → **167**) over-counts: it includes merge commits that
> re-introduce September lineage, so the tree diff is the honest size of the window.
> Headline: a **feature-heavy window** — FEAT-241/242 (native-progress capture + whole-program completion),
> FIX-266/267 (the unified *Log work* card), the before-work page check (`pageCheck`), saved-sticker editing
> and Arcade game art, and `firestore.rules` under an emulator test suite (FIX-265). Baseline green. The
> main bundle **grew +157 kB** with **zero** route-level splitting. One new tangled file is filed
> (`ARCH-55`) and one documentation drift (`DOC-29`).

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `65ee1ab`:

```
npm run lint                      → 0 errors, 4 warnings (3 useQuestSession.ts + 1 new, StickerLibraryTab.tsx:374)
npx tsc -b                        → CLEAN
npx vitest run                    → 790 files, 11,638 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 79 files, 1,808 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,388.40 kB │ gzip: 1,313.17 kB
node scripts/check-docs-alignment.mjs → HARD passed, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 10-04: root **725 → 790 files, 10,391 → 11,638 tests**; functions
**69 → 79 files, 1,538 → 1,808 tests**. The one lint delta is a new `react-hooks/exhaustive-deps` *warning*
at `StickerLibraryTab.tsx:374` (the `stickers` conditional re-creating a `useCallback`'s dependency) from the
saved-sticker work (`c552399`); it is not an error and is filed here rather than as a row — a one-line
`useMemo` the next run touching that file can take.

**Bundle: 4,231.15 kB → 4,388.40 kB (+157.25 kB), gzip 1,265.18 → 1,313.17 kB (+47.99 kB).** The `jspdf`
saving of the previous window is more than spent. `grep -c "React.lazy\|lazy(" src/app/router.tsx` → **0**.

## Step 0.5 — Lenses

- **Learning-loop integrity:** see 2.2.
- **Multi-kid generality:** `npm run census:arch-audit -- --base=12ad312` → **17 name-literal sites in 15
  files**, identical to 10-04. A grep of the window's added non-test lines for
  `=== 'lincoln'|'london'`, `name.toLowerCase() ===` and `isLincoln` returns **nothing**: no new name-gating.
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **19** (was 18)

`census:arch-audit` prints 19 production files ≥ 1,500L of 956 scanned. The set is last cycle's 18 plus
**`today/LogWorkCard.tsx` (1,683L), new this window**. Sizes now (previous audit's figure in brackets):
`PlannerChatPage.tsx` 3,942 [3,942] · `chat.ts` 3,129 [3,108] · `BookEditorPage.tsx` 2,433 [2,433] ·
`useQuestSession.ts` 2,275 [2,275] · `evaluate.ts` 2,106 [2,106] · `TodayPage.tsx` 1,982 [1,952] ·
`dataReviewExport.logic.ts` 1,966 [1,776] · `WorkshopPage.tsx` 1,928 · `shellyChat.ts` 1,919 ·
`MyAvatarPage.tsx` 1,897 · `CurriculumTab.tsx` 1,888 [1,857] · `TodayChecklist.tsx` 1,841 ·
`LogWorkCard.tsx` 1,683 [new] · `chatPlanner.logic.ts` 1,682 · `contextSlices.ts` 1,638 · `RecordsPage.tsx` 1,614 ·
`VoxelCharacter.tsx` 1,606 · `DevAdminTab.tsx` 1,530 · `useShellyChatActions.ts` 1,506.

Standing judgments (`ARCH-01`…`04`, `ARCH-44`, `ARCH-50`, `ARCH-51`) carry forward unchanged;
the census proves size, not cohesion, and those cohesion calls were not re-read this window.
**`ARCH-02` is unaddressed for a seventh consecutive cycle**, still line-flat. `dataReviewExport.logic.ts`
(`ARCH-44`) grew **+190L** in one window (FEAT-242 completion export) — the row's design-first read is now
more overdue, not less.

### 1.2 `today/LogWorkCard.tsx` — new at 1,683L, one component, tangled (`ARCH-55`)

Introduced in `f3c2e54` (FIX-267); three commits in the window touch it, that one included (`git log --oneline -- src/features/today/LogWorkCard.tsx | wc -l`). Evidence
(`grep -nE "^(export )?(default )?(function|const) [A-Z]"`): **one** component, `LogWorkCard`, starting at
line 241, whose body runs to the end of the file; 77 `useState/useRef/useEffect/useCallback/useMemo` sites
(`grep -cE`); the render begins at line 1095, so ~850 lines are state machine and ~590 are markup.
The state machine falls into two clean groups by name: **draft/media epochs** (`bumpMediaGeneration`,
`markDraftEdited`, `markFieldEdited`, `currentEpochs`, `verdictFor`, `dropAllMedia`, `stagePhotos`,
`stageAudio`, `requestMediaKind`, `confirmMediaSwitch` …) and **save/retry/retire**
(`freezeSubmission`, `retireSubmission`, `settle`, `handleSaveWork`, `handleRetry`, `handleStopPending`).
The pure halves already live in `logWorkDraft.ts` (374L) and `logWorkSave.ts` (528L) with three component
test files — so the *logic* is extracted and tested; what is left in the component is the React binding.
**Severity P3, band 1.** **Proposed action:** design-first read, then lift the two groups into
`useLogWorkDraft` and `useLogWorkSave` hooks next to the pure modules, leaving the card as markup. Not for
`PROMPT_FIX` until the owner wants it: this surface writes an `hours` row (see 4.5) and its 77-hook
ordering carries the save/retire sequencing the component's three test files pin — a decomposition must be
asserted by them, not eyeballed. Filed as `ARCH-55`.

**Watch (no row):** new core modules approaching the threshold —
`core/firebase/programCompletionWrites.ts` **1,365L**, `progress/program-completion/ProgramCompletionPanel.tsx`
**1,229L** (both `wc -l`), `NativeProgressSection.tsx` 990L. All three landed whole this window
(`census` drift list: +1,365 / +1,229 / +990). A single-concern transactional writer is cohesive-by-nature;
the Panel is the one to re-read next cycle.

### 1.3 Drift — files that moved > 150L

`census:arch-audit -- --base=12ad312` → **35** files with |net delta| > 150L, 34 of them additions.
Almost all are the new feature modules named above (largest: `LogWorkCard.tsx` +1,683,
`programCompletionWrites.ts` +1,365, `ProgramCompletionPanel.tsx` +1,229, `NativeProgressSection.tsx` +990,
`completionCoverage.ts` +809, `ArcadeArtDialog.tsx` +762). Of **pre-existing** files only
`dataReviewExport.logic.ts` (+190) and `UnifiedCaptureCard.tsx` (**−156**, the parent half moved to
`LogWorkCard`) crossed the line. No silent growth in an unrelated file.

### 1.4 Bundle (`ARCH-05`/`ARCH-08`) — regressed, split still unbuilt

Main chunk **4,388.40 kB** (Step 0), +157.25 kB in one window with `lazy(` count **0** and 34 `import`
lines in `router.tsx`, so every new route and the whole Native-progress / completion / Arcade-art surface
ships in the initial chunk. The 10-04 finding stands: Three.js is reached from the app shell via
`AvatarThumbnail`, so a naive route split of `/avatar` removes nothing. **The new, cheaper observation:** the
window's growth is almost entirely *non-Three* feature code on routes that are parent-only and rarely
opened (`/progress` Curriculum tab, Books sticker dialogs), which **can** be route-/dialog-level lazy without
touching the Three.js question. This audit does not assert a reduction figure — none was measured (no chunk
graph was produced). **Proposed action:** the measured chunk graph already recommended on 10-04 is now
also the way to size this; do it before any ranking. Architectural decision for the owner.

### 1.5 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files, the same five (`auth`, `login`,
`not-found`, `planner`, `ui-preview`); `auth` and `planner` are tracked as `TEST-07`. `workshop` is still
**45 source / 8 test** files and `monthly-review` **15 / 7** — neither moved. New logic modules this window
shipped with tests (`LogWorkCard` has three component test files plus `logWorkDraft`/`logWorkSave`/`logWorkJump`
tests; `src/test/rules/` is a new emulator suite). The 10-04 recommendations (a `workshop` reducer/guard test,
a `monthly-review` publish/photo-selection test) remain the highest-value additions.

### 1.6 `ARCH-06` / `ARCH-43` / `ARCH-07`

`census`: ActivityConfig refs **309 (78 files)**, WorkbookConfig refs **38 (12 files)** — identical to 10-04;
migration completion still not a drive-by. Name-literal sites **17 (15 files)**, unchanged; `ARCH-43` stays
OPEN. `grep -rn "TODO.*ARCH-07" src functions/src` → nothing; no newly removable ladder TODO.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`) — one new direct `learnerModels` writer, not in the authority table

`DECISION_FUNC-01_source_of_truth.md` line 54 lists the **direct** `learnerModels` writers
(`evalModelWriteback.ts`, `questModelSync.ts`, `writeReviewAction.ts`, `workbookPositionSync.ts`,
`bootstrapLearnerModel.ts`, `stuckRetestQueue.ts`, `learnerSynthesis.ts`). FEAT-242 added an eighth:
`src/core/firebase/programCompletionWrites.ts` merge-sets the model inside a `runTransaction`
(`tx.set(input.modelRef, …, { merge: true })`, line 625) and routes status through `promotedModelStatus`
(line 623), so it honours the UX-322 rule. The write is correctly scoped by design — *covered, never
mastered*, no quests queued, no `skillSnapshots`/`activityConfigs`/hours/XP — and `nativeProgressWrites.ts`
explicitly writes no `learnerModels` from an ordinary report. The gap is **documentation**, the same class
`DOC-26` closed on 09-20: the authority table and the "second, independent answer to what Lincoln knows"
paragraph do not name it. Filed as `DOC-29` (proposal; the decision doc is not edited by this run).
No second authority is created: `skillSnapshots` stays the authority for "what to teach next".

### 2.2 Loop integrity — Fast Phonics completion → model → readers

Traced: parent confirms completion on Progress › Curriculum → `programCompletionWrites` writes an
immutable `programCompletionEvents` act and the mutable `programCompletionState` projection and merges
coverage refs (`programCompletionCoverage`, constant at `completionCoverage.ts:93`) into `learnerModels` in
one transaction → consumers of that ref in app code are `foundationsView.ts` (the Foundations tab) and
`workingLevelProjection.ts`. **Not traced this cycle:** whether the planner focus line / Shelly chat /
weekly review (the model's three readers per the authority table) surface a *covered* concept differently
from an unseen one — the ref is read by two files only, so the answer is likely "through `conceptStates`
generically", but that was not verified here and is stated as unverified rather than assumed. No dead end
or silent drop was found on the capture→save leg: the *Log work* lane (FIX-267) generates document ids
before the first write and merges at those ids, so a retry cannot duplicate (`logWorkSave.ts`, `newLogWorkIds`).

### 2.3 Shelly's path / no-shame

The before-work page check is prospective and writes **no** learning or progress record
(`tasks/pageCheck.ts` header); a refusal fails closed with *"unavailable"* rather than running the
retrospective scan. Native-progress and completion copy are by design "covered, never mastered".
No shame language found (3.1). No finding.

### 2.4 Kid voice-first

`UnifiedCaptureCard.tsx` shrank by 156L as the parent form moved to `LogWorkCard`; the kid card's lane is
unchanged (`TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md` row for it says so). Not re-walked on a device.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines of `src/` and `functions/src/` for
  `behind|catch up|falling|deadline|on track|quota|target|streak|you should|overdue`. Every hit is
  non-pedagogical: *left behind* / *behind it* as code-position prose, `deadline` in the Dad Lab upload
  timeout (FIX-269), and `targets` as the completion-coverage data field. **Clean.**
- **Diamonds-not-scores:** no new scoring surface; completion is "covered", not graded.
- **Charter reach:** `CHAT_TASKS` registry size is now **22** (`census:arch-audit`; was 21) — the new task is
  `pageCheck`. It composes its context from `buildContextForTask("scan", …)` (header of `tasks/pageCheck.ts`),
  and `TASK_CONTEXT.scan` begins with `"charter"` (`contextSlices.ts:103`), so the preamble reaches it by
  reuse. `CLAUDE.md:642` still says "21 task types" — part of `DOC-29`. The known `analyzePatterns` gap
  (`TASK_CONTEXT.analyzePatterns = ["childProfile"]`) is unchanged and tracked under `DOC-04`.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src` (non-test) → **5** real call sites, the same five as
10-04 (`RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1461` — moved from :1273 by the file's growth,
`useWeekHours.ts:40`, `weekBySubject.ts:418`, `weekRibbon.logic.ts:320`) plus one comment line
(`MonthlyTrend.tsx:27`). `git diff 12ad312 origin/main --stat -- functions/src/shared/hoursContributions.ts
src/features/records/records.logic.ts` is **empty**: neither the counting rule nor the fold moved.
**The authoritative core-hours figure is not recomputed** — it is a fold over live Firestore documents this
environment cannot read; the last recorded figure (598.73 h core, 1.27 h under the MO 600 line,
`ARCHITECTURE_AUDIT_2026-05.md`) is unchanged here, the MO 2026-06-30 deadline is past, and the owner's
live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-10-25 − 2026-07-01 = 116` days past the freeze window (was 95 on 10-04). Requires a live Firestore
export and the owner.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**,
byte-identical to 10-04; `records.logic.ts` is untouched in the window.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files as 10-04. No new
hardcoding; nothing in the window deepens the MO assumption.

### 4.5 Additive-hours invariant — one new `hours` writer, correctly shaped

`git diff … | grep` for added `hoursCollection(` uses in non-test code finds exactly the new
`logWorkSave.ts` lane: one `hours` row per submission, `setDoc(…, { merge: true })` at a client-generated id,
minutes as submitted, positive only, **the existing row shape** (`source: 'unified-capture'`,
`quickCapture: true`) with `buildLogWorkHoursRow` exported so a test pins it against the pre-FIX-267 row.
It is already registered in `TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md` (line 260) and the kid card's
parallel lane (line 262). It folds through the unchanged `collectHoursContributions`. **Invariant holds.**
Observation for the owner, not a finding: two writers now emit `hours` rows with the same
`source: 'unified-capture'` tag (kid card, parent form), so that tag no longer identifies a surface.

### 4.6 `firestore.rules`

`firestore.rules` changed (+143 / −6 lines) under `FIX-265`, with a new `src/test/rules/` emulator suite and its
own CI job — the invariant-touching change went through the propose-and-confirm path the ledger records.
No action.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-55` (§1.2), `DOC-29` (§2.1, §3). **Status re-verifications (no row rewritten):**
`ARCH-02` OPEN (seventh cycle, line-flat); `ARCH-05`/`ARCH-08` OPEN — main chunk **+157 kB**, 0 `lazy(`;
`ARCH-44` OPEN, file **+190L**; `ARCH-43` OPEN (17 sites); `DATA-01` FIXED; `DATA-02` NEEDS-DATA;
`DATA-13` OPEN; `TEST-01` OPEN (workshop 45/8, monthly-review 15/7). **Mechanical fixes applied:** the
header `Last audit` bump and the `DOCUMENT_INDEX.md` entry only.

**Recommended `PROMPT_FIX` order:**
1. `ARCH-05`/`ARCH-08` — measured chunk graph first (§1.4); the bundle is now larger than at any prior audit
   and the growth is lazy-able parent-only code.
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `DOC-29` — add the eighth `learnerModels` writer to the authority table and correct the task count.
`ARCH-55` and `ARCH-51` are design-first reads, not fix targets yet.

*Every number above is printed by `npm run census:arch-audit -- --base=12ad312`, `npm run build`, the
named `grep`/`wc -l`, or the test runners' own summaries; the window's size is `git diff --shortstat`.
The "167 commits" figure is `git log --oneline | wc -l` and is flagged above as an over-count.*
