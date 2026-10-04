# Architecture Audit — 2026-10-04

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-10-04
> **Branch:** `claude/brave-feynman-kg7hid` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger
> corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-09-20.md` (window start `2a4cf2c`, that audit's own end commit).
> **Window covered:** `2a4cf2c` → `12ad312` (`origin/main` when this run started) — **26 commits, 40 files,
> +4,933 / −712** (`git diff --shortstat 2a4cf2c..origin/main`; `git log --oneline 2a4cf2c..origin/main | wc -l`).
> Newest commit in the window is dated 2026-09-27: a quiet window. Headline: it is **one theme** — the
> weekly-review failure-visibility chain (`FIX-255`/`UX-447`/`UX-420`, `FIX-256`/`UX-450`) — plus the
> Today week-ribbon hours fix (`FIX-254`), the `jspdf` split (`FIX-253`, the first bundle movement in six
> cycles) and four additive test files. No new Band-1 debt beyond one new tangled-file watch (`ARCH-51`).

---

## Step 0 — Baseline

All run in this environment on a fresh `npm ci` of the tree at `12ad312`:

```
npm run lint                      → 0 errors, 3 warnings (the same 3 useQuestSession.ts exhaustive-deps sites)
npx tsc -b                        → CLEAN
npx vitest run                    → 725 files, 10,391 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 69 files, 1,538 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,231.15 kB │ gzip: 1,265.18 kB
npm run docs:check                → HARD green, 10 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 09-20: root **717 → 725 files, 10,211 → 10,391 tests**; functions
**68 → 69 files, 1,509 → 1,538 tests**.

**Bundle: 4,619.20 kB → 4,231.15 kB (−388.05 kB), gzip 1,392.23 → 1,265.18 kB (−127.05 kB).** This is
`FIX-253` (`jspdf` loaded at point of use) — exactly the proposal the 09-13 audit measured, now built.
`grep -c "React.lazy\|lazy(" src/app/router.tsx` → **0**: route-level splitting (`ARCH-05`/`ARCH-08`) is
still unbuilt; the remaining 4.2 MB is Three.js + every route in one chunk.

## Step 0.5 — Lenses

- **Learning-loop integrity:** see 2.2. No new break; the weekly-review chain made a silent failure
  visible, which strengthens the loop's "re-evaluate" leg.
- **Multi-kid generality:** `npm run census:arch-audit` → **17 name-literal sites in 15 files**, identical
  to 09-20. No new name-gating in the window's diff (see 1.5).
- **MO→TX:** no new MO hardcoding (see 4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **18**, same set as 09-20

`npm run census:arch-audit -- --base=2a4cf2c` prints 18 production files ≥ 1,500L (915 files scanned).
Largest: `PlannerChatPage.tsx` 3,942 · `chat.ts` 3,108 · `BookEditorPage.tsx` 2,433 · `useQuestSession.ts`
2,275 · `evaluate.ts` 2,106. The three standing candidates (`PlannerChatPage`, `chat.ts`, `useQuestSession`)
are **byte-flat in line count** this window; `BookEditorPage.tsx` shrank 10 lines (a −4 net edit from
`FIX-253`). **`ARCH-02` is now unaddressed for a sixth consecutive cycle**, again without growing.

### 1.2 `functions/src/ai/evaluate.ts` — +370L in one window, now tangled enough to file (`ARCH-51`)

Drift survey (`census:arch-audit --base=2a4cf2c`): three files moved >150L —
`evaluate.ts` **+370** (1,736 → 2,106), `weekRibbon.logic.ts` **+237**, `weekHours.ts` **+215**.
The latter two are cohesive new logic from `FIX-254`. `evaluate.ts` is different: 09-20 §1.4 judged it
"cohesive-but-big, leave it" at 1,736L, but this window's `FIX-255`/`FIX-256` added a second whole
concern to it. Its top-level declarations now group into **four unrelated jobs**, by line range
(`grep -nE "^export|^function|^async function" functions/src/ai/evaluate.ts`):

| Job | Lines (approx.) |
|---|---|
| Week assembly / evidence summarisers | 294–730 |
| Record-before-model path: positions, hours doc, failure docs (`writeWeekRecord`, `recordWeekBeforeAssembly`, `NARRATIVE_FAILURE_MESSAGES`, `CONTEXT_FAILURE_MESSAGES`) | 752–1275 |
| Prompt + parse (`buildEvaluationPrompt`, `parseReviewResponse`) | 1277–1580 |
| Scheduling / orchestration (`generateWeeklyReviewNow`, `runWeeklyReviewCron`, schedule + timeout constants) | 1747–2090 |

**Severity P3, band 1.** The record/failure block is the cleanest seam: it needs no prompt code and is
the part this series keeps editing (three consecutive fix runs touched it). **Proposed action:** design-first
read, then lift the record/failure block to `functions/src/ai/weeklyReviewRecord.ts`, mirroring the
`weeklyReviewAssemblyFailure.test.ts` / `weeklyReviewSnapshotWrite.test.ts` split the tests already follow.
Filed as `ARCH-51`; not for `PROMPT_FIX` until the owner wants it — the file is correct and heavily tested.

### 1.3 Bundle (`ARCH-05`/`ARCH-08`)

See Step 0. `FIX-253` is the first movement in six cycles and it was the cheap half. **Proposal unchanged:**
route-level `React.lazy` for the heaviest feature routes (Three.js avatar surfaces first, then Books editor
and Workshop). Not estimated afresh here — the 09-13 estimate predates this and no new measurement was run,
so no number is asserted. Architectural decision for the owner, not an auto-fix.

### 1.4 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files: `auth`, `login`, `not-found`, `planner`,
`ui-preview` — all one-file shells (genuinely not worth a test). Ratios worth watching, from the same
script: `workshop` **45 source / 8 test** files and `monthly-review` **15 / 7** are the thinnest real-logic
areas. **Proposed highest-value additions:** a `workshop` test over its game-generation reducers/guards and a
`monthly-review` test over its publish/photo-selection logic. This window shipped four additive test files
(`bookletImposition`, `customStoryTheme`, `draftOwnership`, `imageGenerationFailure`) — all `books`, so the
two named gaps did not move.

### 1.5 `ARCH-06` / `ARCH-43`

`census:arch-audit`: ActivityConfig refs **309 (78 files)**, WorkbookConfig refs **38 (12 files)** — the
legacy count is unchanged, so migration completion is still not safe to start by a drive-by.
Name-literal sites **17 (15 files)**, unchanged; `ARCH-43` stays OPEN.

### 1.6 `ARCH-07`/`ARCH-17`/`ARCH-47`

Not re-opened; no window commit touches them. Nothing newly removable found.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`)

No new writer or reader of child state was added. `DECISION_FUNC-01_source_of_truth.md` stands.

### 2.2 Loop integrity — the weekly-review path (`FIX-255`, `FIX-256`)

Traced: scheduled cron → positions recorded **before** any model call and before week assembly
(`recordWeekBeforeAssembly`, `evaluate.ts:1186`) → narrative merged after → failure written as an app-owned
sentence (`NARRATIVE_FAILURE_MESSAGES` / `CONTEXT_FAILURE_MESSAGES`, never the exception text) → page
decides via `weekHours.ts` → parent *Try again* (`WeekRetryControl` → `retryWeeklyReview.ts` →
`generateWeeklyReviewNow`). A killed run is now observable via `runStartedAt` + the 540 s
`WEEKLY_REVIEW_TIMEOUT_SECONDS` (`evaluate.ts:2075`). **No dead end found.** One standing caveat from the
ledger rows themselves: the retry door is live only once `functions` is deployed.

### 2.3 Shelly's path / no-shame

The failure and retry copy is neutral and states what is unavailable rather than assigning fault. The
Today ribbon (`FIX-254`) now reads counted hours with no denominator and adds a `logged` day state so a day
with counted time is never shown as `empty` — a positive no-shame change. No finding.

### 2.4 Kid voice-first

No kid surface changed in this window beyond a 4-line `KidExtraLogger.tsx` edit. Not re-walked.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added lines for `behind|catch up|deadline|on track|quota|
  target`. Every hit is the word *deadline* in the platform-timeout comments of `FIX-256` (function runtime
  limit, not pace). **Clean.**
- **Diamonds-not-scores:** no new scoring surface.
- **Charter reach:** `CHAT_TASKS` registry size **21** (`census:arch-audit`), unchanged. The known
  `analyzePatterns` gap is tracked under `DOC-04`, untouched.

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds; **one new guarded call site**

`grep -rn "computeHoursSummary(" src functions/src --include=*.ts --include=*.tsx | grep -v '\.test\.'`
now returns **5** real call sites (a sixth line is only a comment in `MonthlyTrend.tsx:27`): `RecordsPage.tsx:481`,
`dataReviewExport.logic.ts:1273`, `useWeekHours.ts:40`, `weekBySubject.ts:418` and — new —
`today/weekRibbon.logic.ts:320`. The new one is `FIX-254`'s ribbon, which folds through the shared rule
(it was moved *into* `hoursReaderAgreement.test.ts`'s agreement per the ledger row), so the Today ribbon
and the Records page can no longer show different hours for one week. **DATA-01 holds FIXED**; this
retires the ribbon as the last known second definition of "hours this week" on a parent surface.
(The 09-20 report counted 4 sites; the ribbon is the fifth.)

### 4.2 `DATA-02` — still NEEDS-DATA

`2026-10-04 − 2026-07-01 = 95` days past the freeze window (was 81 at 09-20). Needs a live Firestore export
and the owner; unresolvable from a repo-only audit.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**,
byte-identical to 09-20; `git diff --stat 2a4cf2c origin/main -- src/features/records/` is empty.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → the same six files as before
(`RecordsPage`, `ComplianceDashboard`, `records.logic`, `family.ts`, `stateCompliance`, `complianceMapping`).
No new hardcoding. `MonthlyTrend.tsx`'s `1000 / 12` reference line is unchanged from the 09-20 note.

### 4.5 Additive-hours invariant

Holds. The only hours-adjacent changes are `weekRibbon.logic.ts` (folds through `computeHoursSummary`) and
`weekHours.ts`/`useWeekHoursInputs.ts` (same shared inputs); no new independent minute sum.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-51` (§1.2). **Status re-verifications:** `ARCH-02` still OPEN (sixth cycle);
`ARCH-05`/`ARCH-08` OPEN — `jspdf` slice already landed under `FIX-253`, the route split has not;
`DATA-01` FIXED; `DATA-02` NEEDS-DATA; `DATA-13` OPEN; `ARCH-43` OPEN (17 sites). Mechanical fixes:
header `Last audit` bump only.

**Recommended `PROMPT_FIX` order:**
1. `ARCH-05`/`ARCH-08` — a design decision first, then the route-level `React.lazy` split (largest remaining
   user-visible win; the `jspdf` slice proved the approach).
2. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
3. `TEST-01` — a `workshop` logic test file.
`ARCH-51` is a design-first read, not yet a fix target.

*Every number above is printed by `npm run census:arch-audit -- --base=2a4cf2c`, `npm run build`, the
named `grep`, or the test runners' own summaries; the window's size is `git diff --shortstat`.*
