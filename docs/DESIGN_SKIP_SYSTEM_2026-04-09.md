# Design: Shelly Skip System

**Status:** Proposal (2026-04-09)
**Depends on:** [SKIP_INVENTORY_2026-04-09.md](./SKIP_INVENTORY_2026-04-09.md)

---

## 1 -- Data Model Changes

### 1a. Add `activityConfigId` to ChecklistItem

The inventory confirms there is **no structured link** between a ChecklistItem and its originating ActivityConfig -- only fuzzy label match and shared `subjectBucket` (Inventory: "Checklist State > Confirming: ChecklistItem has NO structured reference"). This is the single biggest gap blocking any skip system, because "skip lesson 47 of GATB Math" requires knowing *which config* owns that lesson.

```ts
// ChecklistItem (planning.ts)
activityConfigId?: string  // doc ID into activityConfigs collection
```

**Migration:** None. Field is optional. New plans written by the AI planner will populate it; old plans keep working with `undefined`. The planner task (`functions/src/ai/tasks/plan.ts`) already receives `ActivityConfig[]` in its context -- it needs to emit the config ID alongside each generated checklist item. This is the only code change: one field added to the planner's output schema.

**Read impact:** Any code that needs "which config does this item belong to?" (skip system, scan pipeline, progress views) gets a direct lookup instead of fuzzy matching. The scan pipeline's `useScanToActivityConfig.ts` fuzzy matcher stays as fallback for legacy items.

### 1b. Add `skipReason` and `skipNote` to ChecklistItem

The inventory confirms: "There is no 'why skipped' field" (Inventory: "Does anything track 'why'"). The existing `skipped: boolean` stays; we add structured context.

```ts
// ChecklistItem (planning.ts)
skipReason?: SkipReason
skipNote?: string         // optional free-text, max ~200 chars
skippedAt?: string        // ISO timestamp (currently missing for skips)
skippedBy?: 'parent' | 'kid'  // who initiated
```

**Migration:** None -- all optional fields on an existing embedded type. Existing `skipped: true` items from kid-side handler simply have no reason (backward-compatible).

**Read impact:** `shellyChat.ts:178` already counts skipped activities. It should read `skipReason` to distinguish mastery-skips (positive signal) from avoidance-skips (engagement concern). Hours computation (`records.logic.ts:104`) is unaffected -- it filters on `completed`, never touches `skipped`.

### 1c. SkipReason taxonomy

```ts
export const SkipReason = {
  Mastered:     'mastered',      // Child demonstrably knows this material
  AlreadyDone:  'already-done',  // Covered in another activity / context today
  NotToday:     'not-today',     // Deferring -- will revisit later this week
  TooHard:      'too-hard',      // Above current level; need scaffolding first
  NotRelevant:  'not-relevant',  // Doesn't align with current goals
} as const
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]
```

Five reasons. Each has different downstream semantics:

| Reason | Counts as progress? | Affects next plan? | AI interpretation |
|--------|---------------------|--------------------|-------------------|
| `mastered` | Yes -- evidence of growth | Don't regenerate this content | Positive: advance curriculum position |
| `already-done` | Yes -- credit the learning | Don't duplicate next week | Neutral: deduplicate |
| `not-today` | No | Re-offer next session | Neutral: reschedule |
| `too-hard` | No | Flag for scaffolding | Concern: may need level adjustment |
| `not-relevant` | No | Remove or deprioritize | Neutral: curriculum fit issue |

Why not more? "Bored" collapses into `mastered` or `not-relevant`. "Child refused" is already captured by `engagement: 'refused'` on completed items, and `not-today` covers the parent-side analog. Five is tight enough to pick from quickly, expressive enough for AI to differentiate.

### 1d. Extend ActivityConfig with skipped lessons

**Recommendation: `skippedRanges` as a compact range array.**

```ts
// ActivityConfig (planning.ts)
skippedRanges?: [number, number][]  // inclusive pairs, e.g. [[12,15], [23,23]]
```

Why ranges over a flat `skippedLessons: number[]`?

- A bulk lookahead skip of "lessons 12-30" produces one tuple, not 19 elements.
- Checking "is lesson N skipped?" is still trivial: `skippedRanges.some(([lo, hi]) => n >= lo && n <= hi)`.
- Single-lesson skips are `[n, n]` -- no special case needed.

Why not a Set or bitmap? Firestore stores arrays natively; sets and bitmaps require serialization. Ranges stay readable in the Firestore console.

**Migration:** None -- new optional field. `currentPosition` logic is unaffected; skipped ranges sit alongside it. When `currentPosition` advances past a skipped range, that range becomes historical (no cleanup needed).

**Read impact:** The AI context assembly at `contextSlices.ts:411-413` should report skipped ranges so the planner doesn't regenerate skipped content. The GATB progress helper (`getGatbProgress`) should treat skipped lessons as "covered" for the purpose of `upcomingUnits` calculation.

---

## 2 -- User Flows

### Flow 1: On-Demand Page Scan (scan-then-decide)

Shelly is looking at today's GATB Math page and isn't sure if Lincoln already knows this.

1. Shelly taps the **camera icon** on the checklist item for "GATB Math Level 2".
2. `useUnifiedCapture` compresses and uploads the photo, calls the scan Cloud Function.
3. AI returns a `WorksheetScanResult` with `recommendation: 'skip'` and `recommendationReason: "Two-digit addition without regrouping -- Lincoln demonstrated mastery in last week's evaluation."`.
4. `ScanResultsPanel` renders the recommendation with a **skip / do / quick-review** action bar (existing UI, Inventory: "When recommendation is 'skip'").
5. Shelly taps **Skip**. The system:
   - Sets `skipped: true`, `skipReason: 'mastered'`, `skippedAt`, `skippedBy: 'parent'` on the ChecklistItem.
   - Writes `parentOverride: { recommendation: 'skip', note: 'Agreed with AI' }` on the ScanRecord (existing pattern).
   - Advances `currentPosition` on the linked ActivityConfig (via `activityConfigId`).
   - Adds the lesson number to `skippedRanges` on the ActivityConfig.
6. Checklist item renders as dimmed/struck-through with "mastered" badge. Hours unaffected.
7. If Shelly taps **Do** or **Quick Review** instead, `skipped` is not set; the scan recommendation is recorded but not acted on.

**Delta from today:** Steps 5-6 are new. Today the scan recommendation is display-only (Inventory: "Display-only"). This flow makes the skip action programmatic.

### Flow 2: Lookahead Analysis (GATB only in v1)

Shelly wants to see what's coming in GATB LA Level 2 and pre-skip lessons Lincoln already knows.

1. Shelly opens the **Curriculum tab** in Progress and taps a GATB workbook card.
2. A new **"Preview upcoming"** section loads, powered by `getGatbProgress()` which returns `upcomingUnits` with topics and lesson ranges (Inventory: "Does anything track upcoming content" -- GATB only).
3. For each upcoming unit, the system shows: lesson range, topic, and a mastery indicator cross-referenced against `SkillSnapshot.prioritySkills` (reusing `evaluateSkipEligibility` from `skipAdvisor.logic.ts`).
4. Units where all matched skills are at `MasteryGate.IndependentConsistent` show a **"Skip"** chip. Units at `MostlyIndependent` show **"Quick review"**.
5. Shelly selects multiple units and taps **"Skip selected"**.
6. The system adds the selected lesson ranges to `ActivityConfig.skippedRanges` and logs each as `skipReason: 'mastered'` in a lightweight skip-log (stored as a note on the ActivityConfig, not per-checklist-item since these items don't exist on any plan yet).
7. Next time the planner generates a week, it reads `skippedRanges` and does not create checklist items for those lessons.

**v1 scope: GATB only.** Non-GATB curricula lack scope-and-sequence data (Inventory: "For non-GATB curricula: There is no upcoming content tracking"). Adding scope data for Explode the Code, Reading Eggs, etc. is a separate effort. The lookahead UI should show "Scope data not available for this workbook" for non-GATB configs.

### Flow 3: Direct Skip from Today (no scan)

Shelly decides Lincoln doesn't need today's handwriting practice because they did extra writing yesterday.

1. Shelly long-presses (or taps a menu) on the checklist item "Handwriting — Letter Formation p.12".
2. A **skip sheet** appears with the five `SkipReason` options as tappable chips, plus an optional note field.
3. Shelly taps **"Already done"** and optionally types "Did extra writing in journal yesterday".
4. The system sets `skipped: true`, `skipReason: 'already-done'`, `skipNote`, `skippedAt`, `skippedBy: 'parent'` on the ChecklistItem.
5. If the item has an `activityConfigId` and the reason is `mastered`, `currentPosition` advances. For `already-done` / `not-today`, position does not change.
6. Checklist item renders dimmed with an "already done" badge. Hours unaffected.
7. The kid-side view (`KidChecklist`) shows the item as skipped (existing rendering). Kids cannot change the reason -- parent skips are authoritative.

---

## 3 -- Composition with Existing Systems

### Scan override system

The `ParentOverride` pattern (Inventory: "What parentOverride does") is the right shape for scan-triggered skips. The skip flow reuses it directly: when Shelly skips after a scan, a `ParentOverride` is written to the ScanRecord with `recommendation: 'skip'`. The new piece is that the skip *also* writes `skipReason` to the ChecklistItem and updates the ActivityConfig -- today it only writes the override. No shared code extraction needed yet; the scan panel's existing "override + revert" UI handles the ScanRecord side, and the new skip handler handles the ChecklistItem side.

### Hours computation

Confirmed no changes needed (Inventory: "Do skipped checklist items contribute time? No."). `computeHoursSummary` filters on `item.completed === true` at `records.logic.ts:104`. Skipped items are excluded identically to incomplete items. The `skipReason` field is invisible to hours math.

### Planner / Plan My Week

The planner must read `skippedRanges` from ActivityConfig when assembling lesson context. If lesson N is in a skipped range, the planner should not generate a checklist item for it. For `skipReason: 'not-today'`, the planner *should* re-offer the item next session (it's a deferral, not a dismissal). The planner context assembly at `contextSlices.ts:411-446` already injects `currentPosition`; it should also inject skipped ranges so the AI prompt says "skip lessons 12-15 (mastered)".

### Progress view

Skipped-as-mastered lessons should appear in the Curriculum tab as positive evidence: "Lessons 12-15: skipped (mastered)". They should not appear as gaps or missing work. Skipped-as-not-today items should appear as deferred, not as failures. The Progress view should never display skips in a way that could feel punitive -- this aligns with the Charter principle "no grades, no shame" and the project principle that "struggles are data not failure."

### MVD mode

MVD ("Minimum Viable Day") and skip are complementary but independent. MVD reduces the *plan* at generation time via `droppableOnLightDay` flags. Skip removes items *after* the plan is generated. An item marked `mvdEssential: true` can still be skipped by Shelly -- she is the authority. The skip sheet should not add friction for MVD-essential items (no "are you sure?" gate), because Charter says "AI suggests, humans decide."

---

## 4 -- Phased Build

### Phase 1 (S) -- Direct skip from Today

The minimum viable skip: Shelly can skip any checklist item with a reason.

| Aspect | Detail |
|--------|--------|
| **Data model** | Add `skipReason`, `skipNote`, `skippedAt`, `skippedBy` to `ChecklistItem` type |
| **UI** | Skip reason sheet (5 chips + note field) triggered from checklist item menu |
| **Logic** | `handleParentSkip(index, reason, note)` in `TodayChecklist.tsx` -- mirrors existing `handleSkipItem` pattern from `KidChecklist.tsx` |
| **Files touched** | `planning.ts` (type), `enums.ts` (SkipReason const), `TodayChecklist.tsx` (handler + UI), `TodayPage.tsx` (persistence) |
| **Estimate** | ~150 lines new/modified |
| **Unblocks** | Structured skip data flowing to AI context; parent-side skip distinct from kid-side |

### Phase 2 (M) -- Scan-to-skip + activityConfigId link

Connect the scan recommendation to a programmatic skip action, and establish the structured link between checklist items and activity configs.

| Aspect | Detail |
|--------|--------|
| **Data model** | Add `activityConfigId` to `ChecklistItem`; add `skippedRanges` to `ActivityConfig` |
| **Planner** | `functions/src/ai/tasks/plan.ts` emits `activityConfigId` on generated items; `contextSlices.ts` injects `skippedRanges` |
| **Scan flow** | `ScanResultsPanel.tsx` skip button triggers both ScanRecord override AND ChecklistItem skip + ActivityConfig range update |
| **Files touched** | `planning.ts` (types x2), `plan.ts` (planner output), `contextSlices.ts` (context), `ScanResultsPanel.tsx` (action), `useScanToActivityConfig.ts` (range write), `TodayPage.tsx` (handler wiring) |
| **Estimate** | ~350 lines new/modified |
| **Unblocks** | Curriculum-aware skipping; planner respects skipped ranges; scan recommendations become actionable |

### Phase 3 (L) -- Lookahead analysis (optional / deferrable)

Bulk preview and skip of upcoming lessons, initially GATB-only.

| Aspect | Detail |
|--------|--------|
| **UI** | New "Preview upcoming" section in CurriculumTab for GATB workbook cards |
| **Logic** | Cross-reference `getGatbProgress().upcomingUnits` with `SkillSnapshot` mastery gates via `evaluateSkipEligibility` |
| **Bulk action** | Multi-select + "Skip selected" writes ranges to `ActivityConfig.skippedRanges` |
| **Files touched** | `CurriculumTab.tsx` (UI), `skipAdvisor.logic.ts` (batch evaluate), `gatbCurriculum.ts` (range utilities), `planning.ts` (if skip-log shape needed) |
| **Estimate** | ~500 lines new/modified |
| **Unblocks** | Proactive curriculum pacing; "what's coming?" visibility |
| **Deferral risk** | Low. Phase 1-2 deliver full per-item skip. Lookahead is a power-user feature Shelly can live without initially. |

---

## 5 -- Open Questions for Shelly

1. **When you skip as "not today," how soon should it come back?** Next school day? Next week? Or do you want to manually decide when to re-offer it?

2. **For lookahead: how far ahead do you want to see?** The GATB data covers the full workbook. Would you review 5 upcoming lessons? 10? The whole remaining book? (This affects UI density.)

3. **Should "mastered" skips auto-advance the workbook position, or do you want to confirm the advance?** Current proposal: mastered skips advance `currentPosition` automatically. If you'd rather tap "Advance" separately, that's easy to add.

4. **Do you ever want to un-skip something you previously skipped?** E.g., you skipped lessons 12-15 as mastered, then realized Lincoln actually needs review. Should the Curriculum tab have a "restore" action on skipped ranges?

5. **For the kid view: should Lincoln see *why* something was skipped, or just that it's skipped?** Current kid rendering just says "-- skipped" with no reason. Adding "-- mastered" could be encouraging; adding "-- too hard" could feel discouraging.
