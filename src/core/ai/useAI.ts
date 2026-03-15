import { useCallback, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase/firebase'

// ── Types (mirrored from functions/src/ai/chat.ts) ──────────────

export const TaskType = {
  Plan: 'plan',
  Evaluate: 'evaluate',
  Generate: 'generate',
  Chat: 'chat',
  Quest: 'quest',
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
  style?: 'schedule-card' | 'reward-chart' | 'theme-illustration' | 'book-illustration-minecraft' | 'book-illustration-storybook' | 'book-illustration-comic' | 'book-illustration-realistic' | 'book-sticker' | 'general'
  size?: '1024x1024' | '1024x1792' | '1792x1024'
}

export interface ImageGenResponse {
  url: string
  storagePath: string
  revisedPrompt?: string
}

// ── Hook ────────────────────────────────────────────────────────

const functions = getFunctions(app)
const chatFn = httpsCallable<ChatRequest, ChatResponse>(functions, 'chat')
const generateFn = httpsCallable<GenerateRequest, GenerateResponse>(functions, 'generateActivity')
const imageGenFn = httpsCallable<ImageGenRequest, ImageGenResponse>(functions, 'generateImage')

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

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
      try {
        const result = await imageGenFn(request)
        return result.data
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { chat, generateImage, loading, error } as const
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
