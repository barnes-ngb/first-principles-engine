import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GeneratedGame } from '../../core/types'
import { TurnPhase } from '../../core/types/workshop'
import { useGameSession, DEFAULT_PLAYERS } from './useGameSession'

const mockGame: GeneratedGame = {
  title: 'Dragon Race',
  storyIntro: 'Welcome to the Dragon Race!',
  board: {
    totalSpaces: 10,
    spaces: [
      { index: 0, type: 'normal', label: 'Start' },
      { index: 1, type: 'normal' },
      { index: 2, type: 'challenge', challengeCardId: 'card-1' },
      { index: 3, type: 'bonus', label: 'Go forward 2!' },
      { index: 4, type: 'normal' },
      { index: 5, type: 'setback', label: 'Go back 1!' },
      { index: 6, type: 'challenge', challengeCardId: 'card-2' },
      { index: 7, type: 'normal' },
      { index: 8, type: 'normal' },
      { index: 9, type: 'normal', label: 'Finish' },
    ],
  },
  challengeCards: [
    {
      id: 'card-1',
      type: 'reading',
      subjectBucket: 'Reading',
      content: 'Read the word: cat',
      readAloudText: 'Read this word: cat',
      difficulty: 'easy',
      answer: 'cat',
    },
    {
      id: 'card-2',
      type: 'math',
      subjectBucket: 'Math',
      content: 'What is 2 + 3?',
      readAloudText: 'What is two plus three?',
      difficulty: 'medium',
      answer: '5',
      options: ['4', '5', '6'],
    },
  ],
  rules: [
    { number: 1, text: 'Roll the dice.', readAloudText: 'Roll the dice and move that many spaces.' },
  ],
  metadata: {
    playerCount: { min: 2, max: 4 },
    estimatedMinutes: 15,
    theme: 'dragons',
  },
}

/** Helper: roll and complete movement in one step */
function rollAndMove(result: { current: ReturnType<typeof useGameSession> }, value: number) {
  act(() => {
    result.current.roll(value)
  })
  // ROLL goes to Move phase; moveComplete transitions to Card/Resolve
  expect(result.current.state.turnPhase).toBe(TurnPhase.Move)
  act(() => {
    result.current.moveComplete()
  })
}

describe('useGameSession', () => {
  it('initializes with default players', () => {
    const { result } = renderHook(() => useGameSession(mockGame))
    expect(result.current.state.players).toHaveLength(DEFAULT_PLAYERS.length)
  })

  it('starts a game with all players at position 0', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    expect(result.current.state.turnPhase).toBe(TurnPhase.Roll)
    expect(result.current.state.players.every((p) => p.position === 0)).toBe(true)
    expect(result.current.state.startedAt).not.toBeNull()
  })

  it('goes through Move phase on roll before resolving', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    act(() => {
      result.current.roll(3)
    })

    // Should be in Move phase with position info
    expect(result.current.state.turnPhase).toBe(TurnPhase.Move)
    expect(result.current.state.previousPosition).toBe(0)
    expect(result.current.state.targetPosition).toBe(3)
    expect(result.current.state.players[0].position).toBe(3)
  })

  it('rolls and moves the current player', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    rollAndMove(result, 3) // Move to position 3 (bonus space)

    expect(result.current.state.players[0].position).toBe(3)
    expect(result.current.state.lastRoll).toBe(3)
    // Position 3 is a bonus space, not a challenge, so should go to Resolve
    expect(result.current.state.turnPhase).toBe(TurnPhase.Resolve)
  })

  it('shows a challenge card when landing on a challenge space', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    rollAndMove(result, 2) // Move to position 2 (challenge space with card-1)

    expect(result.current.state.turnPhase).toBe(TurnPhase.Card)
    expect(result.current.state.currentCard?.id).toBe('card-1')
    expect(result.current.state.cardsEncountered).toContain('card-1')
  })

  it('dismisses card and goes to resolve', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    rollAndMove(result, 2) // Challenge space

    act(() => {
      result.current.dismissCard()
    })

    expect(result.current.state.turnPhase).toBe(TurnPhase.Resolve)
    expect(result.current.state.currentCard).toBeNull()
  })

  it('advances to next player', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    rollAndMove(result, 1) // Normal space

    act(() => {
      result.current.nextTurn()
    })

    expect(result.current.state.currentPlayerIndex).toBe(1)
    expect(result.current.state.turnPhase).toBe(TurnPhase.Roll)
  })

  it('wraps around to first player after last player', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    // Cycle through all players
    for (let i = 0; i < DEFAULT_PLAYERS.length; i++) {
      rollAndMove(result, 1)
      act(() => {
        result.current.nextTurn()
      })
    }

    expect(result.current.state.currentPlayerIndex).toBe(0)
  })

  it('detects a winner when reaching the last space', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    // Roll a 5 for player 0
    rollAndMove(result, 5)

    act(() => {
      result.current.nextTurn()
    })
    rollAndMove(result, 1) // player 2 moves
    act(() => {
      result.current.nextTurn()
    })
    rollAndMove(result, 1)
    act(() => {
      result.current.nextTurn()
    })
    rollAndMove(result, 1)
    act(() => {
      result.current.nextTurn()
    })

    // Back to player 0, at position 5
    // Need to dismiss card if on challenge space
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => {
        result.current.dismissCard()
      })
    }

    rollAndMove(result, 6) // Should cap at position 9

    expect(result.current.state.winner).toBe('London')
    expect(result.current.isGameOver).toBe(true)
  })

  it('caps position at the last space (no overshoot)', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    rollAndMove(result, 6) // Would be position 6 (challenge), not past end

    // Position 6 is a challenge space
    expect(result.current.state.players[0].position).toBe(6)
    expect(result.current.state.turnPhase).toBe(TurnPhase.Card)
  })

  it('tracks multiple finishers', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame([
        { id: 'p1', name: 'Alice', color: '#f00', position: 0 },
        { id: 'p2', name: 'Bob', color: '#0f0', position: 0 },
      ])
    })

    // Alice reaches the end
    rollAndMove(result, 9)
    expect(result.current.state.winner).toBe('Alice')
    expect(result.current.state.finishers).toEqual(['Alice'])
    expect(result.current.allFinished).toBe(false)
  })
})
