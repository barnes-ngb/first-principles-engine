/**
 * Composite day-log doc-id parsing.
 *
 * THE definition now lives in `functions/src/shared/docId.ts`, compiled by BOTH
 * this app and the Cloud Functions project (ARCH-47 slice 2) — it used to exist
 * here and again, hand-ported, inside `functions/src/ai/tasks/monthlyHours.ts`.
 *
 * This file keeps its path and re-exports, so every consumer
 * (`records/dataReviewExportLoader.ts`, `records/records.logic.ts` — which
 * re-exports it again — and `today/daylog.model.ts`) is untouched.
 */
export { deriveChildIdFromDocId, parseDateFromDocId } from '../../../functions/src/shared/docId'
