// ── The one rule that moves a learner model off `no-data` (UX-322) ────────
//
// `LearnerModel.status` is written in exactly one place — `seedLearnerModel`,
// which stamps `'no-data'` when the child's snapshot / sight-word list carried no
// signal at all. **No incremental writer has ever changed it**, so a model seeded
// before its first workbook position, guided eval or parent attestation stayed
// `'no-data'` for the life of the document, no matter how much real evidence
// landed on it afterwards.
//
// That matters because `'no-data'` is what every consumer treats as *nothing*:
// `buildLearnerModelSlice` returns `""` (so the plan / shellyChat / weeklyReview
// prompts see no model), `learnerSynthesis` returns `skipped-no-data`,
// `FoundationsFocusLine` renders null, the Foundations tab shows its empty state,
// and `shellyChat`'s learner row is filtered out. A `'no-data'` model that holds
// evidence is a model that lies to five readers.
//
// So: one definition, applied by every writer that lands evidence. It **only ever
// promotes `no-data` → `seeded`** — it never demotes, never touches `'seeded'`,
// and never overwrites `'synthesized'` (the synthesis beat owns that one).
//
// Deliberately NOT derived at read time. Recomputing `status` in each of the five
// consumers would be five places to keep in step, in code that already reads the
// stored field; the fix belongs where the evidence lands.

import type { LearnerModel } from '../types/learnerModel'

/** True when any concept in the model carries at least one evidence ref. */
export function modelHasConceptEvidence(model: LearnerModel): boolean {
  for (const entry of Object.values(model.conceptStates ?? {})) {
    if ((entry?.evidence?.length ?? 0) > 0) return true
  }
  return false
}

/**
 * The `status` a write should carry, or `undefined` when the stored one stands —
 * so a caller writes the key only when it actually changes, and a merge payload
 * never carries a redundant field.
 *
 * Reads the **next** model (post-apply), which is what makes the answer exact:
 * a write that appends no evidence (the Review Chat's `queueTest`, which only
 * queues a check) leaves the evidence trail as it found it and promotes nothing.
 * A model already carrying evidence while still stamped `'no-data'` — one written
 * before this rule existed — is repaired by the next write, which is the correct
 * direction: the stored status is the thing that is wrong.
 */
export function promotedModelStatus(next: LearnerModel): LearnerModel['status'] | undefined {
  if (next.status !== 'no-data') return undefined
  return modelHasConceptEvidence(next) ? 'seeded' : undefined
}
