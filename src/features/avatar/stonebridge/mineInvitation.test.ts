import { describe, expect, it } from 'vitest'

import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import type { LearnerModel, OpenQuestion, SynthesisMove } from '../../../core/types/learnerModel'
import { SynthesisVehicle } from '../../../core/types/learnerModel'
import {
  MINE_INVITATION_LINE,
  MINE_MATH_DIG_LABEL,
  MINE_READING_DIG_LABEL,
  MINE_RETURN_LABEL,
} from './libraryReturnCopy'
import {
  MINE_INVITATION_TARGETS,
  MineInvitationSource,
  selectMineInvitation,
} from './mineInvitation'

/**
 * WHICH Mine mode the town may offer — the pure decision, on its own.
 *
 * Everything here is the selector and nothing else: no React, no Firestore, no
 * route. The two supported concepts are real graph nodes (`reading.phonics.cvc`,
 * `math.operations.addWithin20`), so an id typo fails these rather than silently
 * never matching.
 *
 * **Today asks and parent-origin asks are the same entries, by construction.**
 * `OpenQuestion` carries no origin field — the Review Chat's `queueTest` and the
 * Today-side routing both append the same `routedTo:'quest'` shape — so a test
 * that "distinguished" them would be inventing a field. What is asserted
 * instead is that queue ORDER and nothing about provenance decides.
 */

const CVC = 'reading.phonics.cvc'
const ADD_WITHIN_20 = 'math.operations.addWithin20'
/** A real graph concept with no supported mode behind it. */
const BLENDS = 'reading.phonics.blends'

function ask(conceptId: string, extra: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    conceptId,
    question: 'Can he do this one?',
    routedTo: 'quest',
    reason: 'queued by the review',
    ...extra,
  }
}

function move(conceptId: string, vehicle: SynthesisVehicle = SynthesisVehicle.Quest): SynthesisMove {
  return { conceptId, kidName: 'Lincoln', why: 'because', suggestedVehicle: vehicle }
}

/** The synthesis generation every fixture carries unless it says otherwise. */
const GENERATION = '2026-11-01T00:00:00.000Z'

function model(partial: {
  openQuestions?: OpenQuestion[]
  whatMattersNext?: SynthesisMove[]
  synthesisStaleAt?: string | null
  noSynthesis?: boolean
  /** Explicitly settable, including to a blank or non-string value (UX-495). */
  generatedAt?: unknown
  /** The document's own stamp, when the fixture needs one. */
  childId?: string
}): Pick<LearnerModel, 'openQuestions' | 'synthesis' | 'synthesisStaleAt'> &
  Partial<Pick<LearnerModel, 'childId'>> {
  return {
    ...(partial.childId ? { childId: partial.childId } : {}),
    openQuestions: partial.openQuestions ?? [],
    synthesis: partial.noSynthesis
      ? undefined
      : {
          whatMattersNext: partial.whatMattersNext ?? [],
          narrative: 'a story',
          openQuestionsSummary: [],
          generatedAt: ('generatedAt' in partial
            ? partial.generatedAt
            : GENERATION) as unknown as string,
        },
    synthesisStaleAt: partial.synthesisStaleAt ?? null,
  }
}

const BOTH = { readingCalibrated: true, mathCalibrated: true }

describe('the supported set', () => {
  it('is exactly the two concepts, each on an existing Mine mode', () => {
    expect(Object.keys(MINE_INVITATION_TARGETS).sort()).toEqual([ADD_WITHIN_20, CVC])
    expect(MINE_INVITATION_TARGETS[CVC]).toEqual({
      domain: 'reading',
      questMode: 'phonics',
      label: MINE_READING_DIG_LABEL,
    })
    expect(MINE_INVITATION_TARGETS[ADD_WITHIN_20]).toEqual({
      domain: 'math',
      questMode: 'math',
      label: MINE_MATH_DIG_LABEL,
    })
  })
})

describe('the queued ask comes first', () => {
  it('offers the reading dig for a calibrated reading ask', () => {
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(CVC)] }),
      ...BOTH,
    })
    expect(invitation).toMatchObject({
      conceptId: CVC,
      questMode: 'phonics',
      label: MINE_READING_DIG_LABEL,
      source: MineInvitationSource.Ask,
    })
  })

  it('offers the math dig for a calibrated math ask', () => {
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(ADD_WITHIN_20)] }),
      ...BOTH,
    })
    expect(invitation).toMatchObject({ questMode: 'math', label: MINE_MATH_DIG_LABEL })
  })

  it('beats a fresh synthesis that names the other mode', () => {
    const invitation = selectMineInvitation({
      model: model({
        openQuestions: [ask(ADD_WITHIN_20)],
        whatMattersNext: [move(CVC)],
      }),
      ...BOTH,
    })
    expect(invitation?.questMode).toBe('math')
    expect(invitation?.source).toBe(MineInvitationSource.Ask)
  })

  it('takes the FIRST eligible ask — queue order, not provenance', () => {
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(ADD_WITHIN_20), ask(CVC)] }),
      ...BOTH,
    })
    expect(invitation?.conceptId).toBe(ADD_WITHIN_20)
  })

  it('SUPPRESSES when the first eligible ask has no supported mode', () => {
    // The queue is the authority: an invitation into some other mode would
    // contradict what the model is waiting for, so the town stays quiet.
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(BLENDS), ask(CVC)], whatMattersNext: [move(CVC)] }),
      ...BOTH,
    })
    expect(invitation).toBeNull()
  })

  it('ignores a resolved ask, a non-quest ask and an unknown concept', () => {
    const invitation = selectMineInvitation({
      model: model({
        openQuestions: [
          ask(CVC, { resolvedAt: '2026-11-02T00:00:00.000Z' }),
          ask(ADD_WITHIN_20, { routedTo: 'eval' }),
          ask('reading.phonics.not-a-node'),
        ],
        whatMattersNext: [move(CVC)],
      }),
      ...BOTH,
    })
    // Nothing eligible is queued, so the synthesis move is reached.
    expect(invitation?.source).toBe(MineInvitationSource.Synthesis)
  })

  it('does not count an ask in an uncalibrated domain', () => {
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(ADD_WITHIN_20)], whatMattersNext: [move(CVC)] }),
      readingCalibrated: true,
      mathCalibrated: false,
    })
    // The math ask is not eligible at all, so it neither offers nor suppresses.
    expect(invitation).toMatchObject({ conceptId: CVC, source: MineInvitationSource.Synthesis })
  })
})

describe('the synthesis fallback', () => {
  it('needs a synthesis to exist', () => {
    expect(selectMineInvitation({ model: model({ noSynthesis: true }), ...BOTH })).toBeNull()
  })

  it('needs `synthesisStaleAt` falsy — the mark, never a clock', () => {
    const stale = model({
      whatMattersNext: [move(CVC)],
      synthesisStaleAt: '2026-11-09T00:00:00.000Z',
    })
    expect(selectMineInvitation({ model: stale, ...BOTH })).toBeNull()
  })

  it('takes the first COMPATIBLE quest-vehicle move, skipping the rest', () => {
    const invitation = selectMineInvitation({
      model: model({
        whatMattersNext: [
          move(CVC, SynthesisVehicle.DadLab), // right concept, wrong vehicle
          move(BLENDS), // quest vehicle, unsupported mode
          move('math.operations.not-a-node'), // unknown concept
          move(ADD_WITHIN_20),
        ],
      }),
      ...BOTH,
    })
    expect(invitation).toMatchObject({
      conceptId: ADD_WITHIN_20,
      source: MineInvitationSource.Synthesis,
    })
  })

  it('skips a move in an uncalibrated domain', () => {
    const invitation = selectMineInvitation({
      model: model({ whatMattersNext: [move(ADD_WITHIN_20), move(CVC)] }),
      readingCalibrated: true,
      mathCalibrated: false,
    })
    expect(invitation?.conceptId).toBe(CVC)
  })
})

describe('nothing to offer', () => {
  it('a missing or failed model read — both arrive as no model', () => {
    expect(selectMineInvitation({ model: null, ...BOTH })).toBeNull()
    expect(selectMineInvitation({ model: undefined, ...BOTH })).toBeNull()
  })

  it('an uncalibrated child, whatever the model says', () => {
    const data = model({ openQuestions: [ask(CVC)], whatMattersNext: [move(ADD_WITHIN_20)] })
    expect(
      selectMineInvitation({ model: data, readingCalibrated: false, mathCalibrated: false }),
    ).toBeNull()
  })

  it('an empty model', () => {
    expect(selectMineInvitation({ model: model({}), ...BOTH })).toBeNull()
  })
})

/**
 * UX-495 — WHICH synthesis said so, carried on the offer.
 *
 * The defect this closes: the offer named a concept, a mode and a source, and
 * all three are unchanged when a synthesis is REGENERATED. So a same-concept
 * generation B that arrived while the child walked to the Mine was
 * indistinguishable from the generation A they were offered. The generation is
 * the only thing that can tell them apart, so the offer carries it — for a
 * fresh synthesis only, and only when the stored value is usable.
 *
 * It is not part of the mode decision: every assertion above still holds.
 */
describe('the synthesis generation the offer carries', () => {
  it('is the stored `generatedAt` on a synthesis offer', () => {
    const invitation = selectMineInvitation({
      model: model({ whatMattersNext: [move(ADD_WITHIN_20)] }),
      ...BOTH,
    })
    expect(invitation).toMatchObject({
      conceptId: ADD_WITHIN_20,
      source: MineInvitationSource.Synthesis,
      synthesisGeneratedAt: GENERATION,
    })
  })

  it('is ABSENT on a queued ask — a queue entry is not advice and has no generation', () => {
    const invitation = selectMineInvitation({
      model: model({ openQuestions: [ask(CVC)], whatMattersNext: [move(CVC)] }),
      ...BOTH,
    })
    expect(invitation?.source).toBe(MineInvitationSource.Ask)
    expect(invitation?.synthesisGeneratedAt).toBeUndefined()
  })

  it('is absent when the stored generation is missing, blank or not a string', () => {
    for (const generatedAt of [undefined, '', '   ', 42, null, {}]) {
      const invitation = selectMineInvitation({
        model: model({ whatMattersNext: [move(ADD_WITHIN_20)], generatedAt }),
        ...BOTH,
      })
      // The offer itself is unchanged — only the generation is withheld.
      expect(invitation).toMatchObject({ conceptId: ADD_WITHIN_20 })
      expect(invitation?.synthesisGeneratedAt).toBeUndefined()
    }
  })

  it('is trimmed, so a padded stored value still compares equal', () => {
    const invitation = selectMineInvitation({
      model: model({ whatMattersNext: [move(ADD_WITHIN_20)], generatedAt: `  ${GENERATION} ` }),
      ...BOTH,
    })
    expect(invitation?.synthesisGeneratedAt).toBe(GENERATION)
  })

  it('is withheld when the model document is stamped for ANOTHER child', () => {
    const data = model({ whatMattersNext: [move(ADD_WITHIN_20)], childId: 'london' })
    const invitation = selectMineInvitation({
      model: data,
      ...BOTH,
      expectedChildId: 'lincoln',
    })
    // The mode is still offered (the ordinary behaviour); the generation is not.
    expect(invitation).toMatchObject({ conceptId: ADD_WITHIN_20, questMode: 'math' })
    expect(invitation?.synthesisGeneratedAt).toBeUndefined()
  })

  it('is carried when the stamp agrees, and when no caller says what to expect', () => {
    const data = model({ whatMattersNext: [move(ADD_WITHIN_20)], childId: 'lincoln' })
    expect(
      selectMineInvitation({ model: data, ...BOTH, expectedChildId: 'lincoln' })
        ?.synthesisGeneratedAt,
    ).toBe(GENERATION)
    expect(selectMineInvitation({ model: data, ...BOTH })?.synthesisGeneratedAt).toBe(GENERATION)
  })
})

describe('the copy holds the kid readability bar', () => {
  it('the line and the three labels', () => {
    expectKidLine(MINE_INVITATION_LINE, 'Mine invitation · line')
    expectKidWording(MINE_READING_DIG_LABEL, 'Mine invitation · reading action')
    expectKidWording(MINE_MATH_DIG_LABEL, 'Mine invitation · math action')
    expectKidWording(MINE_RETURN_LABEL, 'Mine trip · way back')
  })
})
