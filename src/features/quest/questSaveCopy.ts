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
 * ── Leaving the summary before the SOURCE save landed (UX-496) ─────────────
 *
 * The baseline this repairs: a denied close left *Try saving again* on the
 * summary, and the tappable *Back to village* beside it threw the retry away —
 * the source, the evidence and the Resume were all absent on re-entry. So the
 * three Mine-owned completion exits (*Back to village*, *Done*, *Try another
 * quest*, and the conditional practice-story button that also leaves) ask
 * first, and the safe default is to stay.
 *
 * What it must never say: that the answers are *safe*, which is true only of a
 * saved source whose map is waiting ({@link QUEST_RECOVERY_COPY}). Here they
 * are not. It also makes no promise in the other direction — a write already
 * dispatched may still land — so the leave line says *may*, not *will*.
 *
 * `conflict` is not a success and gets its own honest line: a different run
 * already owns that id, so this payload will never land and no retry can help.
 * The deliberate exit is the only move left, and it stays reachable.
 *
 * The same door serves the owning INTRO's *Back to village* while a manual
 * exit's partial source is saving or waiting on its Retry — the same loss, from
 * the other screen, and the same three sentences are true of it.
 */
export const QUEST_EXIT_GUARD_COPY = {
  savingTitle: 'Still saving your quest.',
  savingBody: 'Wait here while it saves.',
  failedTitle: QUEST_SOURCE_COPY.failed,
  failedBody: 'Your answers are not saved yet.',
  conflictTitle: QUEST_SOURCE_COPY.conflict,
  conflictBody: 'This quest will not save.',
  /** The plain explanation on the deliberate-departure tap. */
  leaveWarning: 'If you go now, they may be lost.',
  /**
   * The OWNERLESS face of the door, for a current exit whose bound notice is
   * hidden from whoever is looking — a sibling profile, or a view the notice's
   * family does not reach. The hold is real (the payload still owes the child
   * who made it), so the exit must not be swallowed in silence; but nothing
   * about the owner, his answers or his Retry belongs on a screen that is not
   * his. So: one true sentence, and the same stay-or-leave choice.
   */
  genericTitle: 'One quest is not saved.',
  genericBody: 'Stay here or leave it now.',
  /** The same no-promise warning, about the quest rather than *your* answers. */
  genericWarning: 'If you go now, it may be lost.',
  stay: 'Stay here',
  leave: 'Leave without saving',
  retry: QUEST_SOURCE_COPY.retry,
} as const

/**
 * Which face the exit door is wearing — the source save's own phase.
 *
 * Declared here, with the copy, so the only module that needs both the phases
 * and the sentences has no component in it: the session hook and the dialog
 * both import this and neither imports the other.
 */
export type QuestExitPhase = 'saving' | 'failed' | 'conflict'

export interface QuestExitNotice {
  title: string
  body: string
  /** What leaving does and does not promise. */
  warning: string
  /** A write is in flight right now, so there is nothing to re-ask for. */
  busy: boolean
  /** Whether a Retry door belongs on this dialog at all. */
  retryable: boolean
  /** A failure, as opposed to an ordinary wait — colour and tone follow. */
  failed: boolean
}

/**
 * The door's copy for the phase it is actually in.
 *
 * A hold that is merely `saving` is a WAIT and must not borrow the vocabulary
 * of a problem: no error colour, no retry, no claim that anything was lost. A
 * `conflict` is a failure but not a retryable one — offering *Try saving again*
 * there would ask the child to re-send a payload that can never land.
 */
export function questExitNotice(phase: QuestExitPhase): QuestExitNotice {
  if (phase === 'saving') {
    return {
      title: QUEST_EXIT_GUARD_COPY.savingTitle,
      body: QUEST_EXIT_GUARD_COPY.savingBody,
      warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
      busy: true,
      retryable: false,
      failed: false,
    }
  }
  if (phase === 'conflict') {
    return {
      title: QUEST_EXIT_GUARD_COPY.conflictTitle,
      body: QUEST_EXIT_GUARD_COPY.conflictBody,
      warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
      busy: false,
      // Nothing to retry: another run owns this id. The escape is the move.
      retryable: false,
      failed: true,
    }
  }
  return {
    title: QUEST_EXIT_GUARD_COPY.failedTitle,
    body: QUEST_EXIT_GUARD_COPY.failedBody,
    warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
    busy: false,
    retryable: true,
    failed: true,
  }
}

/**
 * The door's copy when the held notice is HIDDEN from this viewer (UX-496).
 *
 * The phase is still read live — this face exists only while the bound save is
 * genuinely `saving`, `failed` or `conflict`, and the door closes the moment it
 * is acknowledged. What is dropped is everything the viewer is not entitled to:
 * which phase it is in, whose quest it is, and the Retry, which belongs to the
 * owning child on his own screen. Not retryable and not dressed as an error,
 * because neither claim is this viewer's to act on.
 */
export function questExitGenericNotice(): QuestExitNotice {
  return {
    title: QUEST_EXIT_GUARD_COPY.genericTitle,
    body: QUEST_EXIT_GUARD_COPY.genericBody,
    warning: QUEST_EXIT_GUARD_COPY.genericWarning,
    busy: false,
    retryable: false,
    failed: false,
  }
}

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
  /**
   * The claim could not be sent — the quest is still here and still eligible,
   * so the card stays and this asks for another tap. It must NOT say the quest
   * is gone.
   */
  'claim-failed': 'Could not open it. Tap it again.',
} as const
