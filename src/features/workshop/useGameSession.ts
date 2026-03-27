import { useCallback, useReducer } from 'react'
import type { ChallengeCard, GeneratedGame } from '../../core/types'
import type { BoardSpace, SpaceEffect } from '../../core/types/workshop'
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
  /** All players who have reached the finish, in order */
  finishers: string[]
  startedAt: string | null
  /** Position before the current roll (used for step-by-step animation) */
  previousPosition: number | null
  /** The target position after the current roll */
  targetPosition: number | null
  /** Pending special space effect (bonus/setback/shortcut) */
  pendingSpecialMove: SpaceEffect | null
}

const PLAYER_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00']

const DEFAULT_PLAYERS: Player[] = [
  { id: 'london', name: 'London', color: PLAYER_COLORS[0], position: 0 },
  { id: 'lincoln', name: 'Lincoln', color: PLAYER_COLORS[1], position: 0 },
  { id: 'mom', name: 'Mom', color: PLAYER_COLORS[2], position: 0 },
  { id: 'dad', name: 'Dad', color: PLAYER_COLORS[3], position: 0 },
]

// ── Space Effect Parser ──────────────────────────────────────────

export function parseSpaceEffect(space: BoardSpace): SpaceEffect | null {
  const label = (space.label ?? '').toLowerCase()

  // Try to extract specific numbers from the label first
  const forwardMatch = label.match(/forward\s+(\d+)|ahead\s+(\d+)|\+(\d+)/)
  if (forwardMatch) {
    const amount = parseInt(forwardMatch[1] || forwardMatch[2] || forwardMatch[3], 10)
    return { type: 'forward', amount }
  }

  const backMatch = label.match(/back\s+(\d+)|slip\s+back\s+(\d+)|-(\d+)/)
  if (backMatch) {
    const amount = parseInt(backMatch[1] || backMatch[2] || backMatch[3], 10)
    return { type: 'backward', amount }
  }

  const teleportMatch = label.match(/(?:jump|shortcut|teleport)\s+(?:to\s+)?(?:space\s+)?(\d+)/)
  if (teleportMatch) {
    return { type: 'teleport', amount: parseInt(teleportMatch[1], 10) }
  }

  // Fallback: use space TYPE when label doesn't contain a specific number
  if (space.type === 'bonus' || /forward|ahead|advance|boost|wind|push|fly|zoom|speed|fast/i.test(label)) {
    return { type: 'forward', amount: 2 }
  }

  if (space.type === 'setback' || /back|slip|stumble|fall|oh no|oops|mud|stuck|trap|slide|lose|missed/i.test(label)) {
    return { type: 'backward', amount: 2 }
  }

  if (space.type === 'special' || /shortcut|jump|teleport|warp|portal|skip|secret|hidden/i.test(label)) {
    return { type: 'forward', amount: 3 }
  }

  return null
}

// ── Actions ───────────────────────────────────────────────────────

type GameAction =
  | { type: 'START_GAME'; players?: Player[] }
  | { type: 'RESTORE'; players: Player[]; currentPlayerIndex: number; usedCardIds: string[] }
  | { type: 'ROLL'; value: number; game: GeneratedGame }
  | { type: 'MOVE_COMPLETE'; game: GeneratedGame }
  | { type: 'SPECIAL_MOVE'; delta: number; game: GeneratedGame }
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
        finishers: [],
        startedAt: new Date().toISOString(),
        previousPosition: null,
        targetPosition: null,
        pendingSpecialMove: null,
      }

    case 'RESTORE':
      return {
        ...state,
        players: action.players,
        currentPlayerIndex: action.currentPlayerIndex,
        turnPhase: TurnPhase.Roll,
        lastRoll: null,
        currentCard: null,
        cardsEncountered: action.usedCardIds,
        winner: null,
        startedAt: state.startedAt ?? new Date().toISOString(),
        pendingSpecialMove: null,
      }

    case 'ROLL': {
      const { value, game } = action
      const player = state.players[state.currentPlayerIndex]
      const maxPosition = game.board.totalSpaces - 1
      const newPosition = Math.min(player.position + value, maxPosition)

      return {
        ...state,
        lastRoll: value,
        turnPhase: TurnPhase.Move,
        previousPosition: player.position,
        targetPosition: newPosition,
        pendingSpecialMove: null,
        players: state.players.map((p, i) =>
          i === state.currentPlayerIndex ? { ...p, position: newPosition } : p,
        ),
      }
    }

    case 'MOVE_COMPLETE': {
      const { game } = action
      const player = state.players[state.currentPlayerIndex]
      const maxPosition = game.board.totalSpaces - 1

      // Check if player finished
      if (player.position >= maxPosition) {
        const alreadyFinished = state.finishers.includes(player.name)
        return {
          ...state,
          turnPhase: TurnPhase.Resolve,
          winner: state.winner ?? player.name,
          finishers: alreadyFinished ? state.finishers : [...state.finishers, player.name],
          previousPosition: null,
          targetPosition: null,
          pendingSpecialMove: null,
        }
      }

      // Check for special space movement effect (only on first landing, not after a special move)
      if (!state.pendingSpecialMove) {
        const space = game.board.spaces[player.position]
        if (space && (space.type === 'bonus' || space.type === 'setback' || space.type === 'special')) {
          const effect = parseSpaceEffect(space)
          if (effect) {
            return {
              ...state,
              turnPhase: TurnPhase.SpecialMove,
              pendingSpecialMove: effect,
              previousPosition: null,
              targetPosition: null,
            }
          }
        }
      }

      // Check if the space has a challenge card
      const space = game.board.spaces[player.position]
      if (space?.challengeCardId) {
        const card = game.challengeCards.find((c) => c.id === space.challengeCardId) ?? null
        return {
          ...state,
          turnPhase: TurnPhase.Card,
          currentCard: card,
          cardsEncountered: card
            ? [...state.cardsEncountered, card.id]
            : state.cardsEncountered,
          previousPosition: null,
          targetPosition: null,
          pendingSpecialMove: null,
        }
      }

      // Normal space — go to resolve
      return {
        ...state,
        turnPhase: TurnPhase.Resolve,
        previousPosition: null,
        targetPosition: null,
        pendingSpecialMove: null,
      }
    }

    case 'SPECIAL_MOVE': {
      const { delta, game } = action
      const player = state.players[state.currentPlayerIndex]
      const maxPosition = game.board.totalSpaces - 1
      const newPosition = Math.max(0, Math.min(player.position + delta, maxPosition))

      return {
        ...state,
        turnPhase: TurnPhase.Move,
        previousPosition: player.position,
        targetPosition: newPosition,
        // Keep pendingSpecialMove set so MOVE_COMPLETE knows this was a special move
        // and won't re-trigger another special move
        players: state.players.map((p, i) =>
          i === state.currentPlayerIndex ? { ...p, position: newPosition } : p,
        ),
      }
    }

    case 'DISMISS_CARD':
      return {
        ...state,
        currentCard: null,
        turnPhase: TurnPhase.Resolve,
        pendingSpecialMove: null,
      }

    case 'NEXT_TURN': {
      // Find the next player who hasn't finished yet
      const totalPlayers = state.players.length
      let nextIndex = (state.currentPlayerIndex + 1) % totalPlayers
      let checked = 0

      while (checked < totalPlayers) {
        const candidatePlayer = state.players[nextIndex]
        if (!state.finishers.includes(candidatePlayer.name)) {
          break
        }
        nextIndex = (nextIndex + 1) % totalPlayers
        checked++
      }

      // If all players have finished, don't advance
      if (checked >= totalPlayers) {
        return state
      }

      return {
        ...state,
        currentPlayerIndex: nextIndex,
        turnPhase: TurnPhase.Roll,
        lastRoll: null,
        currentCard: null,
        pendingSpecialMove: null,
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
  finishers: [],
  startedAt: null,
  previousPosition: null,
  targetPosition: null,
  pendingSpecialMove: null,
}

// ── Hook ──────────────────────────────────────────────────────────

export function useGameSession(game: GeneratedGame) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  const startGame = useCallback(
    (players?: Player[]) => dispatch({ type: 'START_GAME', players }),
    [],
  )

  const restore = useCallback(
    (players: Player[], currentPlayerIndex: number, usedCardIds: string[]) =>
      dispatch({ type: 'RESTORE', players, currentPlayerIndex, usedCardIds }),
    [],
  )

  const roll = useCallback(
    (value: number) => dispatch({ type: 'ROLL', value, game }),
    [game],
  )

  const moveComplete = useCallback(
    () => dispatch({ type: 'MOVE_COMPLETE', game }),
    [game],
  )

  const specialMove = useCallback(
    (delta: number) => dispatch({ type: 'SPECIAL_MOVE', delta, game }),
    [game],
  )

  const dismissCard = useCallback(() => dispatch({ type: 'DISMISS_CARD' }), [])
  const nextTurn = useCallback(() => dispatch({ type: 'NEXT_TURN' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const isGameOver = state.winner !== null

  const allFinished = state.players.length > 0 && state.finishers.length >= state.players.length

  return {
    state,
    currentPlayer,
    isGameOver,
    allFinished,
    startGame,
    restore,
    roll,
    moveComplete,
    specialMove,
    dismissCard,
    nextTurn,
    reset,
  }
}

export { DEFAULT_PLAYERS }
