import { useCallback, useRef, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

import { app } from '../../core/firebase/firebase'
import { db, questionBankDocId } from '../../core/firebase/firestore'
import type { BankedQuestion, QuestQuestion } from './questTypes'
import { shouldFlagAsError } from './questHelpers'

// ── Cloud Function callable ──────────────────────────────────

const functions = getFunctions(app)
const generateBankFn = httpsCallable<
  { familyId: string; childId: string; domain: string; questionsPerLevel?: number; levels?: number[] },
  { questionsGenerated: number; levels: number; domain: string }
>(functions, 'generateQuestionBank')

// ── Constants ────────────────────────────────────────────────

/** Minimum questions remaining before triggering a background refresh */
const LOW_WATER_MARK = 10

// ── Hook ─────────────────────────────────────────────────────

interface UseQuestionBankReturn {
  /** Pull the next question for the given level. Returns null if bank is empty. */
  getQuestion: (level: number, domain: string, recentSkills?: string[]) => QuestQuestion | null
  /** Number of questions remaining in the bank */
  remainingCount: number
  /** Whether the bank is currently being loaded */
  loading: boolean
  /** Whether a background refresh is in progress */
  refreshing: boolean
  /** Trigger a full bank refresh */
  refreshBank: (domain: string) => Promise<void>
  /** Whether the bank has been loaded (even if empty) */
  loaded: boolean
}

export function useQuestionBank(
  familyId: string,
  childId: string,
): UseQuestionBankReturn {
  const [questions, setQuestions] = useState<BankedQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const loadedDomainRef = useRef<string | null>(null)
  const refreshingRef = useRef(false)

  // ── Fire-and-forget: mark served in Firestore ─────────────

  const markServedInFirestore = useCallback(
    (questionId: string, domain: string) => {
      if (!familyId || !childId) return
      void (async () => {
        try {
          const docId = questionBankDocId(childId, domain)
          const ref = doc(db, `families/${familyId}/questionBanks/${docId}`)
          const snap = await getDoc(ref)
          if (!snap.exists()) return

          const data = snap.data() as { questions?: BankedQuestion[]; remainingCount?: number }
          const updatedQuestions = (data.questions || []).map((q) =>
            q.id === questionId ? { ...q, served: true } : q,
          )
          const remaining = updatedQuestions.filter((q) => !q.served).length

          await setDoc(ref, {
            ...data,
            questions: updatedQuestions,
            remainingCount: remaining,
          })
        } catch (err) {
          console.warn('Failed to mark question as served:', err)
        }
      })()
    },
    [familyId, childId],
  )

  // ── Load bank from Firestore ──────────────────────────────

  const loadBank = useCallback(
    async (domain: string) => {
      if (!familyId || !childId) return

      setLoading(true)
      try {
        const docId = questionBankDocId(childId, domain)
        const ref = doc(db, `families/${familyId}/questionBanks/${docId}`)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          const data = snap.data() as { questions?: BankedQuestion[] }
          const unserved = (data.questions || []).filter((q) => !q.served)
          setQuestions(unserved)
          loadedDomainRef.current = domain
        } else {
          setQuestions([])
          loadedDomainRef.current = domain
        }
      } catch (err) {
        console.warn('Failed to load question bank:', err)
        setQuestions([])
      } finally {
        setLoading(false)
        setLoaded(true)
      }
    },
    [familyId, childId],
  )

  // ── Refresh bank via Cloud Function ───────────────────────

  const refreshBank = useCallback(
    async (domain: string) => {
      if (!familyId || !childId || refreshingRef.current) return

      refreshingRef.current = true
      setRefreshing(true)

      try {
        await generateBankFn({
          familyId,
          childId,
          domain,
          questionsPerLevel: 8,
        })
        // Reload from Firestore
        await loadBank(domain)
      } catch (err) {
        console.warn('Failed to refresh question bank:', err)
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
      }
    },
    [familyId, childId, loadBank],
  )

  // Keep stable refs for use in getQuestion without circular deps
  const refreshBankRef = useRef(refreshBank)
  refreshBankRef.current = refreshBank

  // ── Get a question from the bank ──────────────────────────

  const getQuestion = useCallback(
    (level: number, domain: string, recentSkills?: string[]): QuestQuestion | null => {
      // Load bank if domain changed
      if (loadedDomainRef.current !== domain) {
        void loadBank(domain)
        return null
      }

      // Find a question at the requested level
      const candidates = questions.filter((q) => q.level === level && !q.served)

      if (candidates.length === 0) return null

      // Prefer questions with skills not recently tested
      let pick: BankedQuestion | undefined
      if (recentSkills?.length) {
        pick = candidates.find((q) => !recentSkills.includes(q.skill))
      }
      if (!pick) {
        // Random selection from candidates
        pick = candidates[Math.floor(Math.random() * candidates.length)]
      }

      // Convert to QuestQuestion
      const questQuestion: QuestQuestion = {
        id: pick.id,
        type: 'multiple-choice',
        level: pick.level,
        skill: pick.skill,
        prompt: pick.prompt,
        stimulus: pick.stimulus,
        phonemeDisplay: pick.phonemeDisplay,
        options: pick.options,
        correctAnswer: pick.correctAnswer,
        encouragement: pick.encouragement,
        allowOpenResponse: pick.allowOpenResponse,
      }

      // Validate — skip bad questions
      if (shouldFlagAsError(questQuestion)) {
        // Mark as served (discard) and try again
        markServedInFirestore(pick.id, domain)
        setQuestions((prev) => prev.filter((q) => q.id !== pick!.id))
        return getQuestion(level, domain, recentSkills)
      }

      // Mark as served locally
      setQuestions((prev) => prev.filter((q) => q.id !== pick!.id))

      // Fire-and-forget: mark as served in Firestore
      markServedInFirestore(pick.id, domain)

      // Trigger background refresh if running low
      if (questions.length - 1 <= LOW_WATER_MARK && !refreshingRef.current) {
        void refreshBankRef.current(domain)
      }

      return questQuestion
    },
    [questions, loadBank, markServedInFirestore],
  )

  return {
    getQuestion,
    remainingCount: questions.length,
    loading,
    refreshing,
    refreshBank,
    loaded,
  }
}
