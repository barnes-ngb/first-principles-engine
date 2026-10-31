import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { getPlanningWeekRange } from '../../core/utils/time'
import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  PLANNER_ASK_HANDOFF_TTL_MS,
  stagePlannerAskHandoff,
  takePlannerAskHandoff,
  type PlannerAskHandoff,
  type PlannerAskHandoffRequest,
} from '../planner-chat/plannerAskHandoff'
import {
  clearComposerCustody,
  EMPTY_COMPOSER_DRAFT,
  type ComposerDraft,
} from './composerCustody'
import PlannerAskHandoffNotice from './PlannerAskHandoffNotice'
import { PLANNER_ASK_HANDOFF_REFUSAL_LINES } from './plannerAskHandoffLines'
import { usePlannerAskHandoff, type PlannerAskHandoffState } from './usePlannerAskHandoff'

/**
 * The two things the real-route suite cannot reach.
 *
 * `plannerAskHandoff.route.test.tsx` owns every journey, because that is where
 * the first candidate failed. What it cannot drive is an identity that has not
 * settled yet (the page's mocks are settled by construction) and each notice
 * state in isolation, so those are here — the NOTICE is rendered, not inspected
 * as data, and the hook is mounted, not described.
 */

const ASK = 'add TGTB Math Level 1, 30 minutes daily'
const CHILDREN = [{ id: 'child-lincoln', name: 'Lincoln' }]
/**
 * The week the planner would be planning right now, for the same reason the
 * route suite uses it: the source-week check (`isPlanningWeekPast`) is part of
 * what is under test, so it has to be exercised rather than bypassed — and a
 * hard-coded Sunday key silently stops exercising it and starts refusing every
 * hand-off instead. `2026-10-25` did exactly that on Sat Oct 31, when its
 * Mon–Fri body had ended and every test here began reading `week-passed`.
 * `getPlanningWeekRange` is the planner's own rolling default, so this is never
 * a past week on any day.
 */
const WEEK_START = getPlanningWeekRange(new Date()).start

function stage(over: Partial<PlannerAskHandoffRequest> = {}, stagedAt?: number) {
  const payload = stagePlannerAskHandoff(
    {
      familyId: 'fam-1',
      childId: 'child-lincoln',
      childName: 'Lincoln',
      weekStart: WEEK_START,
      question: ASK,
      jobId: 'curriculum',
      ...over,
    },
    stagedAt,
  )
  if (!payload) throw new Error('fixture failed to stage')
  return payload
}

interface HarnessProps {
  childrenLoading?: boolean
  profile?: string | null
  activeChildId?: string
  chatContext?: string
  /** What is already unsent in the box when the question arrives. */
  initialDraft?: ComposerDraft
}

function Harness({
  childrenLoading = false,
  profile = 'parents',
  activeChildId = 'child-lincoln',
  chatContext = 'lincoln',
  initialDraft = EMPTY_COMPOSER_DRAFT,
}: HarnessProps) {
  const [draft, setDraft] = useState<ComposerDraft>(initialDraft)
  const handoff = usePlannerAskHandoff({
    familyId: 'fam-1',
    profile,
    isParent: profile === 'parents',
    activeChildId,
    childrenLoading,
    children: CHILDREN,
    chatContext,
    threadId: null,
    draft,
    applyDraft: (next) => setDraft({ ...draft, ...next }),
    startFreshThread: () => {},
  })
  return (
    <>
      <PlannerAskHandoffNotice
        state={handoff.state}
        onKeepExisting={handoff.keepExisting}
        onReplace={handoff.replaceWithQuestion}
        onRestoreSetAside={handoff.restoreSetAside}
        onDiscardSetAside={handoff.discardSetAside}
        onKeepSetAside={handoff.keepSetAside}
        onStartFresh={handoff.startFresh}
        onKeepConversation={handoff.keepConversation}
        onDismiss={handoff.dismiss}
      />
      <textarea aria-label="composer" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
    </>
  )
}

function mount(generation: number | null, props: HarnessProps = {}) {
  const entry =
    generation === null
      ? { pathname: '/chat' }
      : { pathname: '/chat', state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: generation } }
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness {...props} />
    </MemoryRouter>,
  )
}

const composer = () => screen.getByLabelText('composer') as HTMLTextAreaElement

beforeEach(() => {
  clearPlannerAskHandoff()
  clearComposerCustody()
})
afterEach(() => {
  clearPlannerAskHandoff()
  clearComposerCustody()
})

describe('an identity that has not settled', () => {
  it('waits rather than taking the question, then takes it once', () => {
    const payload = stage()
    const { rerender } = mount(payload.generation, { childrenLoading: true, activeChildId: '' })
    expect(composer().value).toBe('')
    expect(screen.queryByText(/Plan My Week/)).not.toBeInTheDocument()

    rerender(
      <MemoryRouter
        initialEntries={[{ pathname: '/chat', state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload.generation } }]}
      >
        <Harness />
      </MemoryRouter>,
    )
    expect(composer().value).toContain(ASK)
  })

  it('waits on an unchosen profile and leaves the slot alone', () => {
    const payload = stage()
    mount(payload.generation, { profile: null })
    expect(screen.queryByText(/Plan My Week/)).not.toBeInTheDocument()
    expect(takePlannerAskHandoff()?.generation).toBe(payload.generation)
  })

  it('says it could not tell, rather than blaming a switch, on a failed read', () => {
    const payload = stage()
    mount(payload.generation, { activeChildId: '' })
    expect(
      screen.getByText(PLANNER_ASK_HANDOFF_REFUSAL_LINES['child-unresolved']),
    ).toBeInTheDocument()
  })

  it('refuses a late read', () => {
    const payload = stage({}, Date.now() - PLANNER_ASK_HANDOFF_TTL_MS - 1)
    mount(payload.generation)
    expect(composer().value).toBe('')
    expect(screen.getByText(PLANNER_ASK_HANDOFF_REFUSAL_LINES.expired)).toBeInTheDocument()
  })

  it('never reads the slot on a visit that did not come from the link', () => {
    const payload = stage()
    mount(null)
    expect(composer().value).toBe('')
    expect(takePlannerAskHandoff()?.generation).toBe(payload.generation)
  })
})

describe('the notice, state by state', () => {
  const handoff: PlannerAskHandoff = {
    familyId: 'fam-1',
    childId: 'child-lincoln',
    childName: 'Lincoln',
    weekStart: '2026-10-25',
    question: ASK,
    jobId: 'curriculum',
    generation: 1,
    stagedAt: 0,
  }
  const mine: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'mine' }
  /** Any owner key: these render one state, they do not drive the hook. */
  const SCOPE = 'fam-1|parents|lincoln|child-lincoln'
  const noop = () => {}

  const show = (state: PlannerAskHandoffState) =>
    render(
      <PlannerAskHandoffNotice
        state={state}
        onKeepExisting={noop}
        onReplace={noop}
        onRestoreSetAside={noop}
        onDiscardSetAside={noop}
        onKeepSetAside={noop}
        onStartFresh={noop}
        onKeepConversation={noop}
        onDismiss={noop}
      />,
    )

  it('shows nothing at all when idle', () => {
    const { container } = show({ kind: 'idle' })
    expect(container).toBeEmptyDOMElement()
  })

  it('discloses the context that will be sent, and offers the set-aside draft back', () => {
    show({ kind: 'filled', handoff, setAside: mine })
    expect(screen.getByText(/From Plan My Week — Lincoln · Week of Oct 26/)).toBeInTheDocument()
    expect(screen.getByText(/both go\s+to Ask AI when you send/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bring my own draft back/ })).toBeInTheDocument()
  })

  it('offers exactly two choices on a collision, and shows both drafts', () => {
    show({ kind: 'collision', handoff, mine, fromOtherThread: false })
    expect(screen.getByText('mine')).toBeInTheDocument()
    expect(screen.getByText(ASK)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Keep what I was typing/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use the planner's question/ })).toBeInTheDocument()
  })

  it('says where a cross-conversation draft came from', () => {
    show({ kind: 'collision', handoff, mine, fromOtherThread: true })
    expect(screen.getByText(/typing this in another conversation/)).toBeInTheDocument()
  })

  it('offers a fresh conversation rather than joining a saved one', () => {
    show({ kind: 'thread-choice', handoff })
    expect(screen.getByText(/would send your question with this conversation/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ask in a new conversation/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Not now/ })).toBeInTheDocument()
  })

  it('says nothing was sent when a question is withdrawn', () => {
    show({ kind: 'withdrawn', handoff, reason: 'context-changed' })
    expect(screen.getByText(PLANNER_ASK_HANDOFF_REFUSAL_LINES['context-changed'])).toBeInTheDocument()
    expect(screen.getByText(/Nothing was sent/)).toBeInTheDocument()
  })

  it('names where her words still are, on every reason', () => {
    for (const [reason, line] of Object.entries(PLANNER_ASK_HANDOFF_REFUSAL_LINES)) {
      if (reason === 'family-changed') {
        expect(line).toMatch(/account/i)
        continue
      }
      expect(line, reason).toMatch(/Plan My Week/)
    }
  })

  it('can be dismissed', () => {
    const payload = stage()
    mount(payload.generation)
    expect(composer().value).toContain(ASK)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/From Plan My Week/)).not.toBeInTheDocument()
    // The draft stays in the box; only the note is gone.
    expect(composer().value).toContain(ASK)
  })

  it('keeps saying where a set-aside draft is, with both exits and no close', () => {
    show({
      kind: 'set-aside',
      draft: { ...mine, imageIdea: 'a reading corner poster' },
      holds: 'mine',
      scopeKey: SCOPE,
    })
    expect(screen.getByText(/Your own draft is set aside, unsent/)).toBeInTheDocument()
    expect(screen.getByText(/an image you were describing/)).toBeInTheDocument()
    expect(screen.getByText('mine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bring my own draft back/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Discard it/ })).toBeInTheDocument()
    // No close button: this note is the only thing on screen that says where
    // her unsent work went, so it goes when she decides, not when she taps X.
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
  })

  it('names the question when THAT is what was swapped out', () => {
    // After a restore the two drafts have traded places, and what is set aside
    // is the question as she had edited it — which the planner cannot give
    // back, so the note must not call it "your own draft" or the other way
    // round.
    show({
      kind: 'set-aside',
      draft: { ...mine, text: `${ASK} and more phonics` },
      holds: 'question',
      scopeKey: SCOPE,
    })
    expect(screen.getByText(/The planner's question is set aside, unsent/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bring that draft back/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
  })

  it('says what is set aside when the draft is media with no words in it', () => {
    show({
      kind: 'set-aside',
      draft: { ...EMPTY_COMPOSER_DRAFT, uploadFiles: [new File(['x'], 'raw.png')] },
      holds: 'mine',
      scopeKey: SCOPE,
    })
    expect(screen.getByText(/set aside, unsent \(with 1 image\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bring my own draft back/ })).toBeInTheDocument()
  })

  it('asks before a third draft would have to exist, and shows the one at stake', () => {
    show({ kind: 'displace-confirm', handoff, standing: { ...mine, text: 'set aside earlier' } })
    expect(screen.getByText(/already have a draft set aside/)).toBeInTheDocument()
    expect(screen.getByText('set aside earlier')).toBeInTheDocument()
    expect(screen.getByText(/would be discarded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Keep it/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Discard it and use the question/ }),
    ).toBeInTheDocument()
  })
})

describe('a draft the question displaced', () => {
  /** Her own unsent work, in the box when the hand-off lands. */
  const MINE: ComposerDraft = {
    ...EMPTY_COMPOSER_DRAFT,
    text: 'mine — the one copy',
    imageIdea: 'a reading corner poster',
    imageFlowOpen: true,
  }

  function displace() {
    const payload = stage()
    mount(payload.generation, { initialDraft: MINE })
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)
  }

  it('survives the notice being closed, and comes back on an explicit tap', () => {
    // Round 1's P2: `dismiss` set `idle`, and her text and her image idea went
    // with the state the notice owned — irrecoverably, since the question had
    // already overwritten the box.
    displace()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(screen.queryByText(/From Plan My Week/)).not.toBeInTheDocument()
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE.text)
  })

  it('swaps rather than overwrites, so the newer work in the box survives too', () => {
    // The release review's correction. Restoring the older draft used to apply
    // it straight over whatever was in the box and say nothing — and what was
    // in the box was the question as she had EDITED it, which the planner does
    // not hold. Two homes, so the restore trades places instead of discarding.
    displace()
    fireEvent.change(composer(), { target: { value: `${composer().value} and more phonics` } })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE.text)

    // Her edited question is now the one set aside, named as itself, and one
    // tap from the box.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/The planner's question is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring that draft back/ }))
    expect(composer().value).toContain('and more phonics')
    expect(composer().value).toContain(ASK)
  })

  it('asks before taking the question would need a third home', () => {
    displace()
    // Restoring swaps, so now BOTH homes are full: her draft in the box, the
    // edited question set aside. Asking for the question again cannot keep all
    // three, so it is a decision.
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question instead/ }))

    expect(screen.getByText(/already have a draft set aside/)).toBeInTheDocument()
    // Keeping it leaves every draft exactly where it was.
    fireEvent.click(screen.getByRole('button', { name: /Keep it/ }))
    expect(composer().value).toBe(MINE.text)

    // And her explicit discard is what lets the question back into the box.
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question instead/ }))
    fireEvent.click(screen.getByRole('button', { name: /Discard it and use the question/ }))
    expect(composer().value).toContain(ASK)
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE.text)
  })

  it('is still offered after the question is sent out of the box', () => {
    displace()
    // What a Send leaves behind: the question gone from the composer, the
    // hand-off's own note finished, her displaced work untouched.
    fireEvent.change(composer(), { target: { value: '' } })
    expect(screen.getByText(/set aside, unsent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE.text)
  })

  it('goes only when she says so, and then the offer goes too', () => {
    displace()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /Discard it/ }))

    expect(screen.queryByText(/set aside, unsent/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
    // The box keeps the question she chose; nothing restored itself.
    expect(composer().value).toContain(ASK)
  })
})
