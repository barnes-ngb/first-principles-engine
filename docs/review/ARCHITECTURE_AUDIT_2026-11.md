# Architecture Audit — 2026-11

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-11-01
> **Branch:** `claude/brave-feynman-pd7y6m` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-25.md` (window end `65ee1ab`).
> **Window covered:** `65ee1ab` → `f5db791` (`origin/main`, 2026-11-01) — **121 files, +26,110 / −933**
> (`git diff --shortstat 65ee1ab..origin/main`). `git log --oneline 65ee1ab..origin/main | wc -l` → **49**.
> Headline: a **hardening-heavy window**. Most of the added lines are the Planner → Ask AI handoff
> (UX-273) and its review-round fixes, the Stonebridge village / recovery work, the Diamond-armor geometry
> (`AV-01`), chapter-question batching (FIX-270), the read-aloud → Curriculum row (FEAT-243) and the
> Books save-recovery fix. Baseline green. The main bundle grew **+90 kB** with still no route-level
> split. Two findings are filed: `ARCH-56` (a 1,274-line single hook, and `ShellyChatPage` growing back
> past the size its decomposition was credited with) and `DOC-31` (the tech-debt sizes in `CLAUDE.md`).

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `f5db791`:

```
npm run lint                      → 0 errors, 5 warnings
npx tsc -b                        → CLEAN
npx vitest run                    → 825 files, 12,242 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 80 files, 1,820 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,478.82 kB │ gzip: 1,340.14 kB
node scripts/check-docs-alignment.mjs → HARD passed, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 10-25: root **790 → 825 files, 11,638 → 12,242 tests**; functions
**79 → 80 files, 1,808 → 1,820 tests**.

Lint: the 5 warnings are the 3 standing `useQuestSession.ts` `sessionTimer` ones, the `StickerLibraryTab.tsx:374`
one filed last cycle (still open), and one **new**: `usePlannerAskHandoff.ts:731` — an *unused*
`eslint-disable` directive for `react-hooks/set-state-in-effect`. It is `--fix`-able (ESLint reports it as
potentially fixable) and is a comment, not behaviour; left for the next run that touches the file rather than
edited here, since this audit changes no source.

**Bundle: 4,388.40 kB → 4,478.82 kB (+90.42 kB), gzip 1,313.17 → 1,340.14 kB (+26.97 kB).**
`grep -c "lazy(" src/app/router.tsx` → **0**.

## Step 0.5 — Lenses

- **Learning-loop integrity:** see 2.2.
- **Multi-kid generality:** `npm run census:arch-audit -- --base=65ee1ab` → **17 name-literal sites in 15
  files**, identical to 10-25. A scan of the window's added non-test lines for `=== 'lincoln'|'london'`,
  `name.toLowerCase() ===`, `.name === '` finds no name comparison; the `isLincoln` hits are in the new
  Stonebridge location dialog, where it is a **prop** used for font and colour only
  (`StonebridgeLocationDialog.tsx:27,94`) — the cosmetic use `CLAUDE.md` keeps. **No new name-gating.**
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **18** (was 19)

`census:arch-audit` prints 18 production files ≥ 1,500L of 982 scanned. The set is last cycle's 19 minus
**`settings/DevAdminTab.tsx`**, which fell from 1,530 to 1,475L (`git show 65ee1ab:… | wc -l` vs `wc -l`) when
FIX-270 moved chapter-question batching out of it into `today/chapterQuestionBatches.ts`; nothing joined. Sizes now (10-25 figure in brackets, where it moved):
`PlannerChatPage.tsx` 4,049 [3,942] · `chat.ts` 3,131 [3,129] · `BookEditorPage.tsx` 2,505 [2,433] ·
`useQuestSession.ts` 2,275 · `evaluate.ts` 2,106 · `dataReviewExport.logic.ts` 1,966 · `TodayPage.tsx` 1,945
[1,982] · `MyAvatarPage.tsx` 1,928 [1,897] · `WorkshopPage.tsx` 1,928 · `shellyChat.ts` 1,919 ·
`CurriculumTab.tsx` 1,899 [1,888] · `TodayChecklist.tsx` 1,841 · `LogWorkCard.tsx` 1,683 ·
`chatPlanner.logic.ts` 1,682 · `contextSlices.ts` 1,638 · `RecordsPage.tsx` 1,614 · `VoxelCharacter.tsx`
1,611 [1,606] · `useShellyChatActions.ts` 1,506.

**`ARCH-02` (`PlannerChatPage.tsx`) is unaddressed for an eighth consecutive cycle and is no longer
line-flat: +107L this window** (`git diff --numstat`: +203 / −96) from FEAT-243 (read-aloud → Curriculum),
FIX-270 (chapter-question batches) and the planner handoff source/visit-lifetime binding (`6c0cfd9`,
`f36526d`). The file also holds **137** `useState/useRef/useEffect/useCallback/useMemo` sites
(`grep -cE`). The seam the ledger named on 2026-08-16 (`useLiveDayEditHandlers`) is untouched and 4,049L is above the 3,942L
recorded in `CLAUDE.md`'s tech-debt entry (`DOC-31`).

### 1.2 `usePlannerAskHandoff.ts` — new at 1,274L, one hook (`ARCH-56`)

Landed in `f36526d` and touched by **15** commits in the window (`git log --oneline 65ee1ab..origin/main -- <file> | wc -l`) (the review-round fixes: draft
ownership, displaced/edited drafts, expired sessions, upload continuations). Evidence
(`grep -nE "^(export )?(function|const) "`): the module has three tiny helpers (`ownerOf`, `ownerKeyOf`,
`draftSignature`, lines 223–244) and **one** exported hook, `usePlannerAskHandoff`, starting at line 260 whose
body runs to the end of the file — ~1,010 lines — with **40** React-hook sites (`grep -cE`). Its pure halves
are already out (`plannerAskHandoff.ts` 605L, `composerCustody.ts` 523L, `plannerAskHandoffLines.ts`,
`useHandoffScopeWatch.ts`) and it is backed by four test files, one of them 2,585 lines
(`plannerAskHandoff.route.test.tsx`). So — as with `ARCH-55` — the *logic* is extracted and heavily tested;
what is left is the React binding, in one function.

Alongside it, `ShellyChatPage.tsx` is **1,151L** (874 at `65ee1ab`: +277) and `useShellyChatFlows.ts`
**1,425L** (1,246: +179), the receiving end of the same feature. `ARCH-09` credited the page with a
decomposition to 647L; that figure was already 874 before this window and is now 1,151 (12 hook sites on the
page, so it is still mostly markup and wiring — cohesive, not tangled, but no longer small).
**Severity P3, band 1.** **Proposed action:** design-first read; if the owner wants it, split the hook along
the custody/lifetime seam its own module names (`composerCustody` owners vs. the navigation receiver) into
two hooks next to the pure modules, asserted by the existing four test files rather than eyeballed. Not for
`PROMPT_FIX` yet: the feature's whole contract is "writes nothing, carries one sentence"
(`plannerAskHandoff.ts` header) and the test files pin the ordering. Filed as `ARCH-56`.

**Watch (no row):** `useStonebridgeProgress.ts` **1,010L** (+827 in the window; it was ~183L), with
`LocationScenes.tsx` 716L, `StonebridgeVillage.tsx` 660L and `stonebridgeProgressWrite.ts` — new modules for
the village and recovery work. The hook is single-concern (mission progress; it reads `xpLedger`
**read-only**, `useStonebridgeProgress.ts:585–587,695`, and writes only `stonebridgeProgress`) so it is
cohesive-by-nature, but it crossed 1,000L in one window and is the one to re-read next cycle.
`useBook.ts` 1,197L (+210, save-recovery) likewise. `armorGeometryDiamond.ts` 675L is data-shaped geometry.

### 1.3 Drift — files that moved > 150L

`census:arch-audit -- --base=65ee1ab` → **19** files with |net delta| > 150L, all additions. Of
**pre-existing** files only `useStonebridgeProgress.ts` (+827), `StonebridgeVillage.tsx` (+406),
`ShellyChatPage.tsx` (+277), `BannerRaiseCelebration.tsx` (+230), `useBook.ts` (+210), `useShellyChatFlows.ts`
(+179) and `StonebridgeMissionCard.tsx` (+186) crossed the line; the rest are new files. `PlannerChatPage.tsx`
(+107) and `BookEditorPage.tsx` (+72) are **below** the 150L rule and are named in 1.1 anyway because both are
standing candidates.

### 1.4 Bundle (`ARCH-05`/`ARCH-08`) — regressed again, split still unbuilt

Main chunk **4,478.82 kB** (Step 0), +90.42 kB with `lazy(` count **0**. This is the second consecutive
window of growth after the `FIX-253` jspdf saving: the series is now 4,231 → 4,388 → 4,479. The growth
this window is mostly the Stonebridge village scenes, the Diamond armor geometry and the handoff — the first
two are on the avatar route, which is entangled with the Three.js question (`AvatarThumbnail` is reached from
the app shell, so a naive `/avatar` split removes nothing: `ARCH-08`). The 10-04 and 10-25 recommendation
stands unchanged: **produce the measured chunk graph first**; no reduction figure is asserted here because
none was measured. Architectural decision for the owner.

### 1.5 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files, the same five (`auth`, `login`,
`not-found`, `planner`, `ui-preview`); `workshop` 45 source / 8 test, `monthly-review` 15 / 7 — neither
moved. The window's new logic shipped heavily tested (the handoff has four test files, Stonebridge recovery
a 2,136-line suite, Books save-recovery three). The standing recommendations (a `workshop` reducer/guard
test, a `monthly-review` publish/photo-selection test) remain the highest-value additions.

### 1.6 `ARCH-06` / `ARCH-43` / `ARCH-07`

`census`: ActivityConfig refs **324 (81 files)** (was 309 / 78 — FEAT-243's read-aloud row writer and
consumers), WorkbookConfig refs **38 (12 files)** unchanged. Name-literal sites **17 (15 files)**, unchanged;
`ARCH-43` stays OPEN. `grep -rn "TODO.*ARCH-07" src functions/src` finds no new removable ladder TODO.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`) — no new authority

No new `learnerModels`, `skillSnapshots` or `childSkillMaps` writer in the window (the diff of added non-test
lines contains no `skillSnapshots`/`xpLedger`/`addXpEvent`/`hoursCollection` use). The authority-table gap
filed last cycle (`DOC-29`) is unchanged and still open.

### 2.2 Loop integrity — Planner refusal → Ask AI (UX-273)

Traced: a planner turn the parent typed is declined (UX-269) → `withDeclinedAskCleared` sets `typedByParent`
to exactly `false` → `plannerAskHandoff.ts` resolves the sentence from the transcript → a **module-level,
one-shot slot** carries it across navigation → Ask AI shows it as an **unsent** composer draft → the
destination's own Send (with its confirm cards) remains the only write. Verified from the module header and
a grep: neither `plannerAskHandoff.ts`, `usePlannerAskHandoff.ts` nor `composerCustody.ts` calls `setDoc`,
`updateDoc`, `addDoc` or `runTransaction`, or touches `hours`/`xpLedger`/`skillSnapshots`. The loop closes
without a silent drop: when the sentence cannot be proven to be hers the resolver returns `null` and the
button falls back to the plain UX-269 navigation (the safe direction, per the header). One honest
limitation, stated by the module itself: nothing is persisted, so a reload loses the draft — the planner
transcript still holds the turn. **Not traced:** the review-round fixes' behaviour on a real device.

Second path: **FEAT-243** (planner pick → Curriculum row). `readAloudConfigWrites.ts` is create-only inside
`runTransaction` (lines 43–46: `tx.get` then `tx.set`), under a deterministic id, with no position — the
`UX-231` pattern, not a check-then-act. **FIX-270** batches chapter questions through one module. Both
consistent with the ledger's rails.

### 2.3 Shelly's path / no-shame

The handoff is a convenience on a *refusal* and writes nothing. The Stonebridge restoration surface is
framed as restoration, not scoring. No shame or dead-end found in the new copy (3.1).

### 2.4 Kid voice-first

Not re-walked on a device. The new Stonebridge location visit is advertised as accessible
(`StonebridgeLocationDialog`, `df3b3ae`); not verified on a handset by this audit.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines of `src/` and `functions/src/` for
  `behind|catch up|falling|deadline|on track|quota|streak|you should|overdue`. Every hit is code-position
  prose in comments ("behind the opening", "behind it", "falling back to") — **none is learner-facing**.
  **Clean.**
- **Diamonds-not-scores:** the Diamond armor change is geometry only (`armorGeometryDiamond.ts`); it does not
  touch the XP ledger or tier thresholds. Stonebridge progress is derived from the ledger read-only.
- **Charter reach:** `CHAT_TASKS` size is still **22** (`census:arch-audit`); no task added in the window, so
  nothing new to check. The `analyzePatterns` gap remains tracked under `DOC-04`.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary("` (non-test) → the same **5** call sites as last cycle
(`RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1461`, `useWeekHours.ts:40`, `weekBySubject.ts:418`,
`weekRibbon.logic.ts:320`) plus the comment at `MonthlyTrend.tsx:27`.
`git diff --stat 65ee1ab..origin/main -- functions/src/shared/hoursContributions.ts
src/features/records/records.logic.ts firestore.rules` is **empty**: neither the counting rule, the fold, nor
the rules moved. **The authoritative core-hours figure is not recomputed** — it is a fold over live
Firestore documents this environment cannot read; the last recorded figure (598.73 h core, 1.27 h under the
MO 600 line, `ARCHITECTURE_AUDIT_2026-05.md`) is unchanged here, the MO 2026-06-30 deadline is past, and the
owner's live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-11-01 − 2026-07-01 = 123` days past the freeze window (116 on 10-25). Requires a live Firestore
export and the owner.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**,
byte-identical; the file is untouched in the window.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files as 10-25
(`RecordsPage.tsx`, `ComplianceDashboard.tsx`, `records.logic.ts`, `core/types/family.ts`,
`core/compliance/stateCompliance.ts`, `core/utils/complianceMapping.ts`). Nothing deepens the assumption.

### 4.5 Additive-hours invariant

No new `hours` writer in the window (no added non-test `hoursCollection(` / `collection(…'hours')` line).
The chapter-question and read-aloud work writes `bookProgress` / `activityConfigs` only. **Invariant holds.**

### 4.6 `firestore.rules`

Unchanged in the window (empty diff above).

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-56` (§1.2), `DOC-31` (stale tech-debt sizes in `CLAUDE.md`: it states
`PlannerChatPage.tsx (3,942L)` and `ShellyChatPage.tsx (647L)` — `grep -n "3,942L\|647L" CLAUDE.md` →
lines 676 and 681 — against 4,049 and 1,151 measured here; `BookEditorPage` and `useShellyChatFlows` drift
the same way). `DOC-31` is a proposal, not a mechanical fix: the ShellyChatPage line carries a "Stable"
judgement, not only a number, and `CLAUDE.md` is the operating manual. (`DOC-30` is the id the October
renumbering run used and has no ledger row; it is skipped, not reused.)
**Status re-verifications (no row rewritten):** `ARCH-02` OPEN (eighth cycle, **+107L**); `ARCH-05`/`ARCH-08`
OPEN (+90 kB, 0 `lazy(`); `ARCH-44` OPEN (`dataReviewExport.logic.ts` 1,966L, flat); `ARCH-43` OPEN (17
sites); `DATA-01` FIXED; `DATA-02` NEEDS-DATA; `DATA-13` OPEN; `TEST-01` OPEN. **Mechanical fixes applied:**
the ledger header `Last audit` bump and the `DOCUMENT_INDEX.md` entry only.

**Recommended `PROMPT_FIX` order:**
1. `ARCH-05`/`ARCH-08` — measured chunk graph first; the bundle has now grown two windows running.
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `DOC-29` + `DOC-31` — one doc-only run: the authority-table row and the stale sizes.
`ARCH-56`, `ARCH-55` and `ARCH-51` are design-first reads, not fix targets yet.

*Every number above is printed by `npm run census:arch-audit -- --base=65ee1ab`, `npm run build`, the
named `grep`/`wc -l`, or the test runners' own summaries; the window's size is `git diff --shortstat`. The
49-commit figure is `git log --oneline | wc -l`. The "~1,010 lines" hook body is `1,274 − 260 + 1`, read off
the line numbers cited.*
