import { useReducer, useCallback } from 'react'
import type { StoryInputs, StoryPlayer, StoryChallenge } from '../../core/types'
import type { AdventureLength, BoardLength, BoardStyle, CardBackStyle, CardMechanic, GameType } from '../../core/types/workshop'

// ── State ─────────────────────────────────────────────────────────

export interface WizardState {
  step: number
  gameType: GameType | ''
  theme: string
  players: StoryPlayer[]
  // Board game fields
  goal: string
  challenges: StoryChallenge[]
  boardStyle: BoardStyle | ''
  boardLength: BoardLength | ''
  // Adventure fields
  storySetup: string
  choiceSeeds: string[]
  adventureLength: AdventureLength | ''
  // Card game fields
  cardMechanic: CardMechanic | ''
  cardDescriptions: string[]
  cardBackStyle: CardBackStyle | ''
  cardBackCustom: string
}

const initialState: WizardState = {
  step: 0,
  gameType: '',
  theme: '',
  players: [],
  goal: '',
  challenges: [],
  boardStyle: '',
  boardLength: '',
  storySetup: '',
  choiceSeeds: [],
  adventureLength: '',
  cardMechanic: '',
  cardDescriptions: [],
  cardBackStyle: '',
  cardBackCustom: '',
}

/** Total wizard steps by game type */
export function getTotalSteps(gameType: GameType | ''): number {
  // Step 0: Game Type, then type-specific steps
  if (gameType === 'adventure') return 6 // GameType, Theme, Players, StorySetup, Choices, Length
  if (gameType === 'cards') return 6 // GameType, Theme, Players, Mechanic, CardDesign, CardStyle
  return 6 // GameType, Theme, Players, Goal, Challenges, Board
}

/** Max step index by game type */
export function getMaxStepIndex(gameType: GameType | ''): number {
  return getTotalSteps(gameType) - 1
}

// ── Actions ───────────────────────────────────────────────────────

type WizardAction =
  | { type: 'SET_GAME_TYPE'; gameType: GameType }
  | { type: 'SET_THEME'; theme: string }
  | { type: 'SET_PLAYERS'; players: StoryPlayer[] }
  | { type: 'SET_GOAL'; goal: string }
  | { type: 'SET_CHALLENGES'; challenges: StoryChallenge[] }
  | { type: 'SET_BOARD_STYLE'; boardStyle: BoardStyle }
  | { type: 'SET_BOARD_LENGTH'; boardLength: BoardLength }
  | { type: 'SET_STORY_SETUP'; storySetup: string }
  | { type: 'SET_CHOICE_SEEDS'; choiceSeeds: string[] }
  | { type: 'SET_ADVENTURE_LENGTH'; adventureLength: AdventureLength }
  | { type: 'SET_CARD_MECHANIC'; cardMechanic: CardMechanic }
  | { type: 'SET_CARD_DESCRIPTIONS'; cardDescriptions: string[] }
  | { type: 'SET_CARD_BACK_STYLE'; cardBackStyle: CardBackStyle }
  | { type: 'SET_CARD_BACK_CUSTOM'; cardBackCustom: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_GAME_TYPE':
      return { ...state, gameType: action.gameType }
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
    case 'SET_STORY_SETUP':
      return { ...state, storySetup: action.storySetup }
    case 'SET_CHOICE_SEEDS':
      return { ...state, choiceSeeds: action.choiceSeeds }
    case 'SET_ADVENTURE_LENGTH':
      return { ...state, adventureLength: action.adventureLength }
    case 'SET_CARD_MECHANIC':
      return { ...state, cardMechanic: action.cardMechanic }
    case 'SET_CARD_DESCRIPTIONS':
      return { ...state, cardDescriptions: action.cardDescriptions }
    case 'SET_CARD_BACK_STYLE':
      return { ...state, cardBackStyle: action.cardBackStyle }
    case 'SET_CARD_BACK_CUSTOM':
      return { ...state, cardBackCustom: action.cardBackCustom }
    case 'NEXT_STEP':
      return { ...state, step: Math.min(state.step + 1, getMaxStepIndex(state.gameType)) }
    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 0) }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// ── Hook ──────────────────────────────────────────────────────────

export function useWorkshopWizard(initial?: Partial<WizardState>) {
  const [state, dispatch] = useReducer(wizardReducer, { ...initialState, ...initial })

  const setGameType = useCallback((gameType: GameType) => dispatch({ type: 'SET_GAME_TYPE', gameType }), [])
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
  const setStorySetup = useCallback(
    (storySetup: string) => dispatch({ type: 'SET_STORY_SETUP', storySetup }),
    [],
  )
  const setChoiceSeeds = useCallback(
    (choiceSeeds: string[]) => dispatch({ type: 'SET_CHOICE_SEEDS', choiceSeeds }),
    [],
  )
  const setAdventureLength = useCallback(
    (adventureLength: AdventureLength) => dispatch({ type: 'SET_ADVENTURE_LENGTH', adventureLength }),
    [],
  )
  const setCardMechanic = useCallback(
    (cardMechanic: CardMechanic) => dispatch({ type: 'SET_CARD_MECHANIC', cardMechanic }),
    [],
  )
  const setCardDescriptions = useCallback(
    (cardDescriptions: string[]) => dispatch({ type: 'SET_CARD_DESCRIPTIONS', cardDescriptions }),
    [],
  )
  const setCardBackStyle = useCallback(
    (cardBackStyle: CardBackStyle) => dispatch({ type: 'SET_CARD_BACK_STYLE', cardBackStyle }),
    [],
  )
  const setCardBackCustom = useCallback(
    (cardBackCustom: string) => dispatch({ type: 'SET_CARD_BACK_CUSTOM', cardBackCustom }),
    [],
  )
  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), [])
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  /** Check if the current step has enough input to proceed */
  const canProceed = (): boolean => {
    const isAdventure = state.gameType === 'adventure'
    const isCards = state.gameType === 'cards'

    switch (state.step) {
      case 0: // Game Type
        return state.gameType !== ''
      case 1: // Theme (shared)
        return state.theme.trim().length > 0
      case 2: // Players (shared)
        return state.players.length >= 2
      case 3: // Goal (board) or StorySetup (adventure) or Mechanic (cards)
        if (isCards) return state.cardMechanic !== ''
        return isAdventure
          ? state.storySetup.trim().length > 0
          : state.goal.trim().length > 0
      case 4: // Challenges (board) or Choices (adventure) or CardDesign (cards)
        if (isCards) return state.cardDescriptions.filter((c) => c.trim()).length > 0
        return isAdventure
          ? state.choiceSeeds.filter((c) => c.trim()).length > 0
          : state.challenges.length > 0
      case 5: // Board (board) or Length (adventure) or CardStyle (cards)
        if (isCards) return state.cardBackStyle !== ''
        return isAdventure
          ? state.adventureLength !== ''
          : state.boardStyle !== '' && state.boardLength !== ''
      default:
        return false
    }
  }

  const isFinalStep = (): boolean => {
    return state.step === getMaxStepIndex(state.gameType)
  }

  /** Build the final StoryInputs from wizard state, only including fields relevant to the game type */
  const buildStoryInputs = (): StoryInputs => {
    const base = {
      theme: state.theme,
      players: state.players,
    }

    if (state.gameType === 'adventure') {
      return {
        ...base,
        goal: '',
        challenges: [],
        boardStyle: '' as BoardStyle,
        boardLength: '' as BoardLength,
        storySetup: state.storySetup,
        choiceSeeds: state.choiceSeeds.filter((c) => c.trim()),
        adventureLength: state.adventureLength as AdventureLength,
      }
    }

    if (state.gameType === 'cards') {
      return {
        ...base,
        goal: '',
        challenges: [],
        boardStyle: '' as BoardStyle,
        boardLength: '' as BoardLength,
        cardMechanic: state.cardMechanic as 'matching' | 'collecting' | 'battle',
        cardDescriptions: state.cardDescriptions.filter((c) => c.trim()),
        cardBackStyle: state.cardBackStyle as 'classic' | 'decorated' | 'custom',
        cardBackCustom: state.cardBackCustom || undefined,
      }
    }

    // Board game (default)
    return {
      ...base,
      goal: state.goal,
      challenges: state.challenges,
      boardStyle: state.boardStyle as BoardStyle,
      boardLength: state.boardLength as BoardLength,
    }
  }

  return {
    state,
    setGameType,
    setTheme,
    setPlayers,
    setGoal,
    setChallenges,
    setBoardStyle,
    setBoardLength,
    setStorySetup,
    setChoiceSeeds,
    setAdventureLength,
    setCardMechanic,
    setCardDescriptions,
    setCardBackStyle,
    setCardBackCustom,
    nextStep,
    prevStep,
    reset,
    canProceed,
    isFinalStep,
    buildStoryInputs,
  }
}
