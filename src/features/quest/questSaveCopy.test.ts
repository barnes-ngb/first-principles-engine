import { describe, expect, it } from 'vitest'

/**
 * UX-494 — the Mine's save copy, held to the shared kid bar.
 *
 * New child-facing text, so `src/test/kidReadability.ts` applies: at most eight
 * words, nothing over two syllables by the proxy. The *lines* are sentences and
 * take the full bar; the retry labels are buttons and take the wording bar only
 * (a button label with a full stop reads worse, not better).
 *
 * It also pins the property the whole repair turns on: the SOURCE success and
 * the GRAPH success are different sentences. A surface that reports one as the
 * other is the defect this run exists for.
 */

import { expectKidLine, expectKidWording } from '../../test/kidReadability'
import {
  QUEST_EXIT_GUARD_COPY,
  QUEST_GRAPH_COPY,
  QUEST_RECOVERY_COPY,
  QUEST_RESUME_REFUSAL_COPY,
  QUEST_SOURCE_COPY,
  QUEST_UNSAVED_COPY,
  questExitGenericNotice,
  questExitNotice,
} from './questSaveCopy'

describe('quest save copy is readable by the boy it is for', () => {
  it('holds every source line to the kid bar', () => {
    for (const [key, line] of Object.entries(QUEST_SOURCE_COPY)) {
      if (key === 'retry') expectKidWording(line, `QUEST_SOURCE_COPY.${key}`)
      else expectKidLine(line, `QUEST_SOURCE_COPY.${key}`)
    }
  })

  it('holds every graph line to the kid bar', () => {
    for (const [key, line] of Object.entries(QUEST_GRAPH_COPY)) {
      if (key === 'retry') expectKidWording(line, `QUEST_GRAPH_COPY.${key}`)
      else expectKidLine(line, `QUEST_GRAPH_COPY.${key}`)
    }
  })

  it('holds the recovery card and every resume refusal to the kid bar', () => {
    expectKidLine(QUEST_RECOVERY_COPY.title, 'QUEST_RECOVERY_COPY.title')
    expectKidLine(QUEST_RECOVERY_COPY.body, 'QUEST_RECOVERY_COPY.body')
    expectKidWording(QUEST_RECOVERY_COPY.action, 'QUEST_RECOVERY_COPY.action')
    for (const [key, line] of Object.entries(QUEST_RESUME_REFUSAL_COPY)) {
      expectKidLine(line, `QUEST_RESUME_REFUSAL_COPY.${key}`)
    }
  })

  it('holds the unsaved-payload card to the kid bar', () => {
    expectKidLine(QUEST_UNSAVED_COPY.title, 'QUEST_UNSAVED_COPY.title')
    expectKidLine(QUEST_UNSAVED_COPY.body, 'QUEST_UNSAVED_COPY.body')
    expectKidLine(QUEST_UNSAVED_COPY.saving, 'QUEST_UNSAVED_COPY.saving')
    expectKidLine(QUEST_UNSAVED_COPY.refused, 'QUEST_UNSAVED_COPY.refused')
    expectKidWording(QUEST_UNSAVED_COPY.action, 'QUEST_UNSAVED_COPY.action')
  })

  /**
   * UX-496 — the exit guard's own copy. The three lines and the warning are
   * sentences; the two button labels take the wording bar only.
   */
  it('holds the exit-guard copy to the kid bar', () => {
    for (const key of [
      'savingTitle',
      'savingBody',
      'failedTitle',
      'failedBody',
      'conflictTitle',
      'conflictBody',
      'leaveWarning',
      'genericTitle',
      'genericBody',
      'genericWarning',
    ] as const) {
      expectKidLine(QUEST_EXIT_GUARD_COPY[key], `QUEST_EXIT_GUARD_COPY.${key}`)
    }
    expectKidWording(QUEST_EXIT_GUARD_COPY.stay, 'QUEST_EXIT_GUARD_COPY.stay')
    expectKidWording(QUEST_EXIT_GUARD_COPY.leave, 'QUEST_EXIT_GUARD_COPY.leave')
    expectKidWording(QUEST_EXIT_GUARD_COPY.retry, 'QUEST_EXIT_GUARD_COPY.retry')
  })
})

describe('the exit guard says what is true about the answers', () => {
  /**
   * The one thing this door must never do: a held departure exists BECAUSE the
   * source has not landed, so borrowing the saved-source reassurance would tell
   * a child his answers are safe at the exact moment they are not.
   */
  it('never calls an unsaved quest safe', () => {
    for (const line of Object.values(QUEST_EXIT_GUARD_COPY)) {
      expect(line.toLowerCase()).not.toContain('safe')
    }
    expect(QUEST_EXIT_GUARD_COPY.failedBody).not.toBe(QUEST_RECOVERY_COPY.body)
  })

  /** No promise in either direction — a dispatched write may still land. */
  it('says the answers MAY be lost, not that they will be', () => {
    expect(QUEST_EXIT_GUARD_COPY.leaveWarning).toContain('may')
    expect(QUEST_EXIT_GUARD_COPY.leaveWarning.toLowerCase()).not.toContain('will')
  })

  /** A wait must not borrow the vocabulary of a failure. */
  it('keeps the saving door apart from the failed one', () => {
    expect(QUEST_EXIT_GUARD_COPY.savingTitle).not.toBe(QUEST_EXIT_GUARD_COPY.failedTitle)
    expect(QUEST_EXIT_GUARD_COPY.savingBody).not.toBe(QUEST_EXIT_GUARD_COPY.failedBody)
    // And the failed/conflict doors say the two different facts they report.
    expect(QUEST_EXIT_GUARD_COPY.conflictTitle).not.toBe(QUEST_EXIT_GUARD_COPY.failedTitle)
  })

  /** The deliberate departure is labelled as one, and is not the stay. */
  it('labels the departure deliberately', () => {
    expect(QUEST_EXIT_GUARD_COPY.leave).not.toBe(QUEST_EXIT_GUARD_COPY.stay)
    expect(QUEST_EXIT_GUARD_COPY.leave.toLowerCase()).toContain('saving')
  })

  /**
   * The selector, which is the whole of the door's logic: a wait offers no
   * retry and wears no error, and a conflict is a failure that cannot be
   * retried — re-sending a payload another run already owns can never land.
   */
  it('offers a retry only where retrying is a real move', () => {
    expect(questExitNotice('saving')).toMatchObject({ retryable: false, failed: false, busy: true })
    expect(questExitNotice('failed')).toMatchObject({ retryable: true, failed: true, busy: false })
    expect(questExitNotice('conflict')).toMatchObject({
      retryable: false,
      failed: true,
      busy: false,
    })
  })

  /**
   * The ownerless face, for a held exit whose notice this viewer may not see.
   * It must still be a real door — a hold with no prompt was the defect — and
   * it must say nothing that belongs to the owning child: not which phase his
   * save is in, and not his Retry.
   */
  it('keeps the hidden-notice door honest and ownerless', () => {
    const generic = questExitGenericNotice()
    expect(generic).toMatchObject({ retryable: false, failed: false, busy: false })
    expect(generic.warning).toContain('may')
    expect(generic.warning.toLowerCase()).not.toContain('will')
    for (const phase of ['saving', 'failed', 'conflict'] as const) {
      const owned = questExitNotice(phase)
      expect(generic.title).not.toBe(owned.title)
      expect(generic.body).not.toBe(owned.body)
    }
  })

  it('carries the leaving warning on every face of the door', () => {
    for (const phase of ['saving', 'failed', 'conflict'] as const) {
      expect(questExitNotice(phase).warning).toBe(QUEST_EXIT_GUARD_COPY.leaveWarning)
    }
  })
})

describe('an unsaved payload is never described as safe', () => {
  /**
   * The one thing this card must not do. The recovery card's body is true of a
   * SAVED source whose map is waiting; reusing it for a payload that never
   * reached Firestore would tell a child his answers are safe when they are not.
   */
  it('does not reuse the saved-source reassurance', () => {
    expect(QUEST_UNSAVED_COPY.body).not.toBe(QUEST_RECOVERY_COPY.body)
    expect(QUEST_UNSAVED_COPY.body.toLowerCase()).not.toContain('safe')
    expect(QUEST_UNSAVED_COPY.title).not.toBe(QUEST_RECOVERY_COPY.title)
  })

  it('offers a different action from the map retry', () => {
    expect(QUEST_UNSAVED_COPY.action).not.toBe(QUEST_RECOVERY_COPY.action)
  })
})

describe('the two successes are said separately', () => {
  it('never reports a saved source as a changed map, or the reverse', () => {
    expect(QUEST_SOURCE_COPY.saved).not.toBe(QUEST_GRAPH_COPY.reached)
    // "Saved, and nothing to add" is the SOURCE sentence, deliberately: a
    // skipped projection must claim no map change at all.
    expect(QUEST_GRAPH_COPY.skipped).toBe(QUEST_SOURCE_COPY.saved)
    expect(QUEST_GRAPH_COPY.skipped).not.toBe(QUEST_GRAPH_COPY.reached)
  })

  it('distinguishes a failed source from a failed map', () => {
    expect(QUEST_SOURCE_COPY.failed).not.toBe(QUEST_GRAPH_COPY.failed)
    expect(QUEST_SOURCE_COPY.retry).not.toBe(QUEST_GRAPH_COPY.retry)
  })

  it('gives each resume refusal its own honest line where the next move differs', () => {
    // A finished quest needs no resuming; a missing one is gone; one that is not
    // yours is a different fact again.
    expect(QUEST_RESUME_REFUSAL_COPY.finalized).not.toBe(QUEST_RESUME_REFUSAL_COPY.missing)
    expect(QUEST_RESUME_REFUSAL_COPY['wrong-child']).not.toBe(QUEST_RESUME_REFUSAL_COPY.missing)
  })
})
