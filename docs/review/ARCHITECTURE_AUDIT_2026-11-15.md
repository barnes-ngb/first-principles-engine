# Architecture Audit — 2026-11-15

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-11-15
> **Branch:** `claude/brave-feynman-g92qic` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc corrections only.
> **Prior merged audit:** `ARCHITECTURE_AUDIT_2026-10-25.md` (window end `65ee1ab`).
> **Window covered:** `65ee1ab` → `1f12b4b` (`origin/main` when this run started) — **228 files,
> +64,523 / −2,326** (`git diff --shortstat 65ee1ab..origin/main`). No commit count is given: this
> environment is a shallow clone (`git rev-parse --is-shallow-repository` → `true`), and the 2026-10 audit
> recorded that a shallow clone under-counts the same range.
>
> **Two earlier audits of this same window are still open and unmerged** — PR #1928 (window
> `65ee1ab`→`f5db791`, 2026-11-01) and PR #1942 (`65ee1ab`→`8bf1f38`, 2026-11-08). **Both** claim `ARCH-56`
> and `DOC-31` (for different findings) and both write `ARCHITECTURE_AUDIT_2026-11.md`. This is the
> collision `DOC-30` had to renumber in October, so this run uses a **dated file name** and takes ids
> **after** theirs (`ARCH-57`, `FUNC-17`, `FUNC-18`, `DOC-32`), and does not re-file their findings
> (`usePlannerAskHandoff.ts` 1,274L; `useBook.ts`'s two unrelated hooks; `CLAUDE.md` stale debt sizes).
> Recommendation: merge **#1942** (its window contains #1928's) and close #1928, resolving the
> `ARCH-56`/`DOC-31` double-claim before either lands.
>
> **Headline:** the window's second half was the **Knowledge Mine save lane** (UX-491 → UX-496: original
> quest save + retry, exit guard, the Stonebridge Mine invitation, the checked-addition pilot). It is
> careful, well-tested work, and it put **+1,683L into `useQuestSession.ts` (2,275 → 3,958, +74%)** and
> **+1,280L into `KnowledgeMinePage.tsx` (788 → 2,068)** — the standing `ARCH-04` candidate is now the
> second-largest file in the repo (`ARCH-57`). The loop gained its first kid-side door into the Mine
> (Stonebridge), and the staleness rule it honours silences that door for most of the week (`FUNC-17`).

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `1f12b4b`:

```
npm run lint                      → 0 errors, 2 warnings (StickerLibraryTab.tsx:374 carried; usePlannerAskHandoff.ts:731 unused eslint-disable, new)
npx tsc -b                        → CLEAN
npx vitest run                    → 865 files, 13,190 passed + 1 skipped, 0 failing
cd functions: lint / tsc --noEmit / npm test → CLEAN / CLEAN / 80 files, 1,820 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,564.88 kB │ gzip: 1,368.31 kB
node scripts/check-docs-alignment.mjs → HARD passed, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN** (deltas vs 10-25: root 790 → 865 files, 11,638 → 13,190 tests; functions 79 → 80 files, 1,808 → 1,820 tests). The three `useQuestSession.ts` lint warnings carried since the summer are gone
(the window rewrote the code they sat on); the new warning is an `eslint-disable` for
`react-hooks/set-state-in-effect` that no longer suppresses anything — a one-line delete, not a row.

## Step 0.5 — Lenses

- **Learning-loop integrity:** §2.2 (`FUNC-17`).
- **Multi-kid generality:** `npm run census:arch-audit -- --base=65ee1ab` → **17 name-literal sites in 15
  files**, unchanged. A grep of the window's added non-test lines for `=== 'lincoln'|'london'` and
  `name.toLowerCase() ===` returns nothing. The window adds many `isLincoln` uses, all in the new
  Stonebridge town (fonts, colours, radii); each is derived from the hero's saved `themeStyle` or
  `getChildAgeGroup` (`StonebridgePage.tsx:223`, `MyAvatarPage.tsx:256`), never a name — the cosmetic flag
  `CLAUDE.md` permits. `UX-477` (a London village saying *"You did it, Lincoln"*) was found and fixed inside
  the window. **No new name-gating.**
- **MO→TX:** no new MO hardcoding (§4.3).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **21** (10-25: 19)

`census:arch-audit` prints 21 production files ≥ 1,500L of 1,009 scanned. New to the list:
`KnowledgeMinePage.tsx` (2,068), `EvaluateChatPage.tsx` (1,888) and `useBook.ts` (1,585 — already filed by
open PR #1942). Sizes now (10-25 figure in brackets): `PlannerChatPage.tsx` 4,049 [3,942] ·
`useQuestSession.ts` **3,958 [2,275]** · `chat.ts` 3,131 [3,129] · `BookEditorPage.tsx` 2,505 [2,433] ·
`evaluate.ts` 2,106 · `KnowledgeMinePage.tsx` **2,068 [new]** · `dataReviewExport.logic.ts` 2,052 [1,966] ·
`MyAvatarPage.tsx` 1,983 [1,897] · `TodayPage.tsx` 1,945 [1,982] · `WorkshopPage.tsx` 1,928 ·
`shellyChat.ts` 1,919 · `CurriculumTab.tsx` 1,899 [1,888] · `EvaluateChatPage.tsx` **1,888 [new]** ·
`TodayChecklist.tsx` 1,841 · `LogWorkCard.tsx` 1,683 · `chatPlanner.logic.ts` 1,682 · `contextSlices.ts`
1,638 · `RecordsPage.tsx` 1,614 · `VoxelCharacter.tsx` 1,611 · `useBook.ts` 1,585 [new] ·
`useShellyChatActions.ts` 1,506. `DevAdminTab.tsx` dropped below the line.

**`ARCH-02` is unaddressed for an eighth cycle and grew +107L** (3,942 → 4,049; all of it before 11-08, per
`git show 8bf1f38:… | wc -l`). Other standing judgments (`ARCH-01`, `03`, `44`, `50`, `51`, `55`) carry
forward unchanged — the census proves size, not cohesion, and they were not re-read.

### 1.2 The Mine lane: `useQuestSession.ts` +1,683L and `KnowledgeMinePage.tsx` +1,280L (`ARCH-57`)

Both files were still at their 10-25 size on 2026-11-08 (`git show 8bf1f38:<file> | wc -l` → 2,275 / 788),
so the whole growth is the UX-491 → UX-496 run of the last week.

**`useQuestSession.ts` (3,958L) — tangled.** One exported hook, `useQuestSession`, from line 593 to the
end of the file; hook-call sites 25 → 41 (`grep -cE "use(State|Ref|Effect|Callback|Memo)\("`). Its
callbacks (`grep -nE "^  const [a-zA-Z]+ = useCallback"`) now include two very long ones —
`startQuest` (:1161 → :1741, ~580 lines) and `endSession` (:2124 → :2710, ~590 lines) — and a new group
that is a lifecycle of its own: `publishSourceSave` :777, `scopeStillLive` :927, `questExitFace` :990,
`questExitVerdict` :1064, `retireUnansweredRun` :1125, `retrySourceSave` :1900. The writes themselves were
correctly extracted (`questSourceWrites.ts` — *"writes `evaluationSessions` and nothing else"*, one
`runTransaction` per write; `questRun.ts`; `questSaveCopy.ts`), so as with `ARCH-55` the logic is pure and
tested and what is left is React binding. **Seams:** (a) the module-level parsers (:128–:340,
`parseQuestBlock`, `extractQuestFinding`, `parseFluencyPassage`, `generateFallbackRecommendations`) → a
pure `questParsing.ts`; (b) the source-save / exit-guard group → `useQuestSourceSave`; (c) the
graph-projection pair (`projectGraph` :1775, `retryGraphProjection` :1829); (d) fluency
(`recordFluencyAttempt` :3220, `requestNewFluencyPassage` :3250, `endFluencySession` :3301) →
`useFluencySession` — the split `CLAUDE.md`'s debt list already suggests ("consider splitting by quest
domain").

**`KnowledgeMinePage.tsx` (2,068L) — big, half-decomposed.** The page component runs :171 → :1485
(~1,310 lines); the window extracted its leaf UI (`MineTripExit` :1485, `MineTripSuggestion` :1546,
`QuestCard` :1744, `RecoveryNotice` :1904, `ResumeCard` :1967), which is the right direction. The page
body still holds the trip / invitation / pilot reconciliation.

**`EvaluateChatPage.tsx` (1,888L, +647)** is the cohesive one: the window split it into scope components
(`EvaluateChatPage` :280, `EvaluateVisit` :393, `EvaluateDraft` :539 to end) precisely so a child switch
remounts the draft (UX-491). Watch only.

**Severity P2, band 1** (P2 rather than ARCH-55's P3 because this is the one file of the four standing
candidates that grew by most of itself again, and it carries an `hours` write — §4.4 — and the
`learnerModels` projection). **Proposed action:** design-first read; the first cut is (a) — pure, zero-risk,
and it removes ~210 lines with no hook ordering involved. (b)–(d) must be asserted by the existing
`useQuestSession*` / `KnowledgeMinePage.*` suites, not eyeballed. Not for `PROMPT_FIX` until the owner wants it.

### 1.3 Drift — files that moved > 150L

`census:arch-audit -- --base=65ee1ab` → **48** files with |net delta| > 150L, all additions. Largest:
`useQuestSession.ts` +1,683, `KnowledgeMinePage.tsx` +1,280, `usePlannerAskHandoff.ts` +1,274 (new; open
PR #1942/#1928 `ARCH-56`), `StonebridgeVillage.tsx` +1,108, `useStonebridgeProgress.ts` +827,
`StonebridgePage.tsx` +748, `LocationScenes.tsx` +716, `armorGeometryDiamond.ts` +675,
`EvaluateChatPage.tsx` +647, `plannerAskHandoff.ts` +605, `useBook.ts` +598. Most are the Stonebridge town
build-out (`src/features/avatar/stonebridge/`, the largest group of the list) — new files, landed under
their own rows (`UX-474`…`UX-484`). **Watch (no row):** `StonebridgeVillage.tsx` is 1,108L, all new
this window; the next cycle should read it for cohesion.

### 1.4 Bundle (`ARCH-05`/`ARCH-08`)

Main chunk **4,388.40 kB → 4,564.88 kB (+176.48 kB), gzip 1,313.17 → 1,368.31 kB (+55.14 kB)** — the second consecutive window of >150 kB growth, and the largest main chunk any audit has recorded. `grep -c "lazy(" src/app/router.tsx` → **0**; 35 `import` lines in `router.tsx`. The 10-25 position
stands unchanged: the measured chunk graph comes first, Three.js is reached from the shell through
`AvatarThumbnail`, and the window's growth is again mostly non-Three feature code (Stonebridge town,
Mine save lane, planner→Ask AI handoff). The Stonebridge town is a **new route** (`UX-479`) and is a natural
lazy boundary. This audit asserts no reduction figure — none was measured.

### 1.5 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files, the same five (`auth`, `login`,
`not-found`, `planner`, `ui-preview`). `workshop` **45 source / 8 test** and `monthly-review` **15 / 7** —
neither moved for a third cycle; those remain the two highest-value additions (a `workshop` phase-gate /
reducer test, a `monthly-review` publish/photo-selection test). The window's own logic shipped with tests:
`quest` is now **28 source / 30 test**, `avatar` 108 / 50.

### 1.6 `ARCH-06` / `ARCH-43` / `ARCH-07`

`census`: ActivityConfig refs **324 (81 files)** (10-25: 309 / 78), WorkbookConfig refs **38 (12 files)** —
the legacy count is flat for a fourth cycle while the new system keeps growing; completion is still a
design run, not a drive-by. Name-literal sites **17 (15 files)**, unchanged. `grep -rn "TODO.*ARCH-07" src
functions/src` → nothing.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`) — no new authority

The window's new stores are **execution records**, not answers to "where is Lincoln":
`guidedEvaluationSources` (UX-492; created once per finalized finding in a transaction with the day's
session, `guidedEvaluationSource.ts:206`–:255), and the quest source document on the existing
`evaluationSessions` (UX-494, `questSourceWrites.ts`). The `learnerModels` writer for quests is still
`questModelSync.ts` (`modelRef` :122), now transactional and stamping the projection outcome on the source.
`skillSnapshots` stays the authority for "what to teach next". The governing ruling is unchanged; the
revision-bound trace (`FUNC01_AUTHORITY_TRACE_2026-10.md`, 2026-10-05) is by design a snapshot and names
neither `programCompletionWrites.ts` (already `DOC-29`) nor the new source stores — a refresh of that trace
should fold both in. No row: `DOC-29` covers the trace refresh.

### 2.2 Loop integrity — Mine → model → Stonebridge invitation → Mine (`FUNC-17`)

Traced the loop the window built: a quest ends → `questModelSync` projects results into `learnerModels`
and, when any concept changed, sets `synthesisStaleAt` (`questModelSync.ts:244`) → the town's
`StonebridgeMineInvitation` reads the model through `useLearnerModel` and asks `selectMineInvitation` →
which reads `synthesis.whatMattersNext` **only when `synthesisStaleAt` is falsy**
(`mineInvitation.ts:215`, `if (!synthesis || input.model.synthesisStaleAt) return null`). The queued-ask
branch (step 1 of its order) is unaffected.

The break: synthesis is regenerated in three places, and only one of them is routine. (i) The Sunday
00:15 `weeklyReview` beat (`evaluate.ts:2050`; `deps.synthesizeIfStale` at :1899 inside
`runWeeklyReviewCycleForChild`). (ii) The manual `generateWeeklyReviewNow` callable, which also runs
`synthesizeIfStale` before generating (`evaluate.ts:1813`). Its one client caller is the Review page's
parent-only *Try again* (`retryWeeklyReview.ts:43`, rendered by `WeekRetryControl` from
`WeekPaceSection.tsx:288`), and that button renders only when the week's review **recorded a failure and
has no narrative** (`weekRetryOffer`; the comment at `WeekPaceSection.tsx:281`). So it is a real midweek
refresh, but only on a failed week, and only when a parent taps it. (iii) The `?diag=1` panel
(`generateLearnerSynthesisNow`'s one client caller is `FoundationsDiagPanel.tsx`; `useLearnerModel.ts:23`
says *"surfaces read it and never regenerate on load (D6)"*). Meanwhile every evidence writer sets the
staleness mark, not only a quest: `evalModelWriteback.ts:81`, `writeReviewAction.ts:59`,
`workbookPositionSync.ts:143`, `stuckRetestQueue.ts:136`. So **on an ordinary week (one with no failed
review for a parent to retry), the first quest, scan, Today struggle signal or review confirm silences
the synthesis-driven invitation until the following Sunday. That includes the UX-495 addition pilot that
depends on it (`mineAdditionPilot.ts`: "a stale synthesis offers nothing").** (Codex round 1 on PR #1971
caught that an earlier draft cited :1813 as the scheduled beat and missed path (ii).) The more the
family uses the app, the sooner in the week the door closes. That is the exact weak link
`PROCESS_OVERVIEW.md` names (Lincoln doing Knowledge Mine ~weekly), reproduced by the door built to fix it.
Nothing is lost or mis-recorded — the refusal is correct under D6 — so this is a design gap, not a defect.

**Severity P2, band 2, lens: learning-loop integrity.** **Proposed (options, owner's call):**
(1) accept — the queued-ask branch still invites, and it is the authority; (2) let the invitation use a
stale synthesis for a move whose concept is **not** among the concepts changed since it was generated
(the refs carry enough to tell); (3) a post-projection `synthesizeIfStale` trigger, rate-limited per child
per day — costs one Sonnet call per triggering day and reverses D6 for one writer. (2) keeps D6 and costs
nothing. **Doc drift noticed with it:** `CLAUDE.md` (Cloud Functions list) and `learnerSynthesis.ts:11` /
:353 describe a *"client regenerate-on-read path"* for `generateLearnerSynthesisNow`; no such caller exists.
Folded into this row, not applied — it is a behaviour claim, and which way it should be corrected depends
on the option chosen.

### 2.3 Shelly's path / no-shame

The window's parent-facing work was failure honesty: a guided assessment shows when a turn is saving
(`0a0a0ce`), a failed save stays recoverable through navigation (`UX-473`), a failed shelf read keeps the
way back (`UX-484`). Mine save copy (`questSaveCopy.ts`) uses plain refusals (*"That quest is not yours."*,
*"Could not open it. Tap it again."*), no scoring words. No shame or dead-end found. No finding.

### 2.4 Kid voice-first (`FUNC-18`)

The Mine addition pilot is tap-choice (`mineAdditionProbe.ts:93`–:140, a canonical choice set), not typed.
But the **Stonebridge town — the new kid hub, built this window — speaks exactly one thing**: the
*Hear the thank you* replay (`StonebridgeLocationDialog.tsx:369`, `StonebridgeVillage.tsx:1279`,
`speak` defaulting to `false`, `StonebridgePage.tsx:732`). The invitation line (*"Your mine has a dig for
you."*, `libraryReturnCopy.ts:30`), its two buttons, the location dialogs and the village steps help are
read-only text. `grep -lE "speak|useTTS|speechSynthesis"` over `stonebridge/*.tsx` finds the three files
above and no other. For a child reading at ~1st-grade level, the invitation the loop now depends on (§2.2)
is a sentence he may not read. **Severity P3, band 2, lens: kid voice-first.** **Proposed:** a single
*Hear it* control on the invitation and the location dialog, reusing the existing speak path the replay
already uses; no auto-speak (the replay's own rationale for `speak=false` on automatic surfaces stands).

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines of `src/` and `functions/src/` for
  `behind|catch up|falling behind|deadline|on track|quota|streak|you should|overdue|hurry|too slow`. Every
  hit is non-pedagogical: *behind* as layout/z-order prose (scenes, modals, focus traps) and one
  *"no quota and no mastery claim"* comment asserting the rule. **Clean.**
- **Diamonds-not-scores:** the Mine's per-answer banking is unchanged in kind (`bankAnswerReward`, deduped
  keys); Stonebridge repairs are framed as restoration, not points. No new scoring surface.
- **Charter reach:** `CHAT_TASKS` registry size **22** (`census:arch-audit`), unchanged; no task added this
  window. The `analyzePatterns` gap (`DOC-04`) is unchanged.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src` (non-test) → the same five call sites as 10-25
(`RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1549` — moved from :1461 by growth, `useWeekHours.ts:40`,
`weekBySubject.ts:418`, `weekRibbon.logic.ts:320`) plus the `MonthlyTrend.tsx:27` comment.
`git diff --stat 65ee1ab origin/main -- src/features/records/records.logic.ts
functions/src/shared/hoursContributions.ts src/core/compliance` is **empty**. The authoritative core-hours
figure is not recomputed — it is a fold over live Firestore documents this environment cannot read; the
last recorded figure (598.73 h core, 1.27 h under the MO 600 line, `ARCHITECTURE_AUDIT_2026-05.md`) stands,
and the owner's live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-11-15 − 2026-07-01 = 137` days past the freeze window (`date` arithmetic). Requires a live export.

### 4.3 `DATA-13` / MO→TX

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**, identical
to 10-25. `grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files. Nothing
deepens the MO assumption.

### 4.4 Additive-hours invariant — holds

`git diff 65ee1ab origin/main` for `hoursCollection(` in non-test code: no **new** writer. The existing
writers in `useQuestSession.ts` (now :2379, :3343, :3827) and `EvaluateChatPage.tsx` (:677) moved, and
the two quest closes now address `run.familyId` / `exitingRun.familyId` and `run.childId` — the run that
was started, not the live scope (attribution, the `UX-327` shape). Read side by side with `65ee1ab`
(:1042–:1058), the arithmetic is byte-identical: `Math.ceil(activeSeconds / 60 / 5) * 5`, written only
when `minutes >= 5`, one `addDoc` per run (guard moved from a shared ref to a per-run set,
`hoursLoggedRunsRef`, so a delayed close can neither double-credit nor suppress the fluency row). The
book reader's writer (`BookReaderPage.tsx:104`) keeps its row shape; its `date` is now the local day the
read ends (`UX-488`). All still fold through the unchanged `collectHoursContributions`. `firestore.rules`,
`storage.rules` and `firestore.indexes.json` are unchanged in the window.

---

## Step 5 — Ledger and recommended actions

**Filed (after the ids open PRs #1928/#1942 claim):** `ARCH-57` (§1.2), `FUNC-17` (§2.2), `FUNC-18`
(§2.4), `DOC-32` (mechanical, applied in this PR — below). **Re-verified, no row rewritten:** `ARCH-02`
OPEN (eighth cycle, +107L); `ARCH-04` OPEN — superseded in practice by `ARCH-57`; `ARCH-05`/`ARCH-08`
OPEN, 0 `lazy(`; `ARCH-43` OPEN (17); `ARCH-06` OPEN (38 legacy refs, flat); `DATA-01` FIXED and holding;
`DATA-02` NEEDS-DATA (137 days); `DATA-13` OPEN; `TEST-01` OPEN (workshop 45/8, monthly-review 15/7).

**Mechanical fixes applied (`DOC-32`):** the task registry gained `pageCheck` on 2026-10 and two docs
still list 21: `docs/SYSTEM_PROMPTS.md`'s dispatch diagram (now lists `pageCheck → handlePageCheck` in
registry order) and `docs/DOCUMENT_INDEX.md`'s `SYSTEM_PROMPTS.md` row (21 → 22, `pageCheck` added).
Plus the ledger's `Last audit` bump and this report's index entry.

**Recommended order:**
1. **Merge #1942 and close #1928** — two open audits of one window double-claim `ARCH-56`/`DOC-31`; the
   longer it waits, the larger the renumbering.
2. `FUNC-17` — an owner decision between the three options; option (2) is buildable by `PROMPT_FIX` once
   chosen, and it is the change that most directly moves "Lincoln does the Mine weekly".
3. `ARCH-05`/`ARCH-08` — the measured chunk graph; the bundle has not been split at any audit this year.
4. `DATA-13` — route the four Missouri literals through `stateCompliance.ts`.
`ARCH-57` (cut (a) first) and `FUNC-18` are next-tier; `ARCH-57` is design-first.

*Every number above is printed by `npm run census:arch-audit -- --base=65ee1ab`, `npm run build`, the test
runners' own summaries, the named `grep`/`wc -l`/`git show <rev>:<file> | wc -l` commands, or
`git diff --shortstat`. The window size is a tree diff because the clone is shallow.*
