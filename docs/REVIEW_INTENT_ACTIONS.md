# Charter Alignment — Action Items

Ordered by priority. Effort: S (< 1 day), M (1-3 days), L (3-5 days).

---

## Priority 1 — Violations

### 1. ✅ PARTIAL — Accept AI skip recommendation (Phase 1, 2026-04-14)
**Principle:** #9 (No busywork)
**Effort:** M
**What:** Phase 1 landed: "Accept & advance" button on ScanResultsPanel when AI recommends skip. Marks checklist item as `skipped: true, skipReason: 'ai-recommended'`, advances `ActivityConfig.currentPosition` by +1, records `parentOverride` on scan record. Auto-rollover of unchecked items to next school day (no manual re-add). Scan-advance auto-completes bypassed checklist items. Remaining: bulk-apply button on `PlanPreviewCard` (Phase 2). Files: `ScanResultsPanel.tsx`, `TodayPage.tsx`, `rollover.ts`, `scanAdvance.ts`, `useUnifiedCapture.ts`.

### 2. Add week-level workbook pause
**Principle:** #9 (No busywork)
**Effort:** M
**What:** In `CurriculumTab.tsx`, add a "Pause for 1 week" action alongside "Mark complete" and "Remove". Store a `pausedUntil: string` (YYYY-MM-DD) on `ActivityConfig`. Planner filters out paused configs when generating plans. Files: `src/core/types/dadlab.ts` or relevant type file for ActivityConfig, `CurriculumTab.tsx`, `useActivityConfigs.ts`, planner prompt assembly.

### 3. ✅ DONE — Editable disposition narrative (2026-04-14)
**Principle:** #5 (AI suggests, humans decide)
**Effort:** S
**What:** Per-disposition inline edit with reason note, "Edited by Shelly" indicator, revert to AI. Overrides stored as separate `dispositionOverrides` field on child document (not inside `dispositionCache`) so regeneration cannot blow away edits. `effectiveDispositionText()` helper centralizes override-vs-AI resolution. "Newer AI available" notice shown when AI regenerates after an override. Types extracted to `src/core/types/disposition.ts`. Files changed: `DispositionProfile.tsx`, `src/core/types/disposition.ts`, `src/core/types/index.ts`.

### 4. ✅ DONE — Remove score display from Quest kid UI (2026-04-14)
**Principle:** #2 (No grades/scores/rankings on kid UI)
**Effort:** S
**What:** Removed `X/10` question counter, running `totalCorrect` tally, `totalQuestions` on summary, `X/5` fluency ratio, and `X/Y correct` on resume card. Progress bar remains for session pacing. Diamond counts kept as achievement framing. Files changed: `ReadingQuest.tsx`, `KnowledgeMinePage.tsx`, `QuestSummary.tsx`, `FluencyPractice.tsx`.

---

## Priority 2 — Gaps

### 5. Add subject-level skip ("skip all Math this week")
**Principle:** #9 (No busywork)
**Effort:** M
**What:** In the plan preview or setup wizard, add a subject toggle that bulk-rejects all items for a given `subjectBucket`. Could live in `PlannerSetupWizard.tsx` as a "Skip subjects" step, or as filter toggles in `PlanPreviewCard.tsx`.

### 6. Add print/export for records and compliance
**Principle:** #11 (Print the stack)
**Effort:** M
**What:** Add a "Download PDF" or "Print" button to the Records page that exports hours logs, evaluation summaries, and compliance status as a formatted document. Missouri compliance requires printable records. jsPDF is already a dependency. Files: `src/features/records/` (new export utility), `records.logic.ts` (extend `computeHoursSummary` output).

### 7. Add one-click portfolio PDF export
**Principle:** #11 (Print the stack)
**Effort:** S
**What:** The markdown export exists (`records.logic.ts:295-334`) but there's no formatted print flow. Add a "Print Portfolio" button that renders the markdown index as a styled HTML page and opens the browser print dialog, or generates a PDF. File: `src/features/records/PortfolioPage.tsx`.

### 8. Improve week plan macro-level control
**Principle:** #5 (AI suggests, humans decide)
**Effort:** M
**What:** Allow Shelly to change plan type (Normal / MVD) per day after AI generates the plan, and to redistribute items between days. Currently only item-level accept/reject exists. Files: `src/features/planner-chat/PlanPreviewCard.tsx`, `PlannerChatPage.tsx` plan-apply logic.

---

## Priority 3 — Polish

### 9. Make quest level override permanent (not 48-hour window)
**Principle:** #5 (AI suggests, humans decide)
**Effort:** S
**What:** In `workingLevels.ts:16`, the 48-hour guard means automated sources can eventually overwrite a manual override. Change to a sticky `manualOverride: true` flag that only clears when Shelly explicitly releases it. File: `src/features/quest/workingLevels.ts`.

### 10. Hide evaluation history scores from kid navigation
**Principle:** #2 (No grades/scores/rankings on kid UI)
**Effort:** S
**What:** `EvaluationHistoryTab.tsx:81,130` shows `X/Y correct`. This tab is parent-facing but could be navigated by kids. Either gate the tab behind parent auth or replace score display with narrative summary. File: `src/features/records/EvaluationHistoryTab.tsx`.

---

## Summary

| # | Action | Principle | Effort | Rating |
|---|---|---|---|---|
| 1 | ✅ Partial: Accept AI skip (Phase 1) | #9 No busywork | M | Improving |
| 2 | Week-level workbook pause | #9 No busywork | M | Violated |
| 3 | ✅ Editable disposition narrative | #5 AI suggests | S | Done |
| 4 | ✅ Remove quest scores from kid UI | #2 No grades | S | Done |
| 5 | Subject-level skip | #9 No busywork | M | Gap |
| 6 | Print records/compliance | #11 Print the stack | M | Gap |
| 7 | Portfolio PDF export | #11 Print the stack | S | Gap |
| 8 | Week plan macro control | #5 AI suggests | M | Gap |
| 9 | Sticky quest level override | #5 AI suggests | S | Polish |
| 10 | Gate evaluation history from kids | #2 No grades | S | Polish |
