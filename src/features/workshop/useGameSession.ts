import { useCallback, useReducer } from 'react'
import type { ChallengeCard, GeneratedGame } from '../../core/types'
import { TurnPhase } from '../../core/types/workshop'

// ── Types ─────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  color: string
  position: number
  avatarUrl?: string
}

export interface GameSessionState {
  players: Player[]
  currentPlayerIndex: number
  turnPhase: TurnPhase
  lastRoll: number | null
  currentCard: ChallengeCard | null
  cardsEncountered: string[]
  winner: string | null
  startedAt: string | null
}

const PLAYER_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00']

const DEFAULT_PLAYERS: Player[] = [
  { id: 'london', name: 'London', color: PLAYER_COLORS[0], position: 0 },
  { id: 'lincoln', name: 'Lincoln', color: PLAYER_COLORS[1], position: 0 },
  { id: 'mom', name: 'Mom', color: PLAYER_COLORS[2], position: 0 },
  { id: 'dad', name: 'Dad', color: PLAYER_COLORS[3], position: 0 },
]

// ── Actions ───────────────────────────────────────────────────────

type GameAction =
  | { type: 'START_GAME'; players?: Player[] }
  | { type: 'ROLL'; value: number; game: GeneratedGame }
  | { type: 'DISMISS_CARD' }
  | { type: 'NEXT_TURN' }
  | { type: 'RESET' }

function gameReducer(state: GameSessionState, action: GameAction): GameSessionState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...state,
        players: (action.players ?? DEFAULT_PLAYERS).map((p) => ({ ...p, position: 0 })),
        currentPlayerIndex: 0,
        turnPhase: TurnPhase.Roll,
        lastRoll: null,
        currentCard: null,
        cardsEncountered: [],
        winner: null,
        startedAt: new Date().toISOString(),
      }

    case 'ROLL': {
      const { value, game } = action
      const player = state.players[state.currentPlayerIndex]
      const maxPosition = game.board.totalSpaces - 1
      const newPosition = Math.min(player.position + value, maxPosition)

      // Update player position
      const updatedPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, position: newPosition } : p,
      )

      // Check if player won
      if (newPosition >= maxPosition) {
        return {
          ...state,
          players: updatedPlayers,
          lastRoll: value,
          turnPhase: TurnPhase.Resolve,
          winner: player.name,
        }
      }

      // Check if the space has a challenge card
      const space = game.board.spaces[newPosition]
      if (space?.challengeCardId) {
        const card = game.challengeCards.find((c) => c.id === space.challengeCardId) ?? null
        return {
          ...state,
          players: updatedPlayers,
          lastRoll: value,
          turnPhase: TurnPhase.Card,
          currentCard: card,
          cardsEncountered: card
            ? [...state.cardsEncountered, card.id]
            : state.cardsEncountered,
        }
      }

      // Normal space — go to next turn
      return {
        ...state,
        players: updatedPlayers,
        lastRoll: value,
        turnPhase: TurnPhase.Resolve,
      }
    }

    case 'DISMISS_CARD':
      return {
        ...state,
        currentCard: null,
        turnPhase: TurnPhase.Resolve,
      }

    case 'NEXT_TURN': {
      if (state.winner) return state
      const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
      return {
        ...state,
        currentPlayerIndex: nextIndex,
        turnPhase: TurnPhase.Roll,
        lastRoll: null,
        currentCard: null,
      }
    }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

const initialState: GameSessionState = {
  players: DEFAULT_PLAYERS,
  currentPlayerIndex: 0,
  turnPhase: TurnPhase.Roll,
  lastRoll: null,
  currentCard: null,
  cardsEncountered: [],
  winner: null,
  startedAt: null,
}

// ── Hook ──────────────────────────────────────────────────────────

export function useGameSession(game: GeneratedGame) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  const startGame = useCallback(
    (players?: Player[]) => dispatch({ type: 'START_GAME', players }),
    [],
  )

  const roll = useCallback(
    (value: number) => dispatch({ type: 'ROLL', value, game }),
    [game],
  )

  const dismissCard = useCallback(() => dispatch({ type: 'DISMISS_CARD' }), [])
  const nextTurn = useCallback(() => dispatch({ type: 'NEXT_TURN' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const isGameOver = state.winner !== null

  return {
    state,
    currentPlayer,
    isGameOver,
    startGame,
    roll,
    dismissCard,
    nextTurn,
    reset,
  }
}

export { DEFAULT_PLAYERS }
