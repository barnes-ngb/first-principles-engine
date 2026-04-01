import type { SubjectBucket } from './enums'

// ── Story Game Workshop Types ─────────────────────────────────

export interface StoryGame {
  id?: string
  childId: string
  createdAt: string
  updatedAt: string
  status: WorkshopStatus

  /** Game type: board game, choose-your-adventure, or card game */
  gameType?: GameType

  /** London's creative choices from the wizard (mostly captured via voice) */
  storyInputs: StoryInputs

  /** AI-generated game definition (board games) */
  generatedGame?: GeneratedGame

  /** AI-generated adventure tree (adventure games) */
  adventureTree?: AdventureTree

  /** AI-generated card game data (card games) */
  cardGame?: CardGameData

  /** In-progress card game session (saved after each turn for resume) */
  activeCardGameSession?: ActiveCardGameSession | null

  /** Play session records */
  playSessions?: GamePlaySession[]

  /** DALL-E generated art assets */
  generatedArt?: GeneratedArt

  /** In-progress game session (saved after each turn for resume) */
  activeSession?: ActiveSession | null

  /** In-progress adventure session (saved after each choice for resume) */
  activeAdventureSession?: ActiveAdventureSession | null

  /** Voice recordings keyed by card/space/node ID */
  voiceRecordings?: VoiceRecordingMap

  /** Tracks wizard step for draft resume (removed when wizard completes) */
  currentWizardStep?: number

  /** Playtest sessions from Lincoln (or other testers) */
  playtestSessions?: PlaytestSession[]

  /** Game version counter (starts at 1, increments on revision) */
  version?: number

  /** History of revisions made after playtests */
  revisionHistory?: RevisionEntry[]
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

export interface ActiveAdventureSession {
  currentNodeId: string
  pathTaken: string[]
  choicesMade: Array<{ nodeId: string; choiceId: string }>
  challengeResults: Array<{ nodeId: string; passed: boolean }>
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
  /** Scene illustrations for adventure nodes, keyed by nodeId */
  sceneArt?: {
    [nodeId: string]: string
  }
  /** Card back design for card games */
  cardBack?: string
  /** Per-card or per-group face art for card games, keyed by cardId or group key */
  cardFaces?: {
    [cardId: string]: string
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
  /** Adventure-specific: story setup description */
  storySetup?: string
  /** Adventure-specific: choice seed descriptions */
  choiceSeeds?: string[]
  /** Adventure-specific: story length preference */
  adventureLength?: AdventureLength
  /** Card game-specific: game mechanic */
  cardMechanic?: 'matching' | 'collecting' | 'battle'
  /** Card game-specific: card descriptions/categories from the child */
  cardDescriptions?: string[]
  /** Card game-specific: card back style */
  cardBackStyle?: 'classic' | 'decorated' | 'custom'
  /** Card game-specific: custom card back description */
  cardBackCustom?: string
}

export interface StoryPlayer {
  id: string
  name: string
  avatarUrl?: string
  isCreator: boolean
  isGuest?: boolean
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
  /** Adventure-specific: path of nodeIds visited */
  pathTaken?: string[]
  /** Adventure-specific: choices made at each node */
  choicesMade?: Array<{ nodeId: string; choiceId: string }>
  /** Adventure-specific: challenge results */
  challengeResults?: Array<{ nodeId: string; passed: boolean }>
}

// ── Adventure Types ──────────────────────────────────────────

export interface AdventureNode {
  id: string
  /** Narrative text for this node (2-4 sentences) */
  text: string
  /** TTS-optimized version */
  spokenText: string
  /** Brief description for DALL-E prompt */
  illustration?: string
  /** Choices available at this node (absent for endings) */
  choices?: AdventureChoice[]
  /** Optional embedded challenge at this node */
  challenge?: AdventureChallenge
  /** True for leaf nodes */
  isEnding?: boolean
  /** Ending type — no bad endings */
  endingType?: 'victory' | 'neutral' | 'retry'
  /** For retry endings, the node to return to */
  retryNodeId?: string
}

export interface AdventureChoice {
  id: string
  /** Choice label shown on button */
  text: string
  /** TTS-optimized version */
  spokenText: string
  /** Where this choice leads */
  nextNodeId: string
}

export interface AdventureChallenge {
  type: 'reading' | 'math' | 'story' | 'action'
  content: string
  spokenText: string
  answer?: string
  options?: string[]
  difficulty: 'easy' | 'medium' | 'stretch'
}

export interface AdventureTree {
  nodes: { [nodeId: string]: AdventureNode }
  rootNodeId: string
  totalNodes: number
  totalEndings: number
  challengeCount: number
}

// ── Card Game Types ─────────────────────────────────────────

export interface CardGameData {
  mechanic: 'matching' | 'collecting' | 'battle'
  cards: CardGameCard[]
  rules: GameRule[]
  metadata: {
    deckSize: number
    estimatedMinutes: number
    playerCount: { min: number; max: number }
  }
}

export interface CardGameCard {
  id: string
  name: string
  spokenText: string
  /** For matching/collecting: which group this card belongs to */
  category?: string
  /** For battle: power level (1-10) */
  value?: number
  /** For battle: optional special ability */
  specialAbility?: string
  learningElement?: {
    type: 'reading' | 'math'
    content: string
    answer?: string
    options?: string[]
  }
  /** Description for DALL-E card face art */
  artPrompt: string
}

export interface ActiveCardGameSession {
  mechanic: 'matching' | 'collecting' | 'battle'
  players: ActiveCardGamePlayer[]
  currentPlayerIndex: number
  /** Matching: which cards are face-up */
  revealedCardIds: string[]
  /** Matching: which pairs have been found */
  matchedCardIds: string[]
  /** Collecting: cards in draw pile */
  drawPile: string[]
  /** Collecting/Battle: cards in each player's hand */
  playerHands: { [playerId: string]: string[] }
  /** Collecting: completed sets per player */
  completedSets: { [playerId: string]: string[][] }
  /** Battle: cards won per player */
  wonCards: { [playerId: string]: string[] }
  /** Battle: current round number */
  currentRound: number
  /** Battle: max rounds */
  maxRounds: number
  scores: { [playerId: string]: number }
  status: 'playing' | 'finished'
  startedAt: string
  updatedAt: string
}

export interface ActiveCardGamePlayer {
  id: string
  name: string
  avatarUrl?: string
}

// ── Playtest Types ───────────────────────────────────────────

export const PlaytestReaction = {
  Good: 'good',
  Confusing: 'confusing',
  TooHard: 'too-hard',
  TooEasy: 'too-easy',
  Change: 'change',
} as const
export type PlaytestReaction = (typeof PlaytestReaction)[keyof typeof PlaytestReaction]

export interface PlaytestFeedback {
  cardId: string
  reaction: PlaytestReaction
  comment?: string
  audioUrl?: string
  timestamp: string
}

export interface PlaytestSummary {
  totalCards: number
  good: number
  confusing: number
  tooHard: number
  tooEasy: number
  change: number
}

export const PlaytestStatus = {
  InProgress: 'in-progress',
  Complete: 'complete',
  Reviewed: 'reviewed',
} as const
export type PlaytestStatus = (typeof PlaytestStatus)[keyof typeof PlaytestStatus]

export interface PlaytestSession {
  id: string
  testerId: string
  testerName: string
  completedAt: string
  feedback: PlaytestFeedback[]
  summary: PlaytestSummary
  status: PlaytestStatus
}

export interface CardRevision {
  cardId: string
  oldContent: string
  newContent: string
  reason: string
}

export interface RevisionEntry {
  version: number
  revisedAt: string
  changes: CardRevision[]
  playtestId: string
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
  Playtesting: 'playtesting',
  PlaytestReview: 'playtest-review',
} as const
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

export const TurnPhase = {
  Roll: 'roll',
  Move: 'move',
  SpecialMove: 'special-move',
  Card: 'card',
  Resolve: 'resolve',
} as const
export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase]

export interface SpaceEffect {
  type: 'forward' | 'backward' | 'teleport'
  amount: number
}

export const GameType = {
  Board: 'board',
  Adventure: 'adventure',
  Cards: 'cards',
} as const
export type GameType = (typeof GameType)[keyof typeof GameType]

export const CardMechanic = {
  Matching: 'matching',
  Collecting: 'collecting',
  Battle: 'battle',
} as const
export type CardMechanic = (typeof CardMechanic)[keyof typeof CardMechanic]

export const CardBackStyle = {
  Classic: 'classic',
  Decorated: 'decorated',
  Custom: 'custom',
} as const
export type CardBackStyle = (typeof CardBackStyle)[keyof typeof CardBackStyle]

export const AdventureLength = {
  Short: 'short',
  Medium: 'medium',
  Long: 'long',
} as const
export type AdventureLength = (typeof AdventureLength)[keyof typeof AdventureLength]
