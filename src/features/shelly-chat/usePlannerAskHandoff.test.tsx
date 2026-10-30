import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  PLANNER_ASK_HANDOFF_TTL_MS,
  stagePlannerAskHandoff,
  takePlannerAskHandoff,
  type PlannerAskHandoff,
  type PlannerAskHandoffRequest,
} from '../planner-chat/plannerAskHandoff'
import { clearComposerCustody, type ComposerDraft } from './composerCustody'
import PlannerAskHandoffNotice, {
  PLANNER_ASK_HANDOFF_REFUSAL_LINES,
} from './PlannerAskHandoffNotice'
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

function stage(over: Partial<PlannerAskHandoffRequest> = {}, stagedAt?: number) {
  const payload = stagePlannerAskHandoff(
    {
      familyId: 'fam-1',
      childId: 'child-lincoln',
      childName: 'Lincoln',
      weekStart: '2026-10-25',
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
}

function Harness({
  childrenLoading = false,
  profile = 'parents',
  activeChildId = 'child-lincoln',
  chatContext = 'lincoln',
}: HarnessProps) {
  const [draft, setDraft] = useState<ComposerDraft>({
    text: '',
    attachments: [],
    referenceImage: null,
  })
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
  const mine = { text: 'mine', attachments: [], referenceImage: null }
  const noop = () => {}

  const show = (state: PlannerAskHandoffState) =>
    render(
      <PlannerAskHandoffNotice
        state={state}
        onKeepExisting={noop}
        onReplace={noop}
        onRestoreSetAside={noop}
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
})
