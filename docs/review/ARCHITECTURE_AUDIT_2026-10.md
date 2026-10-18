# Architecture Audit — 2026-10

> **Type:** Monthly deep audit (scheduled run).
> **Auditor:** Claude Code · **Date:** 2026-10-18
> **Branch:** `claude/brave-feynman-k8uu1j` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied; mechanical doc/ledger corrections only.
> **Prior audit:** `ARCHITECTURE_AUDIT_2026-10-04.md` (window end `12ad312`, 2026-09-27).
> **Window covered:** `12ad312` → `16d52b4` (`origin/main` when this run started) — **129 commits, 176 files,
> +38,596 / −1,066** (`git log --oneline 12ad312..origin/main | wc -l`; `git diff --shortstat 12ad312..origin/main`).
> Headline: a **feature-heavy window** — native-progress capture (`FEAT-241`), Fast Phonics whole-program
> completion (`FEAT-242`), the before-work page check (`pageCheck` task), Arcade sticker art, plus capture-save
> hardening. No new break in the learning loop, compliance or ethos; the debt finding is that several of the new
> files were **born large** (`ARCH-52`).

---

## Step 0 — Baseline

Run in this environment on a fresh `npm ci` of the tree at `16d52b4`:

```
npm run lint                      → 0 errors, 4 warnings (exhaustive-deps: useQuestSession.ts x3, StickerLibraryTab.tsx x1)
npx tsc -b                        → CLEAN
npx vitest run                    → 778 files, 11,437 passed + 1 skipped, 0 failing
cd functions: npm run lint        → CLEAN
cd functions: npx tsc --noEmit    → CLEAN
cd functions: npm test            → 79 files, 1,808 passed, 0 failing
npm run build                     → dist/assets/index-*.js  4,349.72 kB │ gzip: 1,301.59 kB
npm run docs:check                → HARD green, 11 SOFT warnings; [ledger-status] PASS
```

**Baseline: GREEN.** Deltas vs 10-04: root **725 → 778 files, 10,391 → 11,437 tests**; functions
**69 → 79 files, 1,538 → 1,808 tests**. The one new lint warning is `StickerLibraryTab.tsx:374`
(`stickers` conditional could change `useCallback` deps every render) — warning only, from the Arcade/sticker work.

**Bundle: 4,231.15 kB → 4,349.72 kB (+118.57 kB), gzip 1,265.18 → 1,301.59 kB (+36.41 kB).** The window's
feature code (all eagerly imported) reversed about 30% of what `FIX-253` removed. `grep -c "lazy(" src/app/router.tsx`
→ **0**: route-level splitting (`ARCH-05`/`ARCH-08`) is still unbuilt, so every new route adds to the one chunk.

## Step 0.5 — Lenses

- **Learning-loop integrity:** 2.2. No break found.
- **Multi-kid generality:** `npm run census:arch-audit` → **17 name-literal sites in 15 files**, identical to
  10-04. The new native-progress, program-completion and page-check files contain no `Lincoln`/`London` branch
  (checked by `grep` over those directories; comments excluded). No regression.
- **MO→TX:** no new MO hardcoding (4.4).

---

## Step 1 — Architecture & tech debt (Band 1)

### 1.1 Files ≥ 1,500L — **18**, same set as 10-04

`npm run census:arch-audit -- --base=12ad312` prints 18 production files ≥ 1,500L (946 files scanned).
Sizes and judgments carried from 10-04 except where moved:

| Lines | File | Judgment | Note |
|---|---|---|---|
| 3,942 | `planner-chat/PlannerChatPage.tsx` | **Tangled** (`ARCH-02`) | line-flat; unaddressed a **seventh** cycle |
| 3,129 | `ai/chat.ts` | **Tangled** (`ARCH-01`) | +21 net (3,108 → 3,129): `pageCheck` routing |
| 2,433 | `books/BookEditorPage.tsx` | Cohesive-but-big (`ARCH-03`) | flat |
| 2,275 | `quest/useQuestSession.ts` | **Tangled** (`ARCH-04`) | flat |
| 2,106 | `ai/evaluate.ts` | Tangled (`ARCH-51`) | flat since filing |
| 1,968 | `today/TodayPage.tsx` | Cohesive-but-big | +16 |
| 1,966 | `records/dataReviewExport.logic.ts` | **Tangled-leaning, growing** (`ARCH-44`) | **+190** (1,776 → 1,966) |
| 1,928 | `workshop/WorkshopPage.tsx` | Cohesive-but-big | flat |
| 1,919 | `ai/tasks/shellyChat.ts` | Cohesive-but-big | flat |
| 1,897 | `avatar/MyAvatarPage.tsx` | Cohesive-but-big | flat |
| 1,888 | `progress/CurriculumTab.tsx` | Not yet judged (`ARCH-50`) | +31 (native-progress mount) |
| 1,841 | `today/TodayChecklist.tsx` | Cohesive-but-big | flat |
| 1,682 | `planner-chat/chatPlanner.logic.ts` | Cohesive-but-big | flat |
| 1,638 | `ai/contextSlices.ts` | Cohesive-but-big | flat |
| 1,614 | `records/RecordsPage.tsx` | Cohesive-but-big | flat |
| 1,606 | `avatar/VoxelCharacter.tsx` | Cohesive-but-big | leave |
| 1,530 | `settings/DevAdminTab.tsx` | Cohesive-but-big | flat |
| 1,506 | `shelly-chat/useShellyChatActions.ts` | Cohesive-but-big | flat |

Sizes are `census:arch-audit`'s line counts; "flat" means the 10-04 audit's figure is unchanged. The
cohesive/tangled judgments for rows not marked otherwise are carried forward, not re-read — the census proves
size, not cohesion.

### 1.2 Drift: 28 files moved >150L — and three were born large (`ARCH-52`)

`census:arch-audit --base=12ad312` lists 28 production files with |net delta| > 150L. The largest:
`core/firebase/programCompletionWrites.ts` **+1,365**, `program-completion/ProgramCompletionPanel.tsx`
**+1,229**, `native-progress/NativeProgressSection.tsx` **+988**, `books/ArcadeArtDialog.tsx` +762,
`native-progress/nativeProgressRule.ts` +723, `shared/foundations/completionCoverage.ts` +680. The first three
are all new files from `FEAT-241`/`FEAT-242`. Two sit within 135L and 271L of the 1,500L line on first commit —
the same pattern as `ARCH-44` (`dataReviewExport.logic.ts` shipped at 1,612L). Separately `ARCH-44`'s own file
grew +190L this window.

**Severity P3, band 1.** `programCompletionWrites.ts` is one transactional rail with heavy tests and is
plausibly cohesive; `ProgramCompletionPanel.tsx` is the likelier tangle (UI states + confirm/withdraw/review
flows in one component). **Proposed action:** design-first read of the panel's section boundaries before it
crosses 1,500L; no change to the completion rail. Filed as **`ARCH-52`**. `ARCH-44` stays OPEN with the new
figure.

### 1.3 Bundle (`ARCH-05`/`ARCH-08`)

Main chunk **4,349.72 kB** (Step 0), +118.57 kB. The 10-04 finding stands unchanged: Three.js reaches the
initial chunk through `AvatarThumbnail` in the app shell, so a route-level `React.lazy` on `/avatar` alone
removes nothing; a real split needs `AvatarThumbnail` behind `Suspense` or a non-Three fallback. **No reduction
figure is asserted** — a measured chunk graph of the real build is still the prerequisite. New route-level
weight this window (native progress, program completion, Arcade art dialogs) is a second argument for the
split but is also unmeasured. Architectural decision for the owner, not an auto-fix.

### 1.4 Test coverage (`TEST-01`)

`census:arch-audit` → **5** feature directories with 0 test files: `auth`, `login`, `not-found`, `planner`,
`ui-preview` — unchanged; `TEST-07` already tracks `auth`/`planner`. `workshop` remains the thinnest real-logic
area at **45 source / 8 test** files (unchanged). The window's new features arrived with tests (root +53
files, +1,046 tests). Highest-value additions are unchanged: a `workshop` logic test over its game-generation
guards, and `monthly-review` (15 / 7).

### 1.5 `ARCH-06` / `ARCH-43`

ActivityConfig refs **309 (78 files)**, WorkbookConfig refs **38 (12 files)** — both identical to 10-04;
migration completion is still not safe as a drive-by. Name-literal sites **17 (15 files)**, unchanged;
`ARCH-43` stays OPEN.

### 1.6 `ARCH-07`/`ARCH-17`/`ARCH-47`

Not re-opened. `functions/src/shared/` gained `foundations/completionCoverage.ts` and `savedStickerEdit.ts`
(three new files in the directory's diff, all additive), consistent with `ARCH-47`'s shared-rule model.

---

## Step 2 — Functional / UX loop (Band 2)

### 2.1 "Where is Lincoln" (`FUNC-01`)

The 10-05 reconciliation's [source-derived authority trace](FUNC01_AUTHORITY_TRACE_2026-10.md) stands. This
window adds one new writer to the learner-model layer: `programCompletionWrites.ts` writes
`programCompletionState`/`programCompletionEvents` and `learnerModels` coverage evidence in one transaction. Its
own header states it writes no `xpLedger`, `artifacts`, `activityConfigs`, `skillSnapshots`, hours or
`attestation`, and no `firestore.rules` change — it sits inside the layered-ownership decision (learner model
as the evidence layer) and creates no new disagreement with Skill Snapshot or Curriculum position. `native-progress`
is declared isolated by design. Not live-validated; static evidence only.

### 2.2 Loop integrity — Fast Phonics completion → model → quest

Traced: a parent-confirmed whole-program completion (`ProgramCompletionPanel` → `programCompletionWrites`) →
coverage refs on `learnerModels` via the shared `completionCoverage.ts` → `modelStatus.promotedModelStatus` and
`questTargeting` readers → Knowledge Mine re-test; commits `a089a63` and `e8a279d` explicitly release withdrawn
coverage after quests and level projection, so a withdrawal reaches the reader rather than being ignored. The
before-work page check is prospective by design and writes only an AI-usage row (`pageCheck.ts` header), so it
cannot create orphan state. **No dead end found.** Caveat inherited: new `pageCheck` fails closed against an old
dispatcher (client says unavailable) until `functions` is deployed.

Known weak links from `PROCESS_OVERVIEW.md` (iii) were not re-walked this window and carry their existing rows.

### 2.3 Shelly's path / no-shame

Native-progress reports are recorded "as she read it" with a separate observed-on date and correction rows —
no scoring, no pace. Retry-refusal copy (`8ecaf36`) explains rather than blames. No finding.

### 2.4 Kid voice-first

Window changes are parent-gated surfaces (progress, completion) plus the before-work check on Today. Not re-walked for kid taps.

---

## Step 3 — Pedagogy & ethos (Band 3)

- **Pace/pressure language:** scanned the window's added non-test lines for
  `behind|catch up|falling|on track|quota|deadline|target pace|should be at`. Every hit is a code-sense use
  ("left behind" in comments, "the version behind it", network *deadline*s, `ART_QUOTA_MESSAGE`, which is the
  existing non-shaming art cap). **Clean.**
- **Diamonds-not-scores:** no new scoring surface; the three new feature headers each state no XP/hours write.
- **Charter reach:** `CHAT_TASKS` is **22** (`census:arch-audit`), up from 21: `pageCheck` is new. It builds its
  context with `buildContextForTask("scan", …)` (`pageCheck.ts:98`) and `scan`'s slice list begins with
  `charter` (`contextSlices.ts:103`), so the preamble reaches it. Stale "21" counts in three docs corrected
  mechanically (`DOC-28`).

**No new Band 3 findings.**

---

## Step 4 — Data integrity & compliance (Band 4)

### 4.1 `DATA-01` — holds

`grep -rn "computeHoursSummary(" src functions/src` (non-test) → five real call sites (`RecordsPage.tsx:481`,
`dataReviewExport.logic.ts:1461`, `useWeekHours.ts:40`, `weekBySubject.ts:418`, `weekRibbon.logic.ts:320`) plus one
comment line in `MonthlyTrend.tsx:27`. Same five as 10-04; the export's line moved with its +190L growth. No new
reader. `git diff --stat 12ad312..origin/main -- src/features/records/records.logic.ts` is empty and the only
`functions/src/shared` changes are additions (`completionCoverage.ts`, `savedStickerEdit.ts` + test) — the hours
fold did not move. **The authoritative core-hours figure cannot be recomputed from a repo-only audit** (it is a
fold over live Firestore); the last recorded figure (598.73 h, `ARCHITECTURE_AUDIT_2026-05.md:255`) is stale
only to the extent hours were logged since, and the owner's live reading is the authority.

### 4.2 `DATA-02` — still NEEDS-DATA

Requires a live Firestore export; unresolvable here. 2026-10-18 − 2026-07-01 = 109 days past the freeze window.

### 4.3 `DATA-13` — unchanged

`grep -n "Missouri" src/features/records/records.logic.ts` → lines **1046 / 1073 / 1120 / 1150**, identical to
10-04; the file is untouched in the window.

### 4.4 MO→TX lens

`grep -rlE "Missouri|'MO'|MO_" src functions/src` (non-test) → 6 files, the same set as before. No new hardcoding.

### 4.5 Additive-hours invariant

Holds. The three new write layers each state in their headers that they write no `hours`/`xpLedger`
(`programCompletionWrites.ts:38`, `nativeProgressWrites.ts:21`, `arcadeArtSession.ts:26`); a `grep` for
`xpLedger|addXpEvent|hours` writes in them matches only those disclaimer comments. No new independent minute sum.

---

## Step 5 — Ledger and recommended actions

**Filed:** `ARCH-52` (§1.2), `DOC-28` (mechanical: task-registry count 21 → 22 in `CLAUDE.md`,
`docs/MASTER_OUTLINE.md`, `docs/PROJECT_CONTEXT.md`). **Re-verified, unchanged:** `ARCH-02` OPEN (seventh
cycle), `ARCH-05`/`ARCH-08` OPEN (bundle +118.57 kB), `ARCH-43` OPEN (17 sites), `ARCH-44` OPEN (+190L),
`ARCH-51` OPEN, `DATA-01` FIXED, `DATA-02` NEEDS-DATA, `DATA-13` OPEN. Header `Last audit` bumped.

**Recommended `PROMPT_FIX` order:**
1. `DATA-13` — route the four Missouri literals through `stateCompliance.ts` (trivial, unblocks TX).
2. `ARCH-05`/`ARCH-08` — measured chunk graph first, then the owner's decision.
3. `TEST-01` — a `workshop` logic test file.
`ARCH-44`/`ARCH-51`/`ARCH-52` are design-first reads, not fix targets.

*Every number above is printed by `npm run census:arch-audit -- --base=12ad312`, `npm run build`, the named
`grep`, or the test runners' own summaries; the window's size is `git diff --shortstat`.*
