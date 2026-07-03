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

## Second latent contributor — write race
Even with the matcher tightened, applying several scans **concurrently** would race: each `find-or-create` reads
the config set before the prior write commits, so parallel scans collide (create/update against stale state). The
fix must apply a batch/multi-scan **sequentially (await + re-read) or transactionally**, not just fix the matcher.

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
