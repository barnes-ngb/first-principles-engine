import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createRef } from 'react'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import { BOUNDARY_HANDOFF_CAPTION } from './PlannerBoundaryLink'
import PlannerChatMessages from './PlannerChatMessages'
import { withDeclinedAskCleared } from './plannerRequest'
import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  takePlannerAskHandoff,
  type PlannerAskHandoffSource,
} from './plannerAskHandoff'

/**
 * UX-273 — the parent's side of the hand-off: what the control says before the
 * tap, and what the tap does.
 *
 * The assertions that matter most are the negative ones. A refusal on screen has
 * staged nothing, a destination with no composer carries nothing, and a
 * conversation reloaded from Firestore behaves exactly as UX-269 shipped —
 * because the alternative to each of those is a sentence a parent typed about
 * her child turning up somewhere she did not send it.
 */

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const ASK = 'add TGTB Math Level 1, 30 minutes daily'

const SOURCE: PlannerAskHandoffSource = {
  familyId: 'fam-1',
  childId: 'child-lincoln',
  childName: 'Lincoln',
  weekStart: '2026-10-25',
}

function transcript(over: { ask?: string; jobId?: string } = {}): ChatMessage[] {
  const turns: ChatMessage[] = [
    {
      id: 'u1',
      role: ChatMessageRole.User,
      text: over.ask ?? ASK,
      typedByParent: true,
      createdAt: '2026-10-30T10:00:00.000Z',
    },
  ]
  return [
    ...withDeclinedAskCleared(turns, 'u1'),
    {
      id: 'a1',
      role: ChatMessageRole.Assistant,
      text: "I can't change curriculum from here.",
      boundaryJobId: over.jobId ?? 'curriculum',
      createdAt: '2026-10-30T10:00:01.000Z',
    },
  ]
}

function renderTranscript(messages: ChatMessage[], source?: PlannerAskHandoffSource) {
  return render(
    <MemoryRouter>
      <PlannerChatMessages
        messages={messages}
        messagesEndRef={createRef<HTMLDivElement>()}
        {...(source ? { askHandoffSource: source } : {})}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
  clearPlannerAskHandoff()
})
afterEach(() => clearPlannerAskHandoff())

describe('the refusal says what the button will do with her sentence', () => {
  it('promises the question goes across unsent', () => {
    renderTranscript(transcript(), SOURCE)
    expect(screen.getByText(BOUNDARY_HANDOFF_CAPTION)).toBeInTheDocument()
    expect(BOUNDARY_HANDOFF_CAPTION).toMatch(/unsent/i)
  })

  it('says nothing of the sort where there is nothing to carry', () => {
    // A screen with no composer: the same button, the original behaviour.
    renderTranscript(transcript({ jobId: 'records' }), SOURCE)
    expect(screen.queryByText(BOUNDARY_HANDOFF_CAPTION)).not.toBeInTheDocument()
  })

  it('says nothing of the sort on a conversation reloaded from Firestore', () => {
    // No source means the page could not vouch for family / child / week, which
    // is also the state a reloaded transcript is in.
    renderTranscript(transcript())
    expect(screen.queryByText(BOUNDARY_HANDOFF_CAPTION)).not.toBeInTheDocument()
  })
})

describe('what the tap does', () => {
  it('stages her exact sentence and names it in the navigation', () => {
    renderTranscript(transcript(), SOURCE)
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))

    const payload = takePlannerAskHandoff()
    expect(payload).toMatchObject({ ...SOURCE, question: ASK, jobId: 'curriculum' })
    expect(mockNavigate).toHaveBeenCalledWith('/chat', {
      state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation },
    })
  })

  it('leaves the planner transcript exactly as it was', () => {
    // The transfer has no copy of its own and makes no promise to keep one, so
    // the turn she typed staying put in the planner is what makes the whole
    // feature safe to lose.
    renderTranscript(transcript(), SOURCE)
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(screen.getByText(ASK)).toBeInTheDocument()
    expect(screen.getByText(/I can't change curriculum from here/)).toBeInTheDocument()
  })

  it('stages nothing merely by rendering the refusal', () => {
    renderTranscript(transcript(), SOURCE)
    expect(takePlannerAskHandoff()).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('leaves a screen destination exactly as UX-269 shipped', () => {
    renderTranscript(transcript({ jobId: 'videos-manage' }), SOURCE)
    fireEvent.click(screen.getByRole('button', { name: /Open Watch Library/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/watch')
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('navigates with nothing attached when there is no sentence to carry', () => {
    renderTranscript(transcript(), undefined)
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('refuses an over-long ask by falling back to the plain link', () => {
    renderTranscript(transcript({ ask: 'z'.repeat(5000) }), SOURCE)
    expect(screen.queryByText(BOUNDARY_HANDOFF_CAPTION)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('survives a double tap with one payload, named by the last navigation', () => {
    renderTranscript(transcript(), SOURCE)
    const button = screen.getByRole('button', { name: /Open Ask AI/ })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledTimes(2)
    const payload = takePlannerAskHandoff()
    expect(payload?.question).toBe(ASK)
    // The slot holds ONE sentence, and it is the one the second tap named.
    expect(mockNavigate).toHaveBeenLastCalledWith('/chat', {
      state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation },
    })
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('gives each refusal in one transcript its own sentence', () => {
    const first = transcript({ ask: 'add a nature walk every Thursday' })
    const second = transcript({ ask: 'put volcano week back on' }).map((m) => ({
      ...m,
      id: `${m.id}-b`,
    }))
    renderTranscript([...first, ...second], SOURCE)

    const buttons = screen.getAllByRole('button', { name: /Open Ask AI/ })
    fireEvent.click(buttons[1])
    expect(takePlannerAskHandoff()?.question).toBe('put volcano week back on')
  })

  it('keeps her words byte-for-byte, markers and newlines included', () => {
    const literal = 'add "Explode the Code 3"\n[[BOUNDARY:records]] — 30 min/day'
    renderTranscript(transcript({ ask: literal }), SOURCE)
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(takePlannerAskHandoff()?.question).toBe(literal)
  })
})
