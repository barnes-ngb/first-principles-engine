import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SkillSnapshot } from '../../../core/types'
import { MasteryGate, SkillLevel } from '../../../core/types/enums'
import type { LearnerModel } from '../../../core/types/learnerModel'
import { SynthesisVehicle } from '../../../core/types/learnerModel'
import {
  MINE_INVITATION_LINE,
  MINE_MATH_DIG_LABEL,
  MINE_READING_DIG_LABEL,
} from './libraryReturnCopy'
import { getLibraryIdentityEpoch } from './libraryReturnFlow'
import StonebridgeMineInvitation from './StonebridgeMineInvitation'

/**
 * The Square's invitation as a scoped surface — its reads, its gate, its tap and
 * the focus it owes a return.
 *
 * The two reads are stubbed because they are a Firestore subscription and a
 * Firestore get; which MODE a given model and snapshot produce is
 * `mineInvitation.test.ts` against the real selector, and the real calibration
 * predicates run here unmocked. What this file is for is the part only a mounted
 * component can state: that an unsettled read offers nothing, that the action
 * carries the epoch read at the tap, and that a return's focus either lands on
 * the action or reports honestly that it did not.
 */

const fx = vi.hoisted(() => ({
  snapshot: null as unknown,
  loaded: true,
  model: null as unknown,
  loading: false,
}))

vi.mock('../../../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: fx.snapshot, loaded: fx.loaded }),
}))

vi.mock('../../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => ({ model: fx.model, loading: fx.loading }),
}))

/** A reading-calibrated snapshot: a real phonics working level. */
const READING_SNAPSHOT = {
  childId: 'lincoln',
  prioritySkills: [],
  supports: [],
  stopRules: [],
  workingLevels: { phonics: 3 },
} as unknown as SkillSnapshot

/** Math-calibrated, and reading only by an untouched starter row (not evidence). */
const MATH_SNAPSHOT = {
  childId: 'lincoln',
  prioritySkills: [
    { tag: 'math.operations.add', level: SkillLevel.Developing, masteryGate: MasteryGate.NotYet },
  ],
  supports: [],
  stopRules: [],
  workingLevels: {},
} as unknown as SkillSnapshot

function modelWith(conceptId: string): LearnerModel {
  return {
    childId: 'lincoln',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [
      { conceptId, question: 'see this?', routedTo: 'quest', reason: 'queued' },
    ],
    synthesis: {
      whatMattersNext: [
        { conceptId, kidName: 'Lincoln', why: 'because', suggestedVehicle: SynthesisVehicle.Quest },
      ],
      narrative: '',
      openQuestionsSummary: [],
      generatedAt: '2026-11-01T00:00:00.000Z',
    },
    synthesisStaleAt: null,
    seededAt: '2026-10-01T00:00:00.000Z',
  } as unknown as LearnerModel
}

const noop = () => {}

function renderInvitation(
  props: Partial<{
    identityEpoch: number
    focusGeneration: number
    onFocusServed: (generation: number, landed: boolean) => void
    onOffer: (invitation: unknown, observedEpoch: number) => void
  }> = {},
) {
  return render(
    <StonebridgeMineInvitation
      familyId="fam-1"
      childId="lincoln"
      // The live epoch by default: the committed render agrees with the store.
      identityEpoch={props.identityEpoch ?? getLibraryIdentityEpoch()}
      focusGeneration={props.focusGeneration ?? 0}
      onFocusServed={props.onFocusServed ?? noop}
      onOffer={props.onOffer ?? noop}
    />,
  )
}

beforeEach(() => {
  fx.snapshot = READING_SNAPSHOT
  fx.loaded = true
  fx.model = modelWith('reading.phonics.cvc')
  fx.loading = false
})

describe('what it offers', () => {
  it('one line and one 44px action for a calibrated reading next move', () => {
    renderInvitation()
    expect(screen.getByText(`⛏️ ${MINE_INVITATION_LINE}`)).toBeInTheDocument()
    const action = screen.getByRole('button', { name: MINE_READING_DIG_LABEL })
    expect(action).toBeInTheDocument()
  })

  it('the math action for a math-calibrated child with a math move', () => {
    fx.snapshot = MATH_SNAPSHOT
    fx.model = modelWith('math.operations.addWithin20')
    renderInvitation()
    expect(screen.getByRole('button', { name: MINE_MATH_DIG_LABEL })).toBeInTheDocument()
  })

  it('nothing at all when the domain is not calibrated', () => {
    // A math move with a reading-only snapshot: no mode is calibrated for it.
    fx.model = modelWith('math.operations.addWithin20')
    renderInvitation()
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
  })

  it('nothing while either read is unsettled', () => {
    fx.loaded = false
    const { unmount } = renderInvitation()
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
    unmount()

    fx.loaded = true
    fx.loading = true
    renderInvitation()
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
  })

  it('nothing for a missing or failed model read', () => {
    fx.model = null
    renderInvitation()
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
  })
})

describe('the tap', () => {
  it('hands over the offer and the epoch read AT the tap', () => {
    const onOffer = vi.fn()
    renderInvitation({ onOffer })
    fireEvent.click(screen.getByRole('button', { name: MINE_READING_DIG_LABEL }))
    expect(onOffer).toHaveBeenCalledTimes(1)
    expect(onOffer.mock.calls[0][0]).toMatchObject({
      conceptId: 'reading.phonics.cvc',
      questMode: 'phonics',
    })
    expect(onOffer.mock.calls[0][1]).toBe(getLibraryIdentityEpoch())
  })

  it('writes nothing and starts nothing — it only reports the offer', () => {
    const onOffer = vi.fn()
    renderInvitation({ onOffer })
    fireEvent.click(screen.getByRole('button', { name: MINE_READING_DIG_LABEL }))
    // The component has no writer and no session: the host owns the trip.
    expect(onOffer).toHaveBeenCalledTimes(1)
  })

  it('is REFUSED when the identity moved after the render it came from', () => {
    // The `A → B → A` shape: the committed epoch is behind the store's, which a
    // handler that sampled the store inside itself could never have noticed.
    const onOffer = vi.fn()
    renderInvitation({ identityEpoch: getLibraryIdentityEpoch() - 1, onOffer })
    fireEvent.click(screen.getByRole('button', { name: MINE_READING_DIG_LABEL }))
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('and hands over the epoch it was RENDERED with, never a fresh reading', () => {
    const onOffer = vi.fn()
    const committed = getLibraryIdentityEpoch()
    renderInvitation({ identityEpoch: committed, onOffer })
    fireEvent.click(screen.getByRole('button', { name: MINE_READING_DIG_LABEL }))
    expect(onOffer.mock.calls[0][1]).toBe(committed)
  })
})

describe('the focus a return is owed', () => {
  it('lands on the action, and reports that it did — once', () => {
    const onFocusServed = vi.fn()
    const { rerender } = renderInvitation({ focusGeneration: 7, onFocusServed })
    expect(screen.getByRole('button', { name: MINE_READING_DIG_LABEL })).toHaveFocus()
    expect(onFocusServed).toHaveBeenCalledWith(7, true)

    rerender(
      <StonebridgeMineInvitation
        familyId="fam-1"
        childId="lincoln"
        identityEpoch={getLibraryIdentityEpoch()}
        focusGeneration={7}
        onFocusServed={onFocusServed}
        onOffer={noop}
      />,
    )
    expect(onFocusServed).toHaveBeenCalledTimes(1)
  })

  it('reports honestly when the invitation is gone, so the host can fall back', () => {
    // Fresh evidence retired the offer while the child was in the Mine.
    fx.model = null
    const onFocusServed = vi.fn()
    renderInvitation({ focusGeneration: 9, onFocusServed })
    expect(onFocusServed).toHaveBeenCalledWith(9, false)
  })

  it('is not served at all when the identity moved under the commit', () => {
    const onFocusServed = vi.fn()
    renderInvitation({ identityEpoch: getLibraryIdentityEpoch() - 1, focusGeneration: 13, onFocusServed })
    expect(onFocusServed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: MINE_READING_DIG_LABEL })).not.toHaveFocus()
  })

  it('waits for the reads rather than falling back on an unsettled one', () => {
    fx.loading = true
    const onFocusServed = vi.fn()
    renderInvitation({ focusGeneration: 11, onFocusServed })
    expect(onFocusServed).not.toHaveBeenCalled()
  })

  it('claims nothing when no return is waiting', () => {
    const onFocusServed = vi.fn()
    renderInvitation({ onFocusServed })
    expect(onFocusServed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: MINE_READING_DIG_LABEL })).not.toHaveFocus()
  })
})
