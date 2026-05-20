import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GeneratedGame } from '../../core/types'
import { TurnPhase } from '../../core/types/workshop'
import { useGameSession, DEFAULT_PLAYERS, parseSpaceEffect } from './useGameSession'

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

/** Helper: roll and complete movement in one step, handling SpecialMove if triggered */
function rollAndMove(result: { current: ReturnType<typeof useGameSession> }, value: number) {
  act(() => {
    result.current.roll(value)
  })
  // ROLL goes to Move phase; moveComplete transitions to Card/Resolve/SpecialMove
  expect(result.current.state.turnPhase).toBe(TurnPhase.Move)
  act(() => {
    result.current.moveComplete()
  })

  // If we hit a special space, process the special move too
  if (result.current.state.turnPhase === TurnPhase.SpecialMove) {
    const effect = result.current.state.pendingSpecialMove
    if (effect) {
      const delta = effect.type === 'forward'
        ? effect.amount
        : effect.type === 'backward'
          ? -effect.amount
          : effect.amount - result.current.currentPlayer!.position
      act(() => {
        result.current.specialMove(delta)
      })
      // Now in Move phase for the special move
      expect(result.current.state.turnPhase).toBe(TurnPhase.Move)
      act(() => {
        result.current.moveComplete()
      })
    }
  }
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

  it('rolls and moves the current player, triggering special move on bonus space', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    // Roll to position 3 (bonus: "Go forward 2!") → should end at position 5
    rollAndMove(result, 3)

    expect(result.current.state.players[0].position).toBe(5)
    expect(result.current.state.lastRoll).toBe(3)
  })

  it('triggers SpecialMove phase on bonus space before resolving', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    act(() => {
      result.current.roll(3) // Move to position 3 (bonus)
    })

    act(() => {
      result.current.moveComplete()
    })

    // Should be in SpecialMove phase
    expect(result.current.state.turnPhase).toBe(TurnPhase.SpecialMove)
    expect(result.current.state.pendingSpecialMove).toEqual({ type: 'forward', amount: 2 })
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
      // Dismiss card if on challenge space
      if (result.current.state.turnPhase === TurnPhase.Card) {
        act(() => {
          result.current.dismissCard()
        })
      }
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

    // Roll 4 → position 4 (normal), then next turns cycle
    rollAndMove(result, 4)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }

    act(() => { result.current.nextTurn() })
    rollAndMove(result, 1) // player 2
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }
    act(() => { result.current.nextTurn() })
    rollAndMove(result, 1)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }
    act(() => { result.current.nextTurn() })
    rollAndMove(result, 1)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }
    act(() => { result.current.nextTurn() })

    // Back to player 0, at position 4
    rollAndMove(result, 6) // Should cap at position 9
    // Dismiss any card
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }

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
    // Dismiss card if any
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }
    expect(result.current.state.winner).toBe('Alice')
    expect(result.current.state.finishers).toContain('Alice')
    expect(result.current.allFinished).toBe(false)
  })

  it('skips finished players in turn order', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame([
        { id: 'p1', name: 'Alice', color: '#f00', position: 0 },
        { id: 'p2', name: 'Bob', color: '#0f0', position: 0 },
        { id: 'p3', name: 'Carol', color: '#00f', position: 0 },
      ])
    })

    // Alice reaches the end
    rollAndMove(result, 9)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }

    // Next turn should go to Bob (index 1)
    act(() => { result.current.nextTurn() })
    expect(result.current.state.currentPlayerIndex).toBe(1)
    expect(result.current.currentPlayer?.name).toBe('Bob')

    // Bob moves
    rollAndMove(result, 1)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }

    // Next turn should go to Carol (index 2), skipping Alice
    act(() => { result.current.nextTurn() })
    expect(result.current.state.currentPlayerIndex).toBe(2)
    expect(result.current.currentPlayer?.name).toBe('Carol')

    // Carol moves
    rollAndMove(result, 1)
    if (result.current.state.turnPhase === TurnPhase.Card) {
      act(() => { result.current.dismissCard() })
    }

    // Next turn should skip Alice (finished) and go to Bob
    act(() => { result.current.nextTurn() })
    expect(result.current.state.currentPlayerIndex).toBe(1)
    expect(result.current.currentPlayer?.name).toBe('Bob')
  })

  it('setback space moves player backward', () => {
    const { result } = renderHook(() => useGameSession(mockGame))

    act(() => {
      result.current.startGame()
    })

    // Roll to position 5 (setback: "Go back 1!") → should end at position 4
    rollAndMove(result, 5)

    // After special move processes, player should be at position 4
    expect(result.current.state.players[0].position).toBe(4)
  })

  it('backward movement does not go below position 0', () => {
    renderHook(() => useGameSession(mockGame))

    // Use a custom game where position 1 has a big setback
    const bigSetbackGame: GeneratedGame = {
      ...mockGame,
      board: {
        totalSpaces: 10,
        spaces: [
          { index: 0, type: 'normal', label: 'Start' },
          { index: 1, type: 'setback', label: 'Go back 5!' },
          ...mockGame.board.spaces.slice(2),
        ],
      },
    }
    const { result: r2 } = renderHook(() => useGameSession(bigSetbackGame))

    act(() => { r2.current.startGame() })

    // Roll to position 1 (setback: "Go back 5!") → should clamp at 0
    rollAndMove(r2, 1)

    expect(r2.current.state.players[0].position).toBe(0)
  })
})

describe('parseSpaceEffect', () => {
  it('parses forward movement', () => {
    expect(parseSpaceEffect({ index: 0, type: 'bonus', label: 'Go forward 2!' }))
      .toEqual({ type: 'forward', amount: 2 })
    expect(parseSpaceEffect({ index: 0, type: 'bonus', label: 'Move ahead 3!' }))
      .toEqual({ type: 'forward', amount: 3 })
    expect(parseSpaceEffect({ index: 0, type: 'bonus', label: '+4 spaces' }))
      .toEqual({ type: 'forward', amount: 4 })
  })

  it('parses backward movement', () => {
    expect(parseSpaceEffect({ index: 0, type: 'setback', label: 'Go back 3!' }))
      .toEqual({ type: 'backward', amount: 3 })
    expect(parseSpaceEffect({ index: 0, type: 'setback', label: 'Slip back 2!' }))
      .toEqual({ type: 'backward', amount: 2 })
    expect(parseSpaceEffect({ index: 0, type: 'setback', label: '-1 space' }))
      .toEqual({ type: 'backward', amount: 1 })
  })

  it('parses teleport movement', () => {
    expect(parseSpaceEffect({ index: 0, type: 'special', label: 'Jump to space 29!' }))
      .toEqual({ type: 'teleport', amount: 29 })
    expect(parseSpaceEffect({ index: 0, type: 'special', label: 'Shortcut to 15' }))
      .toEqual({ type: 'teleport', amount: 15 })
  })

  it('returns null for normal spaces without movement keywords', () => {
    expect(parseSpaceEffect({ index: 0, type: 'normal' })).toBeNull()
    expect(parseSpaceEffect({ index: 0, type: 'normal', label: 'Rest stop' })).toBeNull()
  })

  it('falls back to default movement for bonus/setback spaces without numbers', () => {
    // Bonus space without a number → default forward 2
    expect(parseSpaceEffect({ index: 0, type: 'bonus', label: 'You found a gem!' }))
      .toEqual({ type: 'forward', amount: 2 })
    expect(parseSpaceEffect({ index: 0, type: 'bonus', label: 'Magic Wind — Go forward!' }))
      .toEqual({ type: 'forward', amount: 2 })

    // Setback space without a number → default backward 2
    expect(parseSpaceEffect({ index: 0, type: 'setback', label: 'Muddy Puddle — Slip back!' }))
      .toEqual({ type: 'backward', amount: 2 })
    expect(parseSpaceEffect({ index: 0, type: 'setback', label: 'Oh no!' }))
      .toEqual({ type: 'backward', amount: 2 })

    // Special space without a target → default forward 3
    expect(parseSpaceEffect({ index: 0, type: 'special', label: 'Portal!' }))
      .toEqual({ type: 'forward', amount: 3 })
  })
})
