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
  /**
   * FEAT-11 Phase 1 — "spell-the-word": the encoding complement to build-word,
   * but seeded from words the child has been *reading* (his sight-word bank +
   * recent phonics frontier, blended) and tracked as a **spelling** signal
   * (`writing.spelling.*`), not phonics. Reuses build-word's tile engine and UI
   * verbatim (tap-only tiles, target spoken not shown, exact-match check); only
   * the word source and the skill tag / working level it feeds differ. Closes
   * the read/spell asymmetry — we tracked whether he can *read* a word but never
   * whether he can *spell* it.
   */
  SpellWord: 'spell-word',
  /**
   * FEAT-11 Phase 2 — "build-the-sentence": the **bridge** from "right word" to
   * "real writing". The child taps word tiles into order to form a sentence,
   * with a **capital tile** and a **period tile** bundled in (capital at the
   * start, period at the end). Scrambled-to-order only (the correct words,
   * scrambled → tapped into order), client-generated from his word bank + a
   * small function-word set. Tracked as a **sentence** signal
   * (`writing.composition.sentence` → `workingLevels.sentence`), kept separate
   * from the spelling signal (`writing.spelling.*` → `workingLevels.writing`)
   * and from future composition. Tap-only tiles — NO text input, ever. Rendered
   * with `BuildSentenceQuestionScreen` (sibling of the word-tile screen).
   */
  BuildSentence: 'build-sentence',
} as const
export type QuestQuestionType = (typeof QuestQuestionType)[keyof typeof QuestQuestionType]

/**
 * Question types whose answer is assembled by tapping tiles (NO text input).
 * `build-word` / `spell-word` join grapheme tiles into a *word*; `build-sentence`
 * orders word tiles into a *sentence*. They share the tap-only/no-typing contract
 * and store their tile set in `SessionQuestion.options`, but assemble differently
 * (the word screen joins with '', the sentence screen joins with spaces +
 * capital/period) — so the word-join helpers below stay scoped to the first two.
 */
export const TILE_ASSEMBLY_TYPES = ['build-word', 'spell-word'] as const
export function isTileAssemblyType(type: string): boolean {
  return type === 'build-word' || type === 'spell-word'
}

/** Any tap-to-assemble type (word or sentence) — records its tiles in `options`. */
export function isTileQuestionType(type: string): boolean {
  return type === 'build-word' || type === 'spell-word' || type === 'build-sentence'
}

/**
 * Spell-the-word level ceiling (FEAT-11). Mirrors build-word's L6 cap — encoding
 * multi-syllable words from tiles is too hard — and bounds the derived
 * `workingLevels.writing` (spelling) level.
 */
export const WRITING_LEVEL_CAP = 6

/**
 * Build-the-sentence level ceiling (FEAT-11 Phase 2). Bounds the derived
 * `workingLevels.sentence` level. Caps at the curriculum "complete sentence"
 * building tier — multi-clause/paragraph construction is a later phase.
 */
export const SENTENCE_LEVEL_CAP = 6

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

/**
 * "Spell-the-word" encoding question (FEAT-11 Phase 1). Structurally identical
 * to {@link BuildWordQuestion} — the child hears a word and taps grapheme tiles
 * to spell it, with NO text input ever — but the target is sourced from the
 * child's sight-word bank + phonics frontier (a word he's been *reading*), and
 * its `skill` is a `writing.spelling.*` tag so it feeds the **spelling** working
 * level, kept separate from phonics and from future composition. Rendered with
 * the same `BuildWordQuestionScreen`.
 */
export interface SpellWordQuestion extends QuestQuestionBase {
  type: 'spell-word'
  /** The word to spell. Always equals `correctAnswer`. Not shown as text. */
  targetWord: string
  /** Grapheme tiles (scrambled) + level-appropriate distractors. */
  tiles: string[]
  /** Spoken cue text (defaults to targetWord when omitted). */
  audioCue?: string
  /** Where the target came from — for evidence/labelling. */
  source?: 'sightWord' | 'frontier'
}

/**
 * "Build-the-sentence" question (FEAT-11 Phase 2). The child hears a sentence
 * and taps **word tiles** into order to build it, with a **capital tile** and a
 * **period tile** bundled in — NO text input ever, tap-only. Scrambled-to-order:
 * the correct words are offered scrambled; the assembled order (incl. capital at
 * start, period at end) is checked against `targetSentence`. `correctAnswer`
 * equals `targetSentence`. Its `skill` is `writing.composition.sentence`, feeding
 * the **sentence** working level — kept separate from spelling and composition.
 * Rendered with `BuildSentenceQuestionScreen`.
 */
export interface BuildSentenceQuestion extends QuestQuestionBase {
  type: 'build-sentence'
  /** The correct sentence (capital at start, period at end). Equals `correctAnswer`. Not shown as text. */
  targetSentence: string
  /**
   * The tile set: each sentence word (lowercase) plus a capital tile
   * (`SENTENCE_CAPITAL_TILE`) and a period tile (`SENTENCE_PERIOD_TILE`),
   * scrambled. Tap into order to build the sentence.
   */
  tiles: string[]
  /** Spoken cue text (defaults to targetSentence when omitted). */
  audioCue?: string
  /** Whether any content word came from the child's bank — for evidence/labelling. */
  source?: 'wordBank' | 'generated'
}

export type QuestQuestion =
  | MultipleChoiceQuestion
  | BuildWordQuestion
  | SpellWordQuestion
  | BuildSentenceQuestion

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
