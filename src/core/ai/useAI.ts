import { useCallback, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase/firebase'

// ── Types (mirrored from functions/src/ai/chat.ts) ──────────────

export const TaskType = {
  Plan: 'plan',
  Evaluate: 'evaluate',
  Generate: 'generate',
  Chat: 'chat',
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
}

export interface ChatResponse {
  message: string
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

// ── Image generation types (mirrored from functions/src/ai/imageGen.ts) ──

export interface ImageGenRequest {
  familyId: string
  prompt: string
  style?: 'schedule-card' | 'reward-chart' | 'theme-illustration' | 'general'
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
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
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
