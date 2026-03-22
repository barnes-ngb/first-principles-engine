import { useReducer, useCallback } from 'react'
import type { StoryInputs, StoryPlayer, StoryChallenge } from '../../core/types'
import type { BoardStyle, BoardLength } from '../../core/types/workshop'

// ── State ─────────────────────────────────────────────────────────

export interface WizardState {
  step: number
  theme: string
  players: StoryPlayer[]
  goal: string
  challenges: StoryChallenge[]
  boardStyle: BoardStyle | ''
  boardLength: BoardLength | ''
}

const initialState: WizardState = {
  step: 0,
  theme: '',
  players: [],
  goal: '',
  challenges: [],
  boardStyle: '',
  boardLength: '',
}

// ── Actions ───────────────────────────────────────────────────────

type WizardAction =
  | { type: 'SET_THEME'; theme: string }
  | { type: 'SET_PLAYERS'; players: StoryPlayer[] }
  | { type: 'SET_GOAL'; goal: string }
  | { type: 'SET_CHALLENGES'; challenges: StoryChallenge[] }
  | { type: 'SET_BOARD_STYLE'; boardStyle: BoardStyle }
  | { type: 'SET_BOARD_LENGTH'; boardLength: BoardLength }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.theme }
    case 'SET_PLAYERS':
      return { ...state, players: action.players }
    case 'SET_GOAL':
      return { ...state, goal: action.goal }
    case 'SET_CHALLENGES':
      return { ...state, challenges: action.challenges }
    case 'SET_BOARD_STYLE':
      return { ...state, boardStyle: action.boardStyle }
    case 'SET_BOARD_LENGTH':
      return { ...state, boardLength: action.boardLength }
    case 'NEXT_STEP':
      return { ...state, step: Math.min(state.step + 1, 4) }
    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 0) }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ── Hook ──────────────────────────────────────────────────────────

export function useWorkshopWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialState)

  const setTheme = useCallback((theme: string) => dispatch({ type: 'SET_THEME', theme }), [])
  const setPlayers = useCallback(
    (players: StoryPlayer[]) => dispatch({ type: 'SET_PLAYERS', players }),
    [],
  )
  const setGoal = useCallback((goal: string) => dispatch({ type: 'SET_GOAL', goal }), [])
  const setChallenges = useCallback(
    (challenges: StoryChallenge[]) => dispatch({ type: 'SET_CHALLENGES', challenges }),
    [],
  )
  const setBoardStyle = useCallback(
    (boardStyle: BoardStyle) => dispatch({ type: 'SET_BOARD_STYLE', boardStyle }),
    [],
  )
  const setBoardLength = useCallback(
    (boardLength: BoardLength) => dispatch({ type: 'SET_BOARD_LENGTH', boardLength }),
    [],
  )
  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), [])
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  /** Check if the current step has enough input to proceed */
  const canProceed = (): boolean => {
    switch (state.step) {
      case 0:
        return state.theme.trim().length > 0
      case 1:
        return state.players.length >= 2
      case 2:
        return state.goal.trim().length > 0
      case 3:
        return state.challenges.length > 0
      case 4:
        return state.boardStyle !== '' && state.boardLength !== ''
      default:
        return false
    }
  }

  /** Build the final StoryInputs from wizard state */
  const buildStoryInputs = (): StoryInputs => ({
    theme: state.theme,
    players: state.players,
    goal: state.goal,
    challenges: state.challenges,
    boardStyle: state.boardStyle as BoardStyle,
    boardLength: state.boardLength as BoardLength,
  })

  return {
    state,
    setTheme,
    setPlayers,
    setGoal,
    setChallenges,
    setBoardStyle,
    setBoardLength,
    nextStep,
    prevStep,
    reset,
    canProceed,
    buildStoryInputs,
  }
}
