# Design: Skip System v2

**Status:** Proposal (2026-04-09, revised from v1)
**Supersedes:** [DESIGN_SKIP_SYSTEM_2026-04-09.md](./DESIGN_SKIP_SYSTEM_2026-04-09.md)
**Depends on:** [SKIP_INVENTORY_2026-04-09.md](./SKIP_INVENTORY_2026-04-09.md)

---

## 1 — The Three Principles

v1 tried to build a general-purpose skip system with five reasons, skippedRanges on ActivityConfig, and a lookahead UI. After using the scan system in practice, Shelly distilled the actual need to three principles:

### Principle 1: Scans Are Truth

> A scan of an ahead page auto-advances `currentPosition`.

This already works. `syncScanToConfig` (useScanToActivityConfig.ts:60-64) advances `currentPosition` when the detected lesson number exceeds the current position. The scan is the evidence — if Shelly scanned page 55, the child is at page 55. No separate "skip to lesson N" decision is needed.

**What changes:** Nothing mechanically. But the system should stop treating scan-advance as a side effect and start treating it as the *primary* pacing mechanism. The "Skip to lesson N" button in `ScanResultsPanel.tsx:191-208` becomes redundant — the auto-advance already did the work. We remove the button or reframe it as "Confirm position" for cases where the auto-advance didn't fire (e.g., backward scans).

### Principle 2: Unchecked Rolls Over

> Incomplete items auto-move to next day.

Today, unchecked items simply stay unchecked on the day they were planned. There is no rollover. If Shelly generates a new plan for Tuesday, Monday's unfinished items are forgotten unless she manually re-adds them.

**What changes:** When a new day's plan is generated (or when Today loads with yesterday's incomplete work), unchecked items from the previous school day carry forward automatically. This replaces v1's `not-today` skip reason — "not today" is just "tomorrow" now. Items don't need to be explicitly deferred; they persist until done or explicitly skipped.

### Principle 3: Explicit Skip Is Rare

> Only two reasons to explicitly skip: **too-hard** and **not-relevant**.

v1 had five skip reasons (mastered, already-done, not-today, too-hard, not-relevant). Shelly's insight: three of those aren't skips at all.

| v1 reason | v2 disposition | Why |
|-----------|---------------|-----|
| `mastered` | Handled by scan-advance (Principle 1) | If it's mastered, scan the page — position advances automatically. |
| `already-done` | Just check it off | If the child did it, it's completed, not skipped. |
| `not-today` | Handled by rollover (Principle 2) | Leave it unchecked — it rolls to tomorrow. |
| `too-hard` | **Kept** — explicit skip | Needs scaffolding. AI should adjust difficulty next plan. |
| `not-relevant` | **Kept** — explicit skip | Doesn't fit current goals. AI should deprioritize. |

Two reasons. Both signal something the AI planner should act on. Neither is the parent's default action — the default is "leave it unchecked and it rolls over."

### What This Drops from v1

- `skippedRanges` on ActivityConfig — unnecessary when scans advance position directly
- Reason picker as Phase 1 — explicit skip is Phase 2
- Lookahead analysis UI — no longer needed; scans handle forward pacing
- `mastered`, `already-done`, `not-today` skip reasons — absorbed by existing mechanics

---

## 2 — Data Model Changes

Two new optional fields on `ChecklistItem`. No new collections. No changes to `ActivityConfig`.

### 2a. Add `activityConfigId` to ChecklistItem

Kept from v1 unchanged. The structured link between checklist items and their originating ActivityConfig is still the single biggest gap. Without it, rollover can't know which config an item belongs to, and scan-advance can't update the right item's visual state.

```ts
// ChecklistItem (planning.ts)
activityConfigId?: string  // doc ID into activityConfigs collection
```

**Migration:** None — optional field. The AI planner (`functions/src/ai/tasks/plan.ts`) already receives `ActivityConfig[]` in context and emits items; it needs to emit the config ID alongside each item. Existing plans work with `undefined`.

### 2b. Narrow SkipReason to two values

```ts
export const SkipReason = {
  TooHard:      'too-hard',
  NotRelevant:  'not-relevant',
} as const
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]
```

**Why only two?** Every other "skip" scenario has a better mechanism:

- "Mastered" → scan the page, position auto-advances
- "Already done" → check it off as completed
- "Not today" → leave unchecked, rollover handles it

An explicit skip is a *signal to the AI planner* that something is wrong with the plan. `too-hard` means "adjust difficulty down." `not-relevant` means "deprioritize this content." Both are rare — Shelly estimates explicit skips happen a few times per month, not daily.

### 2c. Fields on ChecklistItem

```ts
// ChecklistItem (planning.ts) — new fields
skipReason?: SkipReason       // only set when skipped: true
skipNote?: string             // optional free-text, max ~200 chars
skippedAt?: string            // ISO timestamp
skippedBy?: 'parent' | 'kid' // who initiated
```

These are the same fields proposed in v1 §1b, minus `skippedAt` becoming meaningful now that rollover exists (it timestamps when the item was removed from circulation).

### 2d. What we're NOT adding

- **`skippedRanges` on ActivityConfig** — dropped. Scan-advance handles position tracking. There's no bulk "skip lessons 12-30" flow; that was a v1 lookahead feature we're not building.
- **`rolledOverFrom`** on ChecklistItem — considered and rejected. Rollover items are the same item on a new day. Tracking provenance adds complexity for no user-facing value. If we need it later, we add it then.

### Compatibility

The existing `skipped: boolean` field stays. `skipReason` augments it — when `skipped: true` and `skipReason` is absent, it's a legacy kid-side skip (no reason captured). Hours computation (`records.logic.ts:104`) is unaffected — it filters on `completed`, never touches `skipped` or `skipReason`.

---

## 3 — Rollover Logic

### Trigger

Rollover fires when `TodayPage` loads and detects that the current day's checklist is empty (no plan generated yet) while the previous school day has incomplete items. This is a client-side operation — no Cloud Function needed.

### Approach: Copy-on-load

When TodayPage mounts for a new date:

1. Load the previous school day's `DayLog` (the most recent `days/{date}` doc before today).
2. Filter its `checklist` to items where `completed === false && skipped !== true`.
3. Copy those items into today's checklist, preserving all fields including `activityConfigId`, `plannedMinutes`, `subjectBucket`, `block`, etc.
4. Mark the source items on the old day as `{ rolledOver: true }` so they render differently (dimmed, "→ moved to [date]") and aren't rolled over again.
5. Save today's `DayLog` with the carried-forward items.

If Shelly then generates a new AI plan for today, the planner should merge with (not replace) rolled-over items. The planner already receives the current checklist in context — it needs to respect items already present.

### What rolls over

| Item state | Rolls over? | Why |
|-----------|-------------|-----|
| `completed: false, skipped: false/absent` | **Yes** | Unfinished work carries forward |
| `completed: true` | No | Done is done |
| `skipped: true` | No | Explicitly removed from circulation |
| `aspirational: true` + unchecked | No | Aspirational items don't nag; rolling them over contradicts that intent |

### Edge cases

**Weekend gap:** If Friday has incomplete items and Today is Monday, rollover still fires — it finds the most recent school day, not "yesterday." The gap size doesn't matter.

**Multiple days of rollover:** If Monday rolls to Tuesday, and Tuesday also goes unfinished, Wednesday picks up Tuesday's remaining items (which may include Monday's originals). Items don't accumulate duplicates because step 4 marks the source as `rolledOver: true`.

**MVD days:** If today is an MVD day, rolled-over items from a Normal day still appear. Shelly can skip them if they don't fit, but the system doesn't auto-filter. MVD reduces what the *planner generates*, not what rolls over.

**Plan already exists:** If Shelly already generated a plan for today before rollover fires, rolled-over items append to the existing checklist. Deduplication is by `activityConfigId` — if a rolled-over item shares a config ID with a planned item, the planned item wins (it has fresh `contentGuide`).

### State: `rolledOver` flag

```ts
// ChecklistItem (planning.ts) — new field
rolledOver?: boolean  // true on the SOURCE day's item after rollover copies it forward
```

One field. No timestamp, no target date. The flag prevents re-rollover and changes rendering on the old day. The copied item on the new day has no special marking — it's just a normal checklist item.

---

## 4 — Scan-Advance Logic

### What already works

`syncScanToConfig` (`useScanToActivityConfig.ts:60-64`) already auto-advances `currentPosition` when a scanned lesson number exceeds the stored position. This is the core of Principle 1.

`useUnifiedCapture` (`useUnifiedCapture.ts:90`) calls `syncScanToConfig` on every curriculum-type scan. Position advances silently — no user action required beyond taking the photo.

### What changes: act, not just display

Today, scan-advance updates the `ActivityConfig` but has no effect on the checklist item the scan was triggered from. The checklist item stays unchecked, and the "skip" recommendation badge is display-only (Inventory: "Display-only").

v2 closes the loop: when a scan advances `currentPosition` past the checklist item's lesson, the item should auto-complete (not auto-skip). Scanning a page *is* doing the work — it's evidence that the child reached that page. The item should mark `completed: true` with `completedAt` set to the scan timestamp.

Implementation: after `syncScanToConfig` returns, `useUnifiedCapture` checks whether the scan's `lessonNumber` matches or exceeds the checklist item's expected lesson (derivable from `contentGuide` or `activityConfigId` + `currentPosition`). If so, set `completed: true`. The scan artifact is already linked as evidence via `evidenceArtifactId`.

### Edge cases

**Behind-position scan:** Shelly scans a page the child already passed (e.g., scanning page 40 when `currentPosition` is 55). `syncScanToConfig`'s forward-only guard (`lessonNumber > current`) prevents regression. The scan is recorded as evidence but doesn't change position. No special handling needed.

**Missing lesson number:** The scan AI sometimes returns `lessonNumber: null` (e.g., for activity pages without clear numbering). In this case, `syncScanToConfig` skips the position update entirely (line 60: `if (lessonNumber != null)`). The scan still links as evidence to the checklist item, but no auto-advance or auto-complete fires. This is correct — without a lesson number, the system can't know what was covered.

**Multiple items for same config:** If today's checklist has two items for the same `activityConfigId` (e.g., "GATB Math — morning" and "GATB Math — afternoon"), a scan should only auto-complete the item it was triggered from (identified by the `index` parameter in `handleUnifiedCapture`), not all items sharing the config.

### "Skip to lesson N" button

The explicit "Skip to lesson N" button in `ScanResultsPanel.tsx:191-208` becomes unnecessary for most cases — the auto-advance already happened. We keep the button but reframe it: it only appears when the scan's lesson number is *at or behind* `currentPosition` (i.e., auto-advance didn't fire) and the user might want to manually jump forward. Label changes from "Skip to lesson N" to "Jump to lesson N."

---

## 5 — Explicit Skip (Phase 2)

Explicit skip is deliberately deferred to Phase 2. Rollover + scan-advance handle 90%+ of what v1 tried to solve with five skip reasons.

When built, explicit skip will be:

- **Two-reason only:** `too-hard` / `not-relevant`. No picker with five options — two tappable chips plus an optional note.
- **Parent-only in v1:** Kids can leave items unchecked (rollover handles it). Kid-initiated skip stays as the existing `skipped: true` with no reason.
- **AI-consumed:** `shellyChat.ts` and `contextSlices.ts` should surface `skipReason` to the AI. `too-hard` items should trigger the planner to lower difficulty for that config. `not-relevant` items should reduce frequency or drop the config from future plans.
- **UI:** Long-press or swipe-to-skip on a checklist item in `TodayChecklist.tsx`. Minimal surface — this is not a common action.

**Estimate:** ~120 lines (type additions + handler + two-chip UI). Intentionally thin.

---

## 6 — Open Questions for Shelly

1. **Rollover limit:** Should items roll over indefinitely, or should there be a staleness cutoff (e.g., items older than 3 school days auto-expire to avoid an ever-growing checklist)? Current proposal: no limit, but rolled-over items sort to the bottom of the checklist so fresh items stay prominent.

2. **Auto-complete on scan:** When a scan advances position, should the checklist item auto-mark as completed (proposed above), or should Shelly still tap the checkbox? Auto-complete is faster but means she might miss reviewing the child's work. The scan evidence is attached either way.

---

## 7 — Phased Build

### Phase 1: Rollover + activityConfigId (build first)

The highest-value change. Eliminates "lost" unchecked items and establishes the structured config link needed by everything else.

| Area | Files | Lines (est.) |
|------|-------|-------------|
| **Type: `activityConfigId`** | `src/core/types/planning.ts` | ~2 |
| **Type: `rolledOver`** | `src/core/types/planning.ts` | ~2 |
| **Planner emits configId** | `functions/src/ai/tasks/plan.ts` | ~15 |
| **Rollover logic** | `src/features/today/TodayPage.tsx` (new helper, called on mount) | ~60 |
| **Rollover rendering** | `src/features/today/TodayChecklist.tsx` (dimmed style for source-day items) | ~15 |
| **Merge with planner** | `src/features/today/TodayPage.tsx` (dedupe on configId when plan applied) | ~20 |
| **Total** | 4 files | **~115 lines** |

### Phase 2: Explicit skip (build second)

Only after Phase 1 ships and Shelly confirms rollover covers "not-today" and scan-advance covers "mastered."

| Area | Files | Lines (est.) |
|------|-------|-------------|
| **Type: `SkipReason` + fields** | `src/core/types/enums.ts`, `planning.ts` | ~15 |
| **Skip handler** | `src/features/today/TodayChecklist.tsx` | ~40 |
| **Skip UI (two chips + note)** | `src/features/today/TodayChecklist.tsx` | ~50 |
| **AI context injection** | `functions/src/ai/contextSlices.ts` | ~10 |
| **Total** | 3-4 files | **~115 lines** |

### Not planned

- **Lookahead / bulk skip UI** — dropped. Scans handle forward pacing.
- **`skippedRanges` on ActivityConfig** — dropped. No bulk skip mechanism.
- **Scan-to-auto-complete** — depends on answer to Open Question #2. If yes, ~30 lines in `useUnifiedCapture.ts`. Can be added to either phase.
