# Architecture Audit — 2026-07-19

> **Type:** Monthly deep audit (this run: primary July cadence, 7 days after the 2026-07-12 mid-cycle
> re-verification). **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-07-19
> **Branch:** `claude/brave-feynman-kgc6sn` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc/ledger
> corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-07-12.md` (2026-07-12)

---

## Step 0 — Baseline

Fresh container — `npm ci` (root, 646 packages) and `cd functions && npm ci` (683 packages) run first
(node_modules were empty at session start; not a code issue), then:

```
npm run lint                          → 3 warnings (LINT-01, same 3 locations — unchanged), 0 errors
npx tsc -b                            → CLEAN
npx vitest run                        → 4,168 tests passing (316 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 634 tests passing (35 files)
npm run build                         → dist/assets/index-*.js  4,201.42 kB │ gzip: 1,247.67 kB
```

**Baseline: GREEN**, with one transient flake noted and resolved. The first full `npx vitest run` showed
2 failures — `KitBuilderForm.test.tsx` ("adds and removes defender and invader rows") and
`UnifiedCaptureCard.test.tsx` ("renders preset chips, free-form fields, and media tabs") — both the
**first test in their file**, both `Test timed out in 5000ms`. Re-ran both files in isolation:
**56/56 passing, 0 failures.** This is container-resource contention under the full 4,168-test run
(cold render/setup cost on the first heavy test in a file), the same failure shape as the previously
logged TEST-02 flake (`BookEditorPage.cover.test.tsx`) — not a code regression. **No new ledger row for
this**; noting the pattern (two more files now show the same "first-test-in-file timeout under full-suite
load" shape as TEST-02) so a future cycle isn't surprised if it recurs.

Root test count is up **3,459 → 4,168 (+709)** across **248 → 316 files (+68)**; functions' own suite up
**563 → 634 (+71)** across **31 → 35 files (+4)** — real coverage growth tracking this week's ~30 named
`FEAT-*` rows (95–108), not re-counting drift. Bundle up **4,080.44 → 4,201.42 kB (+120.98 kB)** /
**1,208.07 → 1,247.67 kB gzip (+39.60 kB)** — a heavier cycle than 07-05→07-12's +14.26 kB, proportionate
to two brand-new feature surfaces landing this week (Watch Vehicle, Barnes Bros business expansion), not
attributable to any single runaway import.

**This was an unusually large cycle: 213 commits landed on `main` between 2026-07-12 and 2026-07-19**,
far above the ~10–40-commit cadence of prior weekly cycles. Findings below reflect that scale — Step 1's
research pass covered every commit touching a tracked file, not a sample.

---

## Step 0.5 — Audit lenses carried forward

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate
2. **Multi-kid generality** — anything hard-coded to one kid?
3. **MO→TX compliance** — state rules/exports MO-hardcoded in a way that blocks a clean TX toggle?

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large files (>1,500L) — drift since 2026-07-12

| File | 07-12 | 07-19 | Δ | Judgment |
|---|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,757 | **2,838** | **+81** | Tangled, continuing a 3-cycle upward trend — now the **single largest file in the repo**. Growth: FEAT-107 (inline video vet-in), FEAT-103 (watch itemType threading), FEAT-72/73 (catalog-tag backfill). All named, no silent growth. ARCH-02 OPEN, worth a decomposition pass before it compounds further. |
| `functions/src/ai/chat.ts` | 2,641 | **2,641** | 0 | Unchanged. `buildQuestPrompt` is precisely **519 lines** (lines 1445–1963). ARCH-01 still OPEN, top decomposition target, flat this cycle. |
| `src/features/quest/useQuestSession.ts` | 2,215 | **2,215** | 0 | Unchanged. ARCH-04 OPEN. |
| `src/features/books/BookEditorPage.tsx` | 2,103 | **2,103** | 0 | Unchanged. ARCH-03 low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | 1,876 | **1,876** | 0 | Unchanged. |
| `src/features/workshop/WorkshopPage.tsx` | 1,623 | **1,623** | 0 | Unchanged. |
| `functions/src/ai/contextSlices.ts` | 1,617 | **1,617** | 0 | Unchanged. (CLAUDE.md's tech-debt entry still says 1,566L — stale by 51L, predates FEAT-57; doc-hygiene note.) |
| `src/features/avatar/VoxelCharacter.tsx` | 1,606 | **1,606** | 0 | Unchanged. |

**No file crossed the 1,500L threshold for the first time this cycle**, despite 213 commits. The week's
structural story is width, not depth: two new feature surfaces (§1.5) rather than concentrated growth on
already-large files.

**Watch-list movement (1,000–1,500L band):**

| File | 07-12 | 07-19 | Δ | Attribution |
|---|---|---|---|---|
| `src/features/planner-chat/chatPlanner.logic.ts` | 1,363 | **1,457** | **+94** | FEAT-103 (watch threading), FEAT-72/73 (tag-backfill doctrine) |
| `src/features/today/TodayChecklist.tsx` | 1,287 | **1,378** | **+91** | FEAT-107 (batch capture), FEAT-103 (Watch Vehicle hours/artifact), FEAT-69 (skillTag bridge) |
| `src/features/books/BookshelfPage.tsx` | 1,014 | **1,096** | **+82** | FEAT-95 (Story Call), FEAT-82 (promote-to-catalog) |
| `src/features/evaluate/EvaluateChatPage.tsx` | 1,162 | **1,233** | **+71** | FEAT-75/76 (eval writeback + frontier retention) |
| `src/features/records/RecordsPage.tsx` | 1,269 | **1,325** | **+56** | FEAT-105 (hours-by-subject distribution) |
| `functions/src/ai/evaluate.ts` | 1,065 | **1,112** | **+47** | FEAT-74 (weekly review grounds on learner-model frontier) |
| `src/core/types/planning.ts` | 1,046 | **1,055** | +9 | minor, watch itemType threading |
| `src/features/today/KidTodayView.tsx` | 1,055 | **1,059** | +4 | minor |
| `src/features/today/TodayPage.tsx` | 1,123 | **1,104** | **−19** | Net *decrease* — FEAT-96 (Today de-accretion) removed more than FEAT-103/107 added. Only large file to shrink this cycle. |

**Newly crossed 1,000L this cycle:** `src/features/records/records.logic.ts` → **1,031L** (FEAT-105,
well-tested, cohesive); `src/features/books/printBook.ts` → **1,003L** (FEAT-98/99, marginal). Neither is
a decomposition concern yet. **No brand-new file debuted above 1,000L in a single week** — the largest
genuinely-new file (`src/features/watch/WatchPlayer.tsx`) is 320L.

**All drift this cycle is attributable to named, git-log-confirmed `FEAT-*` commits — no silent/unexplained
growth found among the tracked large-file set.**

### 1.2 Bundle (ARCH-05 / ARCH-08)

**Current: 4,201.42 kB / 1,247.67 kB gzip** — up **+120.98 kB / +39.60 kB gzip** (+2.96% / +3.28%) since
2026-07-12, a heavier cycle proportionate to 213 commits and two new feature surfaces landing.

Root blocker **unchanged**: `AvatarThumbnail.tsx:2` still statically imports `three`, still used directly
in `AppShell.tsx` (lines 89, 235, always-rendered nav chrome, not route-gated). **Zero `React.lazy()`/
`lazy(` matches in `src/app/router.tsx`.** The 4-step split proposed since `ARCHITECTURE_AUDIT_2026-05.md`
is unchanged and still just a proposal. Heaviest static imports unchanged (`three`, `jsPDF` — now also
consumed by the new `printableKit.ts`, curriculum data). **ARCH-05 / ARCH-08 still OPEN**, no new urgency
signal beyond the proportionally larger delta.

### 1.3 WorkbookConfig → ActivityConfig migration (ARCH-06) — growth negligible this cycle

**45 references across 13 files** (up from 43/12 at 2026-07-12). The one new file is
`src/core/foundations/dailySignalTargeting.ts` (1 ref, a comment-level type-shape reference —
`WorkbookConfigLike & { currentPosition? }`). This is trivial growth compared to 07-05→07-12's FEAT-62-scale
addition. The dominant blocker (`PhotoLabelForm.tsx`, 8 refs) is unchanged.
**Recommendation unchanged: ARCH-06 still needs an explicit re-scope decision** (home-base chat); the ref
count won't reach zero unattended, but this week's growth is not itself alarming.

### 1.4 Ladder deprecation (ARCH-07) — CLAUDE.md's tech-debt bullet is now stale

CLAUDE.md's Known Technical Debt still lists: *"Dead `ladders` collection query — `functions/src/ai/generate.ts`
still queries a `ladders` collection that is never written to. Safe to remove."* Re-verified:
`grep -in "ladders" functions/src/ai/generate.ts` returns **nothing** — the query is already gone. This bullet
no longer describes the current repo state. **Mechanical doc fix recommended, not applied here** (CLAUDE.md
tech-debt bullets are prose judgment calls, not a stat/index/nav-label correction covered by the
"apply directly" rule) — flagging for a follow-up doc pass.

### 1.5 Drift since last audit — where the 213 commits actually went

The large-commit-count week did **not** manifest as new giant files — it manifested as **two entirely new
feature surfaces**, neither reflected in CLAUDE.md's Project Structure or Firestore Collections tables:

1. **`src/features/watch/` — "Watch Vehicle" (FEAT-100 through FEAT-108).** 2,899 lines across 22 files
   (12 source + 10 test — strong 10/12 test ratio), a new `watchLibrary` Firestore collection
   (`src/core/firebase/firestore.ts:735–740`), a YouTube IFrame Player API integration with a CSP allowlist
   addition (FEAT-101), app-owned fullscreen (FEAT-102), full planner/Today wiring (FEAT-103,
   `itemType:'watch'`). **Zero mentions in CLAUDE.md.**
2. **"Story Call" (FEAT-95/97/98/99)** — grandparent read-aloud call mode inside `src/features/books/`
   (`grandparentBrief.ts`, `storyCallLabels.ts` centralizing Mimi/Papa audience labels). Smaller scope,
   extends an already-documented feature directory, also absent from any doc surface.

This is a documentation-lag finding (doc-maintained structure tables haven't caught up to a fast week), not
a code defect.

### 1.6 Test coverage (TEST-01 / TEST-02 / TEST-04)

**Root: 4,168 tests / 316 files (+709 / +68); functions: 634 tests / 35 files (+71 / +4).**

- **TEST-01 — partial improvement, gap not closed.** `src/features/progress/` is no longer down to 1 test
  file — now **4 files** (`multiPageScan.test.ts`, `FoundationsTab.test.tsx`, `FoundationsDiagPanel.test.tsx`,
  `foundationsView.test.ts`). Real progress, but **none test `DispositionProfile.tsx`** — the specific gap
  the row names is still open. Ledger status text updated below (refresh, not closure).
- **TEST-04 still fully OPEN**, re-verified byte-for-byte: no `useDadLabReports` test, no
  `DispositionProfile.test.*` file exists. Unchanged.
- **Both new feature surfaces this week are well-tested, no gap warranted:** `src/features/watch/` (10
  test / 12 source files) and the Barnes Bros business subtree additions (22 test / 30 source files,
  including new `OrdersSection.test.tsx`, `CatalogPromoteDialog.test.tsx`). FEAT-105's
  `computeSubjectDistribution` is directly tested with an explicit reconciliation guard.
- **TEST-02** (`BookEditorPage.cover.test.tsx` flake): not re-triggered this run; see Step 0's note on two
  *new* first-test-in-file timeouts of the same shape.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 "Where is Lincoln" (FUNC-01) — confirmed-fine, no new claimants

Re-swept every `learnerModels`/`skillSnapshots` writer. All remain inside the standing hierarchy
(`skillSnapshots` via `skillSnapshotWrites.ts`; `learnerModels` via the Learner Model layer). Confirmed in
code (not just prose) that the Barnes Bros / Kit Builder / catalog surfaces have **zero**
`learnerModel`/`skillSnapshot` references anywhere under `src/features/business/` or
`functions/src/business/`. **Status quo holds** — a light, confirm-only cycle.

### 2.2 Loop integrity — traced FEAT-68/69/72/73/74/75/76 end to end against live source

Traced the full chain: daily struggle signal (`TodayChecklist.tsx` mastery chip / `engagement:'struggled'`)
→ `stuckRetestQueue.ts` → the workbook-position ∪ skillTag union bridge
(`dailySignalTargeting.ts:148-160`) → `foundationsReviewActions.ts`'s `queueTest` writer (reusing the
Review-Chat path, no forked writer) → `questTargeting.ts`'s `selectQuestTargets`, called live from
`useQuestSession.ts:516-518` → weekly review grounding (FEAT-74: `synthesizeIfStale` now correctly runs
*before* `generateReviewForChild` in both the scheduled and manual paths) → guided-eval writeback
(FEAT-76: `skillSnapshots` write unchanged, `syncEvalFindingsToModel` fires fire-and-forget, guarded and
non-blocking as designed). **The loop closes end-to-end on current HEAD.**

**Two transient (already-fixed) silent-drop bugs surfaced and were caught mid-week** — both the same
failure shape, worth naming as a pattern rather than two isolated bugs:

1. `82a355c` fixed the workbook-position bridge leg using exact-normalized equality, so *every* real family
   workbook name failed to bridge (the FEAT-68 workbook leg was silently inert — resolver quietly returned
   `[]`, no re-test ever queued, no parent-visible signal). Same-day follow-up `a27a003` then had to guard
   the fix's contains-matching against silently mismatching TGTB Language-Arts levels.
2. `11d1964` fixed the original FEAT-76 commit gating the eval writeback on `if (sessionDocId)`, silently
   skipping it on exactly the first-turn/slow-network Apply case most likely to happen in practice.

Both are fixed on HEAD — not an open bug — but the recurring shape (deterministic resolver/gate → silent
`[]`/skip → `console.warn`-only, no parent-visible or ledger-visible signal) is worth a lightweight
monitoring convention before the next learner-model writer ships (see FUNC-14's sibling note below; not
elevated to its own ID this cycle since both instances are already resolved).

### 2.3 Shelly's path — confirmed-fine, one positive delta

Reviewed actual diffs for the UX-A/B/C1/C2a passes and the Hours-by-Subject pair. UX-A is a **positive**
ethos delta: the MVD chip changed from `warning` (amber) to `info` (blue) in `TodayPage.tsx:952` so a
Minimum Viable Day no longer visually reads as a problem state, and the energy-card title moved from raw
`DayLog (${date})` to "How's today going?" The Hours-by-Subject percentage suppression
(`records.logic.ts:435-436`, `percentagesMeaningful`) is a real guard, not cosmetic — consistently checked
at all four render/print sites, falling back to an em-dash rather than a misleading percentage.

### 2.4 Kid voice-first — one real flag: Kit Builder roster form

Watch Vehicle and batch photo capture both confirmed tap-first / parent-gated correctly. **Flag:** FEAT-94
(`74456c3`) explicitly opened Kit Builder's roster-authoring, art generation, download, and print to
unrestricted kid access ("gates protect money and public exposure, not kid effort"). But
`KitBuilderForm.tsx` requires typing across up to 8 free-text fields (vault/hero/defender/invader
names+powers, win condition) with **no `VoiceInput` import anywhere in the file**. This isn't a fresh
regression — `KitBuilderSection.tsx:56` already says *"the voice-capture flow is slice 2"* and
`docs/GDQ_KIT_BUILDER_DESIGN.md` §7 scoped it as a deferred slice reusing the Story Guide's voice/type-toggle
pattern — but the build sequence jumped from slice 1 straight to FEAT-94's kid-access opening without ever
building the voice slice the gate decision assumed. Given Lincoln is speech-delayed and CLAUDE.md's own
principle states *"Narration counts … especially for Lincoln,"* this is now the single most typing-heavy
kid-facing surface in the app with an already-designed voice alternative sitting unbuilt. **New finding,
see §5 (FUNC-14).**

### 2.5 Multi-kid generality sweep — ARCH-41/ARCH-42 unchanged; broader pattern found (§ Step 1 ARCH-43)

- **ARCH-41**: `MyAvatarPage.tsx:1365` unchanged; `KidTodayView.tsx` — pattern present, line shifted
  `:235 → :240` (unrelated drift, not a new site).
- **ARCH-42**: `KidLabView.tsx:54,278` — unchanged, still unfixed.
- A fresh full-tree sweep for `=== 'Lincoln'` / `.name.toLowerCase() === 'lincoln'` found **20 total sites**
  versus the 4 the ledger currently tracks. `git log -S` pickaxe confirms these are pre-existing (not new
  this week, one exception carried forward verbatim by FEAT-69) — a case of prior audits' narrower sweep
  missing the full instance count, not new drift. Most are cosmetic/content (permitted by policy);
  `TeachBackSection.tsx`'s gate is very plausibly intentional (Teach-back is explicitly "Lincoln teaches
  London" by design). The actionable issue is that **none of the 20 sites use the existing capability-safe
  `childIdentity.ts` abstraction** that was built for exactly this purpose (ARCH-15's fix). Filed as
  **ARCH-43** (§5).

### 2.6 MO→TX compliance, UX layer — confirmed-fine

No commits this cycle touched `chatPlanner.logic.ts`, `PlannerChatPage.tsx`'s time-budget logic, or
`TodayPage.tsx` in a way that adds new state-config coupling (the Watch Vehicle threading commits
explicitly avoid compliance-counting internals, confirmed by diff). Unchanged from 2026-07-12.

---

## Step 3 — Pedagogy & Ethos (Band 3)

*Methodology note: this window's `git log` intersects a shallow-clone boundary (`.git/shallow`, one grafted
commit — `c9ab1ea` — inside the review window), which renders as a false full-repo diff via `git show`. All
findings below were re-verified with `git diff <real-parent>..<commit>` against the boundary commit's true
parent. Flagging for the next audit cycle in case the boundary shifts again.*

### 3.1 Charter preamble coverage — confirmed-fine, no regression

`CHAT_TASKS` registry (`functions/src/ai/tasks/index.ts:27-47`) still has exactly **21 keys**, byte-identical
set to 2026-07-12. The one new endpoint this week, `submitCatalogOrder` (FEAT-88), is the repo's only
unauthenticated `onRequest` function and deliberately bypasses the chat/charter path — it writes exactly
one order doc via the admin SDK, no AI call, so correctly has no charter preamble.

### 3.2 Pace/pressure language scan — confirmed-fine, one model-example finding

Swept every prompt-touching diff since 2026-07-12 (FEAT-74 weekly-review grounding, FEAT-75/76 guided-eval
writeback, FEAT-72/73 planner tag doctrine). **Zero behind/ahead/grade-level/percent/score hits.**
FEAT-75/76's `evalModelSync.ts` — the first writer permitted to move a concept state *down* — is explicitly
ethos-engineered: cites ETHOS-02 by name, renders downward moves as `"still forming"` / `"at the working
edge"` / `"just getting started"` (never "regressed"/"dropped"), and frames a downgrade as *"revisiting —
guided eval showed '{kid}' is {edge word}."* This is a model example of the no-shame convention being
actively engineered in, not just avoided.

### 3.3 Diamonds-not-scores — confirmed-fine

No new score/percentage/level-number UI surfaces this cycle. The week's largest new surface cluster
(Barnes Bros business, ~55 commits) is currency framing (sales totals, order counts), correctly kept
separate from learning framing — zero score/percent/grade-level hits across `src/features/business/*.tsx`.
`GoalThermometer.tsx` and the new `useArtQuota.ts` (FEAT-94) both ship explicit in-code no-shame guardrail
documentation.

### 3.4 New-surface charter alignment — confirmed-fine

Spot-checked `OrdersSection.tsx` (the largest new kid/parent-facing surface): status chips use "a warm
progression, never alarming" color mapping, forward-only stepper, celebratory completion/new-order copy —
no urgency/deadline language on what could easily have shipped as a due-date-pressured order queue.

### 3.5 Charter reach into new business logic — boundary held

`grep -rl "skillSnapshot\|learnerModel\|xpLedger" src/features/business/ functions/src/business/` returns
**zero files**. The business/learning boundary is structural (separate collections, no cross-imports), not
just convention — held cleanly across all ~55 business commits this cycle.

**No new ETHOS- finding this cycle.**

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — re-verified, invariant holds (unlike the last two cycles, actually exercised)

`src/features/records/` **was** touched this week — 4 FEAT-105 ("Hours by Subject") commits.
`computeSubjectDistribution(summary)` is a **pure derivation off the already-computed `HoursSummary`**
(zero new Firestore reads, zero new counting/writes), with its own reconciliation guard test
(`rowSum === summary.totalMinutes`). The one substantive bug fixed this week (`6b040f4`) was in the
**display layer** (a negative correction could push a derived percentage out of 0–100 or produce a false
100%; fixed via `percentagesMeaningful` gating) — not the counting path. **Single-counting-path invariant
holds.**

### 4.2 DATA-02 — still NEEDS-DATA, now 18 days overdue

Freeze window (2026-07-01) is now **18 days elapsed** (was 11 at 2026-07-12), with still no repo-visible
follow-up. Genuinely unresolvable from a repo-only audit. **Now the longest-standing overdue item in the
ledger** — status text updated below.

### 4.3 DATA-13 — still OPEN, content unchanged, line numbers shifted

Re-verified all four sites, byte-identical content, lines shifted **809/836/873/909 → 923/950/989/1027**
(FEAT-105 added ~130 net lines above them in the same file). `StateComplianceConfig` still has no
`reportTitle` field. **Notable context change:** DATA-12 (per-state compliance config, landed 2026-07-15)
is now actively wired in — `getStateConfig(...).legalCitation` is read live one function above DATA-13's
four hardcoded sites, making this the same easy pattern to copy. **Now arguably the easiest open
PROMPT_FIX in the ledger.**

### 4.4 Additive-hours invariant — held, actively exercised this week

Zero commits touched `collectHoursContributions`/`dayLogMinuteContributions`/`computeHoursSummary` as
callees this cycle — only the new read-only `computeSubjectDistribution` view layered on top. The one
other records-adjacent commit (`1fe7341`, a long-diverged branch reconciliation touching
`HoursRoutingAuditPanel.tsx`) is the pre-existing DATA-16 **read-only audit tool**, confirmed never writing
to the counting path.

### 4.5 New MO-hardcoding since 2026-07-12 — none found

Re-swept for `Missouri|MO_| MO |600.*hour|600.*core`; every hit resolves to the known DATA-13 sites,
DATA-12's intentional config, or explicit boundary comments in new business code (`catalogSheet.ts`,
`printableKit.ts`, `HoursRoutingAuditPanel.tsx`) noting they reuse the compliance-report pattern without
touching compliance totals.

### 4.6 Business-feature / compliance decoupling — confirmed held

Given the volume of Barnes Bros work this week (Kit Builder, Product Catalog, public order queue), checked
specifically for any path letting business data count toward school hours: **zero write coupling** —
every relevant file carries an explicit isolation comment (*"no roster/product/learner-model/hours/XP
touch"*), and no `collection(..., 'hours')`/`hoursAdjustments` reference exists anywhere under
`src/features/business/` or `functions/src/business/`.

**No new DATA- finding this cycle** beyond the two status-text refreshes above.

---

## Step 5 — Findings Table and Summary

### 5.1 New ledger rows this cycle

| ID | Band | Title | Evidence |
|---|---|---|---|
| **ARCH-43** | 1 | 20 sites reimplement `child.name.toLowerCase() === 'lincoln'` / `=== 'Lincoln'` as ad-hoc literal comparisons instead of using the existing capability-safe `childIdentity.ts` abstraction; only 4 of the 20 are currently ledger-tracked (ARCH-41/42) | `AvatarCharacterDisplay.tsx:205`, `useShellyChatFlows.ts:127`, `ExplorerMap.tsx:58`, `TodayChecklist.tsx:347`, `TeachBackSection.tsx:40`, `UnifiedCaptureCard.tsx:95`, `RoutineSection.tsx:76`, `CreateSightWordBook.tsx:55`, `BookReaderPage.tsx:116`, `StoryGuidePage.tsx:46`, `PageEditor.tsx:63`, `StickersPage.tsx:41`, `BookEditorPage.tsx:174,582`, `BookshelfPage.tsx:70`, `BookGenerateChat.tsx:72`, `BookReviewChat.tsx:52` (plus ARCH-41/42's known 4) |
| **FUNC-14** | 2 | Kit Builder roster form (`KitBuilderForm.tsx`) is fully typing-only (8 free-text fields, no `VoiceInput`) despite FEAT-94 opening it to unrestricted kid access; the designed voice-capture slice (`docs/GDQ_KIT_BUILDER_DESIGN.md` §7 slice 2) was never built before the gate opened | `src/features/business/KitBuilderForm.tsx` (no VoiceInput import), `KitBuilderSection.tsx:56` ("voice-capture flow is slice 2"), gate commit `74456c3` (FEAT-94) |
| **DOC-10** | — | `src/features/watch/` (Watch Vehicle, FEAT-100–108, 2,899L/22 files) and its `watchLibrary` Firestore collection are entirely absent from CLAUDE.md's Project Structure / Firestore Collections tables; CLAUDE.md's "dead `ladders` query in `generate.ts`" tech-debt bullet is now stale (code already removed) | `CLAUDE.md` Project Structure + Firestore Collections + Known Technical Debt sections vs. current `src/features/watch/`, `functions/src/ai/generate.ts` |

### 5.2 Status refreshes on existing rows (no new IDs, ledger discipline: status-only)

| ID | Was | Now |
|---|---|---|
| ARCH-01/02/03/04/05/06/08 | various OPEN, 07-12 numbers | OPEN, re-verified 07-19 numbers recorded (§1.1–1.3); ARCH-02 now the single largest file in the repo |
| ARCH-41/42 | OPEN, 07-12 sites | OPEN, unchanged (ARCH-41's `KidTodayView.tsx` line drifted 235→240, same site) |
| TEST-01 | OPEN, `progress/` 1 test file | OPEN, `progress/` now 4 test files — `DispositionProfile.tsx` still untested, gap not closed |
| DATA-02 | NEEDS-DATA, 11 days overdue | NEEDS-DATA, **18 days overdue** — longest-standing overdue ledger item |
| DATA-13 | OPEN, sites at :809/:836/:873/:909 | OPEN, unchanged content, sites now at **:923/:950/:989/:1027** (FEAT-105 line shift); DATA-12's live `getStateConfig()` pattern makes this the easiest open fix in the ledger |

### 5-line executive summary

**Baseline GREEN** — lint 3 warnings (unchanged), tsc clean, 4,168/316 root tests + 634/35 functions tests
passing (real +709/+71 growth, all attributable), bundle 4,201 kB (+121 kB, a heavier-than-usual cycle),
one transient full-suite test-timeout flake confirmed non-reproducing in isolation. **Scale note:** 213
commits landed this week (5–20× the recent cadence) — the volume shows up as two new well-tested feature
surfaces (Watch Vehicle, expanded Barnes Bros business) rather than large-file bloat; no file crossed
1,500L for the first time. **Top new finding:** ARCH-43 — the Lincoln-name-literal pattern is 5× larger
than previously tracked (20 sites vs. 4), all bypassing the capability-safe abstraction built for exactly
this purpose. **Second new finding:** FUNC-14 — Kit Builder's kid-access gate opened ahead of its own
designed voice-capture slice, leaving the app's most typing-heavy kid surface live for a speech-delayed
child. **Recommended PROMPT_FIX sequence:** DATA-13 (trivial, now with a proven-this-week pattern to copy)
→ ARCH-42 (higher-severity multi-kid blocker, unfixed since 06-2026) → FUNC-14 (voice-slice scoping
conversation, not necessarily a single PROMPT_FIX) → ARCH-41 → ARCH-43 (larger refactor, needs its own
scoping run) → DATA-02 (owner action against a live Firestore export, 18 days past due, not a PROMPT_FIX).
