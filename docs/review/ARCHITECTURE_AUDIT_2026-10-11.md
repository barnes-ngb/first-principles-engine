# Architecture Audit — 2026-10-11

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-10-11
> **Branch:** `claude/brave-feynman-swpsmv` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-04.md` (window start `12ad312`, the `origin/main` that run began on).
> **Window covered:** `12ad312` → `3db6028` (`origin/main` when this run started) — **45 files,
> +11,728 / −326** (`git diff --shortstat 12ad312..origin/main`; no commit count is stated — this run's
> checkout is shallow, so `git log | wc -l` there is not the real history length);
> source only (`src` + `functions/src`): **32 files, +10,596 / −57**. Newest commit is dated 2026-10-09.
> Headline: it is **one theme** — the sticker lane: saved-sticker editing (`FEAT-201`, PR #1883, with `FIX-258`/`FIX-259`)
> and MakeCode Arcade game art (`FEAT-239`) — plus four additive test files and the 10-05 maintenance
> reconciliation (`DOC-27`, `FUNC01_AUTHORITY_TRACE_2026-10.md`). Nothing touched the hours fold, `xpLedger`,
> `skillSnapshots` writers or `firestore.rules`.

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `3db6028`:

```
npm run lint                      → 0 errors, 4 warnings (3 useQuestSession.ts + 1 new, see 1.2)
npx tsc -b                        → CLEAN
npx vitest run                    → 1st run (concurrent with the other baseline commands): 745/746 files, 4 timeouts
                                    re-run, standalone, full suite: 746 files, 10,853 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 74 files, 1,739 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,260.96 kB │ gzip: 1,274.84 kB
npm run docs:check                → HARD green, 10 SOFT warnings; [ledger-status] PASS
```

**Root vitest was red on the first full run — triaged, then re-run in full.** The one failing file was
`src/features/books/__tests__/SketchScanner.resultIdentity.test.tsx` (4 of 20 tests), every failure a
`Test timed out in 5000ms` (5.0–5.4 s). That run shared the machine with the lint, `tsc` and functions
commands. The file alone passed 20/20 (tests 0.9–2.8 s), and **the whole root suite was then re-run
standalone on the same tree: 746 files, 10,853 passed + 1 skipped, 0 failing.** The failure is therefore
load-sensitive, not a logic regression — but "passes alone" is a weaker claim than "cannot race", which is
exactly the open question `TEST-06` carries. **Baseline: GREEN on the standalone full re-run**, red once under
contention; a cold CI runner can reproduce the contention.

Deltas vs 10-04: root **725 → 746 files**; functions **69 → 74 files, 1,538 → 1,739 tests**. (First run: 10,849 passed + 4 failed + 1 skipped = 10,854 tests; standalone re-run: 10,853 + 1 skipped = 10,854.)

**Bundle: 4,231.15 kB → 4,260.96 kB (+29.81 kB), gzip 1,265.18 → 1,274.84 kB (+9.66 kB).** The first
upward movement since the `jspdf` split; the sticker lane is statically imported. `grep -c "React.lazy\|lazy("
src/app/router.tsx` → **0**: route-level splitting (`ARCH-05`/`ARCH-08`) is still unbuilt.

## Step 0.5 — Lenses

- **Learning-loop integrity:** see 2.2. No new break.
- **Multi-kid generality:** `npm run census:arch-audit` → **17 name-literal sites in 15 files**, identical to
  10-04. No new name-gating in the window's diff.
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **18**, the same set as 10-04

`npm run census:arch-audit -- --base=12ad312` prints 18 production files ≥ 1,500L (922 files scanned).
**No file entered or left the list and none of the 18 appears in the drift list** (below), so every judgment
in `ARCHITECTURE_AUDIT_2026-10-04.md` §1.1 stands unchanged: `PlannerChatPage.tsx` (3,942, `ARCH-02`),
`chat.ts` (3,108, `ARCH-01`), `BookEditorPage.tsx` (2,433, `ARCH-03`), `useQuestSession.ts` (2,275, `ARCH-04`),
`evaluate.ts` (2,106, `ARCH-51`) are the tangled-or-leaning ones. **`ARCH-02` is unaddressed for a seventh
consecutive cycle**, again flat. As before, the "cohesive" calls on the lower rows are carried forward,
not re-read — the census proves size, not cohesion.

### 1.2 Drift — `StickerLibraryTab.tsx` is 17 lines under the list (`ARCH-52`)

`census:arch-audit --base=12ad312` → **8** files moved >150L, all in the sticker lane:
`ArcadeArtDialog.tsx` +762, `SavedStickerEditDialog.tsx` +580, `arcadeArtImage.ts` +489, `arcadeArt.ts` +473,
`enhanceSketch.ts` (functions) +452, `StickerLibraryTab.tsx` +403, `savedStickerEditSession.ts` +363,
`arcadeArtSession.ts` +345. **Six are new** (`git show 12ad312:<path>` fails for them): the dialogs and the
session/image/arcade modules, each single-purpose with sibling tests (21 test files, +6,515 lines in the
window) — the right shape. **Two are existing files that grew** and are judged separately:

- **`StickerLibraryTab.tsx` — 1,483L (`wc -l`), 17 under the census threshold** (`ARCH-52`), having taken both
  new doors and a fourth lint warning (`StickerLibraryTab.tsx:374`, `stickers` conditional could change
  `useCallback` deps every render). **P3.** Do not decompose yet; the next sticker-lane run reads the host's
  section boundaries first and fixes the warning rather than adding a fifth door in place.
- **`functions/src/ai/imageTasks/enhanceSketch.ts` — 694 → 1,146L (+452)** (`ARCH-53`). Unlike the tab this
  is a **privileged callable**, and the growth is a second and third responsibility, not more of the first.
  Top-level declarations by line range (`grep -nE "^export|^(async )?function|^const [A-Z_]+ ="`): prompt
  recipes and `buildEnhancePrompt` (≈ 31–617, the file's original job); **source-path confinement** —
  `checkSketchSourcePath` and its percent-decoding/segment helpers (≈ 398–530, from `7d15990`'s family-confinement
  fix); the **saved-sticker edit** lane — `buildSavedStickerEditPrompt`, `requireSavedStickerEdit`,
  `requireSavedSource`, the refusal/unavailable copy (≈ 617–800, `FEAT-201`); then the `onCall` handler
  (800–1,146). The confinement and edit-validation blocks are pure or near-pure, security-relevant, and already
  have their own test files (`enhanceSketch.sourceOwnership.test.ts`, +532L, plus the shared
  `savedStickerEdit.ts`/test), which is the seam: **lift path confinement to its own module** so a security
  rule is read without the prompt recipes beside it. **Severity P3, band 1** — below the 1,500L list and
  heavily tested, so a design-first read, not a `PROMPT_FIX` target, and not a drive-by inside a feature run.

### 1.3 Bundle (`ARCH-05`/`ARCH-08`)

Main chunk **4,260.96 kB** (Step 0). The 10-04 audit's finding stands and is not re-derived: Three.js is
reached by the app shell through `AvatarThumbnail`, so a route-level `React.lazy` on `/avatar` removes
nothing, and **no reduction figure is asserted** until a chunk graph of the real build exists. New this
window: the sticker lane adds +29.81 kB (above) because nothing in it is lazy; `ArcadeArtDialog` is opened
from the settings sticker library on demand and is the cheapest *real* lazy-split candidate in the repo
(a dialog behind a button, no shell reach). **Proposed action:** when the owner takes `ARCH-05`, start there
as the measured pilot — one dynamic `import()` of a button-gated dialog — before the Three.js decision.

### 1.4 Test coverage (`TEST-01`, `TEST-07`) and a recurring flake (`TEST-06`)

`census:arch-audit` → **5** feature directories with 0 test files: `auth`, `login`, `not-found`, `planner`,
`ui-preview` — unchanged; `TEST-07` (LoginPage, TeachHelperDialog) still OPEN. Thinnest real-logic areas, same
script: `workshop` **45 source / 8 test** and `monthly-review` **15 / 7**, unchanged. The window's test
growth was entirely `books`/`settings`/`planner-chat`/`functions`.

**`TEST-06` (existing, OPEN): this is its second recurrence.** `SketchScanner.resultIdentity.test.tsx` was
already filed by the 09-27 audit for the same `Test timed out in 5000ms` under full-suite load, passing alone.
This window the same file failed **four** tests (it was one then), each 5.0–5.4 s against 0.9–2.8 s alone —
evidence for `TEST-06`'s per-file-versus-suite-wide question: the failures cluster in a file whose tests drive
`userEvent` through several generate/save cycles, which points at a per-file timeout, not a suite-wide change.
No new row is filed; `TEST-06` is the one place to fix it.

### 1.5 `ARCH-06` / `ARCH-43`

`census:arch-audit`: ActivityConfig refs **309 (78 files)**, WorkbookConfig refs **38 (12 files)** — both
unchanged; migration completion still not safe as a drive-by. Name-literal sites **17 (15 files)**,
unchanged; `ARCH-43` stays OPEN.

### 1.6 `ARCH-07`/`ARCH-17`/`ARCH-47`

Not re-opened; no window commit touches them.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`)

Not re-derived. `FUNC01_AUTHORITY_TRACE_2026-10.md` (10-05) is the current source-derived trace and the
layered-ownership decision is retained; the window's sticker commits write no `skillSnapshots`, `childSkillMaps`,
`learnerModels` or curriculum-position field, so no new writer joins the disagreement surface. Static evidence
only, as that trace itself says.

### 2.2 Loop integrity

Window traced for loop reach: saved-sticker edit and Arcade art convert a *saved sticker* into a new
version / game-art export. They are creative-tool surfaces — neither is an evidence-capture door, neither
touches `days`/`hours`/`artifacts`, so the capture → label → evaluate → plan loop has no new leg to break
and no new silent drop. Arcade art states in its own header that its conversion is arithmetic and charges no
art quota (`ArcadeArtDialog.tsx:105`); `useStickerArtQuota` is still the gate for the paid saved-sticker edit.
**No dead end found.**

### 2.3 Shelly's path / no-shame

No planner/Today change in the window. No finding.

### 2.4 Kid voice-first

The new dialogs sit under settings' sticker library (host-opt-in). Not a kid surface; not re-walked.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added source lines (non-test) for
  `behind|catch up|deadline|on track|quota|target`. Hits are the network *deadline* helpers in the Arcade
  art session code, the art *quota* (a cost courtesy cap, not pace) and "left behind" in an image-prompt
  string. **None is pace or pressure language. Clean.**
- **Diamonds-not-scores:** no scoring surface added.
- **Charter reach:** `CHAT_TASKS` registry size **21** (`census:arch-audit`), unchanged.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src --include=*.ts --include=*.tsx | grep -v '\.test\.'` →
5 real call sites (`RecordsPage.tsx:481`, `dataReviewExport.logic.ts:1273`, `useWeekHours.ts:40`,
`weekBySubject.ts:418`, `weekRibbon.logic.ts:320`) plus one comment (`MonthlyTrend.tsx:27`) — identical to
10-04. `git diff 12ad312 origin/main --stat -- functions/src/shared src/features/records` shows only the
two new `savedStickerEdit` files; **`hoursContributions.ts` and `records/` did not change.**

**Authoritative core-hours figure:** not recomputable from a repo-only audit (a fold over live `days`/`hours`/
`hoursAdjustments`). The last recorded figure is 598.73 h core for Lincoln, 1.27 h under the MO 600-core line
(`ARCHITECTURE_AUDIT_2026-05.md:255`); the owner's live reading is the authority. What this audit verifies is
that the fold did not move.

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-10-11 − 2026-07-01 = 102` days past the freeze window (95 at 10-04). Needs a live Firestore export.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**, identical.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files (`RecordsPage`,
`ComplianceDashboard`, `records.logic`, `family.ts`, `stateCompliance`, `complianceMapping`). No new hardcoding.

### 4.5 Additive-hours invariant

Holds. No hours-adjacent file changed; no new minute sum.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-52`, `ARCH-53` (§1.2). **Recurrence recorded on** `TEST-06` (§1.4). **Status re-verifications:** `ARCH-02` OPEN (seventh cycle);
`ARCH-05`/`ARCH-08` OPEN; `ARCH-51` OPEN (`evaluate.ts` flat at 2,106); `DATA-01` FIXED; `DATA-02` NEEDS-DATA;
`DATA-13` OPEN; `ARCH-43` OPEN (17 sites); `TEST-07` OPEN; `TEST-06` OPEN. Mechanical fixes: header `Last audit` bump and the
`DOCUMENT_INDEX.md` entry (10-04 audit flipped to HISTORICAL, this one CURRENT).

**Recommended `PROMPT_FIX` order:**
1. `TEST-06` — scoped timeout on one test file; removes a red baseline that costs every later run a triage.
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `ARCH-05`/`ARCH-08` — design decision first; the Arcade-art dialog is the measured pilot (§1.3).

*Every number above is printed by `npm run census:arch-audit -- --base=12ad312`, `npm run build`, `wc -l`, the
named `grep`, or the test runners' own summaries; the window's size is `git diff --shortstat`.*
