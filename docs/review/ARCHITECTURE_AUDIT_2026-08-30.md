# Architecture Audit — 2026-08-30

> **Type:** Monthly deep audit (scheduled run, fired 2026-08-30 — 7 days after the 2026-08-23 run;
> cadence in practice continues to run roughly weekly in this series).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-08-30
> **Branch:** `claude/brave-feynman-tyxtey` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-08-23.md` (merged as PR #1697, commit `4636cdc`)
> **Window covered:** 2026-08-23 → 2026-08-30 (7 days, `origin/main` at `fc93f35`, 53 commits since
> `4636cdc`). A real feature week: **113 files changed, +11,216 / −602 lines** (103 of those files under
> `src/`+`functions/src/`, +10,948/−414). Headline: the Dad Lab chat arc shipped its "no substitution"
> hardening (FEAT-157 — closing a live production incident where the chat faked a write of the wrong
> kind), three UX audit fix batches landed (FEAT-158/159 sketch cleanup, FEAT-161 computed-copy guards,
> FEAT-162 the two P1 write-honesty bugs), a stickers-surface pass (FEAT-160), and a two-part hours/
> evidence-completeness fix to the monthly review book (FEAT-163/164) that is this cycle's most
> consequential change — see 1.9 and 4.1. One PR is open against `main` outside this audit's branch:
> **#1713** (`FEAT-165`/`UX-95`, sticker art-quota guard) — not yet merged, not in this window's diff,
> noted for completeness only.

---

## Step 0 — Baseline

```
git fetch --unshallow                 → repo was shallow (199 commits visible); unshallowed to 3,129
npm ci (root)                         → fresh container, 0 → clean install
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b (via npm run build)        → CLEAN
npx vitest run                        → 6,342 tests passing (421 files), 0 failing, 0 skipped
cd functions && npm ci                → fresh container, 0 → clean install
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 1,064 tests passing (41 files), 0 failing, 0 skipped
npm run build                         → dist/assets/index-*.js  4,362.99 kB │ gzip: 1,301.48 kB
npm run docs:check                    → HARD green, 11 SOFT warnings (all pre-existing, see below)
```

**Baseline: GREEN.** Fresh container, no `node_modules` at session start for either `npm ci` — same
one-time environment artifact as every prior cycle, not a repo defect. No flakes observed.

Root tests: **397 → 421 files (+24), 5,934 → 6,342 tests (+408)** since the 2026-08-23 audit baseline.
Functions: **39 → 41 files (+2), 976 → 1,064 tests (+88)**. Consistent with a genuine feature week that
shipped tests alongside every fix (this codebase's standing norm, re-confirmed again this cycle).

**`npm audit` (prod-only, `--omit=dev`) — still zero on both trees, second consecutive cycle.** Root:
**0 vulnerabilities**. Functions: **0 vulnerabilities**. Full-audit (including dev deps) counts are
unchanged from 08-23: root 9 (1 low, 8 moderate, `uuid`/`gaxios`/`google-gax` transitive chain, `--force`
required), functions 2 moderate (`ts-deepmerge` via `firebase-functions-test`, `--force` required). No new
dependency debt this window.

**Bundle:** 4,340.19 kB → **4,362.99 kB** (+22.80 kB), 1,293.00 kB → **1,301.48 kB gzip** (+8.48 kB gzip)
since the 08-23 audit baseline — modest growth, proportionate to a week with several real feature
additions (sketch cleanup, sticker rename, Dad Lab chat arcs) rather than a new heavy dependency.
`grep -n "React.lazy\|lazy("  src/app/router.tsx` still returns zero matches — **ARCH-05/ARCH-08
unchanged, zero code-splitting.**

**`npm run docs:check`:** HARD green. `[ledger-ids]` **292 rows** (was 278 at 08-23; +14, all additive,
all unique). `[ledger-status]` PASS. SOFT warnings unchanged in shape and **count** from every prior
cycle: 2 `raw-refs` (`ArmorTab.tsx`, `DevAdminTab.tsx`), 8 `remote-timeout-finally`, 1 `image-downscale`,
and the `silent-fallback-census` still at **97 swallowed catches across 54 files** — byte-identical to
08-23 despite 103 changed files, meaning this window's fixes (see 2.3–2.5) closed as many silent-catch
sites as they touched, net zero, rather than adding new ones. `MakeStickerDialog.tsx`'s two open
`catch {}` sites (`UX-92`/`UX-93`, filed by this same window's own FEAT-160 walk) are inside that 97 and
are the reason it isn't lower — see 2.6.

---

## Step 0.5 — Audit lenses carried forward

Per `docs/PROCESS_OVERVIEW.md`, three lenses apply across every step below:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window's headline changes (FEAT-157, FEAT-163/164) are direct Lens-1 hits — one closes a real
"the AI faked a write" incident, the other closes a real "the record and the narrative disagree" defect
in the one document meant to summarize the record for a parent.

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — full ≥1,500L listing, judged; no new decomposition candidates crossed a threshold

Full `find src functions/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn`, filtered to every
production file ≥1,500L (test files excluded — `records.logic.test.ts` 2,891L (+127),
`useShellyChatActions.logic.test.ts` 2,670L (+253), `shellyChat.test.ts` 2,266L (+0),
`chatPlanner.logic.test.ts` 2,166L (+0) all cross the line but are test files, not decomposition
candidates):

| File | 2026-08-30 | Δ since `4636cdc` (08-23) | Judgment |
|---|---|---|---|
| `PlannerChatPage.tsx` | 3,295L | **+0** | Tangled — ARCH-02, OPEN, unchanged. File not in this window's diff at all. See 1.2. |
| `functions/src/ai/chat.ts` | 2,641L | +0 | Cohesive-but-big — ARCH-01, OPEN, unchanged. |
| `src/features/quest/useQuestSession.ts` | 2,218L | +0 | Tangled — ARCH-04, OPEN, unchanged. |
| `src/features/books/BookEditorPage.tsx` | 2,113L | +0 | Cohesive-but-big — ARCH-03, OPEN, unchanged. |
| `functions/src/ai/tasks/shellyChat.ts` | **1,938L** | +0 (grew to this figure between 08-23 and 08-24, per the 08-24 health report; flat since) | **Watch-list, now 62L from the 2,000L auto-flag threshold used elsewhere in this series.** See 1.3. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,876L | +0 | Cohesive-but-big — CLAUDE.md tech-debt note, unchanged. |
| `src/features/records/dataReviewExport.logic.ts` | 1,712L | −1 | Tangled — ARCH-44, OPEN, unchanged. One-line de-dup (see 1.8), not growth. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623L | +0 | Cohesive-but-big, not urgent. |
| `functions/src/ai/contextSlices.ts` | 1,617L | +0 | Tangled — ARCH-14, OPEN, unchanged. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606L | +0 | Leave as-is per CLAUDE.md — Three.js render loop. |
| `src/features/today/TodayChecklist.tsx` | 1,597L | +5 | Watch-list, unchanged status — flat, no seam identified. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,544L | +0 | Cohesive-but-big, no new candidate. |

**No file crossed 1,500L for the first time, and no file already over the line grew materially.** The
window's real growth landed in files still under the table's cutoff — see 1.3 and 1.9.

### 1.2 ARCH-02 (`PlannerChatPage.tsx`) — untouched this window; recommendation stands for a third cycle

`git diff 4636cdc..HEAD --stat -- src/features/planner-chat/PlannerChatPage.tsx` is **empty** — zero
commits touched this file this window. The 08-16 and 08-23 audits both named the live-day-edit handler
trio (`handleRemoveItem`/`handleMoveItemToDay`/`handleSwapWatchItem`) as the next clean seam; re-confirmed
still inline at the same line numbers (`:1960`, `:2027`, `:2101`). **Unchanged recommendation, now going
into its third cycle unaddressed** — this is the most stable, most-repeated `PROMPT_FIX` candidate in the
ledger and still hasn't been run.

### 1.3 `functions/src/ai/tasks/shellyChat.ts` — flat this window, but the watch-list call was correct

Zero commits touched this file between `4636cdc` and `HEAD` (confirmed via `git log`), so the +219L growth
the 08-23/08-24 reports flagged was entirely absorbed before this window opened; it did not continue. At
**1,938L it remains 62L from the 2,000L line** this report series treats as an auto-flag threshold for
production files. **Not yet a decomposition candidate. Standing recommendation unchanged: name it in
CLAUDE.md's Known Technical Debt list the moment it crosses 2,000L** (per the 08-24 health report's own
recommendation — still not actioned, and still correctly deferred since the file hasn't crossed).

### 1.4 Bundle (ARCH-05) — modest growth, still zero code-splitting

+22.80 kB / +8.48 kB gzip since 08-23 (see Step 0). `AvatarThumbnail.tsx` still statically imports `three`
into always-rendered nav chrome (unchanged). **Band 1, ARCH-05/ARCH-08, OPEN — unchanged.**

### 1.5 Test coverage (TEST-01) — same two gaps, unchanged

- **`DispositionProfile.tsx`** — still zero dedicated test file. Unchanged, not touched this window.
- **`SkillSnapshotPage.tsx`'s `persist` function** (now line 110, was 115) — re-confirmed still untested;
  `SkillSnapshotPage.defaults.test.tsx` still asserts only the defaults-seed branch. File not touched this
  window. **TEST-01 status: unchanged.**
- New test files landed with this window's features, consistent with the "tests ship with the feature"
  norm: `dadLabReportArtifacts.test.ts` (new, 150L), `monthlyReviewData.test.ts` (+240L then +51L then
  +84L across three FEAT-163/164 commits), `monthlyHours.test.ts` (new, paired with the new production
  file), plus assertions added directly inside existing suites for the UX Batch B/C fixes.

### 1.6 ARCH-06 (WorkbookConfig → ActivityConfig) — unchanged

`grep -rn -w 'WorkbookConfig' src functions/src --include=*.ts --include=*.tsx | grep -v '.test.'`: **28
refs / 10 files**, identical to 08-23. No file in this window's diff references `WorkbookConfig`. **Band
1, ARCH-06, OPEN — unchanged.**

### 1.7 ARCH-43/ARCH-46 (Lincoln/London name-literal census) — count unchanged, no new name-gating found

Narrow census (`toLowerCase() === 'lincoln'` / `=== 'Lincoln'` / `=== 'London'`, non-test): **20 sites /
19 files**, byte-identical to 08-23. Of the three files with a match that this window's diff also
touched (`useShellyChatFlows.ts`, `ExplorerMap.tsx`, `TodayChecklist.tsx`), **none of the diffs add a new
name-comparison line** — `ExplorerMap.tsx` adds a new `weekWrapped` copy branch that reuses the
pre-existing `isLincoln`/`isLondon` booleans (unchanged lines) to pick between "biome"/"dino"/generic-"day"
flavor text, and now includes a **neutral fallback branch for a hypothetical third child** it didn't have
before — a small improvement in the capability-not-name direction, not a regression. This is cosmetic
copy variation (permitted per CLAUDE.md — "cosmetic/personality, not access"), not a capability gate.

**ARCH-46** (last cycle's methodology proposal — broaden the grep to catch the two-step
`const lower = x.toLowerCase(); if (lower === 'lincoln')` shape and lowercase object keys, confirmed
present in `LabReportForm.tsx`) is still **OPEN, not executed** — a quick broadened pattern this cycle
produced too many false positives (generic `.toLowerCase()` calls, unrelated lowercase object keys like
theme tokens) to trust without the careful hand-tuning the proposal calls for. Recommend it stay a
dedicated single-purpose `PROMPT_FIX` run rather than a rushed inline pass. No status change.

### 1.8 ARCH-44 (`dataReviewExport.logic.ts`) — one line shrank via legitimate de-dup, not drift

The file's own `reportOwnedArtifactIds` is now a one-line alias (`export const reportOwnedArtifactIds =
reportArtifactIds`) onto the shared `dad-lab/reportArtifacts.ts` helper instead of a second inline
implementation — closing a small piece of the same duplication class named in 1.9, in the direction of
less duplication rather than more. ARCH-44 itself (the file's size/shape) is unaffected — still a
1,100-line `computeIntegrityChecks` function, unchanged, OPEN.

### 1.9 NEW — `functions/` ↔ `src/` cannot-import wall has now produced its third and fourth pure-logic duplications, two of them protecting DATA-01/DATA-04

**Finding, new this cycle: ARCH-47.** `functions/tsconfig.json`'s `rootDir: "./src"` plus its
`moduleResolution: "node16"` mean `functions/` code can never import from the app's `src/` tree (measured
twice this window, independently, against the same import — see both `monthlyHours.ts`'s and
`dadLabReportArtifacts.ts`'s own header comments). CLAUDE.md already documents one instance of the
resulting pattern (`sanitizeJson`, "deliberate duplication... TODO: consolidate"). This window adds two
more, both landed with real discipline (verbatim ports, parity-fixture tests pinning both copies
together, explicit "do not improve it here" comments) but both **higher-stakes** than the JSON parser:

- **`functions/src/ai/tasks/monthlyHours.ts`** ports `collectHoursContributions` + two helpers from
  `src/features/records/records.logic.ts` — the function whose own header calls itself *"the SINGLE
  source of truth for how a day log converts into counted minutes… so the two can never diverge
  (DATA-01)."* There are now two implementations of that single source of truth, hand-kept in lockstep by
  a test fixture repeated verbatim in both suites, not by the compiler.
- **`functions/src/ai/tasks/dadLabReportArtifacts.ts`** ports `dad-lab/reportArtifacts.ts` (the
  UX-85 "what's on this report" union) — the same rule the lab cards and `dataReviewExport.logic.ts`
  already shared as one definition (1.8) now has a third copy across the `functions/` wall.
- `monthlyHours.ts` also inline-ports `deriveChildIdFromDocId` from `src/core/utils/docId.ts` (a fourth,
  smaller instance of the same pattern, same file).

**Why this is a Band-1-with-Band-4-lens finding, not a nitpick:** FEAT-163's own commit message names its
own bug as *"the third occurrence of the UX-85 bug"* — the same evidence-completeness rule has now been
independently wrong three times because it was independently implemented three times. The wall is a real,
measured TypeScript constraint (TS6059 + TS2835), not an oversight, so the fix isn't "just import it" —
but with two of these ports now touching exactly the invariants CLAUDE.md names as propose-and-confirm
(compliance/hours math, and the evidence-completeness rule a real incident already broke once), the
current mitigation (tests, not the type system) is worth a structural look: e.g. a small directory both
`tsconfig.json`s can resolve without violating `rootDir`/`moduleResolution` (a shared package, or relaxing
`functions/tsconfig.json`'s `rootDir` to a common ancestor with an explicit `include`), so a future edit to
one of these rules fails to *compile* instead of relying on a test author remembering the parity fixture
exists. **Proposal only — not attempted here**, since it would touch the functions build configuration and
every file under it; recommend a dedicated, isolated `PROMPT_FIX`/design-chat pass to scope the TS
configuration change before touching any of the four duplicated files.

### 1.10 ARCH-17 (Node.js runtime) — 61 days out

`functions/package.json` still pins `"node": "20"`. Node 20 EOL 2026-10-30 is now **61 days** out (was 68
at 08-23). **Band 1, ARCH-17, OPEN — narrowing, not yet urgent.**

### 1.11 Drift catalog beyond the headline files

Every non-test file whose net line count moved >150L since `4636cdc`:

| File | Δ | Note |
|---|---|---|
| `src/features/books/cleanSketch.ts` | **+586** (319→905) | FEAT-158/159 sketch-cleanup pipeline (background removal, island removal, contrast boost, autocrop). Read in full: a cohesive set of small, single-purpose pure image functions, not tangled — a fast-growing feature module, not a decomposition candidate at 905L. Flagged here per the audit's "any file that grew >150L" rule, not as a structural problem. |
| `functions/src/ai/tasks/monthlyHours.ts` | +371 (new file) | See 1.9 — new, appropriately extracted rather than grown inline. |
| `src/features/shelly-chat/useShellyChatActions.ts` | **+242** (1,112→1,354) | Third consecutive cycle of fast growth on this file (943→1,112→1,354 over the last three windows, ~150–250L/week). Still below the 1,500L table cutoff but the trend line is the same shape ARCH-13/ARCH-02 showed before they became decomposition candidates. **Worth a standing watch-list line, same treatment as `shellyChat.ts` in 1.3.** |
| `src/features/shelly-chat/dadLabActions.ts` | +228 (new file) | FEAT-157's chat dad-lab action writer — appropriately its own module, not grown into an existing file. |
| `functions/src/ai/imageTasks/enhanceSketch.ts` | +187 (291→478) | FEAT-158/159 sketch cleanup, functions side. Still small. |
| `src/features/shelly-chat/parseChatActions.ts` | +154 (543→697) | FEAT-157's `createConceptArc`/`planLab` action parsing. Still small. |

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FUNC-01 ("where is Lincoln") — decision doc is stale again, one day after it was made current

`docs/review/DECISION_FUNC-01_source_of_truth.md` (last touched 2026-08-22, closing `DOC-14`) predates
FEAT-157, which shipped the very next day (2026-08-23) and added **two new Shelly-chat-portal
execution-record writers** the decision doc's own "Execution-record stores the portal can now write"
section does not mention: `createConceptArc` (writes `conceptArcs`) and `planLab` (writes `dadLabReports`,
Planned-only). Grepped the decision doc directly for `conceptArcs` and `dadLabReports` — **zero hits**.
This is the same shape of gap DOC-14 closed for `weeks`/FEAT-150 one cycle ago, recurring because a
feature shipped in the gap between the doc being made current and this audit running. **New row `DOC-17`
below** (doc-currency proposal, no code change) — recommend adding the two rows in the same style as the
existing `weeks`/`watchLibrary` entries. FUNC-01 itself remains **RESOLVED-WITH-DECISION**; only its
supporting doc has drifted.

### 2.2 FEAT-157 (Dad Lab chat arc, "no substitution") — closes a real production incident, traced end to end

**The incident (2026-08-23, Nathan, screenshots):** asked to push a Dad's Lab concept arc via Ask AI —
which had no arc-writing action at the time — the model first described the arc in prose with no card,
then, challenged, emitted the nearest card it *did* have (a curriculum activity named "Dad's Lab:
micro:bit"), which was confirmed and wrote a real record of the wrong kind. This is worse than a refusal:
a real write, silently the wrong shape. **The fix has two independent layers**, both confirmed present in
the tree: (1) a `NO_SUBSTITUTION_RULE` in the base role, both branches ("if the parent asks for a write
you do not have an action for, say so and name the real screen; never approximate it with a different
action kind"), asserted in the built prompts and pinned by a regression-shaped test; (2) two new
confirm-gated `ChatAction` kinds (`createConceptArc`, `planLab`) so the specific gap that caused the
incident no longer exists. Both `createArc`/`plannedLab.ts` are the same extracted, single-lane-two-caller
shape as the `watchDayItem`/`applyWeekPlan` pattern this series has repeatedly praised — confirmed via
`git show` on `1b5271f` ("extract the arc-create and planned-lab write lanes for a second caller"). A
follow-up fix (`c6fb7f7`) closes a two-turn edge case (a just-proposed arc has no `arcId` yet for a
same-turn lab suggestion) — caught and fixed within the same window, not carried as a gap. **No new
name-gating**: `planLab` explicitly ships with no `childIds` field, documented as a deliberate omission
("labs are whole-family... a field the write cannot honor must not appear on the card") rather than an
oversight.

### 2.3 FEAT-161 (UX Batch B, "computed-copy guards") — one bug class, ten faces, fixed as a class

The named indictment (`UX-07`, P1): `TodayChecklist` had no `isToday`/`selectedDate` prop at all, so its
finish-time estimate computed off the raw wall clock regardless of which day was being viewed — 21:05 on a
past day's checklist could render a clock time in the small hours. Fixed by making `isToday` a required
prop and extracting the whole computation into one pure guard (`dayProgressLabels.ts` →
`buildFinishLabel`): a clock time renders only for the actual current day, before a fixed cutoff hour, on
the same civil day; otherwise an honest duration (`~2h 10m left`) or a resolved state (`· All done`).
Genuinely closes a Lens-1 concern (a parent glancing at a past or future day's checklist and being told a
believable but meaningless clock time) with a TZ-pinned test suite, not a spot-fix.

### 2.4 FEAT-162 (UX Batch C, "the two P1s about writes") — the safety budget was inverted, now isn't

`CurriculumTab`'s overflow "Remove" called `deleteConfig`/`deleteDoc` with **no confirmation and no undo**,
while the reversible "Mark as complete" two rows above it required a full confirm dialog — exactly
backwards, and the one surface exempted from the codebase's own stated stance
(`activityConfigWrites.ts:13-15`: *"No delete here, on purpose … retire, don't delete"*). Now reads
"Delete permanently" in error color behind a same-weight confirm dialog that names what goes, what stays,
and the gentler alternative; a rejected delete now says so instead of silently doing nothing (closing
another instance of the UX-83 failure shape). Confirmed as a genuine write-honesty fix, not a copy change.

### 2.5 FEAT-160 (Stickers surface) — real fixes shipped, but the walk's own two P1 findings are still open

FEAT-160 fixed a real default-name bug (`UX-91` — a drawing's default name was frozen at the wrong child
at mount) and a background-removal edge case ("the carpet sliver"). **But the same walk that shipped these
fixes also filed `UX-92` and `UX-93` against `MakeStickerDialog.tsx` in the same file, and neither is
fixed yet** — re-confirmed present at the exact lines the ledger cites (`handleUseGenerated:114`,
`handleConfirmTagging`'s `catch {}` at `:137-139`). This is not a regression — the walk correctly filed
what it didn't fix rather than silently leaving it undocumented — but it means one file now carries a
finished UX-91 fix sitting directly above two open P1 write-honesty gaps of the exact shape FEAT-158/162
just fixed elsewhere. Good candidate for the next UX fix batch. Not re-logged (already OPEN, unchanged).

### 2.6 Loop integrity — traced FEAT-163/164's fix end to end; holds, and demonstrates the invariant discipline working as designed

**The defect:** the monthly review book's hours narration (`functions/src/ai/tasks/monthlyReviewData.ts`
→ `loadHoursForMonth`) summed the `hours` collection alone, while the Records page has always computed the
figure through `collectHoursContributions`'s three additive sources plus the DATA-09 attribution filter
and DATA-14 partial-day rule. Concretely: Lincoln's August book said 34.7 hours where the app said 50.0 —
and because the shortfall was per-subject, the book could also name the wrong subject as the month's
biggest. **The process, not just the fix, is the finding worth naming:** FEAT-163 found this gap and
*correctly declined to close it* — `CLAUDE.md` makes hours math propose-and-confirm, so it wrote the
options into the PR body instead of changing behavior. Nathan decided the next day (2026-08-29 — *"I don't
see why we wouldn't consider all the hours"*), and only then did FEAT-164 ship the fix, as a verbatim port
of the existing, already-invariant-protected rule (see 1.9 for the duplication cost of that port). This is
the propose→confirm→write discipline for invariant-touching changes working exactly as `CLAUDE.md`
specifies, on the highest-stakes possible target (compliance hours math) — a strong positive data point,
not just a bug-fix to log. A same-window Codex follow-up (`f0294ed`) caught a second real gap (legacy
`days` docs with no `childId` field were being silently dropped from the month's count) before it shipped,
confirmed via `git show`. Verified: `loadHoursForMonth`/`monthlyHours.ts` contain **zero** `setDoc`/
`addDoc`/`updateDoc` calls — this is a read-only aggregation fix for a generated document, not a write to
any compliance-critical collection. **DATA-01 holds, and is now honored by a third consumer, not just the
original two.**

### 2.7 FUNC-15 (kid voice-first) and FEAT-145 (live-day card vanishes) — both unchanged, not touched this window

`KidLabView.tsx` (FUNC-15) not in this window's diff. `today/liveDayEdit.ts` and no
`useLiveDayEditHandlers` file exist (FEAT-145) — not in this window's diff either. Both re-confirmed OPEN,
not re-logged.

### 2.8 MO→TX lens — one file touched, and it's a de-dup in the safe direction

`src/features/records/dataReviewExport.logic.ts` and `records.logic.ts` both appear in this window's diff
(see 1.8 and 4.2) but neither change touches Missouri-specific logic — one is a pure de-dup onto an
existing shared helper, the other is a doc-comment addition. `Missouri`/`'MO'`/`MO_` hits remain confined
to the same four files as every prior cycle.

---

## Step 3 — Pedagogy & Ethos (Band 3)

- **Pace/pressure language:** clean. Every `fail`/`failure`/`behind` hit added this window is system/save
  -honesty copy ("a failed Save says so", "the failure is no longer silent") in the FEAT-158/161/162 write
  -honesty theme, or test/comment prose about avoiding blame language — none is kid-facing shame copy.
- **Diamonds-not-scores / no-shame:** clean, plus one more instance of the pattern the 08-23 audit praised
  as a positive trend: `PatternSummary.tsx` (part of FEAT-161) removes a bare `0%` from a kid-facing wall
  ("Zero is absence, not a grade: the percent is dropped...") — the same `UX-49` no-shame rule this series
  has now seen fixed and re-verified across two different surfaces.
- **Charter preamble reach:** unchanged — `functions/src/ai/tasks/index.ts` (the `CHAT_TASKS` registry)
  has zero diff this window, still all **21** task types wired. `docs/SYSTEM_PROMPTS.md` changed (+32/−17,
  the already-ledgered `DOC-16` AI-docs↔code sync) but the registry itself didn't move.
- **No-shame kid-facing copy (FEAT-157/158/162):** the Dad Lab "no substitution" copy, the sketch-cleanup
  changes, and the Curriculum delete-confirmation copy are all system/parent-facing honesty language, not
  kid-facing at all — consistent with prior cycles' findings on this class of change.

**No Band 3 findings this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, holds, and its protected rule now has a third guarded consumer

See 2.6 for the full trace. `computeHoursSummary` callers (non-test, repo-wide): `RecordsPage.tsx:366`,
`dataReviewExport.logic.ts:1211` — same two call sites as every prior cycle, no new caller of the
app-side function. The new third consumer (`functions/src/ai/tasks/monthlyHours.ts`) is a verbatim,
test-pinned port rather than a new caller of the original — see 1.9 for the duplication this creates as a
standing architecture risk, orthogonal to whether the rule itself still holds (it does). **DATA-01 holds
FIXED, no regression; scope of what it protects has grown, not shrunk.**

### 4.2 DATA-02 — still NEEDS-DATA, now 60 days past the freeze window

The 2025-07-15/2025-08-15 suspected duplicate `hoursAdjustments` batches remain unresolved; the
2026-07-01 dedupe-window freeze is now **60 days** overdue (was 53 at 08-23). Still requires the owner to
run the dedupe pass against a live Firestore export — unresolvable from a repo-only audit. **Now in its
ninth week as the single longest-standing item in the ledger.**

### 4.3 DATA-13 — unchanged, 4 sites, only line numbers shifted

`records.logic.ts:1109, 1136, 1183, 1213` (was `1099, 1126, 1173, 1203` at 08-23 — a flat +10-line shift
from the doc-comment addition in 1.8, not new occurrences). Same four plain-string Missouri literals in
the same template-literal HTML builder function. Still the same trivial, low-risk parameterization fix.

### 4.4 MO→TX lens — no new hardcoding (see 2.8)

### 4.5 Additive-hours invariant — holds, see 4.1/2.6

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Already-fixed items confirmed live, not this cycle's finding

- **`FEAT-157`, `FEAT-158`, `FEAT-159`, `FEAT-160`, `FEAT-161`, `FEAT-162`, `FEAT-163`, `FEAT-164`,
  `UX-49`, `UX-91`, `DOC-16`** — all confirmed live in the current tree per Steps 1–4 above. Already
  ledgered as MERGED/FIXED with PR numbers; no status change needed, confirming for the record.

### 5.2 New rows added this cycle

Two new rows, both low-severity proposals (no code fix applied):

- **`ARCH-47`** — the `functions/`↔`src/` cannot-import wall has now produced its third and fourth
  pure-logic duplications (`monthlyHours.ts` porting the DATA-01-protected hours rule;
  `dadLabReportArtifacts.ts` porting the UX-85 evidence-completeness rule), both guarded only by
  test-fixture parity, not the compiler. Recommend scoping a structural fix (shared-directory TS config)
  in a dedicated pass. See 1.9.
- **`DOC-17`** — `DECISION_FUNC-01_source_of_truth.md` needs two new writer rows (`conceptArcs`,
  `dadLabReports`) for FEAT-157's chat-portal writes, the same gap shape DOC-14 closed last cycle. See 2.1.

### 5.3 Re-verified existing rows (status updates, no new IDs)

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| **ARCH-02** | OPEN (recommend live-day-edit handler trio extraction) | **OPEN — file untouched this window (+0L). Recommendation unchanged, third consecutive cycle.** | see 1.2 |
| ARCH-01, 03, 04, 08, 14, 44 | OPEN | OPEN, unchanged | 0L growth (ARCH-44: −1L de-dup, no shape change) |
| ARCH-05 | OPEN | OPEN, unchanged — bundle +22.80 kB/+8.48 kB gzip, still no code-splitting | |
| ARCH-06 | OPEN (28 refs/10 files) | OPEN, unchanged | |
| **ARCH-17** | OPEN (68 days to Node 20 EOL) | OPEN — 61 days, narrowing | |
| ARCH-43 | OPEN (20 sites/19 files) | OPEN, unchanged — re-verified, no new name-gating in this window's diff | see 1.7 |
| ARCH-45 | FIXED | FIXED, unchanged | |
| **ARCH-46** | OPEN (methodology proposal, new 08-23) | **OPEN, unchanged — attempted a quick broadened pass this cycle, too noisy to trust; still recommend a dedicated `PROMPT_FIX` run** | see 1.7 |
| **TEST-01** | IMPROVING | IMPROVING, unchanged — same two gaps | see 1.5 |
| **FUNC-01** | RESOLVED-WITH-DECISION, doc current | **RESOLVED-WITH-DECISION — supporting doc stale again (see new `DOC-17`)** | see 2.1 |
| FUNC-15 | OPEN | OPEN, unchanged | |
| FEAT-145 | OPEN | OPEN, unchanged | |
| UX-92, UX-93 | OPEN (filed 08-28) | OPEN, unchanged — re-confirmed at cited lines | see 2.5 |
| DATA-01 | FIXED | **FIXED — now protects a third consumer; see new `ARCH-47` for the duplication cost** | see 4.1 |
| **DATA-02** | NEEDS-DATA (53 days overdue) | NEEDS-DATA, now **60 days overdue** | |
| DATA-13 | OPEN (4 sites, lines 1099/1126/1173/1203) | **OPEN — lines shifted to 1109/1136/1183/1213 (comment-only shift, not new occurrences); same fix** | see 4.3 |

### 5.4 Mechanical doc fixes applied directly this cycle

- `CLAUDE.md` Known Technical Debt section: three stale line-count parentheticals corrected (all three
  were already flagged as stale by the 2026-08-24 `HEALTH_REPORT.md` but not yet fixed, since that report
  doesn't write `CLAUDE.md` prose) — `chat.ts CF (2,548L)` → **(2,641L)**, `useQuestSession.ts (2,161L)` →
  **(2,218L)**, `BookEditorPage.tsx (2,103L)` → **(2,113L)**. No prose/judgement changed, line counts only.
- `docs/MASTER_OUTLINE.md` stats block: TypeScript lines 275,572 → **281,460**; Commits 3,103 → **3,129**
  (repo was shallow at session start — unshallowed via `git fetch --unshallow` to get an accurate count,
  same step every prior cycle that needed it has taken); Test files 405 → **421**. Firestore collections
  (48), Cloud Functions (29), Chat task types (21), Routes (36) all re-verified unchanged — none of their
  source files (`firestore.ts`, `functions/src/index.ts`, `tasks/index.ts`, `router.tsx`) appear in this
  window's diff, so no re-derivation was needed.
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-08-30, added this report to the
  audit chain; ledger gets **+2 rows / −0** (`ARCH-47`, `DOC-17`), no row reordered, deleted, or reopened.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 6,342/6,342 tests; functions:
clean lint/tsc, 1,064/1,064 tests; build clean, bundle 4,362.99 kB/1,301.48 kB gzip, +22.80 kB/+8.48 kB
gzip since 08-23; `npm audit` 0 vulnerabilities on both trees for a second consecutive cycle; `docs:check`
HARD green, silent-fallback census flat at 97 despite 103 changed files). **Top 3 findings by leverage:**
(1) `ARCH-47` (new) — the `functions/`↔`src/` import wall has now produced its third and fourth pure-logic
duplications, two of them guarding DATA-01 (hours math) and the UX-85 evidence rule that has already
caused three independent bugs by FEAT-163's own account — worth a dedicated structural look, not another
verbatim port next time; (2) FEAT-163/164's hours fix is this cycle's best example of the
propose-and-confirm discipline for invariants working exactly as designed (found, written up, owner
decided, then shipped as a faithful port) — worth naming as a process win, not just a bug fix; (3)
`DATA-02`'s dedupe freeze window is now 60 days overdue (ninth week), still the longest-standing item in
the ledger with no owner action available from a repo-only audit. **Recommend running `PROMPT_FIX.md`
next against:** `ARCH-02`'s live-day-edit handler trio extraction (unchanged recommendation, now three
cycles running), then `UX-92`/`UX-93` (two open P1 write-honesty gaps in the same file FEAT-160 already
touched this window), then `DOC-17` (mechanical — add the two missing writer rows to the FUNC-01 decision
doc).
