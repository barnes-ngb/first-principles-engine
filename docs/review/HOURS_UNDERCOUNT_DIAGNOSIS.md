# Hours Undercount — Diagnosis

> **What this is:** a read-only diagnosis of why completed checklist work is dropped from the Records hours total
> (Today: ~3h 10m logged; Records new-year: ~0.92h). No code or counting-rule changed by this write-up.
> **Created:** 2026-07-01 · **Companion to:** the fix run; `docs/review/REVIEW_HOME_BASE.md` (ledger).
> **Discipline:** fix the computation path, never stored data; count-rule caution near the year boundary.

## TL;DR
Completed checklist items with **no matching tracked block** are silently dropped from the Records total whenever
**any** block on the day has `actualMinutes`. Today counts them; Records doesn't. Carried-over "from Tuesday"
items are the prime victims. The 2026-07-01 rollover made it glaring (fresh-year total).

## Mechanism
1. Checking an item on Today auto-stamps `actualMinutes` onto the **matching block** — but only when the item's
   label/title matches a block (`TodayChecklist.tsx:395`, `matchesLabel || matchesTitle`).
2. `dayLogMinuteContributions` (`records.logic.ts:140`): **if any block has `actualMinutes`, count block actuals
   only and ignore the checklist entirely** (`checklistItemCountedMinutes` not consulted; `item.actualMinutes`
   deliberately ignored — DATA-11, `records.logic.ts:112-124`). Rationale: don't double-count the plan as extra
   time.
3. So once one item matches a block, the day is in **block-actuals-only** mode — every completed item **without** a
   matching block contributes **zero**.
4. Today's "logged" (`TodayChecklist.tsx:482`, from `completedMinutes` at `:276-278`) sums **all** completed items'
   planned minutes → mismatch.
5. **Carried-over items** (rollover carries checklist *items*, not blocks — `TodayPage.tsx:243` via
   `useRolloverUnchecked`) rarely have a matching block → they are checked, counted on Today, and dropped by
   Records.

## Why it surfaced now
The year rollover (2026-07-01) zeroed the new-year total, so 3h 10m (Today) vs 0.92h (Records) is obvious. On a
full year the gap was masked — it has been quietly undercounting whenever some-but-not-all completed items match
blocks.

## Impact
**Undercount** of MO compliance hours (real completed work dropped). Compliance-relevant (1000/600).

## Fix options (computation-path, NOT stored data)
- **A (recommended):** refine the partial-day rule so a day counts **block actuals + completed checklist items
  that have no corresponding tracked block**, deduped by item↔block correspondence (reuse the auto-set's
  label/title match) to avoid double-counting matched items. Keeps the "don't double-count the plan" intent
  without dropping unmatched work. Change lives in ONE place (`dayLogMinuteContributions`, the DATA-11 single
  source). Risk: matching is fragile — false match → undercount, false non-match → double-count; needs tests.
- **B (rejected):** make the auto-set stamp every completed item's block. That's a **stored-data** write + fragile
  matching + doesn't repair existing logs. Violates "fix computation, not data."

## Boundary wrinkle (decision for the fix run)
The counting path recomputes **all** years identically, so the fix would retroactively **increase** the just-closed
**2025–26** total (surfacing previously-dropped hours). This is **beneficial** (more real, already-performed hours;
helps the 1000 target) and safe (states want ≥ requirement), but it **moves a closed number**. Options: (a) accept
the bump (simplest, beneficial) — **recommended**; or (b) scope the fix new-year-forward only (more complex).

## Verify-in-fix (open)
- Reuse the auto-set's `matchesLabel || matchesTitle` for the dedup so it's exact.
- Tests: a day with a matched block + an unmatched completed carried item → counts **both** (block actual + carried
  item planned), no double-count for the matched item; a clean matched-only day → total **unchanged**.
