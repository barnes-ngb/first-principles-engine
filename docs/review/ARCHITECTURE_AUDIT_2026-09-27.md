# Architecture Audit — 2026-09-27

> **Type:** Monthly deep audit (scheduled run — this series has run roughly weekly; the prior full
> pass was 7 days ago).
> **Auditor:** Claude Code (Sonnet 5) · **Date:** 2026-09-27
> **Branch:** `claude/brave-feynman-7n44x8` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-09-20.md` (window start, merge of PR #1869: commit `2ee63ce`).
> **Window covered:** 2026-09-20 → 2026-09-27 — **8 commits, 23 files changed, +1,294 / −639 lines**
> (`git diff --shortstat 2ee63ce..efab358` — `efab358` being `origin/main`'s tip when this audit run
> started, i.e. the window's END commit; **not** `HEAD`, which by the time this PR is reviewed also
> includes this PR's own doc-only fix commits and will report a different, larger figure for the same
> command, since it also measures this audit's own output). The smallest window this series has
> recorded on a file-count basis (23 vs 09-20's 215) — three PRs landed: the daily health audit, and
> two named fix runs (`FIX-253`, `FIX-254`).
> Headline: **`FIX-253` finally claimed the standing `ARCH-05` `jspdf` code-split recommendation this
> series has carried unbuilt for five consecutive cycles** — main bundle chunk dropped from 4,619.20 kB
> to **4,227.44 kB** (−391.76 kB / gzip 1,392.23 kB → **1,264.13 kB**, −128.10 kB gzip), matching the
> −393.24 kB / −128.82 kB gzip the 09-13 audit measured and left unclaimed. The rest of the window is
> `FIX-254` closing `UX-443`→`445` (Today's week ribbon now counts what actually happened, not only
> what was checked off) plus one Codex-round follow-up fix — both fix rows already correctly reflected
> in the ledger with merged PR numbers before this audit started, so this cycle's ledger contribution is
> re-verification plus two genuinely-new status-cell updates (`ARCH-05`, a new flaky-test row), not a
> backlog of unflipped cells. One flaky test found and observed load-sensitive (passes in isolation,
> times out only under full-suite load) — the same class as the standing `TEST-02` row, now a second
> instance.

---

## Step 0 — Baseline

October 4 reconciliation: results below are the original audit's historical observations at efab358. Passing reruns do not establish the timeout's cause. TEST-06 remains open; no production fix or global timeout change is made by this report.

```
npm ci (root)                         → fresh container, clean install
npm run lint                          → 0 errors, 3 warnings (same pre-existing sites as every prior cycle)
npx tsc -b                            → CLEAN
npx vitest run                        → run 1: 10,217 passing + 1 skipped (718 files) / 1 failed
                                         (SketchScanner.resultIdentity.test.tsx — 5000ms timeout under
                                         full-suite load); isolated re-run of that file: 20/20 passing,
                                         1.6s (well under the timeout); full-suite run 2: 718/718 files,
                                         10,218 passing + 1 skipped, 0 failing, clean — confirmed
                                         timeout with cause not established (see below)
cd functions && npm ci                → fresh container, clean install
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 1,509 tests passing (68 files), 0 failing — byte-identical to 09-20
npm run build                         → dist/assets/index-*.js  4,227.44 kB │ gzip: 1,264.13 kB
                                         + dist/assets/jspdf.es.min-*.js  385.99 kB │ gzip: 126.32 kB
                                         (own chunk, confirmed point-of-use `await import('jspdf')` in
                                         both `printBook.ts:1186` and `printStickerSheet.ts:63`)
npm run docs:check                    → HARD green, 10 SOFT warnings (same shape as 09-20)
npm audit --omit=dev (root)           → 1 moderate (fflate), unchanged
cd functions && npm audit --omit=dev  → 3 moderate (qs/body-parser/express chain), unchanged
```

**Baseline: GREEN**, with one confirmed flake. `src/features/books/__tests__/SketchScanner.
resultIdentity.test.tsx`'s `saves the look the picture was drawn in, not one tapped afterwards` test
timed out at the vitest default 5000ms under full-suite load (658 other files scheduled around it) but
passed cleanly in isolation (`npx vitest run` on the file alone: 20/20 tests, the specific test at
1,604ms — nowhere near the limit). This is the same failure shape as the standing `TEST-02` row
(`BookEditorPage.cover.test.tsx` — "passes in isolation, blips under full-suite load") on a second file;
filed as `TEST-06` rather than silently re-running until green, per this audit's own "the baseline is
the first finding" rule — a timeout that only reproduces under load is real evidence, not noise,
and its cause has not been established. A second full-suite run was started to check reproducibility; its
result is folded into this report before the PR opens (see the note at the end of this section).

Root tests: **717 → 718 files (+1), 10,211 → 10,217 passing + 1 skipped (+6)** since the 09-20 baseline —
the one new file is `makeBookPdf.test.ts`, added by `FIX-253` alongside the jspdf split. Functions:
unchanged at **68 files, 1,509 tests** (this window touched no `functions/src` file at all — confirmed,
`git diff 2ee63ce..efab358 --stat -- functions/` is empty).

**Bundle:** 4,619.20 kB → **4,227.44 kB** (−391.76 kB), 1,392.23 kB → **1,264.13 kB gzip** (−128.10 kB
gzip) since the 09-20 baseline — the first bundle *shrink* this series has recorded, and the largest
single-cycle movement (up or down) in its history. `grep -c "React.lazy\|lazy(" src/app/router.tsx` →
**0**, unchanged — route-level code-splitting (the `ARCH-08`/`AvatarThumbnail.tsx`→`three` blocker) is
still unbuilt, so this is a real but partial claim against `ARCH-05`, not its close. See §1.4.

**`npm run docs:check`:** HARD green. `[ledger-ids]` **601 rows** (was 595 at 09-20's own figure —
+6 rows, all filed and closed within this same window by `FIX-253`/`FIX-254`: `UX-443`→`446`). SOFT
warnings: same **10** as 09-20. The silent-fallback census is **105 swallowed catches across 58 files**
— byte-identical for a **third** consecutive cycle now (09-13, 09-20, 09-27), despite 23 more changed
files this window. The two `raw-refs` warnings are the same two files (`ArmorTab.tsx`, `DevAdminTab.
tsx`), and `remote-timeout-finally` is the same 7 sites. Nothing in this window's diff touched any of
those 14 flagged locations.

**Full-suite re-run confirms the flake, does not reproduce it:** a second `npx vitest run`, started
immediately after the first, completed **718/718 files passing, 10,218 passing + 1 skipped, 0 failing**
(440.58s) — clean, including `SketchScanner.resultIdentity.test.tsx`. Two data points now agree: the test
passed on rerun; timing pressure is a hypothesis, not proof against a logic defect — consistent with `TEST-02`'s
own documented behavior on a different file. Baseline stands as **GREEN**.

---

## Step 0.5 — Audit lenses carried forward

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate.
2. **Multi-kid generality** — capability-gated, never name-gated; watch for regressions.
3. **MO→TX compliance** — flag anywhere state rules/exports are MO-hardcoded beyond what's already tracked.

This window's clearest lens-1 result is **`FIX-254`** (§2.1) — Today's week ribbon used to count only
checked-off items, so a day with real work but no ticked boxes silently under-reported, which is exactly
the "sparse-upload days... the loop quietly starves rather than failing loudly" weak link
`PROCESS_OVERVIEW.md` names. No lens-2 or lens-3 hits this window — no file this window's diff touches
does any name-gating or state-specific work (confirmed: the touched files are `books/` print plumbing,
`today/WeekRibbon*`, `weekly-review/useWeekHoursInputs.ts`, `weekly-review/weekHours.ts`, plus doc/ledger
files).

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Largest files — flat except two files touched by this window's two fix runs

`npm run census:arch-audit -- --base=2ee63ce`:

```
non-test .ts/.tsx files scanned under src/ + functions/src/: 913
files >= 1500L: 18
```

| File | 2026-09-27 | Δ since `2ee63ce` (09-20) | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 3,942L | +0 | Tangled — ARCH-02, OPEN, flat — **sixth** consecutive cycle unaddressed (see 1.2). |
| `functions/src/ai/chat.ts` | 3,108L | +0 | Cohesive-but-big — ARCH-01, OPEN, flat. |
| `src/features/books/BookEditorPage.tsx` | 2,433L | −4 | Cohesive-but-big — ARCH-03, OPEN, negligible shrink (unrelated `printBook`/`printStickerSheet` import-site edits touching a shared type). |
| `src/features/quest/useQuestSession.ts` | 2,275L | +0 | Tangled — ARCH-04, OPEN, flat. |
| `src/features/today/TodayPage.tsx` | 1,952L | +1 | Watch-list — the `ribbonWeekStart` import + one call-site swap from `FIX-254`'s Codex round; not new growth. |
| `src/features/workshop/WorkshopPage.tsx` | 1,928L | +0 | Cohesive-but-big, flat. |
| `functions/src/ai/tasks/shellyChat.ts` | 1,919L | +0 | Cohesive-but-big — ARCH-01 sibling, flat. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,897L | +0 | Cohesive-but-big, flat. |
| `src/features/progress/CurriculumTab.tsx` | 1,857L | +0 | ARCH-50, flat — still recommended for a design-first read before the next feature lands on it. |
| `src/features/today/TodayChecklist.tsx` | 1,841L | +0 | Watch-list, flat this window (first flat window after several of slow growth). |
| `src/features/records/dataReviewExport.logic.ts` | 1,776L | +0 | Tangled — ARCH-44, OPEN, flat. |
| `functions/src/ai/evaluate.ts` | 1,736L | +0 | Cohesive-but-big — leave it (judged 09-20 §1.4), flat. |
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,682L | +0 | Cohesive-but-big, flat. |
| `functions/src/ai/contextSlices.ts` | 1,638L | +0 | Tangled — ARCH-14, OPEN, flat. |
| `src/features/records/RecordsPage.tsx` | 1,614L | +0 | Watch-list, flat. |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606L | +0 | Leave as-is per CLAUDE.md — Three.js render loop, untouched. |
| `src/features/settings/DevAdminTab.tsx` | 1,530L | +0 | Watch-list, flat. |
| `src/features/shelly-chat/useShellyChatActions.ts` | 1,506L | +0 | Watch-list, flat — no decomposition read attempted yet; still recommended. |

**Sixteen of eighteen files were exactly flat this window** — the largest "flat" share this series has
recorded, consistent with a window whose diff never touches any of the eighteen tracked files except at
their edges (an import line, a call-site swap). Only `BookEditorPage.tsx` (−4L) and `TodayPage.tsx` (+1L)
moved at all, and neither move is a judgment change.

### 1.2 ARCH-02 (`PlannerChatPage.tsx`) — sixth consecutive cycle, file untouched this window

Re-checked directly: `handleRemoveItem` (2355), `handleMoveItemToDay` (2462), `handleSwapWatchItem`
(2536) are at the **same line numbers as 09-20**, byte-identical — the file recorded zero net line
change this window (confirmed both by the census's flat entry above and by `git diff 2ee63ce..efab358
--stat -- src/features/planner-chat/PlannerChatPage.tsx`, which is empty — the file simply wasn't
touched, not "touched and netted to zero"). **Unchanged recommendation, entering a sixth consecutive
cycle** — this is now the longest-standing named `PROMPT_FIX` target in the architecture lane, and the
09-20 report's own read ("a good week to finally do it," since the seam hadn't been buried under new
growth) still holds unchanged, since nothing landed on the file at all this window.

### 1.3 Bundle (ARCH-05/ARCH-08) — ARCH-05 gets its first real partial fix in this series' history

See Step 0 for the headline numbers. `FIX-253` (PR #1871) moved `jsPDF` from a static top-level import in
`printBook.ts` and `printStickerSheet.ts` to a point-of-use `await import('jspdf')`, confirmed at
`printBook.ts:1186` and `printStickerSheet.ts:63`; `printBook.ts:1` now carries only a type-only `import
type { jsPDF } from 'jspdf'`, which `erasableSyntaxOnly` guarantees emits no runtime code. The measured
win (−391.76 kB / −128.10 kB gzip) is within noise of the −393.24 kB / −128.82 kB gzip the 09-13 audit's
`rollup-plugin-visualizer` run predicted for exactly this split — confirming that measurement rather than
re-deriving a new one. `FIX-253` also shipped a correctness fix alongside the split, not just the
mechanical move: `makeBookPdf.ts` (new, +34L) wraps the three print call sites (`BookEditorPage.tsx`,
`BookReaderPage.tsx`, `BookshelfPage.tsx`) so a failed dynamic `import('jspdf')` (a chunk-load failure —
offline, a stale service worker, a flaky CDN) surfaces as a caught sentence instead of an unhandled
promise rejection; `makeBookPdf.test.ts` (new, +37L) pins that. This is the right shape for a
perf-motivated code-split: the split alone would have traded a silent-slow-load risk for a silent-failure
risk, and this fix closes both in the same PR.

**What's still open:** `ARCH-08` — `AvatarThumbnail.tsx` still statically imports `three` and is still
rendered in `AppShell.tsx`'s always-mounted nav chrome (unchanged; the file is absent from this window's
diff), so the `three` bundle-split ARCH-05's original 4-step plan also called for remains fully unbuilt,
and `router.tsx` still carries zero `React.lazy` call sites. **ARCH-05's ledger row is updated this cycle**
(§5.1) to reflect the genuine partial progress — this is the first time in the row's history its own
recommendation has been partially acted on, worth recording precisely rather than leaving the row's
stale 2026-07-19 bundle figure (4,201.42 kB, now meaningless against the current 4,227.44 kB after five
cycles of unrelated growth and one cycle of real shrink) standing as if nothing had changed.

### 1.4 Test coverage (TEST-01) — unchanged; TEST-06 filed for this window's own flake

Direct re-check, same probes as every prior cycle: `grep -rl "persist(" src/features/evaluation/*.test.
tsx` → zero hits (`SkillSnapshotPage.tsx`'s general merge/`persist` path still untested independently);
`grep -rl "TeachHelperDialog\|LoginPage" src --include=*.test.tsx --include=*.test.ts` → zero hits for
either; `DispositionProfile.tsx` still has only `DispositionProfile.childSwitch.test.tsx`, no general
test file. `workshop` directory ratio unchanged at **45 source / 8 test files (5.6:1)** per this cycle's
census run (byte-identical to 09-20); `avatar` unchanged at **80/20 (4.0:1)**.

**The prompt's own Step 1 instruction is to re-list every zero-test feature each cycle, not only the two
previously-named gaps — done here in full.** `npm run census:arch-audit`'s directory sweep names five
feature directories with source but no test files: `auth`, `login`, `not-found`, `planner`, `ui-preview`.
Two of the five are the `TeachHelperDialog.tsx` (`planner/`) and `LoginPage.tsx` (`auth/`) gaps already
re-checked above — both are genuinely missing coverage on real logic, unchanged. The other three,
read directly this cycle for the first time in this series' recorded text:
- **`login/ProfileSelectPage.tsx`** (251L) — almost entirely presentational styling (per-profile color/
  font/border branching for three static profile cards); its one piece of real behavior is a one-line
  `onClick={() => selectProfile(p.id)}`. Judged a genuine UI shell — low-value to test, not a logic gap.
- **`not-found/NotFoundPage.tsx`** (29L) — static copy plus one `navigate('/today')` call on a button.
  Judged a genuine UI shell.
- **`ui-preview/UiPreviewPage.tsx`** (82L) — a dev-only component gallery, explicitly documented in its
  own file header and in `CLAUDE.md`'s Project Structure section as *"unlinked from nav... does not touch
  any real surface"*; it exists to eyeball shared state components on a phone, not to be used by a family.
  Judged genuinely untestable-and-pointless-to-test — no real user ever reaches it.

So of the five, **two remain the named, real gaps** (`TeachHelperDialog.tsx`, `LoginPage.tsx`) and
**three are correctly classified as UI shells** not worth a test file — the census-derived count was
already fully explained by the two rows this ledger has carried since TEST-04/TEST-01's prior cycles;
nothing new to file. **TEST-01 status: unchanged — IMPROVING, no new progress this cycle on the two named
gaps or the `workshop` ratio** — expected, given the window touched none of the relevant files.

**New this cycle: `TEST-06`**, filed for the flake found in Step 0 (`SketchScanner.resultIdentity.test.
tsx`'s 5000ms timeout under full-suite load, observed load-sensitive by an isolated pass at 1.6s). This
is the same failure shape `TEST-02` already names on a different file (`BookEditorPage.cover.test.tsx`),
so a similar timeout pattern is observed on two independent test files; its cause remains unconfirmed — worth
tracking as its own row (not merged into `TEST-02`, whose own text is scoped to one named file) but
flagged as the same class, since a `PROMPT_FIX` addressing one might reasonably raise the suite's default
per-test timeout, or examine what's making the full 718-file run tight on wall-clock margin around these
two specific async-heavy component tests, rather than patching each file's timeout independently.

### 1.5 ARCH-06 (WorkbookConfig → ActivityConfig) — flat

`npm run census:arch-audit`: **`ActivityConfig`: 308 refs / 78 files**, **`WorkbookConfig`: 38 refs / 12
files** — both figures byte-identical to 09-20. **Band 1, ARCH-06, OPEN, unchanged.**

### 1.6 ARCH-43 (Lincoln/London name-literal census) — flat, same 17 sites / 15 files

`npm run census:arch-audit`: **17 sites / 15 files**, unchanged from 09-20, and the file list itself is
identical (confirmed by diffing this cycle's printed list against 09-20's report text). No name-gating
touched this window (§0.5). **ARCH-43 stays OPEN, unchanged.**

### 1.7 ARCH-07/ARCH-39, ARCH-17, ARCH-47 — re-confirmed still correctly closed

`grep -rn "TODO.*[Ll]adder\|ladder.*TODO" src` → zero hits, unchanged. Node 22 migration (`ARCH-17`) and
the `functions/`↔`src/` duplication consolidation (`ARCH-47`) remain untouched by this window's diff.

### 1.8 CHAT_TASKS registry / FUNC-01 decision doc — unchanged, spot-verified against current code

`CHAT_TASKS registry size`: **21**, unchanged (census script).

`docs/review/DECISION_FUNC-01_source_of_truth.md` is confirmed absent from this window's diff, but that
alone doesn't prove its Authority table (last corrected by `DOC-26`, 09-20) still matches the code — a
claim about who *reads* a store can go stale from a change to the reader, not only from a change to the
named writer, so "the doc file itself wasn't touched" is too weak a check on its own.

Re-verified instead by extracting every distinct writer/reader module the table names across its seven
authority dimensions plus its three execution-record rows — 25 named files in total, spanning
`EvaluateChatPage.tsx`, `useQuestSession.ts`, `SkillSnapshotPage.tsx`, `useCertificateProgress.ts`,
`CertificateScanSection.tsx`, `skillSnapshotWrites.ts`, `updateSkillMapFromFindings.ts`, `useSkillMap.ts`,
the seven `learnerModels` writers (`evalModelWriteback.ts`, `questModelSync.ts`, `writeReviewAction.ts`,
`workbookPositionSync.ts`, `bootstrapLearnerModel.ts`, `stuckRetestQueue.ts`, `learnerSynthesis.ts`),
`activityConfigWrites.ts`, `useActivityConfigs.ts`, `DispositionProfile.tsx`, `useDayLog.ts`,
`applyWeekPlan.ts`, `liveDayEdit.ts`, `writeWatchItemToDay.ts`, `dayWriteGuard.ts`,
`writeNextWeekDraft.ts`, and `useWatchLibrary.ts` — and confirming each still exists and still references
the collection/behavior the table claims for it (a keyword check per file: `learnerModels` inside each of
the seven `learnerModels` writers, `days` inside `useDayLog.ts`, `dispositionCache` inside
`DispositionProfile.tsx`, and so on for the rest). **All 25 found, all 25 match.**

This is a real spot-check, not a full re-derivation census — it confirms presence of the claimed
behavior, not its exclusivity, so it wouldn't catch a *new*, undocumented eighth `learnerModels` writer
appearing somewhere the table doesn't mention. But it is real evidence rather than an inference from an
empty diff, and it agrees with the independently-confirmed fact that this window's diff touches none of
these 25 files at all (§0.5) — the doc's own claims and the code they describe moved together, which is
what "unchanged" should mean here.

### 1.9 Drift catalog — one file crossed the 150L threshold, and it is this window's own named fix

`npm run census:arch-audit -- --base=2ee63ce`, full sweep:

```
files with |net line delta| > 150L since base: 1
  +   237  src/features/today/weekRibbon.logic.ts     (FIX-254, UX-443→445 — see §2.1)
```

The smallest drift sweep this series has recorded (09-20's own sweep found 12 files; every prior cycle
found at least half a dozen). One named, ledgered, already-merged fix accounts for the entire sweep — no
unexplained growth, nothing to file as a new decomposition candidate.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 FIX-254 (UX-443→446) — traced as this window's one real loop-integrity path

Picked as the window's real path per the prompt's Step 2 instruction, since it is this window's only
functional change and sits squarely in the learning-loop-integrity lens. Before this fix, Today's week
ribbon (`WeekRibbon.tsx`) counted a day's dots purely from checked-off checklist items — so a day where a
kid did real, captured work (a photo, a note, a `KidExtraLogger` "I Did More!" quick-log) but the parent
hadn't ticked the matching box read as an **empty** day in the one place a parent glances to see "did the
week happen." This is precisely the `PROCESS_OVERVIEW.md` weak link named as *"sparse-upload days...
evaluation and planning have thin signal; the loop quietly starves rather than failing loudly"* — except
one level up, on the reporting surface rather than the evaluation one: the work wasn't missing, it was
present and simply not being counted by the one summary a parent trusts.

**The fix traced end-to-end:** `weekRibbon.logic.ts`'s new `computeRibbonWeek` (+237L, the window's one
drift-sweep entry, §1.9) now folds the week's actual counted minutes through the **same shared rule**
every other hours surface uses — `computeHoursSummary`/`collectHoursContributions`
(`functions/src/shared/hoursContributions.ts`) — confirmed by direct import at `weekRibbon.logic.ts:58-
59` and call sites at `:320`/`:323`. This adds a **fifth** guarded `computeHoursSummary` consumer
alongside `RecordsPage.tsx`, `dataReviewExport.logic.ts`, `useWeekHours.ts`, and `weekBySubject.ts` (all
four re-confirmed present and unchanged this cycle, §4.1) — not a sixth independent accumulator, which is
exactly what the additive-hours invariant requires (§4.5). `KidExtraLogger.tsx`'s own comment update
(+3L) names the same closure precisely: a kid's manual "I Did More!" log — previously counted on Records
but invisible to Today's own week chip — now moves the parent-facing ribbon too. The dots themselves stay
**plan-based** for `done`/`partial` (no regression to the coverage-not-pace rule — a day is never marked
"behind" by this change), but a day carrying counted minutes with zero checked boxes is now a new `logged`
state rather than reading as `empty`. **The loop closes**: work captured on Today (even unticked, even a
kid-initiated quick-log) now reaches the one weekly-glance surface that used to miss it. `useWeekHours
Inputs.ts` (+190L net across the window) was the parallel change on the weekly-review side, extended to
share its three-query shape with the ribbon's own hook rather than duplicating the Firestore reads — the
sibling of the same "one fold, several readers" pattern.

**No dead end found on this path.** The one thing that remains open and is honestly filed as such:
`UX-446` — weekend time (Saturday/Sunday) now counts toward the ribbon's total minutes (since the week is
now the Review's Sun–Sat range, matching `Hours and Coverage`) but has no dot of its own on the seven-day
strip, which only shows Mon–Fri. Re-confirmed present and unfixed this cycle (`grep -n "446"
docs/review/REVIEW_HOME_BASE.md` — still `OPEN`).

### 2.2 Shelly's path (no-shame) — clean, and this window's own change is itself a positive instance

Grepped this window's two changed hours-facing files (`WeekRibbon.tsx`, `weekRibbon.logic.ts`) for
pace/pressure language (§0.5, §3 below): none found — the 80% thresholds present in the file are the
existing per-day `done`/`partial` plan-completion states (unchanged behavior, not a new week-level
target), and the file's own header comment states the invariant explicitly: *"It computes no minute. The
week's total is `computeHoursSummary` — the shared... fold."* No shame-coded copy, no new quota/target/
percentage-of-a-goal language anywhere in the diff.

### 2.3 Kid voice-first, DATA-17, and the rest of Step 2's standing items — unchanged, re-confirmed

`DATA-17` (certificate-scan lane skips the learner-model sync): `grep -n "syncWorkbookPositionToModel"
src/core/hooks/useCertificateProgress.ts` → zero hits, file absent from this window's diff entirely.
Unchanged, still open. No new kid-facing capture surface requiring typed-only input was found in this
window's diff — the only kid-facing file touched (`KidExtraLogger.tsx`) gained three lines of internal
comment, no UI or interaction change.

---

## Step 3 — Pedagogy & Ethos (Band 3)

- **Pace/pressure language:** clean this window — see 2.2. Zero hits across the window's entire diff.
- **Diamonds-not-scores / no-shame:** clean. The window's one new user-facing surface change (the ribbon
  gaining a `logged` dot state for unticked-but-worked days) is itself a no-shame improvement — it stops
  a real day of work from silently reading as an empty one, which is the shame-adjacent failure mode in
  reverse.
- **Charter preamble reach:** re-confirmed **21** task types still wired in `CHAT_TASKS` (census script),
  unchanged count from 09-20. The pre-existing `analyzePatterns` gap (non-chat-dispatched CF carrying no
  `"charter"` slice, tracked under `DOC-04`) is unchanged; not touched this window (no `functions/src`
  file was touched at all, §0).

**No new Band 3 findings this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — holds, now 5 guarded call sites (one more than 09-20)

`grep -rn "computeHoursSummary(" src functions/src --include=*.ts --include=*.tsx | grep -v '\.test\.'`
returns **6** lines, not 5 — the sixth is `MonthlyTrend.tsx:27`, a comment referencing the function name
(`// computeHoursSummary(). The cumulative core/total below therefore match the...`), not a call.
Excluding declaration-free comment lines (`| grep -vE '^\S+:\s*//'`) reproduces exactly **5** actual call
sites, one more than 09-20's 4: `RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1273`, `weekly-review/
useWeekHours.ts:40`, `weekly-review/weekBySubject.ts:418` (all four present, unchanged), plus the new
`today/weekRibbon.logic.ts:320` from `FIX-254` (§2.1). **DATA-01 holds FIXED** — the new consumer routes
through the shared rule rather than adding a sixth independent accumulator, which is the positive case
this row exists to keep true.

### 4.2 DATA-02 — still NEEDS-DATA, now 88 days past the freeze window

`(2026-09-27 − 2026-07-01) = 88 days` overdue (was 81 at 09-20), now in its **thirteenth week** as the
longest-standing item in the ledger. Still requires the owner to run the dedupe pass against a live
Firestore export — unresolvable from a repo-only audit.

### 4.3 DATA-13 — unchanged, same 4 lines

`grep -n "Missouri" src/features/records/records.logic.ts` → lines 1046/1073/1120/1150, byte-identical
to 09-20 (file absent from this window's diff). Same four plain-string Missouri literals in the same
template-literal HTML builder function.

### 4.4 DATA-17 — see 2.3. Unchanged, re-verified.

### 4.5 MO→TX lens — no new hardcoding found

No new `Missouri`/`'MO'`/`MO_` hits outside the already-tracked files. `src/features/records/
MonthlyTrend.tsx`'s pre-existing MO-1000-hour dashed reference line (noted 09-20, §4.5 of that report) is
untouched this window (`git diff 2ee63ce..efab358 --stat -- src/features/records/MonthlyTrend.tsx` is
empty) — no new row filed, same reasoning as 09-20: worth folding into whatever `PROMPT_FIX` eventually
builds TX support, not urgent on its own.

### 4.6 Additive-hours invariant — holds; this window's one new hours-adjacent file is itself a positive
confirmation, not a new risk

Every changed file this window matching `hour|minute` in its path (`weekRibbon.logic.ts`,
`useWeekHoursInputs.ts`, `weekHours.ts`, `hoursReaderAgreement.test.ts`) was checked against whether it
computes a total independently of `collectHoursContributions`/`computeHoursSummary` — none does; see
§2.1/§4.1. `hoursReaderAgreement.test.ts` itself grew (+82L) specifically to add the ribbon as a **new
asserted reader** in the agreement test (per `CLAUDE.md`'s own note: *"the ribbon moved from
`hoursReaderAgreement.test.ts`'s exclusion list into the agreement"*) — confirmed by direct read of the
diff, this is the invariant's own enforcement widening to cover the window's new surface, which is the
correct direction of travel. No new view computes hours independently this window.

---

## Step 5 — Ledger Hygiene & Recommended Actions

### 5.1 Mechanical doc fixes applied directly this cycle

- **`docs/review/REVIEW_HOME_BASE.md` §6, `ARCH-05` row** — status cell updated to record `FIX-253`'s
  genuine partial progress (the first in this row's history): the `jspdf` split landed, bundle now
  4,227.44 kB / 1,264.13 kB gzip (was the stale 4,201.42 kB / 1,247.67 kB gzip figure dated 2026-07-19,
  now two cycles' worth of unrelated growth plus one cycle of real shrink out of date), route-level
  `React.lazy`/`ARCH-08` still unbuilt — row **stays OPEN**, now correctly described as partially
  addressed rather than silently identical to five cycles ago.
- **`docs/review/REVIEW_HOME_BASE.md` §6** — new row **`TEST-06`** filed for the observed load-sensitive
  flake found in Step 0 (§1.4).
- `docs/review/REVIEW_HOME_BASE.md` header: bumped "Last audit" to 2026-09-27, this report added to the
  audit chain.
- No other ledger status cells needed flipping — `FIX-253`, `FIX-254`, and `UX-443`→`446` were already
  correctly filed with merged PR numbers before this audit began (verified directly, §0 headline); every
  other row this audit re-verified (`ARCH-01`→`04`, `06`→`08`, `43`, `44`, `47`, `50`, `DATA-01`, `DATA-13`,
  `DATA-17`, `TEST-01`) was already correctly reflected in the ledger — this audit's contribution on each
  is independent re-confirmation against current code, not a ledger write.
  **Ledger gets +1 row this cycle** (`TEST-06`) **plus one status-cell edit** (`ARCH-05` — an update to an
  existing row, not a new one) — narrower than most cycles, matching the window's small diff.
- No changes needed to `CLAUDE.md`'s Known Technical Debt section this cycle — every line-count
  parenthetical in that section was already current as of the 09-20 audit's fixes, and this window's
  diff didn't move any of the tracked files except `BookEditorPage.tsx` (−4L, below the section's
  precision) and `TodayPage.tsx` (+1L, same). Confirmed by re-reading the section against this cycle's
  fresh census numbers (§1.1) — no stale figure found.

### 5.2 Status re-verifications this cycle

| ID | Prior status | This cycle | Note |
|---|---|---|---|
| ARCH-01, 03, 04, 06, 07, 14, 17, 43, 44, 47, 50 | OPEN/FIXED (unchanged) | unchanged — flat, files untouched this window | see 1.1, 1.5–1.8 |
| **ARCH-02** | OPEN (fifth consecutive cycle) | **OPEN — sixth consecutive cycle, file completely untouched this window (not even a peripheral edit)** | see 1.2 |
| **ARCH-05** | OPEN (bundle figure stale since 2026-07-19) | **OPEN — first genuine partial progress in this row's history (`FIX-253`'s jspdf split); `ARCH-08`/route-splitting remainder unchanged; ledger row text updated** | see 1.3, 5.1 |
| TEST-01 | IMPROVING | IMPROVING, unchanged — no new progress on either named gap or the `workshop` ratio this cycle | see 1.4 |
| **TEST-06** | — | **NEW — filed this cycle, a second instance of `TEST-02`'s exact flake class on a different file** | see 1.4 |
| DATA-01 | FIXED | FIXED, unchanged — now **5** guarded consumers (was 4), the new one a positive confirmation | see 4.1 |
| **DATA-02** | NEEDS-DATA (81 days overdue at 09-20) | NEEDS-DATA, now **88 days overdue (thirteenth week)** | see 4.2 |
| DATA-13 | OPEN | OPEN, unchanged — same 4 lines | see 4.3 |
| DATA-17 | OPEN | OPEN, unchanged | see 2.3, 4.4 |
| UX-446 | OPEN (filed by FIX-254) | OPEN, unchanged — re-confirmed present | see 2.1 |

### 5.3 Codex rounds

See the run's own summary comment on the PR for round timing and outcome, posted per the end-of-run
protocol below.

---

## 5-line summary

**Baseline: GREEN** (root: 0 lint errors/3 pre-existing warnings, tsc clean, 10,217/10,218 tests passing
+1 skipped across 718 files on the first run, one observed load-sensitive flake — `SketchScanner.
resultIdentity.test.tsx` timed out under full-suite load but passed 20/20 in isolation, filed as
`TEST-06`; functions: clean lint/tsc, 1,509/1,509 tests across 68 files, byte-identical to 09-20 since no
`functions/src` file changed this window; build clean, bundle **4,227.44 kB/1,264.13 kB gzip, the first
cycle-over-cycle shrink this series has recorded** (−391.76 kB/−128.10 kB gzip); `npm audit` unchanged at
1 moderate (root)/3 moderate (functions); `docs:check` HARD green, 10 SOFT warnings, silent-fallback
census byte-identical for a third straight cycle at 105/58). **Top 3 findings by leverage:**
(1) **`FIX-253` claimed the standing `ARCH-05` `jspdf` recommendation** (§1.3) — five cycles unbuilt,
closed this window, matching the 09-13 audit's own measurement almost exactly; the clearest example yet
of this series' recommendations getting acted on once scoped precisely, and proof the propose→fix
pipeline works on architecture findings, not only on functional/data ones (`UX-409`'s same-day turnaround
last cycle was the functional-lane example; this is the architecture-lane one). (2) **`ARCH-02`
(`PlannerChatPage.tsx`)** — unaddressed for a **sixth** consecutive cycle, completely untouched this
window, now the single longest-standing named `PROMPT_FIX` target in the ledger's architecture lane; the
~190L handler-trio extraction (`handleRemoveItem`/`handleMoveItemToDay`/`handleSwapWatchItem` →
`useLiveDayEditHandlers`) is unchanged in scope and cost from every prior audit's description. (3)
**`FIX-254`'s week-ribbon fix** (§2.1) — a genuine learning-loop-integrity closure (a real day of work no
longer silently reads as empty on the one weekly-glance surface a parent trusts), traced end-to-end with
no dead end found, and itself evidence the additive-hours invariant's enforcement surface is growing
correctly (a new reader joined the shared fold and the agreement test, rather than adding a sixth
independent accumulator). **Recommend running `PROMPT_FIX.md` next against:** `ARCH-02`'s live-day-edit
handler trio extraction (six cycles overdue, ~190L, the clearest remaining architecture-lane target now
that `jspdf` is claimed), then `ARCH-08`'s `AvatarThumbnail.tsx`/`three` route-gating (the prerequisite
for the `router.tsx` `React.lazy` split ARCH-05's original plan still calls for), then `TEST-06`/`TEST-02`
together (both are the same under-load-timeout class on two different async-heavy component test files —
worth one investigation into whether the fix is per-file or a suite-wide timeout/scheduling adjustment),
then `UX-446` (the weekend-dot gap `FIX-254` left open, small and well-scoped).
