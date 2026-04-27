# Phase 3 — Records + Compliance Pack
Date: 2026-02-07

## Objective
Make records effortless and exportable:
- Hours totals and breakdowns
- Daily log diary
- Portfolio highlights
- Evaluations
- One-click "pack" export (CSV + Markdown first)

## In-Scope Deliverables
- [x] Hours hardening: derive + adjust + audit trail
- [x] Monthly evaluation workflow (wins/struggles/next steps + sample artifacts)
- [x] Monthly "Demo Night" highlights view (manual select + auto-suggest)
- [x] Export pack:
  - [x] Hours summary CSV
  - [x] Daily log CSV
  - [x] Evaluation markdown
  - [x] Portfolio index markdown (artifact links)

## Acceptance Criteria
- [x] Export pack for any date range with consistent formatting.
- [x] Evaluations are quick enough to do monthly.

## Implementation Notes

### New Files
- `src/features/records/records.logic.ts` — Pure functions for hours summary computation, CSV/Markdown generation, portfolio auto-suggest scoring, month helpers
- `src/features/records/records.logic.test.ts` — 26 tests covering all logic functions
- `src/features/records/EvaluationsPage.tsx` — Monthly evaluation form (wins/struggles/next steps + artifact picker per child)
- `src/features/records/PortfolioPage.tsx` — Demo Night highlights with auto-suggest scoring and manual selection

### Modified Files
- `src/core/types/domain.ts` — Enhanced `Evaluation` type (childId, monthStart/End, wins/struggles/nextSteps, sampleArtifactIds); added `HoursAdjustment` type
- `src/core/firebase/firestore.ts` — Added `hoursAdjustmentsCollection`
- `src/features/records/RecordsPage.tsx` — Hours breakdown by subject table, manual adjustment form with audit trail, full export pack (4 file types + "Export All")
- `src/app/router.tsx` — Routes for `/records/evaluations` and `/records/portfolio`
- `src/app/AppShell.tsx` — Navigation links for Evaluations and Portfolio

### Data Model Changes
- `Evaluation` now has: `childId`, `monthStart`, `monthEnd`, `wins[]`, `struggles[]`, `nextSteps[]`, `sampleArtifactIds[]`, `createdAt`, `updatedAt`
- New `HoursAdjustment`: `date`, `minutes` (+/-), `reason`, `subjectBucket?`, `location?`, `createdAt`
- New Firestore collection: `families/{familyId}/hoursAdjustments`
