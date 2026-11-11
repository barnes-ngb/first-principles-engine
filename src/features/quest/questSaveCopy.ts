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

/**
 * The Mine's recovery card, for a SAVED source whose map update is waiting.
 *
 * *"Your answers are safe"* is true here and only here: the source committed,
 * and the one thing left is the map.
 */
export const QUEST_RECOVERY_COPY = {
  title: 'One quest is still waiting.',
  body: 'Your answers are safe.',
  action: QUEST_GRAPH_COPY.retry,
} as const

/**
 * The card for a payload that never reached Firestore — a held final close, or
 * a manual exit whose partial write was rejected.
 *
 * It deliberately does NOT reuse {@link QUEST_RECOVERY_COPY}'s body: those
 * answers are *not* safe yet, and pairing an unsaved-error card with a sentence
 * saying they are is the one thing this card must never do. It says what is true
 * and what the tap does.
 */
export const QUEST_UNSAVED_COPY = {
  title: QUEST_SOURCE_COPY.failed,
  body: 'Tap to try saving it.',
  action: QUEST_SOURCE_COPY.retry,
  /** While a retry is in flight, on the same card. */
  saving: QUEST_SOURCE_COPY.saving,
  /** A refusal: something else already owns that id, so this payload is not it. */
  refused: QUEST_SOURCE_COPY.conflict,
} as const

/**
 * Why a Resume did nothing — one line per refusal.
 *
 * It says so instead of quietly starting a fresh quest, which is what the old
 * fallback did: a paid run in whatever mode the card named, that nobody asked
 * for. Each line is true about a different thing, because the right next move
 * differs: a finished quest needs no resuming, and a missing one is gone.
 */
export const QUEST_RESUME_REFUSAL_COPY = {
  missing: 'That quest is not here.',
  'not-interactive': 'That quest cannot go on.',
  finalized: 'That quest is done.',
  abandoned: 'That quest was closed.',
  'wrong-child': 'That quest is not yours.',
  'not-resumable': 'That quest cannot go on.',
  'no-resume-point': 'That quest cannot go on.',
  'stale-scope': 'Tap it again to go on.',
} as const
