# Architecture Audit — 2026-08-16

> **Type:** Monthly deep audit (scheduled run, fired 2026-08-16 — 7 days after the 2026-08-09
> mid-cycle re-verification; cadence in practice has run roughly weekly this series).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-08-16
> **Branch:** `claude/brave-feynman-d0ampy` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-08-09.md` (commit `def6010`)
> **Window covered:** 2026-08-09 → 2026-08-16 (7 days, `origin/main` at `6f7dcde`). Unlike the prior two
> audits (2026-08-02, 2026-08-09), which caught the flattest weeks in this series, this window is a real,
> heavy feature week: **87 files changed under `src/`+`functions/src/`, +15,858 / −478 lines** (Ask AI can
> now edit Today/This Week and the curriculum, confirm-gated, in two slices; Today gained a "live week
> edit" mode; Watch gained history tracking; monthly-review generation got three successive reliability
> fixes for a real evidence-integrity gap). Two PRs are currently open against `main` and out of this
> audit's scope: **#1676** (slice 3 of the chat arc — find/plan a video) and **#1677** (weekly test-builder
> lane, additive tests only) — neither is assessed here; re-check next cycle once merged.

---

## Step 0 — Baseline

```
npm ci (root)                         → clean install, 646 packages
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → 5,503 tests passing (381 files), 0 failing, 0 skipped
cd functions && npm ci                → clean install, 694 packages
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 840 tests passing (38 files), 0 failing, 0 skipped
npm run build                         → dist/assets/index-*.js  4,317.85 kB │ gzip: 1,286.21 kB
npm run docs:check                    → HARD green, 11 SOFT warnings (all pre-existing, see below)
```

**Baseline: GREEN.** Fresh container, no `node_modules` at session start — both installs ran clean before
any check. No flakes observed.

Root tests: **362 → 381 files (+19), 4,867 → 5,503 tests (+636)**. This is well above the sanctioned
weekly test-builder lane's typical pace (+2 files / +65 tests in prior quiet cycles) because this week's
feature PRs (FEAT-140 through 148) each shipped their own substantial test coverage alongside the code —
18 new test files landed with the features, not as a separate lane. Functions: **37 → 38 files (+1),
682 → 840 tests (+158)**, same story (`sanitizeJson.test.ts`, `monthlyReview.test.ts` +924L,
`monthlyReviewCuration.test.ts`, `monthlyReviewData.test.ts`, `scan.test.ts`, `chat.test.ts`,
`models.test.ts` all grew or landed new this window).

**`npm audit` (prod-only, `--omit=dev`):** root **3** (1 moderate `dompurify` ≤3.4.12, 2 high
`react-router` 7.12.0–8.2.0 RSC CSRF bypass) — **unchanged** from 08-09, same two advisories, no
non-breaking fix for either (`npm audit fix --dry-run` confirms). Functions **13** (1 low, 9 moderate,
3 high, the `firebase-admin`→`google-gax`/`teeny-request`→`uuid` chain) — **unchanged**, same as every
prior cycle, no non-breaking fix available.

**Bundle:** 4,276.73 kB → **4,317.85 kB** (+41.12 kB), 1,273.33 kB → **1,286.21 kB gzip** (+12.88 kB gzip).
Checked against `package.json` diff (`def6010..origin/main` — **empty**, zero new dependencies this
window) — the growth is proportionate to the week's actual new modules (`liveDayEdit.ts` 514L,
`curriculumActions.ts` 303L, `dayItemActions.ts` 214L, `activityConfigWrites.ts` 199L, `watchLibraryFilter.ts`
135L, plus JSX growth across `PlannerChatPage.tsx`/`TodayChecklist.tsx`/`WatchLibraryTab.tsx`), not a
smoking gun for a stray heavy import.

**`npm run docs:check`:** HARD green. `[ledger-ids]` 246 rows unique. `[ledger-status]` **PASS — no ledger
row claims an open PR** (see Step 5 — this is the scripted check the last two audits recommended as their
top `PROMPT_FIX` candidate; it shipped as `DOC-13`, PR #1662 merged 2026-08-11, commit `f18f6b1`, and this
cycle's run confirms it live and green). SOFT
warnings unchanged in shape from every prior cycle: 2 `raw-refs` (`ArmorTab.tsx`, `DevAdminTab.tsx`, same
files as 08-09), 8 `remote-timeout-finally`, 1 `image-downscale`, plus the 97-swallowed-catch
`silent-fallback-census` (report-only). None of this window's diff touches any of those files.

**A one-time environment artifact, cleaned up, not a repo bug — but a real latent hazard, logged as ARCH-45
below.** This session's checks were initially confused by a local `functions/lib` build directory (created
by an earlier command run inside `functions/` in this same session, not present in a fresh checkout).
Root `vitest run` has **no path restriction** in `vite.config.ts`'s `test` block, so with `functions/lib`
present it silently picked up both `functions/src/**/*.test.ts` **and** the gitignored compiled
`functions/lib/**/*.test.js`, doubling functions' test execution against possibly-stale compiled JS. This
was removed (`rm -rf functions/lib`) before the baseline above was taken, which is clean. Separately and
not a bug: root `vitest run` has *always* included `functions/src/**/*.test.ts` in its 362/381-file count
(there is no `include` scoping it to `src/`) — that is long-standing, harmless, and not what ARCH-45 is
about; ARCH-45 is specifically the *local-build-artifact double-run* risk.

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

Unlike the last two (flat) cycles, this window shipped real surface area against all three lenses — see
Steps 2 and 4 for the actual traces, not a rubber-stamp re-affirmation.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — real movement this window, one headline

Full `find src functions/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn` re-run, filtered to
>1,500L:

| File | 2026-08-09 | 2026-08-16 | Δ |
|---|---|---|---|
| **`PlannerChatPage.tsx`** | **3,092L** | **3,412L** | **+320** |
| `records.logic.test.ts` (test) | 2,764L | 2,764L | +0 |
| `chat.ts` (CF) | 2,641L | 2,641L | +0 |
| `useQuestSession.ts` | 2,218L | 2,218L | +0 |
| `BookEditorPage.tsx` | 2,113L | 2,113L | +0 |
| `chatPlanner.logic.test.ts` (test) | 1,896L | 1,896L | +0 |
| `MyAvatarPage.tsx` | 1,876L | 1,876L | +0 |
| `dataReviewExport.logic.ts` | 1,713L | 1,713L | +0 |
| `WorkshopPage.tsx` | 1,623L | 1,623L | +0 |
| `contextSlices.ts` | 1,617L | 1,617L | +0 |
| `VoxelCharacter.tsx` | 1,606L | 1,606L | +0 |
| **`TodayChecklist.tsx`** | *(1,498L, below cutoff)* | **1,591L** | **+93 (crossed 1,500L)** |
| `useShellyChatActions.logic.test.ts` (test) | *(smaller)* | 1,565L | grew large |
| `chatPlanner.logic.ts` | 1,544L | 1,544L | +0 |

**ARCH-02 (`PlannerChatPage.tsx`) — the "stabilized vs. lull" question the last two audits were watching
is answered: it was a lull, not stabilization.** After two consecutive flat cycles at 3,092L (following a
4-cycle growth streak before that), the file grew +320L the moment real feature work resumed. **Root
cause, verified by reading the diff, not assumed:** this is FEAT-138 (live-week-edit — remove/move/swap a
video directly against saved day docs post-Apply), and — importantly — it is **not** more of the
"1,700L of interconnected wizard/chat/plan/apply state" CLAUDE.md's tech-debt note already flags as hard to
split. The underlying logic is already extracted (`useAppliedWeekDays` hook, `liveDayEdit.ts` at 514L,
`MoveToDayDialog.tsx`). What landed *in the page itself* is three new near-identical handlers
(`handleRemoveItem` expanded, new `handleMoveItemToDay`, `handleSwapWatchItem`, each: resolve row → call
the live-day write helper → mirror the local draft → snack-bar the outcome) plus JSX wiring for two
dialogs, at `PlannerChatPage.tsx:1975` (`handleRemoveItem`), `:2042` (`handleMoveItemToDay`), `:3358`+
(dialog wiring). **A concrete, clean extraction seam exists and wasn't there as obviously two cycles ago:**
a `useLiveDayEditHandlers(currentDraft, setCurrentDraft, applied, isParent, ...)` hook mirroring the
already-extracted `useAppliedWeekDays` pattern would pull an estimated ~230 of these 326 new lines out,
without touching the harder wizard/chat/plan/apply core. Not urgent — the file is still readable, and this
growth is qualitatively different (three parallel, near-identical handler blocks) from the tangled state
problem — but it's now the highest-leverage decomposition candidate in the file precisely because the seam
is this clean. **Recommend as next `PROMPT_FIX` candidate for ARCH-02** (extract the live-day-edit handler
trio, not a full page decomposition).

> **Follow-up (FEAT-150, 2026-08-17) — a DIFFERENT seam was taken, and this one is still open.**
> The FEAT-150 run extracted **Apply** (`handleApplyPlan`'s `WeekPlan` upsert + Mon–Fri day writes) into
> `planner-chat/applyWeekPlan.ts`, taking the page from 3,412L to 3,292L (**−120L**). That was forced by
> the feature rather than chosen from this audit: the chat had to apply a week, and the alternative to
> extracting was a second copy of a day-write — the shape of both audited compliance failures (FEAT-111,
> FEAT-114's P0). It was covered by 30 characterization assertions written before the move.
>
> **It is not the seam this section names.** The live-day-edit handler trio (`handleRemoveItem` /
> `handleMoveItemToDay` / `handleSwapWatchItem` → `useLiveDayEditHandlers`) is untouched and remains the
> recommendation above, with its ~230L estimate intact — the two extractions are independent regions of
> the file. Recorded here so the next `PROMPT_FIX` run against ARCH-02 doesn't read the −120L as this work
> already being done.

**`TodayChecklist.tsx` newly crosses 1,500L** (+93L from the 08-03 health report's 1,498L) — same live-week-
edit feature. Not yet flagged as a decomposition candidate; watch next cycle.

**ARCH-01/03/04/08/13/14 — unchanged, re-verified only** (`chat.ts`, `BookEditorPage.tsx`, `useQuestSession.ts`,
bundle/lazy-loading, `dataReviewExport.logic.ts`, `WorkshopPage.tsx` all byte-identical this window).

### 1.2 Bundle (ARCH-05) — proportionate growth, still zero code-splitting

Still zero `React.lazy`/`lazy(` anywhere in `src/app/router.tsx` (the only router file). `AvatarThumbnail.tsx`
still statically imports `three` (line 2) and is pulled into always-rendered nav chrome
(`AppShell.tsx`, `ContextBar.tsx`, `ProfileMenu.tsx`, `ChildSelector.tsx`). **ARCH-08 remains the concrete
prerequisite, unchanged.** Bundle +41.12 kB / +12.88 kB gzip this window is proportionate to real feature
work (see Step 0) — no disproportionate-growth flag. **Band 1, ARCH-05/ARCH-08, OPEN — unchanged.**

### 1.3 Test coverage (TEST-01) — narrower than previously stated, worth updating the description

- **`DispositionProfile.tsx`** — still zero direct test file anywhere in the repo. Unchanged.
- **`SkillSnapshotPage.tsx`'s inline writers** (lines 96, 115 — unmoved) — **partial coverage exists that
  the ledger's current wording doesn't reflect.** `SkillSnapshotPage.defaults.test.tsx` (pre-existing, not
  new this window) does mock `setDoc` and assert on its payload, but only for the **defaults-load path**
  (line 96, via the "Load Starter Defaults" button). The **general save/update path** at line 115 has no
  assertion anywhere. TEST-01 should read "defaults-load path covered, general update path still bare,"
  not "untested" — a real but smaller gap than previously described. Recommend narrowing the ledger
  wording next `PROMPT_FIX` touch (not urgent enough to force a standalone run).
- 18 new test files landed with this week's features (`activityConfigWrites.test.ts`,
  `curriculumActions.test.ts` 391L, `dayItemActions.test.ts` 340L, `liveDayEdit.test.ts` 590L,
  `ActionConfirmCard.test.tsx` 540L, `contentNote.test.ts`, `useScan.contentNote.test.ts`,
  `workbookScanReport.test.ts`, `useWatchHistory.test.ts`, `watchHistory.test.ts`,
  `watchLibraryFilter.test.ts`, `GenerateNowDialog.test.tsx`, `monthlyDraftWatch.test.ts`,
  `PlanDayCards.liveWeek.test.tsx`, `TodayChecklist.liveWeek.test.tsx`, `useChatActivityConfigs.test.ts`,
  `useChatWeekDays.test.ts`, `manualDayItem.test.ts`) — real behavioral coverage (write-guard refusal
  states, action parsing/resolution, retry/curation logic), not shell padding. **TEST-01 status: IMPROVING,
  same two named gaps still open but one is now partial rather than total.**

### 1.4 ARCH-12 re-verify — count correction (not new drift), invariant held

Re-grepping `setDoc\(snapshotRef|updateDoc\(snapshotRef` (and equivalent `skillSnapshots` doc refs) across
`src` (non-test) returns **9 files**, not the 3 the ledger's row currently names:
`useQuestSession.ts:1148,1168`, `EvaluateChatPage.tsx:622,625`, `SkillSnapshotPage.tsx:96,115`,
`useScanToActivityConfig.ts:277`, `backfillWorkingLevels.ts:235`, `backfillBlockIds.ts:91`,
`WorkingLevelsSection.tsx:167`, `useUnifiedCapture.ts:373`, `TodayChecklist.tsx:344`. **None of these 9
sites changed this window** — this is a pre-existing undercount in the ledger's row text, not new drift,
and it predates this audit series' scope-tightening. **The invariant itself held:** none of this week's
new files (`curriculumActions.ts`, `dayItemActions.ts`, `liveDayEdit.ts`) touch `skillSnapshots` or
`snapshotRef` at all (confirmed, zero hits) — `liveDayEdit.ts:314` even carries an explicit
capability-not-name discipline comment reinforcing the pattern this audit's Lens 2 checks for. Recommend
correcting ARCH-12's row text to the true 9-file scope on its next touch; not scoring this as new drift.

### 1.5 ARCH-43 (Lincoln name-literal sites) — unchanged, and new code reinforces the discipline

`grep -rln "toLowerCase() === 'lincoln'\|=== 'Lincoln'" src` (non-test): still **20 sites / 19 files**,
byte-identical to 08-09. All seven of this week's new name-gate-risk files
(`curriculumActions.ts`, `dayItemActions.ts`, `liveDayEdit.ts`, `manualDayItem.ts`, `dayWriteGuard.ts`,
`watchHistory.ts`, `useWatchHistory.ts`) were checked directly: **zero new name-gates.** The two incidental
hits are a docstring example string (`watchHistory.ts:93`) and an explicit anti-pattern comment
(`liveDayEdit.ts:314`, *"Capability, never a name: this is `isParent`, not 'is Lincoln'"*) — new code this
week is actively reinforcing Lens 2 rather than eroding it. **Band 1, ARCH-43, OPEN — unchanged, no
regression.**

### 1.6 ARCH-06 (WorkbookConfig → ActivityConfig) — unchanged, new work routed correctly

`rg -o -w 'WorkbookConfig' src functions/src -g '!*.test.*'`: **28 refs / 10 files**, identical to 08-09.
The week's new `src/core/firebase/activityConfigWrites.ts` (199L, extracted for FEAT-143 so a
non-component caller — the chat — can reach the same writes Progress → Curriculum uses) has **zero**
`WorkbookConfig` references — new work landed cleanly on the modern system without adding legacy coupling.
**Band 1, ARCH-06, OPEN — unchanged, no coupling increase.**

### 1.7 ARCH-17 (Node.js runtime) — 75 days out

`functions/package.json` still pins `"node": "20"`. Node 20 EOL 2026-10-30 is now **75 days** out (was 82
at 08-09). Local build environment remains Node 22 (`npm warn EBADENGINE` on `functions/npm ci`), so the
pin continues to lag the tooling actually in use. **Band 1, ARCH-17, OPEN — narrowing, not yet urgent.**

### 1.8 New finding — ARCH-45: root `vitest` has no path guard against `functions/lib`

See Step 0's baseline note. `vite.config.ts`'s `test` block has no `include`/`exclude` restricting it away
from build output. `functions/lib` is gitignored and absent from a fresh checkout, so this is **dormant
today**, but it is a real footgun the moment any dev or CI environment runs a `functions/` build (e.g. the
"Manual deploy" path in `CLAUDE.md`, which explicitly requires building functions first) before running
root tests — every functions test would then silently run twice, once from source and once from
possibly-stale compiled JS, inflating every future audit/health-report test count without any code change
to explain it. **Low severity, one-line mechanical candidate** (`test.exclude: [...defaults,
'**/functions/lib/**']` in `vite.config.ts`) — not applied here since it's a build-config change, not a
doc fix, per this audit's own scope rule. Logged as a new row, recommend for next `PROMPT_FIX` batch.

### 1.9 Drift catalog beyond the headline files

- **`functions/src/ai/tasks/shellyChat.ts`: 1,333L (+574 this window).** New capability, not sprawl: curriculum
  actions (add/finish/set-position) and live-day actions (remove/move item) added to the chat portal,
  `civilDateInZone`/`currentWeekDays` (family-timezone-aware week resolution — a real bug-class fix, see
  Step 2), `chatChecklistItemKey`. Each addition is a distinct, well-commented exported function. Now
  within ~1,300L of `chat.ts`, the current #1 functions file by size — worth a watch-list mention if it
  keeps growing at this rate, alongside `contextSlices.ts`.
- **`functions/src/ai/tasks/monthlyReview.ts`: 1,492L (+598 this window).** FEAT-146/147/148 reliability
  hardening for a real LLM-JSON fragility: retry-on-malformed-JSON, parse-failure diagnostics, wordless-book
  detection. Appropriately scoped hardening on a previously-fragile path, not undirected growth.

---

## Step 2 — Functional / UX Loop (Band 2)

Real surface shipped this window, so this is a genuine trace, not the flat-week rubber-stamp the last two
cycles could take.

### 2.1 FUNC-01 ("where is Lincoln") — no new authority conflict, one doc gone stale

The new Ask-AI curriculum-edit path (FEAT-143, `curriculumActions.ts`) adds a **third writer** to
`activityConfigs.curriculumMeta` (curriculum position) — the chat now writes it alongside planner setup
and certificate-scan (`useCertificateProgress`), routing through the same extracted central writers
(`core/firebase/activityConfigWrites.ts`) Progress → Curriculum already uses, so no new disagreement is
created. **`docs/review/DECISION_FUNC-01_source_of_truth.md:52`'s authority table is now stale** — its
"Written by (only)" column for curriculum position still reads "planner setup, certificate scan
(`useCertificateProgress`)" and doesn't list the Shelly-chat portal. Doc-only, no code risk. **New row
DOC-14 below** (not applied directly — this is prose in a decision doc, not a stat/index/nav-label
mechanical fix). FUNC-01 itself remains **RESOLVED-WITH-DECISION**, unaffected.

### 2.2 Loop integrity — traced two real paths, both terminate cleanly

**Ask-AI edit path (FEAT-142/143):** propose → confirm → write is clean and two-layered. Pure resolvers
(`dayItemActions.ts:130-168`, `curriculumActions.ts:148-191`) validate a proposal against **live** data
before a card is ever offered; a drop always carries a plain-language reason (`dayItemActions.ts:69-90`) —
no silent "confirm with a tap" promise that then fails. Writes route through the exact lanes the UI
already uses (`liveDayEdit.ts` writers, `activityConfigWrites.ts`), not a parallel path. Confirm-gating is
real: `stagePendingActions` never writes; the Firestore write happens only inside `applyChatAction`, on a
tap, behind a re-entry lock (`useShellyChatActions.ts:300-548,712-748`). Rows written this way feed back
into the loop normally — same shape, same hours math, same weekly-review visibility as any other checklist
row.

**Monthly-review retry/sanitizer fix (FEAT-146/147/148) — this is a genuine Lens-1 catch, not cosmetic.**
Before this window, a malformed or truncated AI response could reach **publish** as a blank evidence book
— commit `25422f0` is literally titled *"a wordless monthly book is a failure, not a publish."* That is a
kid's monthly evidence artifact silently failing to actually contain anything, exactly the failure mode
Lens 1 ("is every kid's work saved *and* state-labeled") exists to catch. The fix closes it in three
layers: an interior-quote-tolerant JSON sanitizer (both client and functions copies), a bounded one-shot
retry on parse failure or `max_tokens` truncation that never discards a usable first attempt, and — the
part that actually closes the loop — a threshold (`hasNarrativeText`/`countSectionsWithText`) that refuses
to write **any** book document when both attempts come back wordless, surfacing the failure to the parent
as a visible alert instead of a silent blank artifact. **Caught and fixed within the same week it was
reported live** (2026-08-13→08-15). No further action — flagging as a positive example of the loop
working as designed, and worth keeping as a reference case the next time a "silent partial success" bug
class shows up elsewhere (the ledger's FEAT-147 row explicitly names two prior instances of the same class
— the workbook "Registered to GATB Math" bug and the silent chat-card drop — so this is now a recognized,
named failure pattern with three known instances, not a one-off).

**One standing gap, already tracked, re-confirmed, not double-logged:** `FEAT-145` (OPEN, filed 2026-08-14)
— a confirmed live-day card (remove/move) vanishes instead of showing "Done," because the resolved row is
genuinely gone from the live week and the display path has no way to render a decided card without it.
The parallel curriculum-card version of this exact bug was fixed in FEAT-144; the live-day version was
deliberately deferred as "surgery on another feature's presenter, beyond a Codex-fix run." Still open,
still a good `PROMPT_FIX` candidate — not re-logged as a new row.

### 2.3 Today live-week-edit / `dayWriteGuard.ts` — guard extended, not loosened

`git diff def6010..origin/main -- src/features/today/dayWriteGuard.ts` shows only an export/rename
(`checklistKey` → `checklistItemKey`, shared with the new live-edit lane so "the row the chat meant" and
"the row the guard is watching" can't drift) — no refusal-logic change. Additive-hours invariant holds:
`liveDayEdit.ts` hard-refuses move/remove/swap on any row carrying credited `actualMinutes`
(`checklistItemEditLock`, lines 71-96), never edits `plannedMinutes`/`actualMinutes`, and a move is
append-target-then-remove-source with a deliberately surfaced `'duplicated'` half-failure state rather than
silent data loss (lines 434-481) — the file's own header explicitly disclaims hours math, and no new hours
computation exists outside the canonical `computeHoursSummary()` (confirmed via a repo-wide grep — no new
caller added this window). **DATA-01 holds; no regression.**

### 2.4 Shelly's path / no-shame check — clean on the new surfaces

Spot-checked the new `ActionConfirmCard.tsx` copy (+326L) and refusal wording: tap-only (Confirm/Dismiss,
no free-text required to act), and refusals read as neutral-to-positive rather than blaming — e.g. a
completed-row lock reads *"already did this one — finished work stays on its day"* (`liveDayEdit.ts:89-91`),
framing a lock as praise. No pace/pressure or scoring language found in either this file or the new
monthly-review retry copy (`GenerateNowDialog.tsx`) — see Step 3.

### 2.5 Kid voice-first — unchanged; new Watch surfaces confirmed parent-only

**FUNC-15** (`KidLabView.tsx`, 5 plain `TextField`s, zero voice wiring) re-confirmed unchanged — still
OPEN. The new Watch history/filter UI (`WatchVideoCard.tsx`, `WatchLibraryFilters.tsx`, `useWatchHistory.ts`)
is confirmed parent-only: consumed only inside `WatchLibraryTab.tsx`, and `/watch` sits behind
`<RequireParent />` in the router — no regression risk from this window's Watch work.

### 2.6 MO→TX lens — clean rule-out

None of this window's new files (`liveDayEdit.ts`, `workbookScanReport.ts`, `curriculumActions.ts`)
contain any `Missouri`/`'MO'`/`MO_` reference — explicitly ruled out, not skipped.

---

## Step 3 — Pedagogy & Ethos (Band 3)

This window touched AI-adjacent surfaces directly (`shellyChat.ts` +574L, `monthlyReview.ts` +598L,
`scan.ts` +58L), so this is a real check, not a quiet-week re-affirmation.

- **Pace/pressure language:** clean. `shellyChat.ts`'s new plan-adjustment handoff (letting a parent tell
  the chat to pull back next week) is explicitly parent-agency-respecting and non-pressuring — it triggers
  "even when the parent is not upset," grounded in observed signals (evaluation history, disposition,
  hours, coverage), never an implied deadline. No "behind"/"catch up"/"falling behind" language anywhere in
  either diff.
- **Diamonds-not-scores / no grading creep:** clean. Zero score/grade/rank/pass-fail/percent matches in the
  `ActionConfirmCard.tsx` (+326L) or `GenerateNowDialog.tsx` (+139L) diffs.
- **Charter preamble reach:** unchanged, still all **21** `CHAT_TASKS` registry entries wired
  (`functions/src/ai/tasks/index.ts:25-47`) — no new task type added this window.
- **No-shame monthly-review retry copy:** clean, and well-designed. The new timeout/retry UI is entirely
  non-blaming — *"Still working — the book will open when it's ready,"* *"We stopped waiting — this one is
  taking longer than we watch for. It may still finish on its own,"* — frames failure as a system/timing
  issue, never the child's or the book's fault, and deliberately renders a client-side timeout as a
  `warning`, not an `error`.

**No Band 3 findings this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, holds; new day-edit surface explicitly disclaims hours math

Both new day-editing files were read in full. `liveDayEdit.ts`'s module header states outright: *"No
hours math, no XP, no learner-model write, and no `plannedMinutes` on any block is ever changed."*
`manualDayItem.ts` is a pure, side-effect-free builder with a comment noting hours math reads
`estimatedMinutes ?? plannedMinutes` off a completed row and never branches on `source`. A repo-wide grep
for `computeHoursSummary` still resolves to the same canonical call sites as before this window — no new
file added to that list. **DATA-01 holds FIXED, no regression, no reopening needed.** Worth naming as a
positive pattern: the new code documents its own non-involvement in hours math at exactly the point a
future auditor would look for it.

### 4.2 DATA-02 — still NEEDS-DATA, now 46 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved; the 2026-07-01
dedupe-window freeze is now **46 days** overdue (was 39 at 08-09). Unresolvable from a repo-only audit —
still requires the owner to run the July dedupe pass against a live Firestore export. **Still the single
longest-standing item in the ledger, growing weekly.**

### 4.3 DATA-13 — unchanged, same lines

`records.logic.ts` untouched this window (only its test file grew) — the hardcoded `"Missouri Homeschool
Compliance Report"` title remains at lines **1099** and **1126**, unmoved. **Band 4, DATA-13, OPEN —
unchanged, same trivial 3-line fix candidate as every prior cycle.**

### 4.4 MO→TX lens — no new hardcoding

`grep -rln "Missouri\|'MO'" src/features/records src/core/compliance`, diffed against `def6010`, turns up
zero new matches in any changed file's diff hunks (`RecordsPage.tsx`, `ComplianceDashboard.tsx`,
`stateCompliance.ts` all changed elsewhere this window, but not with new MO-only literals). DATA-13 remains
the sole known instance.

### 4.5 Additive-hours invariant — holds (see 4.1 and Step 2.3)

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 DOC-13 (already MERGED, not this cycle's finding) confirms the recurring ledger-status gap is closed

The last two audits (08-02's `DOC-11`, 08-09's `DOC-12`) both found dozens of ledger rows stuck at stale
"PR open"/"do not merge" status after their PRs had actually merged, and both explicitly recommended
building a scripted check rather than repeating the manual sweep a fourth time. That recommendation was
built and merged as **`DOC-13`** (PR #1662, merged 2026-08-11, two days after the last audit — already in
the ledger before this cycle started, not a new finding here) — `docs:check`'s `[ledger-status]` rule,
branch-aware (HARD on `main`, SOFT on feature branches so a run's own in-progress row doesn't fail its own
PR's check). This cycle's `docs:check` run **confirms it live and green: PASS — no ledger row claims an
open PR.** No new stale-status rows found this cycle — the three-cycle recurring defect class (`DOC-11` →
`DOC-12` → `DOC-13`) is closed. Noted here for the record; no ledger action needed.

### 5.2 New rows added this cycle

Two new rows, both low severity, both proposals (no structural/code fix applied):

- **`ARCH-45`** — root `vitest` has no path guard against `functions/lib` (gitignored build output); if
  present locally, functions tests silently double-run against possibly-stale compiled JS. Dormant today,
  real footgun the moment a local/CI environment builds `functions/` before running root tests. One-line
  `vite.config.ts` fix candidate. See Step 1.8.
- **`DOC-14`** — `docs/review/DECISION_FUNC-01_source_of_truth.md:52`'s curriculum-position "Written by
  (only)" column is stale: doesn't list the new Shelly-chat portal (FEAT-143, confirm-gated) as a third
  writer alongside planner setup and certificate-scan. Doc-only, no code risk. See Step 2.1.

### 5.3 Re-verified existing rows (status updates, no new IDs)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| **ARCH-02** | OPEN (flat 2 cycles, "stabilized vs. lull" undecided) | **OPEN — resumed growth, +320L this window (3,092→3,412L); answers the question: it was a lull.** Concrete extraction seam identified (live-day-edit handler trio, ~230L). Recommend as next `PROMPT_FIX` target. | see 1.1 |
| ARCH-01, 03, 04, 08, 13, 14 | OPEN | OPEN, unchanged | 0L growth on every one |
| ARCH-05 | OPEN | OPEN, unchanged — bundle growth proportionate to real feature work | |
| **ARCH-06** | OPEN (28 refs/10 files) | OPEN, unchanged — new work (`activityConfigWrites.ts`) added zero `WorkbookConfig` coupling | |
| **ARCH-12** | OPEN ("3 files" in row text) | **OPEN — actual current scope is 9 files (pre-existing undercount in row text, not new drift); invariant held, zero new inline writers this window** | see 1.4, recommend correcting row text next touch |
| ARCH-17 | OPEN (82 days to Node 20 EOL) | OPEN — 75 days, narrowing | |
| ARCH-43 | OPEN (20 sites/19 files) | OPEN, unchanged — new code reinforces capability-gating discipline | |
| **TEST-01** | IMPROVING (both gaps fully untested) | **IMPROVING — `SkillSnapshotPage.tsx` gap now partial (defaults-load path covered, general update path still bare); `DispositionProfile.tsx` still fully untested** | see 1.3 |
| FUNC-01 | RESOLVED-WITH-DECISION | unchanged; one doc (`DECISION_FUNC-01_source_of_truth.md`) now stale re: writer list — see DOC-14 | |
| FUNC-15 | OPEN | OPEN, unchanged | |
| **FEAT-145** | OPEN (filed 08-14) | OPEN, unchanged — re-confirmed, not re-logged | |
| DATA-01 | FIXED | FIXED, re-verified against two new day-editing files | |
| DATA-02 | NEEDS-DATA (39 days overdue) | NEEDS-DATA, now **46 days overdue** | |
| DATA-13 | OPEN (lines 1099/1126) | OPEN, unchanged | |

### 5.4 Mechanical doc fixes applied directly this cycle

- `docs/MASTER_OUTLINE.md` stats block: TypeScript lines 247,120 → **262,479** (computed, verified
  methodology-consistent with the prior figure); Test files 362 → **381** (root `vitest run` count).
  Commits left unchanged (still unverifiable — this session's clone is also shallow; see below).
  Firestore collections (48), Cloud Functions (29), Chat task types (21), Routes (36) all re-verified
  correct, no change.
- `docs/DOCUMENT_INDEX.md`: added this report's row, flipped `ARCHITECTURE_AUDIT_2026-08-09.md`'s entry
  from **CURRENT** to **HISTORICAL**.
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-08-16, added this report to the
  audit chain; ledger gets **+2 rows / −0** (`ARCH-45`, `DOC-14`), no row reordered, deleted, or reopened.

**Note on "Commits":** this session's clone is also shallow (same class of artifact the 08-03 health report
flagged); `git rev-list --count HEAD` is not ground truth here either. Left at 219, unchanged, consistent
with the last several cycles' practice of not replacing one unreliable number with another.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 5,503/5,503 tests; functions:
clean lint/tsc, 840/840 tests; build clean, bundle 4,317.85 kB/1,286.21 kB gzip +41.12 kB — proportionate to
a real feature week; `npm audit` unchanged on both sides; `docs:check` HARD green, including the newly-live
`[ledger-status]` check). **Top 3 findings by leverage:** (1) `ARCH-02` (`PlannerChatPage.tsx`) resumed
growth after two flat cycles (+320L, 3,092→3,412L) with a clean, concrete extraction seam now visible — the
live-day-edit handler trio (~230L), not the harder wizard/chat/plan/apply core; (2) the monthly-review
pipeline shipped three successive fixes this week (FEAT-146/147/148) closing a genuine Lens-1
evidence-integrity gap — a malformed or truncated AI response could previously reach *publish* as a blank
kid evidence book, now caught and refused with an honest parent-facing message; this is the third named
instance of a "silent partial success" bug class worth watching for elsewhere; (3) `DATA-02`'s dedupe
freeze window is now 46 days overdue with no owner action, still the longest-standing item in the ledger.
**Recommend running `PROMPT_FIX.md` next against:** `ARCH-02`'s newly-identified extraction seam (concrete
and scoped, unlike prior cycles' "decompose the whole file" framing), then `DATA-13` (trivial 3-line fix,
unchanged from every prior cycle's recommendation), then `ARCH-45` (one-line `vite.config.ts` test-exclude,
prevents a latent double-test-run footgun before it bites a future audit's numbers).
