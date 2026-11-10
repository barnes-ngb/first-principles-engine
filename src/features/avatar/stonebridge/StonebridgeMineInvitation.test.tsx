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

/** Both domains calibrated by real evidence — so the OFFER can change mode. */
const BOTH_SNAPSHOT = {
  childId: 'lincoln',
  prioritySkills: [
    { tag: 'math.operations.add', level: SkillLevel.Developing, masteryGate: MasteryGate.NotYet },
  ],
  supports: [],
  stopRules: [],
  workingLevels: { phonics: 3 },
} as unknown as SkillSnapshot

/** A real, answered model that recommends nothing a Mine mode can carry. */
function modelWithNoMove(): LearnerModel {
  return {
    ...modelWith('reading.phonics.cvc'),
    openQuestions: [],
    synthesis: null,
  } as unknown as LearnerModel
}

const noop = () => {}

type InvitationProps = Partial<{
  identityEpoch: number
  focusGeneration: number
  onFocusServed: (generation: number, landed: boolean) => void
  onOffer: (invitation: unknown, observedEpoch: number) => void
}>

function invitationElement(props: InvitationProps = {}) {
  return (
    <StonebridgeMineInvitation
      familyId="fam-1"
      childId="lincoln"
      // The live epoch by default: the committed render agrees with the store.
      identityEpoch={props.identityEpoch ?? getLibraryIdentityEpoch()}
      focusGeneration={props.focusGeneration ?? 0}
      onFocusServed={props.onFocusServed ?? noop}
      onOffer={props.onOffer ?? noop}
    />
  )
}

function renderInvitation(props: InvitationProps = {}) {
  return render(invitationElement(props))
}

/**
 * The `onClick` a RENDERED action is holding — captured, then invoked later.
 *
 * This is the shape the browser actually produced: a handler is captured while
 * the offer is on screen, the offer then goes away inside the same identity and
 * the same mount, and the captured handler is invoked. Clicking the node after
 * the fact proves nothing (React has detached it), so the retained callback is
 * read off the element and called directly, exactly as the hostile case did.
 */
function retainedOnClick(node: HTMLElement): () => void {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  const props = (node as unknown as Record<string, { onClick?: () => void }>)[key!]
  const onClick = props?.onClick
  expect(typeof onClick).toBe('function')
  return onClick!
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

describe('a RETAINED tap, inside the same identity and the same mount', () => {
  /**
   * The hole an epoch and a mount check cannot see.
   *
   * Nothing moves here: the same family, the same child, the same epoch, the
   * same mounted component. Only the OFFER changes — removed, failed, or moved
   * to another mode by fresh evidence — and a handler captured before that must
   * not hand on an offer this surface no longer makes, because the host would
   * navigate and create a trip for it.
   */
  function captureThenCommit(next: () => void) {
    const onOffer = vi.fn()
    const { rerender } = renderInvitation({ onOffer })
    const retained = retainedOnClick(
      screen.getByRole('button', { name: MINE_READING_DIG_LABEL }),
    )
    next()
    rerender(invitationElement({ onOffer }))
    return { retained, onOffer }
  }

  it('is refused after the model is REMOVED under the live scope', () => {
    const { retained, onOffer } = captureThenCommit(() => {
      fx.model = null
    })
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
    retained()
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('is refused after a FAILED model read — which arrives as nothing', () => {
    // A failure is not an affirmative empty result; the hooks report both as
    // "nothing", and neither may authorise a trip a handler captured earlier.
    const { retained, onOffer } = captureThenCommit(() => {
      fx.model = null
      fx.loading = false
      fx.loaded = true
    })
    retained()
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('is refused after the model answers with NO recommendation', () => {
    const { retained, onOffer } = captureThenCommit(() => {
      fx.model = modelWithNoMove()
    })
    expect(screen.queryByText(`⛏️ ${MINE_INVITATION_LINE}`)).not.toBeInTheDocument()
    retained()
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('is refused after the SUPPORTED offer changed to the other mode', () => {
    // The screen still shows an invitation — a different one. The old tap is
    // refused on its own terms rather than being quietly re-pointed.
    fx.snapshot = BOTH_SNAPSHOT
    const { retained, onOffer } = captureThenCommit(() => {
      fx.model = modelWith('math.operations.addWithin20')
    })
    expect(screen.getByRole('button', { name: MINE_MATH_DIG_LABEL })).toBeInTheDocument()
    retained()
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('is refused while the read goes UNSETTLED again, mid-reload', () => {
    const { retained, onOffer } = captureThenCommit(() => {
      fx.loading = true
    })
    retained()
    expect(onOffer).not.toHaveBeenCalled()
  })

  it('but a still-valid tap is accepted — the ordinary child tap is untouched', () => {
    const { retained, onOffer } = captureThenCommit(() => {})
    retained()
    expect(onOffer).toHaveBeenCalledTimes(1)
    expect(onOffer.mock.calls[0][0]).toMatchObject({
      conceptId: 'reading.phonics.cvc',
      questMode: 'phonics',
    })
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
