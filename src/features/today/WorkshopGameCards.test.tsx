// ── FEAT-161 (UX-27): no invented people, and a noun that agrees ────────────
//
// The card's creator lookup fell back to the literal string "Someone" (and, four
// lines down, its lowercase twin "someone"), so an unresolved child id became a
// made-up person in a sentence about the family's own kids. The caption also had
// no plural guard: "1 cards • 1 spaces • 1 min".

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Child, StoryGame } from '../../core/types'
import { WorkshopStatus } from '../../core/types/workshop'

const gamesRef: { current: StoryGame[] } = { current: [] }
vi.mock('../workshop/useWorkshopGames', () => ({
  useWorkshopGames: () => ({ games: gamesRef.current, loading: false }),
}))

import WorkshopGameCards from './WorkshopGameCards'

const readyGame = (childId: string, cards = 1, spaces = 1): StoryGame =>
  ({
    id: 'g1',
    childId,
    status: WorkshopStatus.Ready,
    playSessions: [],
    generatedGame: {
      title: 'Dragon Quest',
      challengeCards: Array.from({ length: cards }, (_, i) => ({ id: `c${i}` })),
      board: { totalSpaces: spaces },
      metadata: { estimatedMinutes: 15 },
    },
  }) as unknown as StoryGame

const playingGame = (playerName?: string): StoryGame =>
  ({
    id: 'g2',
    childId: 'lincoln',
    status: WorkshopStatus.Ready,
    playSessions: [{ id: 's0' }],
    generatedGame: { title: 'Castle Run' },
    activeSession: {
      status: 'playing',
      currentTurnIndex: 0,
      players: playerName ? [{ id: 'lincoln', name: playerName }] : [],
    },
  }) as unknown as StoryGame

const children = [{ id: 'lincoln', name: 'Lincoln' }] as unknown as Child[]

const renderCards = (games: StoryGame[], kids: Child[] = children) => {
  gamesRef.current = games
  render(
    <MemoryRouter>
      <WorkshopGameCards familyId="f1" children={kids} />
    </MemoryRouter>,
  )
}

describe('WorkshopGameCards — unresolved names (UX-27)', () => {
  it('names the child when the id resolves', () => {
    renderCards([readyGame('lincoln')])
    expect(screen.getByText(/Lincoln made a new game!/)).toBeTruthy()
  })

  it('drops the attribution clause rather than inventing "Someone"', () => {
    renderCards([readyGame('ghost-id')])

    expect(screen.getByText(/A new game is ready!/)).toBeTruthy()
    expect(screen.queryByText(/Someone/)).toBeNull()
  })

  it('says something true when no player can be resolved for the current turn', () => {
    renderCards([playingGame()])

    expect(screen.getByText('Pick up where you left off!')).toBeTruthy()
    expect(screen.queryByText(/someone/i)).toBeNull()
  })

  it('still names the player whose turn it is', () => {
    renderCards([playingGame('London')])
    expect(screen.getByText("It's London's turn!")).toBeTruthy()
  })
})

describe('WorkshopGameCards — the caption counts (UX-27)', () => {
  it('is singular at one', () => {
    renderCards([readyGame('lincoln', 1, 1)])
    expect(screen.getByText(/1 card • 1 space • 15 min/)).toBeTruthy()
  })

  it('is plural above one', () => {
    renderCards([readyGame('lincoln', 12, 30)])
    expect(screen.getByText(/12 cards • 30 spaces • 15 min/)).toBeTruthy()
  })
})
