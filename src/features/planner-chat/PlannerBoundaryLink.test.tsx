import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createRef } from 'react'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import PlannerBoundaryLink, { BOUNDARY_BARE_REFUSAL_TEXT } from './PlannerBoundaryLink'
import PlannerChatMessages from './PlannerChatMessages'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function assistantTurn(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: ChatMessageRole.Assistant,
    text: 'Reply.',
    createdAt: '2026-09-08T12:00:00.000Z',
    ...over,
  }
}

function renderTurns(messages: ChatMessage[]) {
  return render(
    <MemoryRouter>
      <PlannerChatMessages messages={messages} messagesEndRef={createRef<HTMLDivElement>()} />
    </MemoryRouter>,
  )
}

describe('PlannerBoundaryLink', () => {
  it('names where it goes and navigates there — the app owns the route', () => {
    mockNavigate.mockClear()
    render(
      <MemoryRouter>
        <PlannerBoundaryLink jobId="records" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Open Records/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/records')
  })

  it('sends a job Ask AI can write to Ask AI', () => {
    mockNavigate.mockClear()
    render(
      <MemoryRouter>
        <PlannerBoundaryLink jobId="curriculum" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
  })

  it('falls back to the one general link rather than guessing a destination', () => {
    mockNavigate.mockClear()
    render(
      <MemoryRouter>
        <PlannerBoundaryLink jobId="schedule-settings" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
  })
})

describe('PlannerChatMessages — the refusal carries a control, and never a raw marker', () => {
  it('shows the link on a turn that declined a job', () => {
    renderTurns([
      assistantTurn({
        text: "I can't change curriculum from here — that's Ask AI. Meanwhile I can shape this week.",
        boundaryJobId: 'curriculum',
      }),
    ])
    expect(screen.getByRole('button', { name: /Open Ask AI/ })).toBeInTheDocument()
    expect(screen.getByText(/Meanwhile I can shape this week/)).toBeInTheDocument()
  })

  it('shows no link on an ordinary reply', () => {
    renderTurns([assistantTurn({ text: "Here's Wednesday, lighter." })])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('strips a marker that reached the stored message anyway', () => {
    // The belt: this text should never have been stored unstripped, but if a
    // future call site skips the parse, Shelly still must not read `[[…]]`.
    const { container } = renderTurns([
      assistantTurn({ text: "Can't do that from here.\n\n[[BOUNDARY:records]]" }),
    ])
    expect(container.textContent).not.toContain('[[')
    expect(container.textContent).not.toContain('BOUNDARY')
    expect(screen.getByText(/Can't do that from here\./)).toBeInTheDocument()
  })

  it('strips a truncated marker too', () => {
    const { container } = renderTurns([
      assistantTurn({ text: "Can't do that from here.\n\n[[BOUNDARY:reco" }),
    ])
    expect(container.textContent).not.toContain('[[')
  })

  it('renders no marker text when a reply was nothing but a marker', () => {
    const { container } = renderTurns([assistantTurn({ text: '[[BOUNDARY:today]]', boundaryJobId: 'today' })])
    expect(container.textContent).not.toContain('[[')
    expect(screen.getByRole('button', { name: /Open Today/ })).toBeInTheDocument()
  })

  it("leaves a parent's own turn alone — the belt is for the model's text, not hers", () => {
    // She could conceivably paste anything; the app must never eat her words to
    // tidy up after the model.
    renderTurns([
      { ...assistantTurn(), id: 'u1', role: ChatMessageRole.User, text: 'Try [[BOUNDARY:records]] please' },
    ])
    expect(screen.getByText(/Try \[\[BOUNDARY:records\]\] please/)).toBeInTheDocument()
  })
})

describe('the bare-refusal fallback', () => {
  it('says something honest rather than leaving an empty bubble', () => {
    renderTurns([assistantTurn({ text: BOUNDARY_BARE_REFUSAL_TEXT, boundaryJobId: 'records' })])
    expect(screen.getByText(BOUNDARY_BARE_REFUSAL_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Records/ })).toBeInTheDocument()
  })

  it('names no screen of its own — the button is the only destination', () => {
    expect(BOUNDARY_BARE_REFUSAL_TEXT).not.toMatch(/screen|tab|settings|menu|page/i)
    expect(BOUNDARY_BARE_REFUSAL_TEXT.trim().length).toBeGreaterThan(0)
  })
})
