// ── What the Mine says about saving (UX-494) ───────────────────────────────
//
// Two successes, said separately, because they are two different facts and the
// child (and the parent reading over his shoulder) can act on only one of them:
//
//   • the SOURCE — his answers, under this run's own id. If this did not land,
//     nothing else matters and the retry is worth offering immediately.
//   • the GRAPH — the learner model's evidence, concept states and the parent's
//     queued requests. This can fail on its own, hours after the answers are
//     safe, and it is recoverable from the saved source alone.
//
// Collapsing them is the defect this run repairs in words as well as in code: a
// denied save used to leave the summary saying nothing while the graph claimed
// the work had landed.
//
// Kid copy, held to the shared readability bar (`src/test/kidReadability.ts`):
// at most eight words, nothing over two syllables. This is a kid's screen.

/** The source save, as the child reads it. */
export const QUEST_SOURCE_COPY = {
  saving: 'Saving your quest.',
  saved: 'Your quest is saved.',
  failed: 'Your quest did not save.',
  /** A different run already finished under this id — his answers are not it. */
  conflict: 'This quest was saved before.',
  retry: 'Try saving again',
} as const

/** The graph (learner-model) projection, as the child reads it. */
export const QUEST_GRAPH_COPY = {
  pending: 'Adding this to your map.',
  reached: 'Your map has it now.',
  /** Honest: saved, and nothing to add — never dressed up as a map update. */
  skipped: 'Your quest is saved.',
  failed: 'Your map did not change.',
  retry: 'Add to my map',
} as const

/** The Mine's recovery card, for a saved source whose map update failed. */
export const QUEST_RECOVERY_COPY = {
  title: 'One quest is still waiting.',
  body: 'Your answers are safe.',
  action: QUEST_GRAPH_COPY.retry,
} as const
