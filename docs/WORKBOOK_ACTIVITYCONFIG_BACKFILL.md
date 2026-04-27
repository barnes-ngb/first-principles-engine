# Workbook ActivityConfig Guaranteed Backfill (Phase 2B hardening)

## What this adds

A **server-side guaranteed backfill path** now runs inside the callable AI entrypoint before task dispatch:

- Function: `ensureWorkbookActivityConfigsForChild(...)`
- File: `functions/src/ai/workbookActivityConfigBackfill.ts`
- Call site: `functions/src/ai/chat.ts`

Because all quest/AI task calls pass through this callable, workbook-type `activityConfigs` are backfilled for the active child before quest/AI context logic executes.

## Backfill coverage

For each legacy `workbookConfigs` document for the active child, the backfill ensures a workbook-type `activityConfigs` entry exists and includes:

- `currentPosition` (max(existing, legacy))
- `totalUnits` / `unitLabel` (preserve existing, fill from legacy when missing)
- curriculum metadata needed by quest/AI (`curriculumMeta`)
- `curriculumMeta.completed`
- `curriculumMeta.masteredSkills` (merged + deduped)

## Idempotency

The path is safe to run repeatedly:

- deterministic doc IDs for new workbook activity configs (`wb_{childId}_{normalizedCurriculumKey}`)
- merges into existing activity docs with `set(..., { merge: true })`
- only commits a write batch when there are actual creates/updates

## Legacy compatibility

This PR **does not remove workbookConfigs fallbacks**. Legacy fallback reads remain for safety while this guaranteed path rolls out.

## Validation guidance

1. Deploy functions with this change.
2. Trigger any AI child-scoped task for each active family/child (Quest, plan chat, etc.).
3. Confirm logs for `[activityConfigs.backfill] Applied workbook backfill` during initial runs.
4. Verify `families/{familyId}/activityConfigs` has workbook docs populated with progression + curriculum metadata.
5. Confirm quest/AI behavior remains stable.

## When Phase 2C fallback removal is safe

Phase 2C (removing remaining workbookConfigs fallback reads in AI/quest paths) is safe only when all are true:

1. This server-side backfill has been deployed to production.
2. Active families/children have executed at least one child-scoped AI request post-deploy.
3. Validation confirms workbook-type `activityConfigs` exist with required metadata (`currentPosition`, `totalUnits`/`unitLabel` where available, `curriculumMeta.completed`, `curriculumMeta.masteredSkills` where available).
4. No production errors indicate missing workbook activity configs in quest/AI flows.
