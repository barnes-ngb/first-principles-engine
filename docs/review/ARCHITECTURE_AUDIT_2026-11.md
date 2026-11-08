# Architecture Audit — 2026-11

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-11-08
> **Branch:** `claude/brave-feynman-rte8gu` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-25.md` (window end `65ee1ab`).
> **Window covered:** `65ee1ab` → `8bf1f38` (`origin/main` when this run started, 2026-11-08) —
> **167 files, +40,461 / −1,045** (`git diff --shortstat 65ee1ab..origin/main`); of which `src/` +
> `functions/src/` is 157 files, +39,457 / −1,032. The commit count
> (`git log --oneline 65ee1ab..origin/main | wc -l` → **89**) includes merge commits, so the tree diff is the
> honest size.
> Headline: a **Stonebridge-dominated window** — the `src/features/avatar/stonebridge/` tree alone is 59 files,
> +20,803 / −526 (`git diff --shortstat 65ee1ab..origin/main -- src/features/avatar/stonebridge`), roughly half
> the window. The rest: the planner-refusal → Ask AI handoff (`UX-273`), the Library shelf-read recovery
> (`useBook.ts`), read-aloud curriculum rows (`FEAT-243`) and batched chapter questions (`FIX-270`). Baseline
> green. The main bundle **grew +122 kB** with **zero** route-level splitting, and a **20th** file crossed 1,500L
> (`useBook.ts`), filed as `ARCH-56`.

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` (root and `functions/`) of the tree at `8bf1f38`:

```
npm run lint                      → 0 errors, 5 warnings
npx tsc -b                        → CLEAN
npx vitest run                    → 846 files, 12,642 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 80 files, 1,820 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,510.54 kB │ gzip: 1,350.90 kB
node scripts/check-docs-alignment.mjs → HARD passed, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 10-25: root **790 → 846 files, 11,638 → 12,642 tests**; functions
**79 → 80 files, 1,808 → 1,820 tests**. Lint warnings **4 → 5**: the new one is an *unused*
`eslint-disable` directive at `usePlannerAskHandoff.ts:731` (`react-hooks/set-state-in-effect` reports no
problem there, so the directive can simply be deleted — `lint --fix` would do it); the other four are the
`useQuestSession.ts` / `EvaluateChatPage.tsx` / `StickerLibraryTab.tsx:374` warnings carried from before
(the lint log lists exactly those four files plus the new one). Warnings only — filed here, not as a row.

**Bundle: 4,388.40 kB → 4,510.54 kB (+122.14 kB), gzip 1,313.17 → 1,350.90 kB (+37.73 kB).**
`grep -c "lazy(" src/app/router.tsx` → **0**; `grep -c "^import" src/app/router.tsx` → **35**.

## Step 0.5 — Lenses

- **Learning-loop integrity:** see 2.2.
- **Multi-kid generality:** `npm run census:arch-audit -- --base=65ee1ab` → **17 name-literal sites in 15
  files**, identical to 10-25 and the same file list. A scan of the window's added non-test lines for
  `=== 'lincoln'|'london'`, `name.toLowerCase() ===` found none; the only `isLincoln` additions are the new
  Stonebridge components threading the existing **cosmetic** flag (fonts, colours, radii, e.g. the
  `titleFont` / `bgcolor` ternaries) — personality, which `CLAUDE.md` keeps explicitly distinct from access.
  Not a regression; noted so the next audit does not rediscover it.
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **19** (was 19; one left, one joined)

`census:arch-audit` prints **19** production files ≥ 1,500L of **999** scanned. Sizes now (previous audit
figure in brackets): `PlannerChatPage.tsx` 4,049 [3,942] · `chat.ts` 3,131 [3,129] · `BookEditorPage.tsx`
2,505 [2,433] · `useQuestSession.ts` 2,275 [2,275] · `evaluate.ts` 2,106 [2,106] · `MyAvatarPage.tsx`
1,983 [1,897] · `dataReviewExport.logic.ts` 1,966 [1,966] · `TodayPage.tsx` 1,945 [1,982] ·
`WorkshopPage.tsx` 1,928 · `shellyChat.ts` 1,919 · `CurriculumTab.tsx` 1,899 [1,888] ·
`TodayChecklist.tsx` 1,841 · `LogWorkCard.tsx` 1,683 · `chatPlanner.logic.ts` 1,682 · `contextSlices.ts`
1,638 · `RecordsPage.tsx` 1,614 · `VoxelCharacter.tsx` 1,611 [1,606] · **`useBook.ts` 1,528 [new]** ·
`useShellyChatActions.ts` 1,506. `DevAdminTab.tsx` (1,530 last cycle) fell below the line.

Standing judgments carry forward unchanged; the census proves size, not cohesion, and the cohesion calls on
`ARCH-01`…`04`, `ARCH-44`, `ARCH-50`, `ARCH-51`, `ARCH-55` were not re-read this window.
**`ARCH-02` is unaddressed for an eighth consecutive cycle and *grew* by 107L** (3,942 → 4,049) — the first
growth since the seam was named; `git log --oneline 65ee1ab..origin/main -- src/features/planner-chat/PlannerChatPage.tsx | wc -l` → 4 commits (`6c0cfd9` handoff binding, `f36526d` staged Ask AI drafts, `6bc5a88` `FEAT-243` read-aloud Apply, `50fd445` `FIX-270` chapter-question batches).
`BookEditorPage.tsx` (`ARCH-03`) +72L, `MyAvatarPage.tsx` +86L.

### 1.2 `books/useBook.ts` — 987L → 1,528L, two hooks and a read state machine in one file (`ARCH-56`)

Evidence: `wc -l` 987 at `65ee1ab` → 1,528 at `8bf1f38` (+541L, in 6 commits —
`git log --oneline 65ee1ab..origin/main -- src/features/books/useBook.ts | wc -l`). The file now holds, per
`grep -nE "^(export )?(function|const) "`: the shelf-read vocabulary and reducers (`shelfQueryScope` :162,
`ownerKeyFor` :223, `nextOwner` :237, `openingState` :250), the per-book editor hook `useBook`
(:391 → :1200, ~810L), the shelf hook `useBookshelf` (:1201 → :1470, ~270L), and two tiny draft/completed
lookups (`useDraftBook` :1471, `useCompletedBook` :1501). 66 `useState/useRef/useEffect/useCallback/useMemo`
sites (`grep -cE`).
The window's growth is the **Library shelf recovery** (`feeae2f`, `d8ae020`, `0c11fcc`, `b61590c`, `0cf3717`):
the shelf-read owner/phase/question machinery plus `useBookshelf`. That machinery shares **nothing** with the
editor hook `useBook` but the file. **Severity P3, band 1.** **Proposed action:** a mechanical, low-risk cut —
move the shelf-read state machine and `useBookshelf` (+ the two lookups) to `useBookshelf.ts` beside the
existing `useBook.unmountOrder.test.ts`, leaving `useBook` as the editor hook. **Not** a drive-by: `CLAUDE.md`
records a load-bearing **unmount-cleanup order** inside `useBook` (the `hours` merge must be declared below
`useDebounce(persist, 500)`), and that test must keep passing untouched. Shelf-recovery tests (several recent
`fix:` commits) assert the shelf half. Filed as `ARCH-56`.

**Watch (no row):** `usePlannerAskHandoff.ts` **1,274L** (new this window, `wc -l`) and
`plannerAskHandoff.ts` 605L; `composerCustody.ts` 523L. The 1,274L hook is the nearest new file to the line:
its own header (`plannerAskHandoff.ts`) describes a one-slot, in-memory, no-write transfer, but **9** commits
in the window (`git log --oneline 65ee1ab..origin/main | grep -ciE "handoff|composer"` → 9) went into binding it to source, visit and profile lifetimes — a sign the hook carries
identity-lifetime logic worth a design read before it grows again. It is a hook, not a component, and has a
sibling pure module; leave it.

### 1.3 Drift — files that moved > 150L

`census:arch-audit -- --base=65ee1ab` → **29** files with |net delta| > 150L, all additions. Of the 29, **18**
are under `src/features/avatar/stonebridge/` (`StonebridgeVillage.tsx` +1,108, `useStonebridgeProgress.ts` +827,
`LocationScenes.tsx` +716, `StonebridgePage.tsx` +623, `libraryReturnFlow.ts` +470 …), the rest being the handoff
lane (`usePlannerAskHandoff.ts` +1,274, `plannerAskHandoff.ts` +605, `composerCustody.ts` +523,
`PlannerAskHandoffNotice.tsx` +256, `ShellyChatPage.tsx` +277, `useShellyChatFlows.ts` +179),
`armorGeometryDiamond.ts` +675, `useBook.ts` +541, `chapterQuestionBatches.ts` +333, `readAloudCurriculum.ts`
+175, `BookshelfPage.tsx` +158. Of **pre-existing** files, `ShellyChatPage.tsx`, `useShellyChatFlows.ts`,
`BookshelfPage.tsx`, `useBook.ts` (+541, above) crossed the line. `ShellyChatPage.tsx` is **1,151L**, up from
647L in `CLAUDE.md`'s debt entry — see `DOC-31`.

### 1.4 Bundle (`ARCH-05` / `ARCH-08`) — regressed again, split still unbuilt

Main chunk **4,510.54 kB**, **+122.14 kB** in one window; two consecutive windows now add **+279 kB**
(10-04 → 10-25 → 11-08: 4,231.15 → 4,388.40 → 4,510.54). `lazy(` count **0**. This window's growth is mostly the
Stonebridge village (`router.tsx` imports `StonebridgePage` statically at line 27, route `/stonebridge`). Unlike
the avatar hub, `grep -rl "from 'three'" src/features/avatar/stonebridge` returns **nothing** — the village is
SVG/DOM, not Three.js — so **a route-level lazy of `/stonebridge` is not entangled with the
`AvatarThumbnail` → Three.js problem** that blocks `/avatar` (`ARCH-08`). That makes it the cleanest first slice
of `ARCH-05`: one `React.lazy` for a route that imports ~8k lines of its own code (59 files in the stonebridge
tree). No reduction figure is asserted — none was measured; the measured chunk graph recommended on 10-04 is
still the way to size it. **Proposed action:** owner decision; start with `/stonebridge`, then the
parent-only Curriculum / completion surfaces named on 10-25. Recorded on `ARCH-05`'s row as this audit's
re-verification.

### 1.5 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files, the same five (`auth`, `login`,
`not-found`, `planner`, `ui-preview`). `workshop` **45 source / 8 test** and `monthly-review` **15 / 7** — both
unmoved. Everything new in the window shipped with tests (root +56 files, +1,004 tests). Highest-value
additions remain the 10-04 pair (a `workshop` reducer/guard test, a `monthly-review` publish/photo-selection
test).

### 1.6 `ARCH-06` / `ARCH-43` / `ARCH-07`

`census`: ActivityConfig refs **324 (81 files)** (was 309/78), WorkbookConfig refs **38 (12 files)**, same files —
the legacy side has not moved, so migration completion is still not a drive-by. Name-literal sites **17 (15
files)**, unchanged; `ARCH-43` stays OPEN. `grep -rn "TODO.*ARCH-07" src functions/src` → nothing.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`) — `DOC-29` half-closed

`DECISION_FUNC-01_source_of_truth.md` still does not name `src/core/firebase/programCompletionWrites.ts`
(`grep -c programCompletionWrites` → 0), so `DOC-29` part (1) stays open. Part (2) (the task count) has
**already been corrected in `CLAUDE.md`** — line 643 now reads "22 task types", matching `census:arch-audit`.
No new `learnerModels` writer was added in this window (a scan of added non-test lines for `learnerModels` /
collection helpers returned nothing). No second authority created; `skillSnapshots` remains the authority for
"what to teach next". The row's status is not rewritten; this note records that half of it is already true.

### 2.2 Loop integrity — planner refusal → Ask AI (`UX-273`) and read-aloud → Curriculum (`FEAT-243`)

Two real paths traced.

**Refusal handoff.** `plannerAskHandoff.ts` (header) carries one parent-typed sentence from a planner
refusal to Ask AI as an **unsent composer draft**: in-memory slot read once and cleared, opaque generation
number in router state, **no URL parameter, no thread/message write, no model call**. The destination's own
Send, with its confirm cards, stays the only writer, so the propose→confirm→write rail is intact and the
handoff cannot reach a child record. Nine handoff/composer commits in the window (§1.2) bound it to source, visit and profile
lifetimes (the child-switch class). No dead end or silent drop found; the recoverable copy of her words remains
the planner transcript.

**Read-aloud Apply → Curriculum row.** `readAloudConfigWrites.ts` (49L) writes one `activityConfigs` row at the
deterministic id `readaloud-<chapterBookId>`, **create-only in a `runTransaction`** (`snap.exists()` → return,
never overwrite), parent-gated on capability (`canEdit`), called from `PlannerChatPage.tsx:1079` as an
enrichment beside `applyDraftWeek`. It writes no `hours`, `xpLedger` or `skillSnapshots` and reads neither
`chapterBooks` nor `bookProgress` (file header and body agree). Sound; same precedent as the seed writers.

**Not traced this cycle:** Stonebridge's relationship to the learning loop. Per `CLAUDE.md` it is derived
read-only from XP ledger reading events and never stores XP/diamonds; this audit read none of the 59 files for
a write path and states that as unverified rather than assumed. (Its `stonebridgeProgressWrite.ts` is the
file to open first — a compare-and-set on its own document, per the collection table.)

### 2.3 Shelly's path / no-shame

The handoff notice and the batched chapter-question copy (`FIX-270`: *"Questions ready for 12 of 58 chapters …
Tap again to finish the rest."*) are partial-progress sentences that do not shame. No finding.

### 2.4 Kid voice-first

Stonebridge's new controls are specified as 44px targets with plain labels (header comments in
`StonebridgeLocationDialog`/village files); not re-walked on a device. `UX-481` (the app shell overflowing a
narrow phone viewport) is open in the ledger and is the one live phone-width defect on record.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines of `src/` and `functions/src/` for
  `behind|catch up|falling|deadline|on track|quota|target|streak|you should|overdue`. Every hit is
  non-pedagogical: *behind* as spatial/z-order prose in scene components, *target* as tap-target size or the
  mission-step field (`villageStepsLabel(active.current, active.target)`), *falling* as a code comment about
  fallback. The step counter is a mission-progress label, not a pace deadline. **Clean.**
- **Diamonds-not-scores:** no new scoring surface.
- **Charter reach:** `CHAT_TASKS` registry size is **22**, unchanged. `git diff 65ee1ab origin/main --stat --
  functions/src/ai/contextSlices.ts functions/src/ai/tasks/pageCheck.ts` is empty — no context-slice or
  `pageCheck` change. `TASK_CONTEXT.analyzePatterns = ["childProfile"]` (`contextSlices.ts:96`) is still the
  known charter gap, tracked under `DOC-04`.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src` (non-test) → the same **5** real call sites as 10-25
(`RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1461`, `useWeekHours.ts:40`, `weekBySubject.ts:418`,
`weekRibbon.logic.ts:320`) plus one comment (`MonthlyTrend.tsx:27`).
`git diff 65ee1ab origin/main --stat -- functions/src/shared/hoursContributions.ts
src/features/records/records.logic.ts` is **empty**: neither the counting rule nor the fold moved.
**The authoritative core-hours figure is not recomputed** — it is a fold over live Firestore documents this
environment cannot read; the last recorded figure (598.73 h core, 1.27 h under the MO 600 line,
`ARCHITECTURE_AUDIT_2026-05.md`) is unchanged here, the MO 2026-06-30 deadline is past, and the owner's
live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-11-08 − 2026-07-01 = 130` days past the freeze window (was 116 on 10-25). Requires a live Firestore
export and the owner.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**,
byte-identical to 10-25; `records.logic.ts` is untouched in the window.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files as 10-25
(`RecordsPage.tsx`, `ComplianceDashboard.tsx`, `records.logic.ts`, `core/types/family.ts`,
`core/compliance/stateCompliance.ts`, `core/utils/complianceMapping.ts`). Nothing in the window deepens the MO
assumption.

### 4.5 Additive-hours invariant — no new `hours` writer

A scan of the window's added non-test lines for `hoursCollection(` / `collection(…'hours')` returns
**nothing**: no `hours` writer was added or changed, and the counting rule is byte-unchanged (4.1). The
read-aloud row (2.2) carries no minutes of its own to the fold. **Invariant holds.**

### 4.6 `firestore.rules`

`git diff 65ee1ab origin/main --stat -- firestore.rules` is **empty**. No action.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-56` (§1.2), `DOC-31` (§1.3 — `CLAUDE.md`'s tech-debt line for `ShellyChatPage.tsx` is stale).
**Status re-verifications (no row rewritten):** `ARCH-02` OPEN (eighth cycle, **+107L**, first growth since the
seam was named); `ARCH-05`/`ARCH-08` OPEN — main chunk **+122 kB**, 0 `lazy(`, and a Three-free first slice
(`/stonebridge`) identified; `ARCH-03` OPEN (+72L); `ARCH-44` OPEN (line-flat); `ARCH-43` OPEN (17 sites);
`ARCH-55` OPEN (line-flat); `DATA-01` FIXED; `DATA-02` NEEDS-DATA; `DATA-13` OPEN; `DOC-29` OPEN (half true,
§2.1); `TEST-01` OPEN. **Mechanical fixes applied:** the header `Last audit` bump and the `DOCUMENT_INDEX.md`
entry only.

**`DOC-31`** — `CLAUDE.md` "Known Technical Debt" lists `ShellyChatPage.tsx (647L)` as *"Stable"*; `wc -l` reads
**1,151L** (+277 in this window from the handoff lane). Documentation only, proposed rather than applied here
because the paragraph is a debt judgement ("Stable") the owner should re-make, not a stat number.

**Recommended `PROMPT_FIX` order:**
1. `ARCH-05`/`ARCH-08` — lazy-load `/stonebridge` as the first measured slice (§1.4); the bundle is the largest
   it has been at any audit.
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `DOC-29` + `DOC-31` — one docs run: add `programCompletionWrites.ts` to the authority table and refresh the
   `ShellyChatPage.tsx` debt line.
`ARCH-56` is a mechanical but test-pinned cut (do it before `useBook` grows again); `ARCH-55`/`ARCH-51`
remain design-first reads.

*Every number above is printed by `npm run census:arch-audit -- --base=65ee1ab`, `npm run build`, the named
`grep`/`wc -l`, or the test runners' own summaries; the window's size is `git diff --shortstat`. The "89
commits" figure is `git log --oneline | wc -l` and is flagged above as including merges.*
