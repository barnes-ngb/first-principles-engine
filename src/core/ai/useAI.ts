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
  Workshop: 'workshop',
  AnalyzeWorkbook: 'analyzeWorkbook',
  Disposition: 'disposition',
  Conundrum: 'conundrum',
  WeeklyFocus: 'weeklyFocus',
  Scan: 'scan',
  ShellyChat: 'shellyChat',
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
}

export interface ChatResponse {
  message: string
  model: string
  usage: { inputTokens: number; outputTokens: number }
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
  style?: 'schedule-card' | 'reward-chart' | 'theme-illustration' | 'book-illustration-minecraft' | 'book-illustration-storybook' | 'book-illustration-comic' | 'book-illustration-realistic' | 'book-illustration-garden-warfare' | 'book-illustration-platformer' | 'book-sticker' | 'general'
  size?: '1024x1024' | '1024x1792' | '1792x1024'
  /** Optional theme ID — theme's imageStylePrefix overrides default style prefix for book illustrations. */
  themeId?: string
}

export interface ImageGenResponse {
  url: string
  storagePath: string
  revisedPrompt?: string
}

// ── Sketch enhancement types (mirrored from functions/src/ai/imageTasks/enhanceSketch.ts) ──

export interface EnhanceSketchRequest {
  familyId: string
  sketchStoragePath: string
  style?: 'storybook' | 'comic' | 'realistic' | 'minecraft'
  /** Optional caption/description of the sketch (e.g. "my dragon drawing"). Filtered for copyright. */
  caption?: string
}

export interface EnhanceSketchResponse {
  url: string
  storagePath: string
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
  { timeout: 120_000 }, // match Cloud Function timeoutSeconds: 120
)
const analyzePatternsFn = httpsCallable<AnalyzePatternsRequest, AnalyzePatternsResponse>(
  functions,
  'analyzeEvaluationPatterns',
)

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const lastErrorRef = useRef<string | null>(null)

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
      lastErrorRef.current = null
      try {
        const result = await imageGenFn(request)
        return result.data
      } catch (err) {
        const fireErr = err as { code?: string; message?: string; details?: string }
        const message =
          fireErr.details || fireErr.message || (err instanceof Error ? err.message : String(err))
        setError(new Error(message))
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
      try {
        const result = await enhanceSketchFn(request)
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

  return { chat, generateImage, enhanceSketch, analyzePatterns, loading, error, lastErrorRef } as const
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
