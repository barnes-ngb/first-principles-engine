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
  QUEST_GRAPH_COPY,
  QUEST_RECOVERY_COPY,
  QUEST_RESUME_REFUSAL_COPY,
  QUEST_SOURCE_COPY,
  QUEST_UNSAVED_COPY,
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
