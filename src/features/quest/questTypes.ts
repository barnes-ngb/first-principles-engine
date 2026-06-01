import type { EvaluationDomain } from '../../core/types/enums'

// ── Quest domain and mode ────────────────────────────────────

export const QuestDomain = {
  Reading: 'reading',
  Math: 'math',
  Speech: 'speech',
} as const
export type QuestDomain = (typeof QuestDomain)[keyof typeof QuestDomain]

export const QuestMode = {
  Phonics: 'phonics',
  Comprehension: 'comprehension',
  Fluency: 'fluency',
  Math: 'math',
} as const
export type QuestMode = (typeof QuestMode)[keyof typeof QuestMode]

// ── Quest screen state machine ────────────────────────────────

export const QuestScreen = {
  Intro: 'intro',
  Loading: 'loading',
  Question: 'question',
  Feedback: 'feedback',
  Summary: 'summary',
  // Fluency-specific screens
  FluencyPassage: 'fluency-passage',
  FluencyRecording: 'fluency-recording',
  FluencySelfCheck: 'fluency-self-check',
  FluencySummary: 'fluency-summary',
} as const
export type QuestScreen = (typeof QuestScreen)[keyof typeof QuestScreen]

// ── Constants ─────────────────────────────────────────────────

export const MAX_QUESTIONS = 10
export const MIN_QUESTIONS = 5 // never end before 5 questions unless child manually exits
export const MAX_SECONDS = 480 // 8 minutes
export const LEVEL_UP_STREAK = 3 // 3 correct → harder
export const LEVEL_DOWN_STREAK = 2 // 2 wrong → easier
export const FRUSTRATION_LIMIT = 2 // 2 level-downs in a row → end
// 4 wrong at Level 1 → end (frustration escape).
// At floor, level-downs can't fire (already at 1), so FRUSTRATION_LIMIT (2 level-downs)
// never triggers. 4 wrong at floor ≈ 2 would-be level-down events (every 2 wrong = 1
// level-down attempt), matching the FRUSTRATION_LIMIT = 2 design intent.
// Bonus round still fires because levelDownsInARow stays 0 at floor.
export const FLOOR_WRONG_LIMIT = 4
export const VALIDATION_RETRIES = 2 // retry AI calls when question validation fails

// Per-quest-mode level ceilings.
// Phonics: L9-10 test comprehension, not phonics — cap at 8.
// Comprehension: prompts only define L1-6 — cap at 6.
// Math: L1-6 numbers & operations + L7-8 larger subtraction / times tables (FEAT-08) — cap at 8.
// Fluency has no levels (N/A).
export const QUEST_MODE_LEVEL_CAP: Record<string, number> = {
  phonics: 8,
  comprehension: 6,
  math: 8,
} as const
export const DEFAULT_LEVEL_CAP = 10

// ── Quest adaptive state ──────────────────────────────────────

export interface QuestState {
  currentLevel: number // difficulty tier (1-10 for reading)
  consecutiveCorrect: number
  consecutiveWrong: number
  levelDownsInARow: number // 2 in a row = frustration → end session
  totalQuestions: number
  totalCorrect: number
  questionsThisLevel: number
  wrongAtFloor: number // wrong answers while at Level 1 (floor escape)
  startedAt: string
  elapsedSeconds: number // updated by client-side timer
}

// ── Question from AI ──────────────────────────────────────────

// ── Answer input method tracking ─────────────────────────────

export const AnswerInputMethod = {
  MultipleChoice: 'multiple-choice',
  Voice: 'voice',
  Typed: 'typed',
  /** "Build the word" — child assembled the word by tapping sound/letter tiles (no typing). */
  Tile: 'tile',
} as const
export type AnswerInputMethod = (typeof AnswerInputMethod)[keyof typeof AnswerInputMethod]

// ── Question types (discriminated union) ──────────────────────
// FEAT-04: the reading quest started multiple-choice only. "build-word" adds
// ordered tile assembly (encoding) — the complement to decode/recognition. It
// reuses the same lifecycle (adaptive engine, TTS, findings→snapshot writer);
// only the render branch and answer-check differ.

export const QuestQuestionType = {
  MultipleChoice: 'multiple-choice',
  BuildWord: 'build-word',
} as const
export type QuestQuestionType = (typeof QuestQuestionType)[keyof typeof QuestQuestionType]

interface QuestQuestionBase {
  id: string
  level: number
  skill: string // e.g. "phonics.cvc.short-o"
  prompt: string // what Lincoln sees
  stimulus?: string // the word/content to display prominently (e.g. "stop")
  /**
   * The answer the child must produce. For multiple-choice it matches one
   * option; for build-word it is the target word the assembled tiles must
   * spell. Kept on the base so type-agnostic code (checkAnswer, findings,
   * persistence) reads one field regardless of question type.
   */
  correctAnswer: string
  encouragement?: string // shown after wrong answer
  isBonusRound?: boolean // true for end-on-a-win bonus question
  /**
   * Phase 2 — when the AI deliberately targets a known blocker from the
   * skill snapshot, it sets this to the block's stable id. Absent on
   * general-pool questions. The client passes this through to SessionQuestion
   * so `updateBlockerLifecycle` can weight targeted evidence.
   */
  targetedBlockerId?: string
}

/** Tap-one-option recognition/decoding question (the original quest type). */
export interface MultipleChoiceQuestion extends QuestQuestionBase {
  type: 'multiple-choice'
  phonemeDisplay?: string // e.g. "/d/ /o/ /g/" — shown above options (Levels 1-3 only)
  options: string[] // always 3 for multiple choice
  /** Whether this question should also show voice/type input alongside MC options */
  allowOpenResponse?: boolean
}

/**
 * "Build the word" encoding question (FEAT-04). The target word is read aloud
 * via TTS; the child taps sound/letter tiles into ordered slots to spell it.
 * There is NEVER a typed text field — tap (and/or voice) only. `correctAnswer`
 * equals `targetWord` and is the string the assembled tiles are checked against.
 */
export interface BuildWordQuestion extends QuestQuestionBase {
  type: 'build-word'
  /** The word to construct. Always equals `correctAnswer`. Not shown as text. */
  targetWord: string
  /**
   * The tile set: the target word's graphemes (scrambled) plus a few
   * level-appropriate distractor tiles. Single letters at low (CVC) levels;
   * digraphs/blends as multi-character tiles at higher levels.
   */
  tiles: string[]
  /** Spoken cue text (defaults to targetWord when omitted). */
  audioCue?: string
}

export type QuestQuestion = MultipleChoiceQuestion | BuildWordQuestion

// ── Answered question ─────────────────────────────────────────

export interface SessionQuestion {
  id: string
  type: QuestQuestionType
  level: number
  skill: string
  prompt: string
  stimulus?: string
  /** MC options, or — for build-word — the tile set the child assembled from. */
  options: string[]
  correctAnswer: string
  childAnswer: string
  correct: boolean
  skipped?: boolean
  flaggedAsError?: boolean
  responseTimeMs: number
  timestamp: string
  /** How the child answered: tapped an MC option, spoke via voice, or typed */
  inputMethod?: AnswerInputMethod
  /**
   * Phase 2 — set when the AI deliberately targeted a known blocker for this
   * question (see QuestQuestion.targetedBlockerId). Used by
   * updateBlockerLifecycle to weight targeted evidence more heavily than
   * incidental evidence when advancing ADDRESS_NOW → RESOLVING → RESOLVED.
   */
  targetedBlockerId?: string
}

// ── Extra fields on EvaluationSession for interactive sessions ─

export interface InteractiveSessionData {
  sessionType: 'interactive' // distinguishes from 'guided' Shelly sessions
  questions: SessionQuestion[]
  finalLevel: number
  totalCorrect: number
  totalQuestions: number
  diamondsMined: number // = totalCorrect
  streakDays: number
  timedOut?: boolean
  skippedCount?: number
  flaggedErrorCount?: number
  /** Distinguishes phonics quests from comprehension quests */
  questMode?: QuestMode
  // ── Resume support fields (saved on partial sessions) ──────
  /** Full adaptive state — needed to restore quest on resume */
  savedQuestState?: QuestState
  /** The exact question the child was looking at when they exited */
  savedCurrentQuestion?: QuestQuestion
  /** Whether bonus round was already used this session */
  bonusRoundUsed?: boolean
}

// ── Fluency practice types ───────────────────────────────────

export const FluencySelfRating = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
} as const
export type FluencySelfRating = (typeof FluencySelfRating)[keyof typeof FluencySelfRating]

export interface FluencyPassage {
  text: string
  targetWords: string[]
  speechWords: string[]
  wordCount: number
  readingLevel: string
  attempts: FluencyAttempt[]
}

export interface FluencyAttempt {
  recordingUrl: string | null // Firebase Storage path
  selfRating: FluencySelfRating
  durationSeconds: number
  timestamp: string
}

export interface FluencySessionData {
  sessionType: 'fluency'
  questMode: 'fluency'
  passages: FluencyPassage[]
  totalReadingTimeSeconds: number
  diamondsEarned: number
}

// ── Quest streak ──────────────────────────────────────────────

export interface QuestStreak {
  currentStreak: number
  lastQuestDate: string | null
}

// ── Domain config for intro screen ────────────────────────────

export interface QuestDomainConfig {
  domain: EvaluationDomain
  label: string
  icon: string
  enabled: boolean
  description?: string
  /** Quest mode within a domain (e.g., phonics vs comprehension within reading) */
  questMode?: QuestMode
  /** Whether to show a "Recommended" badge based on skill snapshot */
  recommended?: boolean
}
