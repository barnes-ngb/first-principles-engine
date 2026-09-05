import { useCallback, useRef, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase/firebase'

// ── Types (mirrored from functions/src/ai/chat.ts) ──────────────

export const TaskType = {
  Plan: 'plan',
  Evaluate: 'evaluate',
  Generate: 'generate',
  Chat: 'chat',
  Quest: 'quest',
  GenerateStory: 'generateStory',
  ReviseStory: 'reviseStory',
  RevisePage: 'revisePage',
  Workshop: 'workshop',
  AnalyzeWorkbook: 'analyzeWorkbook',
  Disposition: 'disposition',
  Conundrum: 'conundrum',
  WeeklyFocus: 'weeklyFocus',
  Scan: 'scan',
  ShellyChat: 'shellyChat',
  FoundationsReview: 'foundationsReview',
  ChapterQuestions: 'chapterQuestions',
  BookLookup: 'bookLookup',
  LessonVideo: 'lessonVideo',
  HelpCard: 'helpCard',
} as const
export type TaskType = (typeof TaskType)[keyof typeof TaskType]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  familyId: string
  childId: string
  taskType: TaskType
  messages: ChatMessage[]
  /** Evaluation domain (only used when taskType === 'evaluate') */
  domain?: string
  /**
   * Optional per-request model override (allowlisted server-side). Lets a
   * specific caller upgrade a generic task's default model without changing it
   * for every other consumer — e.g. ETHOS-03 runs Dad Lab suggestion generation
   * on Sonnet while other `chat`-task callers stay on Haiku.
   */
  model?: string
}

export interface ChatResponse {
  message: string
  model: string
  usage: { inputTokens: number; outputTokens: number }
  /**
   * Why the model stopped (`end_turn`, `max_tokens`, …) when the task handler
   * reports it — `generateStory` does since FEAT-169. `undefined` from tasks
   * that don't, and from an older deploy; treat it as "unknown", never success.
   */
  stopReason?: string
  /**
   * How readable the returned story actually is for this child (FEAT-176) —
   * `generateStory` only. The server measures the drafted story against the
   * child's assessed phonics level, makes at most one fix attempt, and reports
   * what is still above the level so the draft turn can say so plainly.
   * `undefined` from every other task and from an older deploy; treat it as
   * "not measured", never as "fine".
   */
  readability?: {
    phonicsLevel: number
    levelSource: 'assessed' | 'age'
    passed: boolean
    /** A capped SAMPLE of the words above the level — examples, not the tally. */
    hardWords: Array<{ page: number; word: string }>
    /** The TRUE distinct count across the story, never truncated (FEAT-176). */
    hardWordCount: number
    revised: boolean
    /**
     * The per-story "one step up" this book was written AND measured at
     * (FEAT-191), 0-2. `phonicsLevel` above is already stretched, so this is
     * what tells the draft line whether a bigger word was asked for.
     * Optional — an older deploy sends no such field, which means 0.
     */
    stretch?: number
  }
}

// ── Generate types (mirrored from functions/src/ai/generate.ts) ──

export interface GenerateRequest {
  familyId: string
  childId: string
  activityType: string
  skillTag: string
  estimatedMinutes: number
}

export interface GeneratedActivity {
  title: string
  objective: string
  materials: string[]
  steps: string[]
  successCriteria: string[]
}

export interface GenerateResponse {
  activity: GeneratedActivity
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

// ── Image generation types (mirrored from functions/src/ai/imageGen.ts) ──

export interface ImageGenRequest {
  familyId: string
  prompt: string
  style?: 'schedule-card' | 'reward-chart' | 'theme-illustration' | 'book-illustration-minecraft' | 'book-illustration-storybook' | 'book-illustration-comic' | 'book-illustration-realistic' | 'book-illustration-garden-warfare' | 'book-illustration-platformer' | 'book-sticker' | 'game-art' | 'general'
  size?: '1024x1024' | '1024x1792' | '1792x1024'
  /** Optional theme ID — used only when `style` carries no look of its own; a picked illustration style always wins (FEAT-174). */
  themeId?: string
}

export interface ImageGenResponse {
  url: string
  storagePath: string
  /**
   * What the picture maker was actually asked to draw, when that is NOT what
   * the person typed (FEAT-195). The server rewrites every prompt for
   * copyright before the image call, so a child who asks for a named character
   * gets a picture of someone else; this is the field that lets a surface say
   * so. `undefined` when the ask was unchanged, and from an older deploy —
   * treat it as "nothing to report", never as "unchanged".
   */
  revisedPrompt?: string
}

/**
 * A failed image call, as the callable rejected it (FEAT-195).
 *
 * `error` above flattens a rejection to one string, which is all four picture
 * doors ever had — so each sniffed that string for the word "blocked" and got a
 * different answer. This keeps the `code` and the handler's structured
 * `details` intact so `books/imageGenerationFailure.ts` can classify the
 * failure and read the alternatives the server sent, rather than guess from
 * prose. Non-image callables are unaffected.
 */
export interface ImageCallFailure {
  /** e.g. `functions/invalid-argument`. */
  code?: string
  message?: string
  /** The handler's `ImageFailureDetails` payload, when this deploy sends one. */
  details?: unknown
}

// ── Sketch enhancement types (mirrored from functions/src/ai/imageTasks/enhanceSketch.ts) ──

export interface EnhanceSketchRequest {
  familyId: string
  sketchStoragePath: string
  style?: 'storybook' | 'comic' | 'realistic' | 'minecraft'
  /** Optional caption/description of the sketch (e.g. "my dragon drawing"). Filtered for copyright. */
  caption?: string
  /** Optional book theme ID — influences the reimagine style to match the book's visual identity. */
  theme?: string
  /** When true, render the result with a transparent background so it can be used as a sticker. */
  transparent?: boolean
  /**
   * The FEAT-197 "+ My own look" note — one **subject** instruction ("put her in
   * a space suit"), never a style one. Capped and normalized by the shared rule
   * on both sides (`functions/src/shared/customPictureNote.ts`) and run through
   * the same copyright rewriter every other prompt goes through.
   */
  customNote?: string
}

export interface EnhanceSketchResponse {
  url: string
  storagePath: string
  /**
   * The custom note as the copyright rewriter left it, present only when the
   * rewrite changed the words (FEAT-197). Rendered as the FEAT-195
   * "Drawn as: …" line.
   */
  revisedNote?: string
}

// ── Pattern analysis types (mirrored from functions/src/ai/chat.ts) ──

export interface AnalyzePatternsRequest {
  familyId: string
  childId: string
  evaluationSessionId: string
  currentFindings: Array<{
    skill: string
    status: string
    evidence: string
    notes?: string
  }>
}

export interface ConceptualBlockResult {
  name: string
  affectedSkills: string[]
  recommendation: 'ADDRESS_NOW' | 'DEFER'
  rationale: string
  strategies?: string[]
  deferNote?: string
  detectedAt: string
  evaluationSessionId: string

  // Phase 1: lifecycle + multi-writer fields (all optional for backward compat)
  id?: string
  status?: 'ADDRESS_NOW' | 'DEFER' | 'RESOLVING' | 'RESOLVED'
  evidence?: string
  firstDetectedAt?: string
  lastReinforcedAt?: string
  sessionCount?: number
  resolvedAt?: string
  source?: 'evaluation' | 'quest' | 'scan' | 'parent'
  lastSource?: 'evaluation' | 'quest' | 'scan' | 'parent'
  specificWords?: string[]
  specificQuestions?: string[]
}

export interface AnalyzePatternsResponse {
  blocks: ConceptualBlockResult[]
  summary: string
}

// ── Hook ────────────────────────────────────────────────────────

const functions = getFunctions(app)
const chatFn = httpsCallable<ChatRequest, ChatResponse>(functions, 'chat', {
  timeout: 300_000, // 5 min — match server-side timeoutSeconds to avoid client-side timeout on large generations (adventure trees)
})
const generateFn = httpsCallable<GenerateRequest, GenerateResponse>(functions, 'generateActivity')
const imageGenFn = httpsCallable<ImageGenRequest, ImageGenResponse>(functions, 'generateImage', {
  timeout: 120_000,
})
const enhanceSketchFn = httpsCallable<EnhanceSketchRequest, EnhanceSketchResponse>(
  functions,
  'enhanceSketch',
  { timeout: 180_000 }, // match Cloud Function timeoutSeconds: 180
)
const analyzePatternsFn = httpsCallable<AnalyzePatternsRequest, AnalyzePatternsResponse>(
  functions,
  'analyzeEvaluationPatterns',
)

/**
 * The readable message for a callable rejection.
 *
 * `details` was read as a message string here since the beginning, which was
 * right while nothing sent structured details. FEAT-195 attaches an object to
 * every image failure, and `object || message` would have printed
 * "[object Object]" on screen — so a non-string `details` is now skipped rather
 * than stringified, and the server's own message wins.
 */
function callableMessage(err: unknown): string {
  const fireErr = err as { message?: string; details?: unknown }
  if (typeof fireErr?.details === 'string' && fireErr.details) return fireErr.details
  return fireErr?.message || (err instanceof Error ? err.message : String(err))
}

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const lastErrorRef = useRef<string | null>(null)
  /**
   * The structured rejection of the last image call (FEAT-195) — kept beside
   * `error`, never instead of it, so existing readers are untouched. Cleared at
   * the start of every image call, so a card can never show a stale failure over
   * a picture that did arrive.
   *
   * A **ref**, not state, and deliberately: every caller reads it on the line
   * after `await generateImage(...)` returns `null`, and a state setter has not
   * applied by then — the host would classify the *previous* failure, or none at
   * all on the first one. `lastErrorRef` is a ref for the same reason.
   */
  const imageFailureRef = useRef<ImageCallFailure | null>(null)

  const chat = useCallback(async (request: ChatRequest): Promise<ChatResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await chatFn(request)
      return result.data
    } catch (err) {
      // Firebase callable functions wrap errors in FirebaseError with a `code` and `message`
      // Extract the server message when available for a better user experience
      const fireErr = err as { code?: string; message?: string; details?: string }
      const message =
        fireErr.details || fireErr.message || (err instanceof Error ? err.message : String(err))
      setError(new Error(message))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const generateImage = useCallback(
    async (request: ImageGenRequest): Promise<ImageGenResponse | null> => {
      setLoading(true)
      setError(null)
      imageFailureRef.current = null
      lastErrorRef.current = null
      try {
        const result = await imageGenFn(request)
        return result.data
      } catch (err) {
        const fireErr = err as ImageCallFailure
        const message = callableMessage(err)
        setError(new Error(message))
        // Keep the code and the handler's declared details, not just the prose
        // (FEAT-195) — that is what lets the door tell a refused prompt from a
        // rate limit, and read the alternatives the server sent back.
        imageFailureRef.current = {
          code: fireErr.code,
          message,
          details: fireErr.details,
        }
        lastErrorRef.current = message
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const enhanceSketch = useCallback(
    async (request: EnhanceSketchRequest): Promise<EnhanceSketchResponse | null> => {
      setLoading(true)
      setError(null)
      imageFailureRef.current = null
      try {
        const result = await enhanceSketchFn(request)
        return result.data
      } catch (err) {
        const fireErr = err as ImageCallFailure
        const message = callableMessage(err)
        setError(new Error(message))
        imageFailureRef.current = {
          code: fireErr.code,
          message,
          details: fireErr.details,
        }
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const analyzePatterns = useCallback(
    async (request: AnalyzePatternsRequest): Promise<AnalyzePatternsResponse | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await analyzePatternsFn(request)
        return result.data
      } catch (err) {
        const fireErr = err as { code?: string; message?: string; details?: string }
        const message =
          fireErr.details || fireErr.message || (err instanceof Error ? err.message : String(err))
        setError(new Error(message))
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return {
    chat,
    generateImage,
    enhanceSketch,
    analyzePatterns,
    loading,
    error,
    imageFailureRef,
    lastErrorRef,
  } as const
}

export function useGenerateActivity() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const generate = useCallback(async (request: GenerateRequest): Promise<GenerateResponse> => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateFn(request)
      return result.data
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { generate, loading, error } as const
}
