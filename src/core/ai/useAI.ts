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

// ── Hook ────────────────────────────────────────────────────────

const functions = getFunctions(app)
const chatFn = httpsCallable<ChatRequest, ChatResponse>(functions, 'chat')
const generateFn = httpsCallable<GenerateRequest, GenerateResponse>(functions, 'generateActivity')

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

  return { chat, loading, error } as const
}

export function useGenerateActivity() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const generate = useCallback(async (request: GenerateRequest): Promise<GenerateResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateFn(request)
      return result.data
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { generate, loading, error } as const
}
