import type { EvaluationDomain } from '../../core/types/enums'

// ── Quest screen state machine ────────────────────────────────

export const QuestScreen = {
  Intro: 'intro',
  Loading: 'loading',
  Question: 'question',
  Feedback: 'feedback',
  Summary: 'summary',
} as const
export type QuestScreen = (typeof QuestScreen)[keyof typeof QuestScreen]

// ── Constants ─────────────────────────────────────────────────

export const MAX_QUESTIONS = 10
export const MAX_SECONDS = 480 // 8 minutes
export const LEVEL_UP_STREAK = 3 // 3 correct → harder
export const LEVEL_DOWN_STREAK = 2 // 2 wrong → easier
export const FRUSTRATION_LIMIT = 2 // 2 level-downs in a row → end

// ── Quest adaptive state ──────────────────────────────────────

export interface QuestState {
  currentLevel: number // difficulty tier (1-6 for reading)
  consecutiveCorrect: number
  consecutiveWrong: number
  levelDownsInARow: number // 2 in a row = frustration → end session
  totalQuestions: number
  totalCorrect: number
  questionsThisLevel: number
  startedAt: string
  elapsedSeconds: number // updated by client-side timer
}

// ── Question from AI ──────────────────────────────────────────

export interface QuestQuestion {
  id: string
  type: 'multiple-choice'
  level: number
  skill: string // e.g. "phonics.cvc.short-o"
  prompt: string // what Lincoln sees
  stimulus?: string // the word/content to display prominently (e.g. "stop")
  phonemeDisplay?: string // e.g. "/d/ /o/ /g/" — shown above options (Levels 1-3 only)
  options: string[] // always 3 for multiple choice
  correctAnswer: string
  encouragement?: string // shown after wrong answer
  isBonusRound?: boolean // true for end-on-a-win bonus question
}

// ── Answered question ─────────────────────────────────────────

export interface SessionQuestion {
  id: string
  type: 'multiple-choice'
  level: number
  skill: string
  prompt: string
  options: string[]
  correctAnswer: string
  childAnswer: string
  correct: boolean
  responseTimeMs: number
  timestamp: string
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
  enabled: boolean // only 'reading' for Phase 1
  description?: string
}
