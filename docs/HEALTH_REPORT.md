# Code Health Report — 2026-09-07

## Metrics

| Metric | Value | Change from last report (2026-08-24) |
|--------|-------|--------------------------------------|
| **Total lines** | **317,104** | +41,532 |
| **Commits** | **3,403** | +300 |
| **Test files** | **537** | +132 |
| **Tests passing** | **7,788** (root, 1 failing) + **1,371** (functions/ own suite) | +1,663 root, +357 functions |
| **Firestore collections** | **47** | −1 (`bookThemesCollection` retired, FEAT-194) |
| **Cloud Functions** | **29** | +0 |
| **Chat task types** | **21** | +0 |
| **Routes** | **36** | +0 |
| **Bundle size** | **4,428.50 kB / 1,326.22 kB gzip** | +76.42 kB / +29.02 kB gzip |

---

## Build Status

| Check | Status | Notes |
|-------|--------|-------|
| **Build** | ✅ PASS | `tsc -b && vite build` clean (~24s). Fresh sandbox — `npm ci` at root and in `functions/` required (not a repo issue). |
| **Lint** | ⚠️ 3 WARNINGS | 0 errors; same 3 `react-hooks/exhaustive-deps` warnings as every prior cycle (`EvaluateChatPage.tsx:295`, `useQuestSession.ts:814`, `useQuestSession.ts:2083`, all involving `sessionTimer`). Not mechanically fixable without reviewing timer semantics. |
| **Tests (root)** | ❌ **1 FAILING** — **resolved 2026-09-08 (UX-272)** | 7,788 passing, 1 failing, 0 skipped (537 test files, `src/` + `functions/src/` combined via root `vitest.config.ts`). See **CRITICAL finding** below — a test-infrastructure gap exposed only by a full-history clone. `ci.yml` (PR checks, push to `main`) checks out shallow and is unaffected, **but `deploy.yml` checks out with `fetch-depth: 0` and runs this suite — a push to `deploy` will hit this failure and block the Firebase deployment.** |
| **Tests (functions/)** | ✅ PASS | 1,371 passing, 0 failing (61 test files) — functions' own `vitest.config.ts` (real deps, no Anthropic/OpenAI/firebase-admin stubs) |
| **TypeScript** | ✅ PASS | `npm run build` (`tsc -b`) + a standalone `npx tsc --noEmit -p tsconfig.app.json` (Phase 3g orphaned-import check) both clean; `functions`' `tsc --noEmit` also clean — no orphaned imports |
| **`npm run docs:check`** | ✅ PASS | All HARD checks pass (ledger IDs, index resolution, ledger anchors, collection-count spans, evidence kinds, day-write routing, ledger-status, ledger-status-contradiction). 10 SOFT warnings — see **docs:check findings** below. `--fix` made no changes (nothing to auto-fix). |
| **npm audit (prod, root)** | ⚠️ **1 moderate** | `fflate` (ReDoS-adjacent infinite-loop on malformed ZIP64) — was 0 last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (Rule 8: moderate-only → note, don't fix). |
| **npm audit (prod, functions)** | ⚠️ **3 moderate** | `qs`/`body-parser`/`express` transitive chain — was 0 last cycle. Fix available via `npm audit fix` (non-breaking); not applied per policy (moderate-only). |
| **npm audit (full, root)** | ⚠️ 12 vulnerabilities (1 low, 10 moderate, 1 high) | The 1 high is dev-dependency-only (not in `--production` tree). Fix requires `--force` (breaking) for the dev-only remainder. Low priority per policy. |
| **npm audit (full, functions)** | ⚠️ 7 vulnerabilities (6 moderate, 1 high) | Same pattern — high is dev-only (`firebase-functions-test` → `ts-deepmerge`/related). Fix requires `--force` (breaking). Low priority per policy. |

---

## CRITICAL finding — **RESOLVED 2026-09-08 (UX-272)**

> **Resolution.** The historical-sweep test is **removed**; the sweep survives as an **opt-in probe**
> (`npm run docs:ledger-sweep`, gated on `LEDGER_HISTORY_SWEEP`) and no longer runs in `npx vitest run`,
> so `deploy.yml` is unblocked. Owner decision, 2026-09-07: *"Guard the live ledger. Drop the walk over
> history."* — history is immutable, so a row that read ambiguously in July cannot be fixed now and the
> assertion could only ever accumulate exceptions. `findContradictoryStatusRows` and both pattern lists
> are **untouched**, the `holds on the live ledger` sibling remains the guard, and the two false
> positives the sweep originally found (`FEAT-177`, `ARCH-42`) stay pinned as verbatim fixtures.
>
> **Two corrections to the diagnosis below, both measured on a full clone (591 ledger revisions):**
>
> 1. The offenders are **not** "all tagged `FEAT-112`". There are **67 hits across 5 rows**: `FEAT-112`
>    ×57 (the amendment-PR narrative described below), `FEAT-152`/`FEAT-153`/`FEAT-154` ×9 (the house-rule
>    shape *"SHIPPED — PR #NNNN, date; awaiting human review + merge"*, which the guard fires on **by
>    design** — see the `FEAT-99` fixture), and `UX-218` ×1, the true positive.
> 2. The expected list was **never verifiable in the first place**, independently of any workflow. Its
>    docstring records a sweep of *"134 historical revisions"*; a full clone at that same commit had
>    **578**, and every offender sits at position **198+** in the newest-first list. The verification saw
>    a shorter, cleaner history than the assertion would later meet — a sweep's result depends on how
>    deep the clone happens to be.
>
> Neither the house rule (a run flips its own ledger cell before it finishes — DOC-19) nor any historical
> ledger row was changed. See ledger row **UX-272**.

`scripts/check-docs-alignment.test.mjs` → `findContradictoryStatusRows > holds across every historical revision of the real ledger` **fails** with 66 "offenders" instead of the expected 1.

**What happened:** this session started from a **shallow clone** (`git rev-parse --is-shallow-repository` → `true`, `git rev-list --count HEAD` → 225 instead of the true ~3,403). Accurate commit-count stats require full history, so this cycle ran `git fetch --unshallow` (as the 2026-08-24 report's own notes said prior cycles had done: *"budget went to unshallowing git history"*). That test is **explicitly self-guarded to skip on a shallow clone** (`if (run(['rev-parse','--is-shallow-repository']).trim() === 'true') return`) — its own comment states *"SKIPPED ON A SHALLOW CLONE, and that is not a cop-out… CI checks out with `actions/checkout@v4` and no `fetch-depth`, so the runner has depth 1… an unconditional assertion would have failed every CI run."*

**Correction (caught by this PR's own Codex review round):** that self-guard comment is true of `ci.yml` (the workflow that runs on PR checks and on push to `main` — plain `actions/checkout@v4`, no `fetch-depth`, so depth 1, the assertion self-skips, **unaffected**) but **not** of `.github/workflows/deploy.yml`, which checks out with **`fetch-depth: 0` (full history)** at lines 23–25 and runs `npx vitest run` (the root suite, including this test) at lines 59–60. **A push to the `deploy` branch — the full-deploy trigger (hosting, functions, Firestore rules/indexes, Storage) — will hit the real 66-vs-1 assertion failure and stop the workflow before Firebase deployment runs.** This is a live deploy-blocker, not a CI-invisible curiosity. It does not block *this* PR (which targets `main`, checked by shallow `ci.yml`), but it will block the *next* `deploy`-branch push, from anyone, until resolved.

**Why it fails:** the test replays `findContradictoryStatusRows` (a regex heuristic checking a ledger status cell for both a LANDED pattern and an OPEN-PR pattern) over every historical revision of `docs/review/REVIEW_HOME_BASE.md` and asserts exactly one true positive (`1a7c56858f:UX-218`). With full history now present, it finds 66 matches, all tagged `FEAT-112`, across dozens of distinct historical revisions. Inspecting one (revision `48f211a23e`): the FEAT-112 row's status cell reads `**MERGED (PR #1607, 2026-07-20). AMENDMENT PR open — do not merge**` — a legitimate, self-consistent narrative (the original work merged; a *later* amendment PR was separately open) that both the `LANDED_STATUS_PATTERNS` and `OPEN_PR_STATUS_PATTERNS` regexes fire on. This is exactly the false-positive failure mode the test's own docstring warns about: *"a false positive on a row that was correct at the time… the failure mode that gets a rule deleted rather than fixed."*

**Not a regression from anything in this run** — the ledger content is untouched by this session, and the "holds on the live ledger" sibling test (same file) **passes**. This is a latent gap in the checker's pattern-matching precision, and — per the correction above — it is **not** invisible to every workflow: it is invisible to `ci.yml` (shallow) but real and blocking on `deploy.yml` (full history). Per this audit's failure-mode policy this is **not fixed** by this run (a HEALTH_REPORT/CLAUDE.md-doc-only audit doesn't touch `scripts/`), but given it will stop the next production deploy, this needs a human decision **before the next push to `deploy`**, not at leisure: (1) tighten `LANDED_STATUS_PATTERNS`/`OPEN_PR_STATUS_PATTERNS` (or the test's expected-offenders list) to account for the "amendment PR, original already merged" narrative shape and re-verify against full history, or (2) as a faster stopgap, make the test's shallow-clone guard unconditional (skip regardless of clone depth) if replaying full ledger history isn't meant to be a deploy-blocking check at all — but that trades away a real regression detector, so option (1) is preferred.

This branch is left **unshallowed** so the finding is reproducible from the pushed state; a normal CI checkout (shallow) is unaffected.

---

## Doc Accuracy

### Stats Comparison (MASTER_OUTLINE vs Computed)

| Claim | Doc value (before fix) | Computed | Status |
|-------|------------------------|----------|--------|
| TypeScript lines | 281,460 | 317,104 | DRIFT +12.7% — **AUTO-FIXED** |
| Commits | 3,129 | 3,403 | DRIFT +8.8% — **AUTO-FIXED** |
| Test files | 421 | 537 | DRIFT +27.6% — **AUTO-FIXED** |
| Firestore collections | 48 | 47 | ERROR — **AUTO-FIXED** (real code change: `bookThemesCollection` was removed under FEAT-194/UX-160; CLAUDE.md's narrative prose already describes the retirement correctly, no edit needed there) |
| Cloud Functions | 29 | 29 | ✅ OK (naive single-line grep on `functions/src/index.ts` undercounts to 22 because 2 of the 11 `export {...}` blocks span multiple lines; hand-walking every block confirms 29, matching the doc — same caveat as every prior cycle) |
| Chat task types | 21 | 21 | ✅ OK |
| Routes | 36 | 36 | ✅ OK |

This cycle's drift is larger than usual (12.7% on lines, 27.6% on test files) — consistent with the heavy feature velocity visible in the commit log (FEAT-176 through FEAT-205, the book-generation/reading-level arc, and the Sep 7 "Plan My Week walked top to bottom" 14-fix batch) over roughly two weeks since the last report. No anomalies beyond volume.

`npm run docs:check` independently confirms the collection count (`Derived Firestore collection count (firestore.ts): 47`, `PASS [collection-count] all spans == 47`) — the generated `<!-- gen:collection-count -->47<!-- /gen -->` span in `DOCUMENT_INDEX.md`'s `FIRESTORE_AUDIT.md` row was already correct; only `MASTER_OUTLINE.md`'s hand-set figure was stale.

### Missing File References

Same four expected carry-overs as every prior cycle, all correctly marked as removed/superseded in their source docs — not real gaps:

| File | Status |
|------|--------|
| `PARENT_EXPERIENCE_AUDIT.md` | Marked REMOVED in DOCUMENT_INDEX |
| `PARENT_EXPERIENCE_ALIGNMENT_PLAN.md` | Marked REMOVED in DOCUMENT_INDEX |
| `QuickCaptureSection.tsx` / `QuickCaptureSection.test.tsx` | Referenced only in MASTER_OUTLINE's historical UX P1.04/P2.06 changelog entries, which explicitly say the file was removed by a later change |
| `CreativeTimeLog.tsx` | Same UX P2.06 changelog entry, same reason |

One new-looking hit, **not a real gap**: `AGENTS.md`. `DOCUMENT_INDEX.md`'s own row for `review/AI_DEVELOPMENT_REVIEW_20260905.md` already documents that this file was never pushed to any branch (checked by home-base) — the review's "Documentation changes" table described corrections that never landed, and the doc index carries a note to that effect. No fix needed.

### Navigation — MISMATCH FOUND AND FIXED

`docs/MASTER_OUTLINE.md`'s Kid Nav line still listed **My Stuff** between My Hero and Barnes Bros. `src/app/AppShell.tsx`'s `kidNavItems` array does **not** contain it — a code comment at that exact spot explains why: *"FEAT-186 (London audit #9, owner decision): no `My Stuff` entry for a kid… Kid Today's own '📸 My Stuff' card is a different destination and stays."* This is a genuine, code-confirmed nav mismatch (not the "intentionally different" case Phase 6 warns about — the removal was a deliberate, already-shipped decision the doc simply never caught up to), so it was **auto-fixed** per the companion prompt's Rule 4: removed `My Stuff` from the Kid Nav line in `MASTER_OUTLINE.md`. Parent Nav (12 items) already matched exactly; Kid Nav now reads 8 items matching code order exactly.

(The other `My Stuff` mention in `MASTER_OUTLINE.md`, in the UX P2.08 changelog entry, refers to `KidCaptureForm`'s in-page "My Stuff" capture card — a different feature, explicitly named as untouched by FEAT-186. Left alone, correctly.)

### Collection Coverage

All 47 collection helpers in `firestore.ts` are documented in `CLAUDE.md`'s Firestore Collections table (including path-name vs. helper-name aliases: `catalogOrdersCollection` → `orders`, `errorLogsCollection` → `errorLog`, `shellyChatMessagesCollection` → the documented `shellyChatThreads/{threadId}/messages` subcollection). No CLAUDE.md edit needed.

### Task Type Coverage

All 21 `CHAT_TASKS` registry entries are referenced in `docs/SYSTEM_PROMPTS.md`, both directions — no gap either way.

### Unindexed Docs

None — every top-level file in `docs/*.md` (except `DOCUMENT_INDEX.md` itself) appears in `DOCUMENT_INDEX.md`.

### Stale Docs (Phase 3h)

Using the corrected per-row-status-column parse (the 2026-08-24 report's methodology fix — grepping loose text for "CURRENT" false-positives on filenames merely *mentioned* in a CURRENT row's prose): **64 unique docs are marked `**CURRENT**`** in `DOCUMENT_INDEX.md` (deduped by filename; +5 vs. last cycle's 59, consistent with two weeks of new audits/design docs landing). **43 have not been touched in over 30 days; 21 have.**

**Oldest 15 of the 43 stale:**

| Doc | Age |
|---|---|
| `ENGINE_V2.md` | 187d |
| `KNOWLEDGE_MINE_BRIEF.md` | 168d |
| `WEEKLY_CONUNDRUM_ARC.md` | 162d |
| `STONEBRIDGE_BIBLE.md` | 152d |
| `HERO_HUB_ANIMATION_TUNING.md` | 152d |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | 152d |
| `first-principles-system-review.md` | 152d |
| `SCRIPT_CONVENTIONS.md` | 148d |
| `investigations/backend-reliability-assessment.md` | 147d |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | 139d |
| `EVALUATION_METHODOLOGY_2026-04.md` | 113d |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | 113d |
| `PROFILE_LIMITS_AUDIT.md` | 104d |
| `design-pass-v1/` | 103d |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | 103d |

Same pattern as every prior cycle — several are deliberately stable reference documents (`STONEBRIDGE_BIBLE.md`, `ENGINE_V2.md`) or point-in-time audits correctly marked `CURRENT` for their findings rather than `HISTORICAL`. Not auto-fixed (requires reading each doc to assess, per policy). Flagged for a human spot-check if those surfaces are still active.

---

## Largest Files (over 1,000 lines)

| Lines | File | Change from last report (2026-08-24) |
|-------|------|--------------------------------------|
| 3,465 | `src/features/planner-chat/PlannerChatPage.tsx` | +170 |
| 3,051 | `functions/src/ai/chat.ts` | **+410** |
| 2,942 | `src/features/records/records.logic.test.ts` | +178 (test file) |
| 2,670 | `src/features/shelly-chat/useShellyChatActions.logic.test.ts` | +253 (test file) |
| 2,414 | `src/features/books/BookEditorPage.tsx` | **+301** |
| 2,299 | `src/features/planner-chat/chatPlanner.logic.test.ts` | +133 (test file) |
| 2,266 | `functions/src/ai/tasks/shellyChat.test.ts` | +0 |
| 2,218 | `src/features/quest/useQuestSession.ts` | +0 |
| 1,949 | `functions/src/ai/tasks/shellyChat.ts` | +11 — still just under 2,000 (see Decomposition Candidates) |
| 1,876 | `src/features/avatar/MyAvatarPage.tsx` | +0 |
| 1,816 | `src/features/workshop/WorkshopPage.tsx` | **+193** |
| 1,712 | `src/features/records/dataReviewExport.logic.ts` | +0 |
| 1,655 | `src/features/planner-chat/chatPlanner.logic.ts` | +111 |
| 1,627 | `functions/src/ai/contextSlices.ts` | +10 |
| 1,606 | `src/features/avatar/VoxelCharacter.tsx` | +0 |
| 1,605 | `src/features/today/TodayChecklist.tsx` | +13 |
| 1,492 | `functions/src/ai/tasks/monthlyReview.ts` | +0 |
| 1,464 | `src/features/records/RecordsPage.tsx` | +0 |
| 1,389 | `src/features/books/useBookGenerateChat.ts` | new to >1,000 table |
| 1,387 | `src/features/today/TodayPage.tsx` | +22 |
| 1,360 | `src/features/shelly-chat/useShellyChatActions.ts` | +118 |
| 1,307 | `src/features/shelly-chat/parseChatActions.test.ts` | +20 (test file) |
| 1,302 | `functions/src/ai/tasks/monthlyReviewData.test.ts` | new to >1,000 table |
| 1,302 | `functions/src/ai/evaluate.ts` | +190 |
| 1,295 | `src/features/dad-lab/LabReportForm.tsx` | +0 |
| 1,266 | `src/features/books/printBook.ts` | new to >1,000 table |
| 1,251 | `functions/src/ai/tasks/monthlyReviewData.ts` | +129 |
| 1,242 | `src/features/evaluate/EvaluateChatPage.tsx` | +9 |
| 1,198 | `src/features/today/KidTodayView.tsx` | +17 |
| 1,196 | `src/features/shelly-chat/useShellyChatFlows.ts` | +62 |
| 1,180 | `src/features/books/BookshelfPage.tsx` | +84 |
| 1,153 | `src/core/types/planning.ts` | +78 |
| 1,150 | `functions/src/ai/tasks/monthlyReview.test.ts` | +0 |
| 1,139 | `src/features/settings/DevAdminTab.tsx` | +93 |
| 1,138 | `functions/src/ai/chat.test.ts` | +37 |
| 1,120 | `src/features/progress/CurriculumTab.tsx` | new to >1,000 table |
| 1,114 | `src/features/dad-lab/DadLabPage.tsx` | +0 |
| 1,104 | `src/features/settings/AvatarAdminTab.tsx` | +0 |
| 1,102 | `src/features/records/records.logic.ts` | +0 |
| 1,080 | `src/features/settings/StickerLibraryTab.tsx` | new to >1,000 table |

(Table truncated at ~1,080L for length; 130 files total exceed 500 lines, up from the prior cycle.)

---

## Decomposition Candidates

Two production files crossed size milestones worth flagging this cycle:

| File | Lines | Status |
|------|-------|--------|
| `chat.ts` (CF) | 3,051 | KNOWN, but **+410 lines this cycle** — the fastest-growing large file. `buildQuestPrompt` was already 400+ lines at the last measurement; this needs a fresh look. `CLAUDE.md`'s tech-debt note still reads 2,641L — now **410 lines stale**. |
| `BookEditorPage.tsx` | 2,414 | KNOWN, **+301 lines this cycle** — consistent with the FEAT-187/193/195/197 book-generation feature arc landing in this window. `CLAUDE.md`'s note reads 2,113L — now **301 lines stale**. |
| `PlannerChatPage.tsx` | 3,465 | KNOWN, +170 this cycle. `CLAUDE.md`'s note reads 3,295L — now **170 lines stale**. |
| `useQuestSession.ts` | 2,218 | KNOWN, flat. `CLAUDE.md`'s note reads 2,218L — accurate, no drift. |

**`functions/src/ai/tasks/shellyChat.ts` (1,949L)** is still the closest unlisted file to the 2,000-line threshold (flagged at 1,938L last cycle, then 1,719L the cycle before that) — grew only +11 lines this cycle, essentially flat, but has not shrunk. **`functions/src/ai/evaluate.ts` grew +190 lines** (1,112→1,302) — worth watching if that pace continues.

---

## Issues Found

### Auto-Fixed

- **`docs/MASTER_OUTLINE.md` stats block:** TypeScript lines 281,460→317,104; Commits 3,129→3,403; Test files 421→537; Firestore collections 48→47.
- **`docs/MASTER_OUTLINE.md` Kid Navigation line:** removed the stale `My Stuff` entry (FEAT-186 removed it from `AppShell.tsx`'s `kidNavItems`; the doc line hadn't caught up). See Navigation section above.
- Ran `npm run lint` (0 auto-fixable issues found — same 3 pre-existing `react-hooks/exhaustive-deps` warnings, dependency-array judgment calls, left as-is) and `npm run docs:check -- --fix` (made no changes — nothing to auto-fix, all HARD checks already passing).

### Auto-Fixed (by companion)

Companion pass found nothing further in Rules 1, 2, 3, or 5 (no undocumented task types, no undocumented Cloud Functions, no missing collections, no unindexed docs). **Rule 4 (nav mismatch) found and fixed one real gap** — see Navigation section above; this is the first cycle Rule 4 has had anything to do.

### Needs Human Attention

- ~~**NEW this cycle, and will block the next deploy — a latent test-suite gap, not an app regression, but not CI-invisible either.**~~ **DONE — UX-272, 2026-09-08.** The historical-ledger-replay test is removed and the sweep is now the opt-in `npm run docs:ledger-sweep` probe, so `npx vitest run` is green and `deploy.yml` is unblocked. Neither regex was narrowed: the offenders are not a pattern gap (57 of them are one `FEAT-112` cell counted once per revision it survived in, and 9 more are the house-rule *"awaiting human review + merge"* shape the guard catches **deliberately**), and history cannot be edited to satisfy an assertion. See the **CRITICAL finding** section above for the corrected numbers and the two reasons the sweep could not hold.
- **Any other history-sensitive test has the same blind spot.** `ci.yml` runs the suite on a shallow clone and `deploy.yml` on a full one, so **the two workflows do not run the same tests** — a test that reads git history is measured by only one of them. Noted, not swept for, by UX-272.
- **`npm audit --production` regressed from 0→1 (root) and 0→3 (functions) moderate-severity findings** this cycle (`fflate` on root; `qs`/`body-parser`/`express` chain on functions). All moderate, all have non-breaking `npm audit fix` available. Per policy (Rule 8: moderate-only → note, don't fix), left for a human to apply `npm audit fix` at their discretion — non-breaking, should be safe, but is a dependency-tree change outside this audit's mechanical-fix scope.
- **`CLAUDE.md`'s size notes for `chat.ts`, `BookEditorPage.tsx`, and `PlannerChatPage.tsx` are now stale by 410L, 301L, and 170L respectively** — see Decomposition Candidates. Not auto-fixed — `CLAUDE.md` prose is excluded from this audit's write scope by policy.
- **`functions/src/ai/chat.ts` grew +410 lines this cycle (2,641→3,051L)**, the single largest jump of any tracked file. Worth a decomposition look given it was already flagged as a known-debt file at a much smaller size.
- **`src/features/shelly-chat/ShellyChatPage.tsx` is 846 lines**, but `CLAUDE.md`'s Known Technical Debt section describes it as "ARCH-09 FIXED (1,632→647L)… Stable." — it has grown +199 lines (+31%) since that figure was written and is no longer flat. Not auto-fixed (CLAUDE.md prose out of scope), flagged for a human to decide whether "Stable" still applies.
- **Dead-export scan skipped this cycle**, same as every prior cycle — budget went to the full unshallow + fresh-sandbox install + the double build/lint/test run (root 7,789 tests + functions 1,371 tests). Recommend a real dead-code tool (`ts-prune` or `knip`) over the grep heuristic whenever this is picked back up.
- **Dev-dependency-only npm audit findings remain** (1 high + 9 moderate on root full audit beyond production, 1 high + 6 moderate on functions) — see Build Status table. Require `--force`/breaking upgrades, outside the production dependency tree. Low priority per policy, unchanged assessment from prior cycles.
- **Bundle size 4,428.50 kB (1,326.22 kB gzip), +76.42 kB / +29.02 kB gzip since last report:** growth roughly tracks the +41,532 line-count delta. Main chunk (Three.js avatar, jsPDF print, curriculum map data, shelly-chat/chat surface) is still unsplit. Route-level `React.lazy` splitting would reduce initial load. Not fixed — architectural decision, same recommendation as every prior cycle.
- **Lint warnings (3, unchanged):** `react-hooks/exhaustive-deps` in `EvaluateChatPage.tsx:295`, `useQuestSession.ts:814`, `useQuestSession.ts:2083` — all involve `sessionTimer`. Not auto-fixable without reviewing timer semantics.
- **43 of 64 unique `CURRENT`-marked docs are >30 days untouched** (up from 51/59 last cycle in absolute count, roughly flat in proportion — 67% vs. 86% last cycle, actually improved as a share, likely from the batch of new CURRENT audits landing recently). Most look like legitimately-stable reference/design docs. Recommend a human skim pass on the oldest cluster (`ENGINE_V2.md` at 187d, `KNOWLEDGE_MINE_BRIEF.md` at 168d) if those surfaces are still active.

---

## docs:check findings (SOFT warnings, informational)

`npm run docs:check` (the repo's own DOC-08/DOC-09 alignment tool) surfaced 10 SOFT warnings that don't fail the build but are worth a human's attention:

- **2 new raw Firestore refs outside the allowlist:** `src/features/progress/ArmorTab.tsx` (raw `xpLedger` collection ref) and `src/features/settings/DevAdminTab.tsx` (raw `days` collection ref). SOFT, not HARD — flagged for review, not auto-fixed (code change, outside this audit's scope).
- **7 files with `httpsCallable` missing a timeout/AbortController or `finally` in reach** (SOFT — "flips HARD after one clean month"): `AvatarPhotoUpload.tsx`, `generateFace.ts`, `DiagnosticPanel.tsx`/`GenerateNowDialog.tsx`/`MonthlyReviewReader.tsx` (monthly-review), `FoundationsDiagPanel.tsx`, `AvatarAdminTab.tsx`.
- **1 file with an image file-input and no visible downscale/compress call:** `src/features/records/PortfolioPage.tsx`.
- **98 swallowed `catch()` blocks across 54 files** (report-only census, not a failure) — heaviest in `PlannerChatPage.tsx`, `RecordsPage.tsx`, `useShellyChatFlows.ts` (5 each).

None of these are new-this-cycle regressions per se (the census is cumulative), but they're surfaced because `docs:check` ran clean on all HARD checks and these are its only open SOFT items. Not fixed — code changes, outside this audit's read-only/doc-only scope.

---

## Charter Alignment

All 21 task types verified to reference `buildContextForTask`, `CHARTER_PREAMBLE`, or `charterContext` (`chat`/`generate` are handled inline in `functions/src/ai/tasks/chatHandler.ts`, which itself references charter context — no dedicated task file, same as every prior cycle).

✅ No charter gaps.

---

## Test Coverage by Feature

| Tests (test files) | Feature | Change from last report |
|-------|---------|--------------------------|
| 86 | books | **+51** |
| 64 | today | **+16** |
| 27 | shelly-chat | +2 |
| 27 | planner-chat | +6 |
| 23 | business | +0 |
| 20 | watch | +0 |
| 18 | avatar | +1 |
| 17 | settings | +4 |
| 17 | quest | +0 |
| 16 | dad-lab | +1 |
| 13 | progress | +7 |
| 11 | weekly-review | +10 |
| 9 | records | +0 |
| 9 | evaluate | +0 |
| 7 | foundations-review | +0 |
| 6 | workshop | +4 |
| 6 | monthly-review | +0 |
| 3 | evaluation | +0 |
| 1 | engine | +0 |
| 0 | ui-preview *(dev-only gallery — ok)* | +0 |
| 0 | planner | +0 |
| 0 | not-found | +0 |
| 0 | login | +0 |
| 0 | auth | +0 |

Same 0-test feature set as every prior cycle (`planner`, `not-found`, `login`, `auth`; `ui-preview` intentionally untested, dev-only). The books surface's growth (+51) and today's (+16) dominate this cycle, consistent with the heavy book-generation/reading-level feature arc (FEAT-176 through FEAT-197) and the "Plan My Week walked top to bottom" 14-fix batch (FEAT-205) both landing in this window.

---

## Dependency Notes

- **Root (prod):** 1 moderate (`fflate`) — regressed from 0 last cycle. Non-breaking fix available (`npm audit fix`), not applied per policy. Full audit (including dev deps): 12 (1 low, 10 moderate, 1 high) — the high is dev-only; the remainder needs `--force` (breaking). Left for human review.
- **Functions (prod):** 3 moderate (`qs`/`body-parser`/`express` chain) — regressed from 0 last cycle. Non-breaking fix available, not applied per policy. Full audit: 7 (6 moderate, 1 high, dev-only for the high); fix needs `--force` (breaking) for the remainder. Left for human review.
- **Outdated majors available (informational only, not acted on):** `@mui/material`/`@mui/icons-material` 7.x→9.x, `eslint` 9.x→10.x, `firebase-admin` 13.x→14.x, `jsdom` 27.x→30.x, `@types/three` 0.128→0.185, `typescript` 5.9→7.0, `vite` 7.3→8.2, `vitest` 3.2→5.0, `three` 0.128→0.185. No action taken — major-version bumps are a human decision per policy.
