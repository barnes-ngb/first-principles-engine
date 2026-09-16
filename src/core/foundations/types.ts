/**
 * Foundations concept-graph types (FEAT-48, Learner Model slice 1).
 *
 * THE definition now lives in `functions/src/shared/foundations/types.ts`,
 * compiled by BOTH this app and the Cloud Functions project (the ARCH-47 pattern
 * — UX-296). It used to live here, and the functions side could not import it, so
 * `functions/src/ai/data/foundationsGraphSummary.ts` carried a hand-committed
 * machine-generated MIRROR of the graph with nothing enforcing the two agreed.
 *
 * This file keeps its path and re-exports, so every consumer — the barrel, the
 * bridges, the seeder, `FoundationsReviewLauncher`, `useFoundationsReview`,
 * `FoundationsReviewSession` and `progress/foundationsView.ts` — is untouched.
 */
export * from '../../../functions/src/shared/foundations/types'
