import type { SubjectBucket } from './enums'

// ── Story Game Workshop Types ─────────────────────────────────

export interface StoryGame {
  id?: string
  childId: string
  createdAt: string
  updatedAt: string
  status: WorkshopStatus

  /** London's creative choices from the wizard (mostly captured via voice) */
  storyInputs: StoryInputs

  /** AI-generated game definition */
  generatedGame?: GeneratedGame

  /** Play session records */
  playSessions?: GamePlaySession[]

  /** DALL-E generated art assets */
  generatedArt?: GeneratedArt

  /** In-progress game session (saved after each turn for resume) */
  activeSession?: ActiveSession | null

  /** Voice recordings keyed by card/space ID */
  voiceRecordings?: VoiceRecordingMap

  /** Tracks wizard step for draft resume (removed when wizard completes) */
  currentWizardStep?: number
}

export interface VoiceRecording {
  /** Firebase Storage download URL */
  url: string
  /** Child ID of the recorder */
  recordedBy: string
  /** Recording duration in milliseconds */
  durationMs: number
  /** ISO timestamp of when the recording was made */
  recordedAt: string
}

export type VoiceRecordingMap = {
  [cardOrSpaceId: string]: VoiceRecording
}

export interface ActiveSession {
  players: ActiveSessionPlayer[]
  currentTurnIndex: number
  usedCardIds: string[]
  status: 'playing' | 'finished'
  startedAt: string
  updatedAt: string
}

export interface ActiveSessionPlayer {
  id: string
  name: string
  avatarUrl?: string
  position: number
}

export interface GeneratedArt {
  boardBackground?: string
  titleScreen?: string
  cardArt?: {
    reading?: string
    math?: string
    story?: string
    action?: string
  }
  parentTokens?: {
    [parentId: string]: string
  }
}

export interface StoryInputs {
  theme: string
  players: StoryPlayer[]
  goal: string
  challenges: StoryChallenge[]
  boardStyle: BoardStyle
  boardLength: BoardLength
  /** Raw voice transcriptions for portfolio/debugging */
  voiceTranscripts?: string[]
}

export interface StoryPlayer {
  id: string
  name: string
  avatarUrl?: string
  isCreator: boolean
}

export interface StoryChallenge {
  type: ChallengeCardType | 'custom'
  idea?: string
}

export interface GeneratedGame {
  title: string
  board: GameBoard
  challengeCards: ChallengeCard[]
  rules: GameRule[]
  metadata: GameMetadata
  /** TTS-friendly intro read aloud before game starts */
  storyIntro?: string
}

export interface GameBoard {
  spaces: BoardSpace[]
  totalSpaces: number
}

export interface BoardSpace {
  index: number
  type: BoardSpaceType
  label?: string
  challengeCardId?: string
  /** Theme color hint for rendering */
  color?: string
}

export interface ChallengeCard {
  id: string
  type: ChallengeCardType
  subjectBucket: SubjectBucket
  content: string
  /** TTS-optimized version — shorter, conversational, no abbreviations */
  readAloudText: string
  difficulty: CardDifficulty
  answer?: string
  options?: string[]
}

export interface GameRule {
  number: number
  text: string
  /** TTS-optimized version */
  readAloudText: string
}

export interface GameMetadata {
  playerCount: { min: number; max: number }
  estimatedMinutes: number
  theme: string
}

export interface GamePlaySession {
  playedAt: string
  players: string[]
  winner?: string
  durationMinutes?: number
  /** Cards encountered during play, for hours split calculation */
  cardsEncountered?: string[]
}

// ── Const enums (as const pattern) ────────────────────────────

export const WorkshopStatus = {
  Draft: 'draft',
  Ready: 'ready',
  Played: 'played',
} as const
export type WorkshopStatus = (typeof WorkshopStatus)[keyof typeof WorkshopStatus]

export const ChallengeCardType = {
  Reading: 'reading',
  Math: 'math',
  Story: 'story',
  Action: 'action',
} as const
export type ChallengeCardType = (typeof ChallengeCardType)[keyof typeof ChallengeCardType]

export const BoardSpaceType = {
  Normal: 'normal',
  Challenge: 'challenge',
  Bonus: 'bonus',
  Setback: 'setback',
  Special: 'special',
} as const
export type BoardSpaceType = (typeof BoardSpaceType)[keyof typeof BoardSpaceType]

export const CardDifficulty = {
  Easy: 'easy',
  Medium: 'medium',
  Stretch: 'stretch',
} as const
export type CardDifficulty = (typeof CardDifficulty)[keyof typeof CardDifficulty]

export const BoardStyle = {
  Winding: 'winding',
  Grid: 'grid',
  Circle: 'circle',
} as const
export type BoardStyle = (typeof BoardStyle)[keyof typeof BoardStyle]

export const BoardLength = {
  Short: 'short',
  Medium: 'medium',
  Long: 'long',
} as const
export type BoardLength = (typeof BoardLength)[keyof typeof BoardLength]

export const GamePhase = {
  Idle: 'idle',
  Wizard: 'wizard',
  Generating: 'generating',
  Recording: 'recording',
  Ready: 'ready',
  Playing: 'playing',
  Finished: 'finished',
} as const
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

export const TurnPhase = {
  Roll: 'roll',
  Move: 'move',
  Card: 'card',
  Resolve: 'resolve',
} as const
export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase]
