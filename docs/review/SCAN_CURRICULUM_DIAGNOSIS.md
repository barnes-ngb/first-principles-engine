# Scan → Curriculum Update — Diagnosis

> **What this is:** a read-only diagnosis of why scanning/adding multiple distinct workbooks collapses into one
> curriculum config, and why multi-page scan isn't supported. No code changed.
> **Created:** 2026-07-01 · **Companion to:** the fix run; `docs/review/REVIEW_HOME_BASE.md` (ledger).

## TL;DR
1. `isWorkbookMatch`'s final **"same subject = same workbook"** fallback collapses distinct workbooks that share a
   detected subject into one config — each new scan **updates the first match instead of creating a new config**
   (the "4 → 1"). 2. `ScanButton` is **single-photo** (`files?.[0]`, no `multiple`) — no multi-page scan.

## How the flow works
- **Scan** (`ScanButton` → `useScan.scan(file)`): one photo → base64 → `scan` Cloud Function (Claude reads
  workbook name, lesson/position, page type) → saves a `ScanRecord` to `scans`. **Single photo.**
- **Update** (`useScanToActivityConfig`): scan result → **find-or-create** an `ActivityConfig` (per-workbook
  tracker, `type: 'workbook'`, `currentPosition` = lesson). Query the child's workbook configs → `.find()` first
  where `isWorkbookMatch(...)` → **UPDATE** its position (only if higher); else **CREATE**. Also nudges the
  working level.
- **List** (`CurriculumTab`): groups configs (workbooks/routines/evaluations/completed); matches scans for display.
- **Persistence:** `scans` (live), `activityConfigs`.

## Issue 1 — distinct workbooks collapse ("4 → 1")
`isWorkbookMatch` (`useScanToActivityConfig.ts:~247`) tries, in order: exact normalized name; one-contains-the-other
(len > 3); GATB + same subject; same subject + one-is-GATB; generic-workbook-name + same subject; and finally a
**bare same-subject** rule (`configSubject === scanSubject → true`, comment "one primary workbook per subject").
- The **bare same-subject fallback is the over-match**: any two workbook configs sharing a detected subject are
  treated as the same workbook. So the 2nd/3rd/4th scan finds the 1st config as a "match" → **updates it → no new
  config**. Distinct workbooks collapse into one; its position gets overwritten (explains "pages disappeared, the
  lesson maybe updated" — it did, onto the survivor).
- Aggravated when the scan's **detected subject is coarse/mis-detected**, bucketing several workbooks the same.

## Issue 2 — no multi-page scan
`ScanButton.tsx:~24` reads `files?.[0]`; the file/camera inputs lack `multiple`; `useScan.scan` takes one `File`.
A multi-page worksheet can't be scanned as one unit, and pages can't be queued.

**Addressed by FEAT-52 (2026-07-03).** `ScanButton` gains an opt-in `multiple` mode (gallery accepts N via
`multiple`; camera stays one-at-a-time) exposing `onCaptureFiles: (files: File[]) => void`, used **only** on the
Curriculum tab. The tab stages N photos (thumbnails + per-page remove) and a **"Scan N pages"** action processes
them (see below). The other three scan surfaces keep single-photo `onCapture` unchanged.

## Second latent contributor — write race
Even with the matcher tightened, applying several scans **concurrently** would race: each `find-or-create` reads
the config set before the prior write commits, so parallel scans collide (create/update against stale state). The
fix must apply a batch/multi-scan **sequentially (await + re-read) or transactionally**, not just fix the matcher.

**Addressed by FEAT-52 (2026-07-03).** The multi-page batch is processed **strictly sequentially** —
`processScanBatch` (`src/features/progress/multiPageScan.ts`) `await`s each page's `scan` **and**
`syncScanToConfig` before the next page starts (no `Promise.all`). Because the generic find-or-create re-reads
configs with a fresh `getDocs` on every call, a prior page's write is visible to the next: same-workbook pages
merge onto one config and distinct workbooks each create their own. This is the write-race fix.

## Fix plan (for a later run)
### Issue 1 — tighten the matcher
- **Drop the bare same-subject fallback.** Keep exact-normalized name, one-contains-the-other, GATB + same subject,
  and **generic-workbook-name + same subject** (so a nameless "Math worksheet" scan still updates the Math
  workbook). Net: distinctly-named workbooks each create a config; a generic scan updates the subject's workbook.
- **Tradeoff to hold:** over-match (collapse, current) vs under-match (duplicates). Dropping only the *bare*
  fallback keeps the generic-scan intent while stopping distinct-name collapse.
- **Verify-in-fix:** 4 distinctly-named workbooks (even overlapping subjects) → 4 configs; a nameless "Math" scan
  with an existing Math workbook → updates it (no duplicate); GATB Math vs GATB Language Arts → distinct.

### Issue 2 — multi-page scan
- Add `multiple` to `ScanButton` inputs + handle `File[]`; `useScan` accepts multiple; scan pages **sequentially**
  (avoid rate limits + the race above) → apply to configs one at a time (re-reading between). Scope: multi-page
  capture + sequential apply.
- **Done — FEAT-52 (2026-07-03).** `ScanButton` opt-in `multiple` + `onCaptureFiles`; Curriculum tab stages N
  pages and calls `processScanBatch` (sequential `scan` → `syncScanToConfig` per page, combined summary; a failed
  page never aborts the rest). `useScan.scan` stays single-file — the loop calls it once per page rather than
  changing its signature. Matcher, hours, and leveling untouched. Review-before-apply and multi-photo on the other
  surfaces remain out of scope.

## Issue 3 — Today captures silently bypassed the scan (FEAT-62)

**Owner bug (2026-07-09, live use):** Shelly photographed completed workbook pages via Today's per-item Camera /
Upload buttons; the photos saved but the workbook cards on Progress stayed stale (positions/recent-scans from Jul 2,
Jun 5). "Scans are truth" (Key Decision) depended on Shelly using a door she doesn't live on.

**Why the photos bypassed scanning (the recon answer).** The per-item capture (`useUnifiedCapture.handleUnifiedCapture`,
merged Jun 20) *did* run a scan — but routing it to the curriculum was **doubly conditional and failed silently**:
1. **pageType gate** (`isCurriculumScan`): the scan only counted as curriculum when the AI classified `pageType ∈
   {worksheet, textbook, test}`. A real completed-page photo that read as a filled-in exercise / cover / ambiguous
   image classified *outside* those and fell to the plain **artifacts** branch — no position advance, and (when the
   CF errored) no `scans` doc at all → "recent-scans stale."
2. **fuzzy-match gate** (`syncScanToConfig` with no `targetConfigId`): even reaching the scans branch, position
   advanced only if the AI-detected curriculum name fuzzy-matched an existing config. Plan items carried **no link to
   their workbook**, so the capture had to re-derive the workbook from the photo; generic labels / OCR variance
   missed. The label-regex `scanPatterns` "sparkle" route is a *different* door (the pre-completion "Scan lesson to
   check if you should skip" affordance, shown only when `skipGuidance` contains "check lesson") — **not** the one
   Shelly used, so this was neither a `scanPatterns` pattern-miss nor a literal no-scan bypass. It was a silent
   fallback to a plain artifact because the capture had no reliable join to the workbook config.

**Fix (FEAT-62).** Give the item a deterministic join and route on it:
- **Join at lock-in.** `PlannerChatPage` apply stamps `ChecklistItem.workbookConfigId` (an `activityConfigs` doc id)
  by matching each generated item against the child's scannable workbook configs (`findWorkbookConfigId`, name/subject
  via `isSameWorkbook`). This is the only point the item can know its workbook — the routine→item pipeline round-trips
  through free text and drops the config id. Legacy/unstamped items simply lack the field and keep the label-regex /
  fuzzy fallback (precedence: `workbookConfigId` when present, else the existing classification path).
- **Route on it.** A per-item photo on a `workbookConfigId` item creates the artifact (evidence, as before) **and**
  registers a scan against that exact workbook — position advances via `syncScanToConfig`'s `targetConfigId` (the same
  pinned path the Progress per-card scan uses), skipping both the pageType gate and the fuzzy match. Analysis is
  timeout-guarded (120s `withTimeout`) and best-effort: the capture always succeeds and leaves a plain artifact if
  analysis fails (`reuse`s FEAT-61's `downscaleImage`).
- **Backfill + visibility.** Workbook items whose photo was stranded as a plain artifact get a one-tap "Analyze as
  workbook scan" action (no new artifact, no auto-sweep — owner taps). After registration a quiet "Registered to
  {workbook} · Lesson {n}" line shows on Today so the count is visible without opening Progress.

**Out of scope (named, not built).** No hours/counting changes; artifact semantics unchanged; the Progress scan
buttons unchanged. **Scan → learner-model evidence** (feeding a routed workbook scan into `learnerModels`) stays the
**named workbook-positions wiring follow-up** — this run only advances the `activityConfigs` position + writes the
`scans` doc, exactly as the Progress scan button does.
