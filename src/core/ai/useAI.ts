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

// ── Hook ────────────────────────────────────────────────────────

const functions = getFunctions(app)
const chatFn = httpsCallable<ChatRequest, ChatResponse>(functions, 'chat')

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
