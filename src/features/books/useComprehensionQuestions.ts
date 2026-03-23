import { useCallback, useState } from 'react'

import { useAI } from '../../core/ai/useAI'
import type { Book } from '../../core/types'

// ── Types ──────────────────────────────────────────────────────

export interface ComprehensionQuestion {
  question: string
  /** Expected correct answer (for parent reference) */
  answer: string
  /** Question type for display styling */
  type: 'recall' | 'inference' | 'opinion'
}

// ── Hook ───────────────────────────────────────────────────────

/**
 * Generates 2-3 comprehension questions for a completed book.
 * Uses the existing `chat` task type with a comprehension-focused prompt.
 */
export function useComprehensionQuestions(familyId: string, childId: string) {
  const { chat } = useAI()
  const [questions, setQuestions] = useState<ComprehensionQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateQuestions = useCallback(
    async (book: Book, childName: string, childAge: number) => {
      if (!familyId || !childId) return
      setLoading(true)
      setError(null)

      // Build a summary of the book for the AI
      const pageTexts = book.pages
        .filter((p) => p.text)
        .map((p) => p.text!)
        .join('\n\n')

      const sightWords = book.sightWords?.join(', ') ?? 'none'

      const prompt = `Generate 2-3 simple comprehension questions for ${childName} (age ${childAge}) who just read a book.

Book title: "${book.title}"
Sight words practiced: ${sightWords}
Book text:
${pageTexts}

Instructions:
- One recall question (what happened in the story)
- One inference question (why did something happen, or what might happen next)
- One opinion question (what was your favorite part, or how did a character feel)
- Keep questions short and age-appropriate for ${childAge} years old
- Use simple vocabulary${childAge <= 7 ? ' — keep sentences under 10 words' : ''}
- Reference specific story events so the child connects to what they read

Respond in JSON format:
[
  { "question": "...", "answer": "...", "type": "recall" },
  { "question": "...", "answer": "...", "type": "inference" },
  { "question": "...", "answer": "...", "type": "opinion" }
]`

      try {
        const result = await chat({
          familyId,
          childId,
          taskType: 'chat',
          messages: [{ role: 'user', content: prompt }],
        })

        if (result?.message) {
          const cleaned = result.message.replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(cleaned) as ComprehensionQuestion[]
          setQuestions(parsed.slice(0, 3))
        } else {
          setError('Could not generate questions')
        }
      } catch {
        setError('Failed to generate questions — try again')
      } finally {
        setLoading(false)
      }
    },
    [familyId, childId, chat],
  )

  const reset = useCallback(() => {
    setQuestions([])
    setError(null)
  }, [])

  return { questions, loading, error, generateQuestions, reset }
}
